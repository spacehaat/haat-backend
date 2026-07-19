import { Types, type FilterQuery } from 'mongoose';
import { ApiError } from '../../utils/apiError.js';
import { Activity } from '../activity/activity.model.js';
import { cityScope, hasPermission, isAdmin, PERMISSIONS, type AuthUser } from '../auth/permissions.js';
import {
  ClientDirectory,
  LEAD_INTERESTED_IN,
  Lead,
  type LeadDoc,
} from './leads.model.js';
import type { LeadCreateInput, LeadFromMatchInput, LeadUpdateInput } from './leads.schema.js';
import { parseLeadFromText } from './leads.parser.js';
import { buildLeadSearchFilter } from './leads.search.js';
import {
  assertAssigneeEligible,
  attachAssigneeNames,
  listLeadAssignees,
  resolveLeadAssignee,
} from './leads.assign.js';
import { buildParseContext } from '../smart-match/smart-match.service.js';
import { listListings } from '../listings/listings.service.js';
import { notifyLeadAssigned, notifyMembersOfNewLead } from '../devices/devices.service.js';

type LegacyLeadDoc = LeadDoc & {
  title?: string;
  status?: string;
  client?: { name?: string; company?: string; email?: string; phone?: string };
  requirement?: {
    rawEnquiry?: string;
    parsed?: {
      city?: string;
      micro?: string;
      seats?: number;
      budget?: number;
      moveIn?: string;
      amenities?: string[];
      spaceType?: string;
    };
  };
};

const INTERESTED_IN_SET = new Set<string>(LEAD_INTERESTED_IN);

function mapSpaceTypeToInterestedIn(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (INTERESTED_IN_SET.has(v)) return v;
  if (v === 'Private cabin') return 'Private office';
  return null;
}

function mapSpaceTypes(values: string[] = []) {
  const out: string[] = [];
  for (const v of values) {
    const mapped = mapSpaceTypeToInterestedIn(v);
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function normalizeLegacyLead(doc: LegacyLeadDoc) {
  if (doc.name !== undefined && (doc.city !== undefined || doc.stage !== undefined)) {
    return doc;
  }

  const parsed = doc.requirement?.parsed || {};
  const client = doc.client || {};
  const interestedIn = parsed.spaceType
    ? mapSpaceTypes([parsed.spaceType])
    : [];

  return {
    ...doc,
    leadDate: doc.leadDate || doc.createdAt || new Date(),
    name: client.name || '',
    contact: client.phone || '',
    email: client.email || '',
    company: client.company || '',
    interestedIn: doc.interestedIn?.length ? doc.interestedIn : interestedIn,
    city: parsed.city || '',
    microlocation: parsed.micro || '',
    seats: parsed.seats || 0,
    stage: doc.stage || doc.status || 'new',
    budget: parsed.budget || 0,
    moveIn: parsed.moveIn || '',
    rawEnquiry: doc.rawEnquiry || doc.requirement?.rawEnquiry || '',
    amenities: doc.amenities?.length ? doc.amenities : (parsed.amenities || []),
  } as LegacyLeadDoc;
}

function seatDisplayLabel(lead: { seats?: number; seatRange?: string }) {
  if (lead.seatRange?.trim()) return `${lead.seatRange.trim()} seats`;
  if (lead.seats) return `${lead.seats} seats`;
  return '';
}

function buildDisplayTitle(lead: {
  name?: string;
  company?: string;
  seats?: number;
  seatRange?: string;
  microlocation?: string;
  city?: string;
}) {
  const who = lead.company || lead.name || 'New lead';
  const seats = seatDisplayLabel(lead);
  const place = lead.microlocation || lead.city || '';
  const parts = [who, [seats, place].filter(Boolean).join(' · ')].filter(Boolean);
  return parts.join(' — ').slice(0, 200);
}

function defaultDueAt() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d;
}

async function logLeadActivity(who: string, text: string, sub: string) {
  await Activity.create({ kind: 'lead', who, text, sub });
}

async function upsertClientDirectory(
  client: { name?: string; company?: string; email?: string; contact?: string; phone?: string },
  actorId: string,
) {
  const name = client.name?.trim() || '';
  const company = client.company?.trim() || '';
  if (!name && !company) return;

  const q: Record<string, unknown> = { createdBy: new Types.ObjectId(actorId) };
  if (company) q.company = company;
  else q.name = name;

  await ClientDirectory.findOneAndUpdate(
    q,
    {
      $set: {
        name,
        company,
        email: client.email || '',
        phone: client.contact || client.phone || '',
        lastContactAt: new Date(),
      },
      $inc: { leadCount: 1 },
      $setOnInsert: { createdBy: new Types.ObjectId(actorId), wonCount: 0 },
    },
    { upsert: true, new: true },
  ).exec();
}

function leadQueryForUser(user: AuthUser) {
  if (isAdmin(user)) return {};
  const scope = cityScope(user);
  const or: Record<string, unknown>[] = [
    { assigneeId: new Types.ObjectId(user.id) },
    { createdBy: new Types.ObjectId(user.id) },
  ];
  // Members scoped to cities can see leads in those cities (e.g. admin-created leads).
  if (scope && scope.length) {
    or.push({ city: { $in: scope } });
  }
  return { $or: or };
}

function combineFilters(...filters: Record<string, unknown>[]): Record<string, unknown> {
  const parts = filters.filter((f) => Object.keys(f).length > 0);
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0]!;
  return { $and: parts };
}

function asLeadFilter(q: Record<string, unknown>) {
  return q as FilterQuery<LeadDoc>;
}

function cityFilterForUser(user: AuthUser, city?: string) {
  const scope = cityScope(user);
  if (scope !== null) {
    if (!scope.length) return { city: { $in: [] } };
    return {
      $or: [
        { city: { $in: scope } },
        { 'requirement.parsed.city': { $in: scope } },
      ],
    };
  }
  if (city && city !== 'All cities') {
    return {
      $or: [
        { city },
        { 'requirement.parsed.city': city },
      ],
    };
  }
  return {};
}

function parseLeadDateBound(value?: string, endExclusive = false) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function leadDateFilter(dateFrom?: string, dateTo?: string) {
  const from = parseLeadDateBound(dateFrom);
  const to = parseLeadDateBound(dateTo);
  if (!from && !to) return {};

  const leadDate: Record<string, Date> = {};
  const createdAt: Record<string, Date> = {};
  if (from) {
    leadDate.$gte = from;
    createdAt.$gte = from;
  }
  if (to) {
    leadDate.$lt = to;
    createdAt.$lt = to;
  }

  return {
    $or: [
      { leadDate },
      { $and: [{ $or: [{ leadDate: { $exists: false } }, { leadDate: null }] }, { createdAt }] },
    ],
  };
}

function buildLeadListFilters(
  actor: AuthUser,
  options: {
    assignee?: string;
    city?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  const filters: Record<string, unknown>[] = [
    leadQueryForUser(actor),
    cityFilterForUser(actor, options.city),
  ];

  if (options.assignee) {
    filters.push({ assigneeId: new Types.ObjectId(options.assignee) });
  }
  if (options.source) {
    filters.push({ source: options.source });
  }

  const dateRange = leadDateFilter(options.dateFrom, options.dateTo);
  if (Object.keys(dateRange).length) filters.push(dateRange);

  return filters;
}

async function aggregateLeadStageCounts(q: FilterQuery<LeadDoc>) {
  const rows = await Lead.aggregate<{ _id: string; count: number }>([
    { $match: q },
    {
      $project: {
        stageValue: {
          $ifNull: ['$stage', { $ifNull: ['$status', 'new'] }],
        },
      },
    },
    { $group: { _id: '$stageValue', count: { $sum: 1 } } },
  ]).exec();

  const stageCounts: Record<string, number> = {};
  for (const row of rows) {
    if (row._id) stageCounts[row._id] = row.count;
  }
  return stageCounts;
}

function toLeadSummary(doc: LegacyLeadDoc) {
  const lead = normalizeLegacyLead(doc);
  return {
    id: String(lead._id),
    displayTitle: buildDisplayTitle(lead),
    leadDate: lead.leadDate || lead.createdAt || null,
    name: lead.name || '',
    contact: lead.contact || '',
    email: lead.email || '',
    company: lead.company || '',
    interestedIn: lead.interestedIn || [],
    city: lead.city || '',
    microlocation: lead.microlocation || '',
    seats: lead.seats || 0,
    seatRange: lead.seatRange || '',
    stage: lead.stage || 'new',
    source: lead.source || 'manual',
    budget: lead.budget || 0,
    moveIn: lead.moveIn || '',
    priority: lead.priority || 'normal',
    listingCount: lead.listingIds?.length || 0,
    proposalCount: lead.proposalIds?.length || 0,
    assigneeId: lead.assigneeId ? String(lead.assigneeId) : '',
    dueAt: lead.dueAt || null,
    createdAt: lead.createdAt || null,
    updatedAt: lead.updatedAt || null,
  };
}

function toLeadDetail(doc: LegacyLeadDoc) {
  const lead = normalizeLegacyLead(doc);
  const notes = (lead.notes || []).map((n) => ({
    text: n.text,
    who: n.who,
    at: n.at,
  }));
  const timeline = [
    ...notes.map((n) => ({
      kind: 'note',
      who: n.who,
      text: n.text,
      at: n.at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    ...toLeadSummary(lead),
    rawEnquiry: lead.rawEnquiry || '',
    amenities: lead.amenities || [],
    listingIds: (lead.listingIds || []).map((id) => String(id)),
    proposalIds: (lead.proposalIds || []).map((id) => String(id)),
    lostReason: lead.lostReason || '',
    notes,
    timeline,
  };
}

async function getLeadDoc(id: string, actor: AuthUser) {
  const doc = await Lead.findById(id).exec();
  if (!doc) throw new ApiError(404, 'Lead not found', 'NOT_FOUND');
  if (!isAdmin(actor)) {
    const owner = String(doc.createdBy) === actor.id;
    const assignee = doc.assigneeId && String(doc.assigneeId) === actor.id;
    const scope = cityScope(actor);
    const inCity = !!(scope && scope.length && doc.city && scope.includes(doc.city));
    if (!owner && !assignee && !inCity) {
      throw new ApiError(403, 'You do not have access to this lead', 'FORBIDDEN');
    }
  }
  return doc;
}

export async function listLeads(
  actor: AuthUser,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    stage?: string;
    status?: string;
    assignee?: string;
    city?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const stageFilter = options.stage || options.status;
  const baseFilters = buildLeadListFilters(actor, {
    assignee: options.assignee,
    city: options.city,
    source: options.source,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  });

  const search = options.search?.trim();
  let searchFilter: Record<string, unknown> = {};
  if (search) {
    searchFilter = (await buildLeadSearchFilter(search)) || {};
  }

  const listFilters = [...baseFilters];
  if (stageFilter) {
    listFilters.push({
      $or: [
        { stage: stageFilter },
        { status: stageFilter },
      ],
    });
  }
  if (Object.keys(searchFilter).length) listFilters.push(searchFilter);

  const q = asLeadFilter(combineFilters(...listFilters));
  const countBaseFilters = [...baseFilters];
  if (Object.keys(searchFilter).length) countBaseFilters.push(searchFilter);
  const countBaseQ = asLeadFilter(combineFilters(...countBaseFilters));

  const [rawRows, total, stageCounts] = await Promise.all([
    Lead.find(q).sort({ leadDate: -1, updatedAt: -1 }).skip(skip).limit(limit).lean().exec(),
    Lead.countDocuments(q),
    aggregateLeadStageCounts(countBaseQ),
  ]);
  const rows = rawRows as LegacyLeadDoc[];

  return {
    items: await attachAssigneeNames(rows.map((doc) => toLeadSummary(doc))),
    total,
    stageCounts,
    page,
    limit,
    pageCount: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function createLead(input: LeadCreateInput, actor: AuthUser) {
  const city = input.city || '';
  const assigneeId = await resolveLeadAssignee(city, actor, input.assigneeId || null);

  const listingIds = (input.listingIds || [])
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const doc = await Lead.create({
    leadDate: input.leadDate ? new Date(input.leadDate) : new Date(),
    name: input.name || '',
    contact: input.contact || '',
    email: input.email || '',
    company: input.company || '',
    interestedIn: input.interestedIn || [],
    city: input.city || '',
    microlocation: input.microlocation || '',
    seats: input.seats || 0,
    seatRange: input.seatRange || '',
    stage: input.stage || 'new',
    source: input.source || 'manual',
    budget: input.budget || 0,
    moveIn: input.moveIn || '',
    rawEnquiry: input.rawEnquiry || '',
    amenities: input.amenities || [],
    assigneeId: new Types.ObjectId(assigneeId),
    createdBy: new Types.ObjectId(actor.id),
    listingIds,
    proposalIds: [],
    visitIds: [],
    priority: input.priority || 'normal',
    dueAt: input.dueAt ? new Date(input.dueAt) : defaultDueAt(),
    notes: [],
  });

  await upsertClientDirectory(doc, actor.id);
  const title = buildDisplayTitle(doc);
  await logLeadActivity(actor.name, 'created a lead', title);

  // Notify city members; never notify the person who created the lead (e.g. admin).
  void notifyMembersOfNewLead({
    leadId: String(doc._id),
    leadTitle: title,
    city,
    excludeUserId: actor.id,
    assigneeId,
  });

  const [item] = await attachAssigneeNames([toLeadDetail(doc)]);
  return item;
}

export async function createLeadFromMatch(input: LeadFromMatchInput, actor: AuthUser) {
  const client = input.client ?? { name: '', company: '', email: '', phone: '' };
  const interestedIn = input.interestedIn?.length
    ? input.interestedIn
    : mapSpaceTypes(input.spaceTypes || []) as typeof input.interestedIn;

  return createLead(
    {
      source: 'smart_match',
      name: input.name || client.name || '',
      contact: input.contact || client.phone || '',
      email: input.email || client.email || '',
      company: input.company || client.company || '',
      city: input.city || '',
      microlocation: input.microlocation || input.locality || '',
      seats: input.seats ?? input.teamSize ?? 0,
      seatRange: '',
      budget: input.budget ?? input.budgetPerSeat ?? 0,
      moveIn: input.moveIn || '',
      amenities: input.amenities || [],
      interestedIn,
      rawEnquiry: input.enquiry || '',
      listingIds: input.listingIds,
    },
    actor,
  );
}

export async function parseLeadPaste(enquiry: string, actor: AuthUser) {
  const allowed = cityScope(actor);
  const { items } = await listListings({ allowedCities: allowed });
  const ctx = buildParseContext(items);
  const { fields, source } = await parseLeadFromText(enquiry, ctx);
  return { fields, source };
}

export async function getLeadAssignees(city: string, actor: AuthUser) {
  return listLeadAssignees(city, actor);
}

export async function getLead(id: string, actor: AuthUser) {
  const doc = await getLeadDoc(id, actor);
  const [item] = await attachAssigneeNames([toLeadDetail(doc)]);
  return item;
}

export async function deleteLead(id: string, actor: AuthUser) {
  const doc = await getLeadDoc(id, actor);
  const title = buildDisplayTitle(normalizeLegacyLead(doc as LegacyLeadDoc));
  await doc.deleteOne();
  await logLeadActivity(actor.name, 'deleted lead', title);
  return { id: String(doc._id), deleted: true };
}

export async function updateLead(id: string, input: LeadUpdateInput, actor: AuthUser) {
  const doc = await getLeadDoc(id, actor);
  const prevAssigneeId = doc.assigneeId ? String(doc.assigneeId) : '';

  if (input.assigneeId !== undefined) {
    if (!hasPermission(actor, PERMISSIONS.LEADS_ASSIGN) && !isAdmin(actor)) {
      throw new ApiError(403, 'You cannot reassign leads', 'FORBIDDEN');
    }
    if (input.assigneeId) {
      await assertAssigneeEligible(input.assigneeId, doc.city || '');
      doc.assigneeId = new Types.ObjectId(input.assigneeId);
    } else {
      const autoId = await resolveLeadAssignee(doc.city || '', actor, null);
      doc.assigneeId = new Types.ObjectId(autoId);
    }
  }

  const prevStage = doc.stage || (doc as LegacyLeadDoc).status;
  if (input.leadDate !== undefined) doc.leadDate = input.leadDate ? new Date(input.leadDate) : new Date();
  if (input.name !== undefined) doc.name = input.name;
  if (input.contact !== undefined) doc.contact = input.contact;
  if (input.email !== undefined) doc.email = input.email;
  if (input.company !== undefined) doc.company = input.company;
  if (input.interestedIn !== undefined) doc.interestedIn = input.interestedIn;
  if (input.city !== undefined) doc.city = input.city;
  if (input.microlocation !== undefined) doc.microlocation = input.microlocation;
  if (input.seats !== undefined) doc.seats = input.seats;
  if (input.seatRange !== undefined) doc.seatRange = input.seatRange;
  if (input.stage !== undefined) doc.stage = input.stage;
  if (input.source !== undefined) doc.source = input.source;
  if (input.budget !== undefined) doc.budget = input.budget;
  if (input.moveIn !== undefined) doc.moveIn = input.moveIn;
  if (input.rawEnquiry !== undefined) doc.rawEnquiry = input.rawEnquiry;
  if (input.priority !== undefined) doc.priority = input.priority;
  if (input.dueAt !== undefined) doc.dueAt = input.dueAt ? new Date(input.dueAt) : undefined;
  if (input.lostReason !== undefined) doc.lostReason = input.lostReason;
  if (input.listingIds) {
    doc.listingIds = input.listingIds
      .filter((x) => Types.ObjectId.isValid(x))
      .map((x) => new Types.ObjectId(x));
  }

  await doc.save();

  const normalized = normalizeLegacyLead(doc as LegacyLeadDoc);
  if (input.name !== undefined || input.email !== undefined || input.contact !== undefined || input.company !== undefined) {
    await upsertClientDirectory(normalized, actor.id);
  }
  if (input.stage && input.stage !== prevStage) {
    await logLeadActivity(actor.name, `moved lead to ${input.stage.replace(/_/g, ' ')}`, buildDisplayTitle(normalized));
  }
  if (input.assigneeId !== undefined) {
    await logLeadActivity(actor.name, 'updated lead assignment', buildDisplayTitle(normalized));
    const newAssigneeId = String(doc.assigneeId);
    if (newAssigneeId && newAssigneeId !== prevAssigneeId && newAssigneeId !== actor.id) {
      void notifyLeadAssigned(newAssigneeId, buildDisplayTitle(normalized), String(doc._id));
    }
  }

  const [item] = await attachAssigneeNames([toLeadDetail(doc)]);
  return item;
}

export async function addLeadNote(id: string, text: string, actor: AuthUser) {
  const doc = await getLeadDoc(id, actor);
  doc.notes.push({ text, who: actor.name, at: new Date() });
  await doc.save();
  await logLeadActivity(actor.name, 'added a note on', buildDisplayTitle(normalizeLegacyLead(doc as LegacyLeadDoc)));
  const [item] = await attachAssigneeNames([toLeadDetail(doc)]);
  return item;
}

export async function attachProposalToLead(leadId: string, proposalId: string, actor: AuthUser) {
  if (!Types.ObjectId.isValid(leadId) || !Types.ObjectId.isValid(proposalId)) return null;
  const doc = await getLeadDoc(leadId, actor);
  const pid = new Types.ObjectId(proposalId);
  const exists = (doc.proposalIds || []).some((id) => String(id) === proposalId);
  if (!exists) doc.proposalIds.push(pid);
  const stage = doc.stage || (doc as LegacyLeadDoc).status || 'new';
  if (stage === 'new' || stage === 'qualified') doc.stage = 'proposal_sent';
  await doc.save();
  await logLeadActivity(actor.name, 'linked a proposal to', buildDisplayTitle(normalizeLegacyLead(doc as LegacyLeadDoc)));
  const [item] = await attachAssigneeNames([toLeadSummary(doc)]);
  return item;
}

/** Called from the public client portal when a visit is requested. */
export async function advanceLeadOnClientVisit(leadId: string | Types.ObjectId | null | undefined) {
  if (!leadId || !Types.ObjectId.isValid(String(leadId))) return null;
  const doc = await Lead.findById(leadId).exec();
  if (!doc) return null;
  const stage = doc.stage || (doc as LegacyLeadDoc).status || 'new';
  if (stage === 'won' || stage === 'lost' || stage === 'visit_scheduled') return doc;
  doc.stage = 'visit_scheduled';
  await doc.save();
  const title = buildDisplayTitle(normalizeLegacyLead(doc as LegacyLeadDoc));
  await logLeadActivity('Client', 'requested a visit via proposal portal', title);
  return doc;
}

export async function listClients(actor: AuthUser, search = '') {
  const q: Record<string, unknown> = {};
  if (!isAdmin(actor)) q.createdBy = new Types.ObjectId(actor.id);
  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    q.$or = [{ name: re }, { company: re }, { email: re }];
  }
  const rows = await ClientDirectory.find(q).sort({ lastContactAt: -1 }).limit(100).lean().exec();
  return rows.map((c) => ({
    id: String(c._id),
    name: c.name || '',
    company: c.company || '',
    email: c.email || '',
    phone: c.phone || '',
    leadCount: c.leadCount || 0,
    wonCount: c.wonCount || 0,
    lastContactAt: c.lastContactAt || null,
  }));
}

export async function listRecentClients(actor: AuthUser, limit = 10) {
  const q: Record<string, unknown> = {};
  if (!isAdmin(actor)) q.createdBy = new Types.ObjectId(actor.id);
  const rows = await ClientDirectory.find(q).sort({ lastContactAt: -1 }).limit(limit).lean().exec();
  return rows.map((c) => ({
    id: String(c._id),
    name: c.name || '',
    company: c.company || '',
    email: c.email || '',
    phone: c.phone || '',
  }));
}

export async function countOverdueLeads(actor: AuthUser) {
  const q = asLeadFilter(combineFilters(
    leadQueryForUser(actor),
    cityFilterForUser(actor),
    {
      dueAt: { $lt: new Date() },
      $or: [
        { stage: { $nin: ['won', 'lost'] } },
        { status: { $nin: ['won', 'lost'] } },
      ],
    },
  ));
  return Lead.countDocuments(q);
}

export async function listOverdueLeads(actor: AuthUser, limit = 5) {
  const q = asLeadFilter(combineFilters(
    leadQueryForUser(actor),
    cityFilterForUser(actor),
    {
      dueAt: { $lt: new Date() },
      $or: [
        { stage: { $nin: ['won', 'lost'] } },
        { status: { $nin: ['won', 'lost'] } },
      ],
    },
  ));
  const rawRows = await Lead.find(q).sort({ dueAt: 1 }).limit(limit).lean().exec();
  const rows = rawRows as LegacyLeadDoc[];
  return rows.map((doc) => toLeadSummary(doc));
}

export async function countOpenLeads(actor: AuthUser) {
  const q = asLeadFilter(combineFilters(
    leadQueryForUser(actor),
    cityFilterForUser(actor),
    {
      $or: [
        { stage: { $nin: ['won', 'lost'] } },
        { status: { $nin: ['won', 'lost'] } },
      ],
    },
  ));
  return Lead.countDocuments(q);
}
