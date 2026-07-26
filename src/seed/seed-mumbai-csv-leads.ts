import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Lead } from '../modules/leads/leads.model.js';
import { User } from '../modules/users/users.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, 'mumbai-csv-leads.json');
const ASSIGNEE_EMAIL = 'deepak@spacehaat.com';

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
};

function normPhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function leadIdentityKey(phone: string, leadDate: string) {
  return `${phone}|${new Date(leadDate).toISOString()}`;
}

function defaultDueAt(from: Date) {
  const d = new Date(from);
  d.setDate(d.getDate() + 2);
  return d;
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`Missing ${JSON_PATH}. Run: python3 src/seed/map-mumbai-csv-leads.py`);
  }

  const payload = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as SeedPayload;
  await connectDb();

  const deepak = await User.findOne({ email: ASSIGNEE_EMAIL, status: 'active' }).select('_id name');
  if (!deepak) {
    throw new Error(`Assignee not found: ${ASSIGNEE_EMAIL}`);
  }

  const admin =
    (await User.findOne({ role: 'admin', status: 'active' }).select('_id name')) ??
    (await User.findOne({ status: 'active' }).select('_id name'));

  if (!admin) {
    throw new Error('No active admin user found for createdBy.');
  }

  const existing = await Lead.find({}).select('contact leadDate').lean();
  const existingPhones = new Set(
    existing.map((lead) => normPhone(String(lead.contact || ''))).filter(Boolean),
  );
  const existingKeys = new Set(
    existing
      .map((lead) => {
        const phone = normPhone(String(lead.contact || ''));
        const date = lead.leadDate ? new Date(lead.leadDate).toISOString() : '';
        return phone && date ? `${phone}|${date}` : '';
      })
      .filter(Boolean),
  );

  const seenBatch = new Set<string>();
  const toInsert: SeedLead[] = [];
  let skippedExistingPhone = 0;
  let skippedExistingKey = 0;
  let skippedBatchDupe = 0;

  for (const lead of payload.leads) {
    const phone = normPhone(lead.contact);
    const key = leadIdentityKey(phone, lead.leadDate);

    if (existingPhones.has(phone)) {
      skippedExistingPhone += 1;
      continue;
    }
    if (existingKeys.has(key)) {
      skippedExistingKey += 1;
      continue;
    }
    if (seenBatch.has(key)) {
      skippedBatchDupe += 1;
      continue;
    }

    seenBatch.add(key);
    toInsert.push(lead);
  }

  if (!toInsert.length) {
    // eslint-disable-next-line no-console
    console.log('[seed:mumbai-leads] nothing to insert');
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
      assigneeId: deepak._id,
      createdBy: admin._id,
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
  console.log(`[seed:mumbai-leads] inserted ${created.length} leads into ${env.MONGODB_URI}`);
  // eslint-disable-next-line no-console
  console.log(`[seed:mumbai-leads] assignee: ${deepak.name} (${ASSIGNEE_EMAIL})`);
  // eslint-disable-next-line no-console
  console.log(`[seed:mumbai-leads] skipped ${skippedExistingPhone} (phone already in DB)`);
  // eslint-disable-next-line no-console
  console.log(`[seed:mumbai-leads] skipped ${skippedExistingKey} (phone+datetime already in DB)`);
  // eslint-disable-next-line no-console
  console.log(`[seed:mumbai-leads] skipped ${skippedBatchDupe} (duplicate in batch)`);
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
  console.error('[seed:mumbai-leads] failed', err);
  process.exit(1);
});
