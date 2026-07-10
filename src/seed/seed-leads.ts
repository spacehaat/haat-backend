import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Lead } from '../modules/leads/leads.model.js';
import { Listing } from '../modules/listings/listings.model.js';
import { User } from '../modules/users/users.model.js';

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(17, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

const DUMMY_LEADS = [
  {
    leadDate: daysAgo(1),
    name: 'Ananya Rao',
    contact: '+91 98765 43210',
    email: 'ananya@paynest.in',
    company: 'PayNest Labs',
    interestedIn: ['Private office'],
    city: 'Bangalore',
    microlocation: 'Koramangala',
    seats: 18,
    stage: 'new',
    source: 'whatsapp',
    budget: 9000,
    moveIn: '2026-07-15',
    rawEnquiry: 'Need 18 seats in Koramangala, budget ~9k/seat, move-in by mid-July. Parking + meeting rooms required.',
    dueAt: daysFromNow(2),
    notes: [{ text: 'Inbound on WhatsApp — asked for Awfis / IndiQube options.', who: 'Seed', at: new Date() }],
  },
  {
    leadDate: daysAgo(3),
    name: 'Rahul Mehta',
    contact: '+91 99887 76655',
    email: 'rahul@cloudstack.io',
    company: 'CloudStack India',
    interestedIn: ['Dedicated desk'],
    city: 'Bangalore',
    microlocation: 'Indiranagar',
    seats: 25,
    stage: 'qualified',
    source: 'referral',
    budget: 9500,
    moveIn: '2026-08-01',
    rawEnquiry: '25 dedicated desks near metro, Indiranagar or nearby. Budget flexible up to ₹9,500.',
    dueAt: daysFromNow(5),
    notes: [{ text: 'Referred by existing client at IndiQube.', who: 'Seed', at: new Date() }],
  },
  {
    leadDate: daysAgo(5),
    name: 'Priya Shah',
    contact: '+91 91234 56789',
    email: 'priya.shah@horizon.co',
    company: 'Horizon Consulting',
    interestedIn: ['Managed office'],
    city: 'Mumbai',
    microlocation: 'BKC',
    seats: 60,
    stage: 'proposal_sent',
    source: 'smart_match',
    budget: 13200,
    moveIn: '2026-07-01',
    rawEnquiry: 'Managed office for 60 in BKC. Need reception, gym access, 24x7. Proposal sent last week.',
    dueAt: daysFromNow(-1),
    notes: [
      { text: 'Matched via Smart Match — shortlist sent.', who: 'Seed', at: new Date() },
      { text: 'Follow up on proposal feedback.', who: 'Seed', at: new Date() },
    ],
  },
  {
    leadDate: daysAgo(2),
    name: 'Vikram Singh',
    contact: '+91 98100 12345',
    email: 'vikram@singhlaw.in',
    company: 'Singh & Associates',
    interestedIn: ['Private office'],
    city: 'Delhi NCR',
    microlocation: 'Cyber City, Gurgaon',
    seats: 16,
    stage: 'visit_scheduled',
    source: 'website',
    budget: 12000,
    moveIn: '2026-07-20',
    rawEnquiry: 'Private cabin for 16 lawyers in Cyber City. Vastu preferred. Visit booked for Friday.',
    dueAt: daysFromNow(3),
    notes: [{ text: 'Site visit scheduled — Innov8 Cyber City.', who: 'Seed', at: new Date() }],
  },
  {
    leadDate: daysAgo(7),
    name: 'Neha Patil',
    contact: '+91 97654 32109',
    email: 'neha@sproutworks.in',
    company: 'SproutWorks',
    interestedIn: ['Hot desk'],
    city: 'Pune',
    microlocation: 'Baner',
    seats: 45,
    stage: 'negotiation',
    source: 'manual',
    budget: 4600,
    moveIn: '2026-06-25',
    rawEnquiry: 'Flexible hot desks for ~45 in Baner. Negotiating on notice period and deposit.',
    dueAt: daysFromNow(-3),
    notes: [{ text: 'Client pushing for 1-month notice instead of standard terms.', who: 'Seed', at: new Date() }],
  },
];

async function main() {
  await connectDb();

  const user =
    (await User.findOne({ role: 'admin', status: 'active' }).select('_id name')) ??
    (await User.findOne({ status: 'active' }).select('_id name'));

  if (!user) {
    throw new Error('No active user found — log in once or run user seed before seeding leads.');
  }

  await Lead.deleteMany({});

  const listings = await Listing.find().select('_id city micro').limit(10).lean();
  const listingByCity = new Map<string, typeof listings>();
  for (const l of listings) {
    const key = String(l.city || '');
    if (!listingByCity.has(key)) listingByCity.set(key, []);
    listingByCity.get(key)!.push(l);
  }

  const docs = DUMMY_LEADS.map((lead) => {
    const cityListings = listingByCity.get(lead.city) ?? listings.slice(0, 2);
    const listingIds = cityListings.slice(0, 2).map((l) => l._id);

    return {
      ...lead,
      assigneeId: user._id,
      createdBy: user._id,
      listingIds,
      proposalIds: [],
      visitIds: [],
      lostReason: '',
      priority: 'normal',
      amenities: [],
    };
  });

  const created = await Lead.insertMany(docs);

  // eslint-disable-next-line no-console
  console.log(`[seed:leads] inserted ${created.length} leads into ${env.MONGODB_URI}`);
  created.forEach((l) => {
    // eslint-disable-next-line no-console
    console.log(`  - ${l.name} · ${l.stage} · ${l.city} · ${l.interestedIn?.join(', ')}`);
  });
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed:leads] failed', err);
  process.exit(1);
});
