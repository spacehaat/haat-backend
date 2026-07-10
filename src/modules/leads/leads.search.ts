import { Types } from 'mongoose';
import { LEAD_SOURCES, LEAD_STAGES } from './leads.model.js';
import { User } from '../users/users.model.js';

const STAGE_LABELS: Record<string, string> = {
  new: 'new',
  qualified: 'qualified',
  proposal_sent: 'proposal sent',
  visit_scheduled: 'visit scheduled',
  negotiation: 'negotiation',
  won: 'won',
  lost: 'lost',
};

const SOURCE_LABELS: Record<string, string> = {
  smart_match: 'smart match',
  manual: 'manual',
  referral: 'referral',
  website: 'website',
  whatsapp: 'whatsapp',
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stageMatches(search: string): string[] {
  const lower = search.toLowerCase().trim();
  const normalized = lower.replace(/\s+/g, '_');
  const hits = new Set<string>();

  for (const stage of LEAD_STAGES) {
    if (stage.includes(normalized) || normalized.includes(stage)) hits.add(stage);
    const label = STAGE_LABELS[stage] || stage;
    if (label.includes(lower) || lower.includes(label.replace(/_/g, ' '))) hits.add(stage);
  }
  return [...hits];
}

function sourceMatches(search: string): string[] {
  const lower = search.toLowerCase().trim();
  const hits = new Set<string>();

  for (const source of LEAD_SOURCES) {
    if (source.includes(lower.replace(/\s+/g, '_')) || lower.includes(source.replace(/_/g, ' '))) {
      hits.add(source);
    }
    const label = SOURCE_LABELS[source] || source;
    if (label.includes(lower) || lower.includes(label)) hits.add(source);
  }
  return [...hits];
}

export async function buildLeadSearchFilter(search: string) {
  const trimmed = search.trim();
  if (!trimmed) return null;

  const escaped = escapeRegex(trimmed);
  const re = new RegExp(escaped, 'i');
  const or: Record<string, unknown>[] = [
    { name: re },
    { company: re },
    { email: re },
    { contact: re },
    { city: re },
    { microlocation: re },
    { moveIn: re },
    { rawEnquiry: re },
    { interestedIn: re },
    { source: re },
    { stage: re },
    { title: re },
    { 'client.name': re },
    { 'client.company': re },
    { 'client.email': re },
    { 'client.phone': re },
    { 'requirement.rawEnquiry': re },
    { 'requirement.parsed.city': re },
    { 'requirement.parsed.micro': re },
    { 'requirement.parsed.spaceType': re },
    { 'requirement.parsed.moveIn': re },
  ];

  for (const stage of stageMatches(trimmed)) {
    or.push({ stage }, { status: stage });
  }

  for (const source of sourceMatches(trimmed)) {
    or.push({ source });
  }

  const numeric = Number(trimmed.replace(/[,₹\s]/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) {
    or.push({ seats: numeric }, { budget: numeric });
  }

  const assignees = await User.find({
    status: 'active',
    $or: [{ name: re }, { email: re }],
  }).select('_id').lean().exec();

  if (assignees.length) {
    or.push({ assigneeId: { $in: assignees.map((u) => u._id) } });
  }

  if (Types.ObjectId.isValid(trimmed) && trimmed.length === 24) {
    or.push({ _id: new Types.ObjectId(trimmed) });
  }

  return { $or: or };
}
