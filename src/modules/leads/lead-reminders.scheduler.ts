import { Lead } from './leads.model.js';
import { notifyLeadReminder } from '../devices/devices.service.js';

function buildLeadTitle(lead: { name?: string; company?: string }) {
  return lead.name || lead.company || 'Lead follow-up';
}

export async function processDueLeadReminders() {
  const now = new Date();
  const dueLeads = await Lead.find({
    assigneeId: { $exists: true, $ne: null },
    reminderSetAt: { $exists: true, $ne: null },
    dueAt: { $lte: now },
    stage: { $nin: ['won', 'lost'] },
    $or: [
      { reminderSentAt: null },
      { reminderSentAt: { $exists: false } },
      { $expr: { $ne: ['$reminderSentAt', '$dueAt'] } },
    ],
  })
    .sort({ dueAt: 1 })
    .limit(50)
    .lean()
    .exec();

  if (!dueLeads.length) return 0;

  let sent = 0;
  for (const lead of dueLeads) {
    if (!lead.assigneeId || !lead.dueAt) continue;
    const leadId = String(lead._id);
    const assigneeId = String(lead.assigneeId);
    const title = buildLeadTitle(lead);

    await notifyLeadReminder(assigneeId, title, leadId);
    await Lead.updateOne(
      { _id: lead._id },
      { $set: { reminderSentAt: lead.dueAt } },
    );
    sent += 1;
  }

  if (sent > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reminders] sent ${sent} lead reminder(s)`);
  }
  return sent;
}

const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

export function startLeadReminderScheduler() {
  const tick = () => {
    void processDueLeadReminders().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[reminders] scheduler error', err);
    });
  };

  tick();
  const timer = setInterval(tick, REMINDER_INTERVAL_MS);
  timer.unref?.();
  // eslint-disable-next-line no-console
  console.log('[reminders] scheduler started (every 5 min)');
}
