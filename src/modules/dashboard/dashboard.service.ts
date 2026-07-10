import { Types } from 'mongoose';
import { cityScope, type AuthUser } from '../auth/permissions.js';
import { countOpenLeads, countOverdueLeads, listOverdueLeads } from '../leads/leads.service.js';
import { Listing } from '../listings/listings.model.js';
import { freshOfDays } from '../listings/listings.service.js';
import { Proposal } from '../proposals/proposals.model.js';

function daysSince(d: Date) {
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function listingQueryForUser(user: AuthUser) {
  const scope = cityScope(user);
  if (scope === null) return {};
  if (!scope.length) return { city: { $in: [] } };
  return { city: { $in: scope } };
}

function proposalQueryForUser(user: AuthUser) {
  if (user.role === 'admin') return {};
  return { createdBy: new Types.ObjectId(user.id) };
}

async function countProposalsSentBetween(user: AuthUser, from: Date, to: Date) {
  return Proposal.countDocuments({
    ...proposalQueryForUser(user),
    status: 'sent',
    sentAt: { $gte: from, $lt: to },
  });
}

export async function getDashboardStats(user: AuthUser) {
  const listingQ = listingQueryForUser(user);
  const rows = await Listing.find(listingQ).select('verifiedAt createdAt city').lean().exec();

  const weekAgo = startOfDay();
  weekAgo.setDate(weekAgo.getDate() - 7);

  let fresh = 0;
  let stale = 0;
  let expired = 0;
  let addedThisWeek = 0;

  for (const row of rows) {
    const days = row.verifiedAt ? daysSince(new Date(row.verifiedAt)) : 999;
    const state = freshOfDays(days).state;
    if (state === 'fresh') fresh += 1;
    else if (state === 'stale') stale += 1;
    else expired += 1;

    if (row.createdAt && new Date(row.createdAt) >= weekAgo) addedThisWeek += 1;
  }

  const total = rows.length;
  const freshPct = total ? Math.round((fresh / total) * 100) : 0;

  const todayStart = startOfDay();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [sentToday, sentYesterday, sentThisWeek, generatedTotal, openLeads, overdueLeads, overdueLeadItems] =
    await Promise.all([
      countProposalsSentBetween(user, todayStart, tomorrowStart),
      countProposalsSentBetween(user, yesterdayStart, todayStart),
      Proposal.countDocuments({
        ...proposalQueryForUser(user),
        status: 'sent',
        sentAt: { $gte: weekAgo },
      }),
      Proposal.countDocuments({
        ...proposalQueryForUser(user),
        status: { $in: ['sent', 'generated'] },
      }),
      countOpenLeads(user),
      countOverdueLeads(user),
      listOverdueLeads(user, 5),
    ]);

  const proposalsDelta = sentToday - sentYesterday;

  return {
    listings: {
      total,
      fresh,
      stale,
      expired,
      needsReverify: stale + expired,
      addedThisWeek,
      freshPct,
    },
    proposals: {
      sentToday,
      sentYesterday,
      sentThisWeek,
      generatedTotal,
      deltaVsYesterday: proposalsDelta,
    },
    leads: {
      open: openLeads,
      overdue: overdueLeads,
    },
    attention: {
      staleListings: stale + expired,
      expiredListings: expired,
      overdueLeads: overdueLeadItems,
    },
  };
}
