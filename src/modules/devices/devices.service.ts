import { Types } from 'mongoose';
import type { AuthUser } from '../auth/permissions.js';
import { Device } from './devices.model.js';
import { Lead } from '../leads/leads.model.js';
import type { DeviceRegisterInput } from './devices.schema.js';

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

async function sendExpoPush(tokens: string[], message: PushMessage) {
  if (!tokens.length) return;

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  await Promise.all(chunks.map(async (batch) => {
    await fetch('https://exp.host/--/api/v2/push/send', {
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
        data: message.data || {},
      }))),
    });
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
