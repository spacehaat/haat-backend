import { Types } from 'mongoose';
import { ApiError } from '../../utils/apiError.js';
import { hasPermission, isAdmin, PERMISSIONS, type AuthUser } from '../auth/permissions.js';
import { User } from '../users/users.model.js';
import { Lead } from './leads.model.js';

const LEAD_ACCESS_PERMS = [PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_WRITE];

function userCanTakeLeads(permissions: string[] = []) {
  return LEAD_ACCESS_PERMS.some((p) => permissions.includes(p));
}

export async function assertAssigneeEligible(assigneeId: string, city: string) {
  if (!Types.ObjectId.isValid(assigneeId)) {
    throw new ApiError(400, 'Invalid assignee', 'INVALID_INPUT');
  }

  const user = await User.findById(assigneeId).select('name role cities permissions status').lean().exec();
  if (!user || user.status !== 'active') {
    throw new ApiError(400, 'Assignee must be an active user', 'INVALID_INPUT');
  }

  if (user.role === 'admin') return user;

  if (!userCanTakeLeads(user.permissions || [])) {
    throw new ApiError(400, 'Assignee does not have lead access', 'INVALID_INPUT');
  }

  if (city && !(user.cities || []).includes(city)) {
    throw new ApiError(400, `Assignee is not scoped to ${city}`, 'INVALID_INPUT');
  }

  return user;
}

export async function findAutoAssigneeForCity(city: string): Promise<string | null> {
  if (!city) return null;

  const members = await User.find({
    status: 'active',
    role: 'member',
    cities: city,
    permissions: { $in: LEAD_ACCESS_PERMS },
  }).select('_id').lean().exec();

  if (members.length) {
    const scored = await Promise.all(
      members.map(async (member) => {
        const openLeads = await Lead.countDocuments({
          assigneeId: member._id,
          city,
          $or: [
            { stage: { $nin: ['won', 'lost'] } },
            { status: { $nin: ['won', 'lost'] } },
          ],
        }).exec();
        return { id: String(member._id), openLeads };
      }),
    );
    scored.sort((a, b) => a.openLeads - b.openLeads);
    return scored[0]?.id || null;
  }

  const admin = await User.findOne({ status: 'active', role: 'admin' }).select('_id').lean().exec();
  return admin ? String(admin._id) : null;
}

export async function resolveLeadAssignee(
  city: string,
  actor: AuthUser,
  requestedAssigneeId?: string | null,
): Promise<string> {
  if (requestedAssigneeId && Types.ObjectId.isValid(requestedAssigneeId)) {
    if (hasPermission(actor, PERMISSIONS.LEADS_ASSIGN) || isAdmin(actor)) {
      await assertAssigneeEligible(requestedAssigneeId, city);
      return requestedAssigneeId;
    }
    if (requestedAssigneeId === actor.id) return actor.id;
  }

  const auto = await findAutoAssigneeForCity(city);
  if (auto) return auto;

  return actor.id;
}

export type LeadAssigneeOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  cities: string[];
  openLeads: number;
  matchesCity: boolean;
};

export async function listLeadAssignees(city: string, actor: AuthUser) {
  const users = await User.find({ status: 'active' })
    .select('name email role cities permissions')
    .sort({ name: 1 })
    .lean()
    .exec();

  const eligible = users.filter((u) => {
    if (u.role === 'admin') return true;
    if (!userCanTakeLeads(u.permissions || [])) return false;
    if (!city) return true;
    return (u.cities || []).includes(city);
  });

  const items: LeadAssigneeOption[] = await Promise.all(
    eligible.map(async (u) => {
      const openLeads = await Lead.countDocuments({
        assigneeId: u._id,
        ...(city ? { city } : {}),
        $or: [
          { stage: { $nin: ['won', 'lost'] } },
          { status: { $nin: ['won', 'lost'] } },
        ],
      }).exec();
      return {
        id: String(u._id),
        name: u.name || '',
        email: u.email || '',
        role: u.role || 'member',
        cities: u.cities || [],
        openLeads,
        matchesCity: !city || u.role === 'admin' || (u.cities || []).includes(city),
      };
    }),
  );

  items.sort((a, b) => {
    if (a.matchesCity !== b.matchesCity) return a.matchesCity ? -1 : 1;
    return a.openLeads - b.openLeads || a.name.localeCompare(b.name);
  });

  const suggestedId = city
    ? (await findAutoAssigneeForCity(city))
    : (items[0]?.id || null);

  if (!hasPermission(actor, PERMISSIONS.LEADS_ASSIGN) && !isAdmin(actor)) {
    return { items: [], suggestedId, canAssign: false };
  }

  return { items, suggestedId, canAssign: true };
}

export async function attachAssigneeNames<T extends { assigneeId?: string }>(items: T[]) {
  const ids = [...new Set(items.map((i) => i.assigneeId).filter(Boolean))] as string[];
  if (!ids.length) {
    return items.map((i) => ({ ...i, assigneeName: '' }));
  }

  const users = await User.find({ _id: { $in: ids } }).select('name').lean().exec();
  const map = new Map(users.map((u) => [String(u._id), u.name || '']));
  return items.map((i) => ({
    ...i,
    assigneeName: i.assigneeId ? (map.get(i.assigneeId) || '') : '',
  }));
}
