import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Lead } from '../modules/leads/leads.model.js';
import { User } from '../modules/users/users.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, 'noida-csv-leads.json');

type SeedLead = {
  rowNum: number;
  name: string;
  email: string;
  contact: string;
  interestedIn: string[];
  city: string;
  microlocation: string;
  seatRange: string;
  seats: number;
  leadDate: string;
  rawEnquiry: string;
  source: string;
  stage: string;
};

type SeedPayload = {
  leads: SeedLead[];
  toImport: number;
};

function normPhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function defaultDueAt(from: Date) {
  const d = new Date(from);
  d.setDate(d.getDate() + 2);
  return d;
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`Missing ${JSON_PATH}. Run: python3 src/seed/map-noida-csv-leads.py`);
  }

  const payload = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as SeedPayload;
  await connectDb();

  const user =
    (await User.findOne({ role: 'admin', status: 'active' }).select('_id name')) ??
    (await User.findOne({ status: 'active' }).select('_id name'));

  if (!user) {
    throw new Error('No active user found — log in once or run user seed before seeding leads.');
  }

  const existing = await Lead.find({}).select('contact').lean();
  const existingPhones = new Set(
    existing.map((lead) => normPhone(String(lead.contact || ''))).filter(Boolean),
  );

  const toInsert = payload.leads.filter((lead) => !existingPhones.has(normPhone(lead.contact)));
  const skippedExisting = payload.leads.length - toInsert.length;

  if (!toInsert.length) {
    // eslint-disable-next-line no-console
    console.log('[seed:noida-leads] nothing to insert — all phones already exist in DB');
    process.exit(0);
  }

  const docs = toInsert.map((lead) => {
    const leadDate = new Date(lead.leadDate);
    return {
      leadDate,
      createdAt: leadDate,
      updatedAt: leadDate,
      name: lead.name,
      contact: lead.contact,
      email: lead.email,
      company: '',
      interestedIn: lead.interestedIn,
      city: lead.city,
      microlocation: lead.microlocation,
      seats: lead.seats,
      seatRange: lead.seatRange,
      stage: lead.stage,
      source: lead.source,
      budget: 0,
      moveIn: '',
      rawEnquiry: lead.rawEnquiry,
      amenities: [],
      assigneeId: user._id,
      createdBy: user._id,
      listingIds: [],
      proposalIds: [],
      visitIds: [],
      priority: 'normal',
      dueAt: defaultDueAt(leadDate),
      lostReason: '',
      notes: [],
    };
  });

  const created = await Lead.insertMany(docs);

  // eslint-disable-next-line no-console
  console.log(`[seed:noida-leads] inserted ${created.length} leads into ${env.MONGODB_URI}`);
  // eslint-disable-next-line no-console
  console.log(`[seed:noida-leads] skipped ${skippedExisting} (phone already in DB)`);
  created.forEach((lead) => {
    const seatsLabel = lead.seatRange || (lead.seats ? String(lead.seats) : '—');
    // eslint-disable-next-line no-console
    console.log(
      `  - ${lead.name} · ${lead.contact} · ${seatsLabel} seats · ${lead.leadDate?.toISOString()}`,
    );
  });
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed:noida-leads] failed', err);
  process.exit(1);
});
