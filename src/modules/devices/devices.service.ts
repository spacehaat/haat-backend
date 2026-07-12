import { Types } from 'mongoose';
import type { AuthUser } from '../auth/permissions.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { User } from '../users/users.model.js';
import { Device } from './devices.model.js';
import { Lead } from '../leads/leads.model.js';
import type { DeviceRegisterInput } from './devices.schema.js';

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

const LEAD_ACCESS_PERMS = [PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_WRITE];

async function sendExpoPush(tokens: string[], message: PushMessage) {
  if (!tokens.length) return;

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  await Promise.all(chunks.map(async (batch) => {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch.map((to) => ({
        to,
        sound: 'default',
        title: message.title,
        body: message.body,
        channelId: 'default',
        data: message.data || {},
      }))),
    });
    const json = await res.json().catch(() => null) as
      | { data?: Array<{ status?: string; message?: string; details?: unknown }> }
      | null;
    if (json?.data) {
      for (const item of json.data) {
        if (item.status === 'error') {
          // eslint-disable-next-line no-console
          console.error('[push] Expo send error:', item.message, item.details);
        }
      }
    }
  }));
}

export async function registerDevice(input: DeviceRegisterInput, user: AuthUser) {
  await Device.findOneAndUpdate(
    { token: input.token },
    {
      userId: new Types.ObjectId(user.id),
      token: input.token,
      platform: input.platform,
      lastSeenAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await notifyOverdueLeads(user.id).catch(() => {});
}

export async function unregisterDevice(token: string, user: AuthUser) {
  await Device.deleteOne({ token, userId: new Types.ObjectId(user.id) });
}

async function tokensForUser(userId: string) {
  const docs = await Device.find({ userId: new Types.ObjectId(userId) }).select('token').lean();
  return docs.map((d) => d.token).filter(Boolean);
}

export async function notifyUser(userId: string, message: PushMessage) {
  const tokens = await tokensForUser(userId);
  await sendExpoPush(tokens, message);
}

export async function notifyLeadAssigned(assigneeId: string, leadTitle: string, leadId: string) {
  await notifyUser(assigneeId, {
    title: 'New lead assigned',
    body: leadTitle,
    data: { type: 'lead_assigned', leadId },
  });
}

/**
 * Notify members about a newly created lead.
 * Excludes the creator (e.g. admin who added the lead).
 * Assignee gets a stronger "assigned" message; other city members get "new lead".
 */
export async function notifyMembersOfNewLead(input: {
  leadId: string;
  leadTitle: string;
  city: string;
  excludeUserId: string;
  assigneeId?: string | null;
}) {
  const { leadId, leadTitle, city, excludeUserId, assigneeId } = input;

  const query: Record<string, unknown> = {
    status: 'active',
    role: 'member',
    permissions: { $in: LEAD_ACCESS_PERMS },
    _id: { $ne: new Types.ObjectId(excludeUserId) },
  };
  if (city) {
    query.cities = city;
  }

  const members = await User.find(query).select('_id').lean().exec();
  const memberIds = members.map((m) => String(m._id));

  // Always include the assignee (if a member and not the creator), even if city scope missed them.
  if (
    assigneeId
    && assigneeId !== excludeUserId
    && Types.ObjectId.isValid(assigneeId)
    && !memberIds.includes(assigneeId)
  ) {
    const assignee = await User.findOne({
      _id: assigneeId,
      status: 'active',
      role: 'member',
    }).select('_id').lean().exec();
    if (assignee) memberIds.push(String(assignee._id));
  }

  await Promise.all(
    memberIds.map(async (userId) => {
      const isAssignee = assigneeId === userId;
      await notifyUser(userId, {
        title: isAssignee ? 'New lead assigned' : 'New lead added',
        body: isAssignee
          ? leadTitle
          : city
            ? `${leadTitle} · ${city}`
            : leadTitle,
        data: {
          type: isAssignee ? 'lead_assigned' : 'lead_created',
          leadId,
        },
      });
    }),
  );
}

export async function notifyOverdueLeads(userId: string) {
  const now = new Date();
  const overdue = await Lead.find({
    assigneeId: new Types.ObjectId(userId),
    dueAt: { $lt: now },
    stage: { $nin: ['won', 'lost'] },
  })
    .sort({ dueAt: 1 })
    .limit(5)
    .lean();

  if (!overdue.length) return;

  const first = overdue[0]!;
  const count = overdue.length;
  const title = count === 1 ? 'Follow-up overdue' : `${count} follow-ups overdue`;
  const body = count === 1
    ? `${first.name || first.company || 'Lead'} needs attention`
    : `Including ${first.name || first.company || 'a lead'} — tap to review`;

  await notifyUser(userId, {
    title,
    body,
    data: {
      type: 'follow_up_overdue',
      leadId: String(first._id),
    },
  });
}
