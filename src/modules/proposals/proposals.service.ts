import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { ApiError } from '../../utils/apiError.js';
import { Activity } from '../activity/activity.model.js';
import { attachProposalToLead, advanceLeadOnClientVisit } from '../leads/leads.service.js';
import { Listing } from '../listings/listings.model.js';
import { downloadBuffer, uploadProposalPdf } from '../uploads/uploads.service.js';
import { Proposal } from './proposals.model.js';
import { buildProposalPdf, mapListingToPdf, type PdfListing } from './proposals.pdf.js';
import type { AuthUser } from '../auth/permissions.js';
import type {
  PublicProposalFeedbackInput,
  ProposalDraftUpdateInput,
  ProposalRenderInput,
  ProposalSendInput,
} from './proposals.schema.js';

type ProposalDocument = InstanceType<typeof Proposal>;

function toDraftResponse(doc: {
  _id: Types.ObjectId;
  title?: string;
  client?: { name?: string; company?: string };
  listingIds?: Types.ObjectId[];
  coverNote?: string;
  coverNoteIdx?: number;
  status?: string;
  pdfUrl?: string;
  pdfKey?: string;
  pdfGeneratedAt?: Date | null;
  leadId?: Types.ObjectId | null;
}) {
  return {
    id: String(doc._id),
    title: doc.title || '',
    status: doc.status || 'draft',
    client: {
      name: doc.client?.name || '',
      company: doc.client?.company || '',
    },
    listingIds: (doc.listingIds || []).map((id) => String(id)),
    coverNote: doc.coverNote || '',
    coverNoteIdx: doc.coverNoteIdx ?? 0,
    pdfUrl: doc.pdfUrl || '',
    pdfGeneratedAt: doc.pdfGeneratedAt || null,
    leadId: doc.leadId ? String(doc.leadId) : null,
  };
}

type ProposalHistoryDoc = {
  _id: Types.ObjectId;
  title?: string;
  status?: string;
  client?: { name?: string; company?: string };
  listingIds?: Types.ObjectId[];
  summary?: {
    listingCount?: number;
    cities?: string[];
    operators?: string[];
    priceMin?: number;
    priceMax?: number;
  };
  sendChannel?: string;
  sentAt?: Date | null;
  pdfUrl?: string;
  shareToken?: string;
  shareExpiresAt?: Date | null;
  pdfGeneratedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  clientInteractions?: Array<{ listingId?: Types.ObjectId; status?: string; updatedAt?: Date }>;
  clientComments?: Array<{ listingId?: Types.ObjectId; text?: string; createdAt?: Date }>;
  visitRequests?: Array<{ listingId?: Types.ObjectId; preferredDates?: string[]; note?: string; createdAt?: Date }>;
  clientFeedbackSeenAt?: Date | null;
  leadId?: Types.ObjectId | null;
};

function listingLabel(listing: Record<string, any> | undefined, listingId: string) {
  if (!listing) return `Space ${listingId.slice(-6)}`;
  const op = listing.operator || '';
  const micro = listing.micro || '';
  if (op && micro) return `${op} · ${micro}`;
  return op || micro || `Space ${listingId.slice(-6)}`;
}

function feedbackCounts(doc: ProposalHistoryDoc) {
  const interactions = doc.clientInteractions || [];
  return {
    shortlisted: interactions.filter((x) => x.status === 'shortlisted').length,
    rejected: interactions.filter((x) => x.status === 'rejected').length,
    comments: (doc.clientComments || []).length,
    visitRequests: (doc.visitRequests || []).length,
    total: interactions.length + (doc.clientComments || []).length + (doc.visitRequests || []).length,
  };
}

function countNewFeedback(doc: ProposalHistoryDoc) {
  const seenAt = doc.clientFeedbackSeenAt ? new Date(doc.clientFeedbackSeenAt).getTime() : 0;
  let n = 0;
  for (const x of doc.clientInteractions || []) {
    if (new Date(x.updatedAt || 0).getTime() > seenAt) n += 1;
  }
  for (const x of doc.clientComments || []) {
    if (new Date(x.createdAt || 0).getTime() > seenAt) n += 1;
  }
  for (const x of doc.visitRequests || []) {
    if (new Date(x.createdAt || 0).getTime() > seenAt) n += 1;
  }
  return n;
}

function buildBrokerFeedback(
  doc: ProposalHistoryDoc,
  listingMap: Map<string, Record<string, any>>,
) {
  return {
    interactions: (doc.clientInteractions || []).map((x) => ({
      listingId: String(x.listingId),
      listingLabel: listingLabel(listingMap.get(String(x.listingId)), String(x.listingId)),
      status: x.status,
      updatedAt: x.updatedAt || null,
    })),
    comments: (doc.clientComments || []).map((x) => ({
      listingId: x.listingId ? String(x.listingId) : '',
      listingLabel: x.listingId
        ? listingLabel(listingMap.get(String(x.listingId)), String(x.listingId))
        : 'Overall',
      text: x.text || '',
      createdAt: x.createdAt || null,
    })),
    visitRequests: (doc.visitRequests || []).map((x) => ({
      listingId: x.listingId ? String(x.listingId) : '',
      listingLabel: x.listingId
        ? listingLabel(listingMap.get(String(x.listingId)), String(x.listingId))
        : 'General',
      preferredDates: x.preferredDates || [],
      note: x.note || '',
      createdAt: x.createdAt || null,
    })),
    seenAt: doc.clientFeedbackSeenAt || null,
  };
}

function toHistoryResponse(doc: ProposalHistoryDoc) {
  const s = doc.summary || {};
  const feedback = feedbackCounts(doc);
  return {
    id: String(doc._id),
    title: doc.title || 'Untitled proposal',
    status: doc.status || 'draft',
    client: {
      name: doc.client?.name || '',
      company: doc.client?.company || '',
    },
    summary: {
      listingCount: s.listingCount ?? (doc.listingIds || []).length,
      cities: s.cities || [],
      operators: s.operators || [],
      priceMin: s.priceMin ?? 0,
      priceMax: s.priceMax ?? 0,
    },
    channel: doc.sendChannel || '',
    sentAt: doc.sentAt || null,
    pdfUrl: doc.pdfUrl || '',
    shareToken: doc.shareToken || '',
    shareExpiresAt: doc.shareExpiresAt || null,
    generatedAt: doc.pdfGeneratedAt || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    leadId: doc.leadId ? String(doc.leadId) : null,
    feedback,
    feedbackNewCount: countNewFeedback(doc),
  };
}

function defaultProposalTitle(
  client: { name?: string; company?: string } | undefined,
  count: number,
) {
  const who = client?.company || client?.name;
  const base = who ? `${who} — workspace proposal` : 'Workspace proposal';
  return `${base} · ${count} option${count !== 1 ? 's' : ''}`;
}

async function filterValidListingIds(ids: string[]) {
  if (!ids.length) return [];
  const objectIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  if (!objectIds.length) return [];
  const found = await Listing.find({ _id: { $in: objectIds } }).select('_id').lean().exec();
  const validSet = new Set(found.map((l) => String(l._id)));
  return ids.filter((id) => validSet.has(id));
}

async function getOrderedListings(listingIds: Types.ObjectId[]) {
  if (!listingIds.length) return [];
  const rows = await Listing.find({ _id: { $in: listingIds } }).lean().exec();
  const map = new Map(rows.map((l) => [String(l._id), l]));
  return listingIds
    .map((id) => map.get(String(id)))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
}

function renderToPdfListings(render: ProposalRenderInput): PdfListing[] {
  return render.listings.map((l) => ({
    operator: l.operator,
    type: l.type,
    city: l.city,
    micro: l.micro,
    seats: l.seats,
    price: l.price,
    avail: l.avail,
    freshLabel: l.freshLabel,
    amenities: l.amenities,
    buildingType: l.buildingType,
    nearestMetro: l.nearestMetro,
    carpet: l.carpet,
    securityDeposit: l.securityDeposit || '—',
    noticePeriod: l.noticePeriod || '—',
    gallery: l.gallery.map((g) => ({ src: g.src, label: g.label })),
  }));
}

async function resolvePdfContent(
  proposal: Pick<ProposalDocument, 'listingIds' | 'client' | 'title'>,
  render: ProposalRenderInput | undefined,
  title: string | undefined,
) {
  if (!proposal.listingIds?.length) {
    throw new ApiError(400, 'Add at least one space before generating PDF', 'EMPTY_PROPOSAL');
  }

  // Prefer the exact render payload from the client (mirrors the live preview),
  // falling back to DB-derived data when it isn't supplied.
  let pdfListings: PdfListing[];
  if (render && render.listings.length) {
    pdfListings = renderToPdfListings(render);
  } else {
    const listings = await getOrderedListings(proposal.listingIds);
    pdfListings = listings.map((l) => mapListingToPdf(l));
  }

  const resolvedTitle =
    title?.trim() || proposal.title?.trim() || defaultProposalTitle(proposal.client, pdfListings.length);

  const prices = pdfListings.map((l) => Number(l.price)).filter((n) => Number.isFinite(n));
  const summary = {
    listingCount: pdfListings.length,
    cities: [...new Set(pdfListings.map((l) => l.city).filter(Boolean))],
    operators: [...new Set(pdfListings.map((l) => l.operator).filter(Boolean))],
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
  };

  return { resolvedTitle, pdfListings, summary };
}

async function uploadPdfForProposal(
  stored: ProposalDocument,
  resolvedTitle: string,
  pdfListings: PdfListing[],
  coverNoteText: string,
) {
  const { buffer, pageCount } = await buildProposalPdf({
    title: resolvedTitle,
    clientName: stored.client?.name || '',
    clientCompany: stored.client?.company || '',
    coverNote: coverNoteText,
    listings: pdfListings,
  });

  const uploaded = await uploadProposalPdf(String(stored._id), buffer);
  stored.pdfUrl = uploaded.url;
  stored.pdfKey = uploaded.key;
  stored.pdfGeneratedAt = new Date();
  await stored.save();

  return {
    pdf: {
      url: uploaded.url,
      key: uploaded.key,
      generatedAt: stored.pdfGeneratedAt,
      sizeBytes: buffer.length,
      pageCount,
    },
  };
}

async function updateStoredProposal(
  storedId: string,
  draft: ProposalDocument,
  render: ProposalRenderInput | undefined,
  title: string | undefined,
  actor: { id: string; role: string },
) {
  const stored = await getStoredProposalDoc(storedId, actor);
  const { resolvedTitle, pdfListings, summary } = await resolvePdfContent(draft, render, title);

  stored.title = resolvedTitle;
  stored.client = {
    name: draft.client?.name || '',
    company: draft.client?.company || '',
  };
  stored.listingIds = draft.listingIds;
  stored.coverNote = draft.coverNote || '';
  stored.coverNoteIdx = draft.coverNoteIdx ?? 0;
  stored.summary = summary;

  const { pdf } = await uploadPdfForProposal(stored, resolvedTitle, pdfListings, stored.coverNote || '');
  return { stored, pdf };
}

async function createStoredProposal(
  proposal: ProposalDocument,
  render: ProposalRenderInput | undefined,
  title: string | undefined,
  status: 'generated' | 'sent',
  extra?: { channel?: 'whatsapp' | 'email'; sentBy?: string },
) {
  const { resolvedTitle, pdfListings, summary } = await resolvePdfContent(proposal, render, title);

  // Each generate/send produces a NEW, immutable stored proposal so the full
  // history is preserved (the draft remains the live editing workspace).
  const stored = await Proposal.create({
    title: resolvedTitle,
    status,
    client: {
      name: proposal.client?.name || '',
      company: proposal.client?.company || '',
    },
    listingIds: proposal.listingIds,
    coverNote: proposal.coverNote || '',
    coverNoteIdx: proposal.coverNoteIdx ?? 0,
    summary,
    sendChannel: status === 'sent' ? extra?.channel : undefined,
    sentAt: status === 'sent' ? new Date() : undefined,
    sentBy: extra?.sentBy || 'Rohit',
    createdBy: proposal.createdBy,
    leadId: proposal.leadId || undefined,
  });

  const { pdf } = await uploadPdfForProposal(stored, resolvedTitle, pdfListings, stored.coverNote || '');
  return { stored, pdf };
}

export async function countProposalsSentToday(actor?: { id: string; role: string }) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const q: Record<string, unknown> = { status: 'sent', sentAt: { $gte: startOfDay } };
  if (actor && actor.role !== 'admin') q.createdBy = new Types.ObjectId(actor.id);
  return Proposal.countDocuments(q);
}

// Each user owns exactly one editable draft.
export async function getOrCreateDraft(userId: string) {
  const owner = new Types.ObjectId(userId);
  let draft = await Proposal.findOne({ status: 'draft', createdBy: owner }).sort({ updatedAt: -1 }).exec();
  if (!draft) {
    draft = await Proposal.create({ status: 'draft', createdBy: owner });
  }
  return toDraftResponse(draft);
}

export async function updateDraft(input: ProposalDraftUpdateInput, userId: string) {
  const owner = new Types.ObjectId(userId);
  let draft = await Proposal.findOne({ status: 'draft', createdBy: owner }).sort({ updatedAt: -1 }).exec();
  if (!draft) draft = await Proposal.create({ status: 'draft', createdBy: owner });

  if (input.client) {
    draft.client = {
      name: input.client.name ?? draft.client?.name ?? '',
      company: input.client.company ?? draft.client?.company ?? '',
    };
  }
  if (input.title !== undefined) draft.title = input.title;
  if (input.coverNote !== undefined) draft.coverNote = input.coverNote;
  if (input.coverNoteIdx !== undefined) draft.coverNoteIdx = input.coverNoteIdx;
  if (input.listingIds) {
    draft.listingIds = (await filterValidListingIds(input.listingIds)).map((id) => new Types.ObjectId(id));
  }
  if (input.leadId !== undefined) {
    draft.leadId = input.leadId && Types.ObjectId.isValid(input.leadId)
      ? new Types.ObjectId(input.leadId)
      : undefined;
  }

  await draft.save();
  return toDraftResponse(draft);
}

function resetDraftWorkspace(draft: ProposalDocument) {
  draft.title = '';
  draft.client = { name: '', company: '' };
  draft.listingIds = [];
  draft.coverNote = '';
  draft.coverNoteIdx = 0;
  draft.leadId = undefined;
}

async function maybeLinkLead(actor: AuthUser, proposalId: string, leadId?: string | null) {
  if (!leadId) return;
  try {
    await attachProposalToLead(leadId, proposalId, actor);
    await Proposal.findByIdAndUpdate(proposalId, { leadId: new Types.ObjectId(leadId) }).exec();
  } catch {
    // linking is best-effort — proposal still saved
  }
}

export async function generateDraftPdf(
  actor: AuthUser,
  render?: ProposalRenderInput,
  title?: string,
  updateProposalId?: string,
  leadId?: string,
) {
  const owner = new Types.ObjectId(actor.id);
  const draft = await Proposal.findOne({ status: 'draft', createdBy: owner }).sort({ updatedAt: -1 }).exec();
  if (!draft) throw new ApiError(404, 'Draft proposal not found', 'NOT_FOUND');

  // Keep the typed name on the draft so the builder remembers it.
  const trimmedTitle = title?.trim();
  if (trimmedTitle && trimmedTitle !== draft.title) {
    draft.title = trimmedTitle;
    await draft.save();
  }

  if (updateProposalId) {
    const { stored, pdf } = await updateStoredProposal(updateProposalId, draft, render, title, actor);
    await maybeLinkLead(actor, String(stored._id), leadId || (draft.leadId ? String(draft.leadId) : null));
    return { draft: toDraftResponse(draft), proposal: toHistoryResponse(stored as unknown as ProposalHistoryDoc), pdf };
  }

  const linkedLeadId = leadId || (draft.leadId ? String(draft.leadId) : null);
  const { stored, pdf } = await createStoredProposal(draft, render, title, 'generated');
  await maybeLinkLead(actor, String(stored._id), linkedLeadId);
  resetDraftWorkspace(draft);
  await draft.save();
  return { draft: toDraftResponse(draft), proposal: toHistoryResponse(stored as unknown as ProposalHistoryDoc), pdf };
}

function toDetailResponse(doc: ProposalHistoryDoc & {
  listingIds?: Types.ObjectId[];
  coverNote?: string;
  coverNoteIdx?: number;
  createdBy?: Types.ObjectId;
}) {
  return {
    ...toHistoryResponse(doc),
    listingIds: (doc.listingIds || []).map((id) => String(id)),
    coverNote: doc.coverNote || '',
    coverNoteIdx: doc.coverNoteIdx ?? 0,
  };
}

async function getStoredProposalDoc(id: string, actor: { id: string; role: string }) {
  const doc = await Proposal.findOne({
    _id: id,
    status: { $in: ['sent', 'generated'] },
  }).exec();
  if (!doc) throw new ApiError(404, 'Proposal not found', 'NOT_FOUND');
  if (actor.role !== 'admin' && String(doc.createdBy) !== actor.id) {
    throw new ApiError(403, 'You do not have access to this proposal', 'FORBIDDEN');
  }
  return doc;
}

export async function getStoredProposal(id: string, actor: { id: string; role: string }) {
  const doc = await getStoredProposalDoc(id, actor);
  const listings = await getOrderedListings(doc.listingIds || []);
  const listingMap = new Map(listings.map((l) => [String(l._id), l as Record<string, any>]));
  const historyDoc = doc as unknown as ProposalHistoryDoc & {
    listingIds?: Types.ObjectId[];
    coverNote?: string;
    coverNoteIdx?: number;
  };
  return {
    ...toDetailResponse(historyDoc),
    feedbackDetail: buildBrokerFeedback(historyDoc, listingMap),
    feedbackNewCount: countNewFeedback(historyDoc),
  };
}

export async function markProposalFeedbackSeen(id: string, actor: { id: string; role: string }) {
  const doc = await getStoredProposalDoc(id, actor);
  doc.clientFeedbackSeenAt = new Date();
  await doc.save();
  return {
    seenAt: doc.clientFeedbackSeenAt,
    feedbackNewCount: 0,
  };
}

export async function getProposalPdfBuffer(id: string, actor: { id: string; role: string }) {
  const doc = await getStoredProposalDoc(id, actor);
  if (doc.pdfKey) {
    return downloadBuffer(doc.pdfKey);
  }
  if (!doc.pdfUrl) {
    throw new ApiError(404, 'PDF not found for this proposal', 'NOT_FOUND');
  }
  const res = await fetch(doc.pdfUrl);
  if (!res.ok) {
    throw new ApiError(404, 'PDF not found for this proposal', 'NOT_FOUND');
  }
  return Buffer.from(await res.arrayBuffer());
}

async function getPublicProposalDoc(token: string) {
  const doc = await Proposal.findOne({
    shareToken: token,
    status: { $in: ['sent', 'generated'] },
  }).exec();
  if (!doc) throw new ApiError(404, 'Proposal link not found', 'NOT_FOUND');
  if (!doc.shareExpiresAt || doc.shareExpiresAt.getTime() < Date.now()) {
    throw new ApiError(410, 'Proposal link has expired', 'LINK_EXPIRED');
  }
  return doc;
}

function newShareToken() {
  return randomBytes(24).toString('base64url');
}

function shareExpiry(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function getOrCreateProposalShareLink(id: string, actor: { id: string; role: string }) {
  const doc = await getStoredProposalDoc(id, actor);
  if (!doc.shareToken || !doc.shareExpiresAt || doc.shareExpiresAt.getTime() < Date.now()) {
    let token = newShareToken();
    // Extremely unlikely, but keep token generation collision-safe.
    while (await Proposal.exists({ shareToken: token })) token = newShareToken();
    doc.shareToken = token;
    doc.shareExpiresAt = shareExpiry();
    await doc.save();
  }
  return {
    shareToken: doc.shareToken,
    sharePath: `/p/${doc.shareToken}`,
    expiresAt: doc.shareExpiresAt,
  };
}

function publicPhotoUrl(seed: string, w = 900, h = 560) {
  const ids = [
    'photo-1497366754035-f200968a6e72',
    'photo-1497366811353-6870744d04b2',
    'photo-1524758631624-e2822e304c36',
    'photo-1556761175-5973dc0f32e7',
    'photo-1497215728101-856f4ea42174',
    'photo-1604328698692-f76ea9498e76',
  ];
  let hsh = 0;
  for (const c of seed) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  const id = ids[hsh % ids.length];
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=72`;
}

function publicListingCard(listing: Record<string, any>) {
  const profile = listing.profile || {};
  const identity = profile.identity || {};
  const pricing = profile.pricing || {};
  const contactsMedia = profile.contactsMedia || {};
  const id = String(listing._id || listing.id);
  const images = Array.isArray(listing.images) && listing.images.length
    ? listing.images
    : [publicPhotoUrl(id)];

  return {
    id,
    operator: listing.operator || '',
    type: listing.type || '',
    city: listing.city || '',
    micro: listing.micro || '',
    seats: listing.seats || 0,
    price: listing.price || 0,
    avail: listing.avail || '',
    amenities: listing.amenities || [],
    images,
    address: identity.address || '',
    nearestMetro: identity.nearestMetro || '',
    buildingType: identity.buildingType || '',
    carpet: identity.carpet || 0,
    securityDeposit: pricing.securityDeposit || '',
    noticePeriod: pricing.noticePeriod || '',
    brochure: contactsMedia.brochure || '',
    website: contactsMedia.website || '',
  };
}

function publicFeedback(doc: any) {
  return {
    interactions: (doc.clientInteractions || []).map((x: any) => ({
      listingId: String(x.listingId),
      status: x.status,
      comment: x.comment || '',
      updatedAt: x.updatedAt || null,
    })),
    comments: (doc.clientComments || []).map((x: any) => ({
      listingId: x.listingId ? String(x.listingId) : '',
      text: x.text || '',
      createdAt: x.createdAt || null,
    })),
    visitRequests: (doc.visitRequests || []).map((x: any) => ({
      listingId: x.listingId ? String(x.listingId) : '',
      preferredDates: x.preferredDates || [],
      note: x.note || '',
      createdAt: x.createdAt || null,
    })),
  };
}

export async function getPublicProposal(token: string) {
  const doc = await getPublicProposalDoc(token);
  const listingIds = (doc.listingIds || []).map((id) => new Types.ObjectId(id));
  const listings = listingIds.length ? await getOrderedListings(listingIds) : [];
  return {
    proposal: {
      id: String(doc._id),
      title: doc.title || 'Workspace proposal',
      client: {
        name: doc.client?.name || '',
        company: doc.client?.company || '',
      },
      coverNote: doc.coverNote || '',
      sentBy: doc.sentBy || 'Spacehaat',
      pdfUrl: doc.pdfUrl || '',
      expiresAt: doc.shareExpiresAt || null,
      summary: doc.summary || {},
    },
    listings: listings.map((l) => publicListingCard(l as Record<string, any>)),
    feedback: publicFeedback(doc),
  };
}

export async function updatePublicProposalFeedback(token: string, input: PublicProposalFeedbackInput) {
  const doc = await getPublicProposalDoc(token);
  const mutableDoc = doc as any;
  const listingIds = new Set((doc.listingIds || []).map((id) => String(id)));
  const listingId = input.listingId || '';

  if (listingId && !listingIds.has(listingId)) {
    throw new ApiError(400, 'Listing is not part of this proposal', 'INVALID_LISTING');
  }

  if (listingId && input.status) {
    mutableDoc.clientInteractions = (doc.clientInteractions || []).filter((x: any) => String(x.listingId) !== listingId);
    if (input.status !== 'none') {
      mutableDoc.clientInteractions.push({
        listingId: new Types.ObjectId(listingId),
        status: input.status,
        comment: input.comment || '',
        updatedAt: new Date(),
      });
    }
  }

  if (input.comment && !input.status) {
    if (!mutableDoc.clientComments) mutableDoc.clientComments = [];
    mutableDoc.clientComments.push({
      listingId: listingId ? new Types.ObjectId(listingId) : undefined,
      text: input.comment,
      createdAt: new Date(),
    });
  }

  if (input.preferredDates?.length) {
    if (!mutableDoc.visitRequests) mutableDoc.visitRequests = [];
    mutableDoc.visitRequests.push({
      listingId: listingId ? new Types.ObjectId(listingId) : undefined,
      preferredDates: input.preferredDates,
      note: input.visitNote || '',
      createdAt: new Date(),
    });
    if (doc.leadId) {
      void advanceLeadOnClientVisit(doc.leadId);
    }
  }

  await doc.save();
  return { feedback: publicFeedback(doc) };
}

export async function getPublicProposalPdfBuffer(token: string) {
  const doc = await getPublicProposalDoc(token);
  if (doc.pdfKey) return downloadBuffer(doc.pdfKey);
  if (!doc.pdfUrl) throw new ApiError(404, 'PDF not found for this proposal', 'NOT_FOUND');
  const res = await fetch(doc.pdfUrl);
  if (!res.ok) throw new ApiError(404, 'PDF not found for this proposal', 'NOT_FOUND');
  return Buffer.from(await res.arrayBuffer());
}

export async function loadStoredProposalToDraft(id: string, actor: { id: string; role: string }) {
  const doc = await getStoredProposalDoc(id, actor);
  const listingIds = (await filterValidListingIds(
    (doc.listingIds || []).map((x) => String(x)),
  ));

  const draft = await updateDraft(
    {
      title: doc.title || '',
      client: {
        name: doc.client?.name || '',
        company: doc.client?.company || '',
      },
      listingIds,
      coverNote: doc.coverNote || '',
      coverNoteIdx: doc.coverNoteIdx ?? 0,
    },
    actor.id,
  );

  return { draft, sourceProposalId: String(doc._id) };
}

export async function listProposals(
  actor: { id: string; role: string },
  options: { page?: number; limit?: number; search?: string } = {},
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 15));
  const skip = (page - 1) * limit;

  const q: Record<string, unknown> = { status: { $in: ['sent', 'generated'] } };
  if (actor.role !== 'admin') q.createdBy = new Types.ObjectId(actor.id);

  const search = options.search?.trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    q.$or = [
      { title: re },
      { 'client.name': re },
      { 'client.company': re },
    ];
  }

  const [rows, total] = await Promise.all([
    Proposal.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
    Proposal.countDocuments(q),
  ]);

  const allForCount = await Proposal.find(q).select('clientInteractions clientComments visitRequests clientFeedbackSeenAt').lean().exec();
  const feedbackNewTotal = allForCount.reduce((sum, doc) => sum + countNewFeedback(doc as ProposalHistoryDoc), 0);

  return {
    items: rows.map((doc) => toHistoryResponse(doc as unknown as ProposalHistoryDoc)),
    total,
    page,
    limit,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    feedbackNewTotal,
  };
}

export async function sendDraft(input: ProposalSendInput, actor: AuthUser) {
  const owner = new Types.ObjectId(actor.id);
  const draft = await Proposal.findOne({ status: 'draft', createdBy: owner }).sort({ updatedAt: -1 }).exec();
  if (!draft) throw new ApiError(404, 'Draft proposal not found', 'NOT_FOUND');
  if (!draft.listingIds?.length) {
    throw new ApiError(400, 'Add at least one space before sending', 'EMPTY_PROPOSAL');
  }

  const listings = await Listing.find({ _id: { $in: draft.listingIds } }).select('micro seats').lean().exec();
  const clientLabel = draft.client?.company || draft.client?.name || 'a client';
  const listingCount = draft.listingIds.length;
  const linkedLeadId = input.leadId || (draft.leadId ? String(draft.leadId) : null);

  const { stored, pdf } = await createStoredProposal(draft, input.render, input.title, 'sent', {
    channel: input.channel,
    sentBy: input.sentBy || actor.name || '',
  });

  await maybeLinkLead(actor, String(stored._id), linkedLeadId);

  const activity = await Activity.create({
    kind: 'proposal',
    who: stored.sentBy || 'Rohit',
    text: `sent a proposal to ${clientLabel}`,
    sub: `${listingCount} spaces · ${listings[0]?.micro || 'multiple locations'} · via ${input.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}`,
  });

  // Clear the draft so the builder resets after sending.
  resetDraftWorkspace(draft);
  await draft.save();

  const proposalsSentToday = await countProposalsSentToday(actor);

  return {
    sent: toHistoryResponse(stored as unknown as ProposalHistoryDoc),
    draft: toDraftResponse(draft),
    pdf,
    activity: {
      kind: activity.kind,
      who: activity.who,
      text: activity.text,
      sub: activity.sub,
      mins: 0,
      at: activity.createdAt,
    },
    stats: { proposalsSentToday },
  };
}

export async function listRecentActivity(limit = 20) {
  const items = await Activity.find().sort({ createdAt: -1 }).limit(limit).lean().exec();
  const now = Date.now();
  return items.map((a) => ({
    kind: a.kind,
    who: a.who,
    text: a.text,
    sub: a.sub,
    mins: Math.max(0, Math.floor((now - new Date(a.createdAt).getTime()) / 60000)),
  }));
}
