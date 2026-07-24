import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Listing } from '../modules/listings/listings.model.js';
import { freshOfDays } from '../modules/listings/listings.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'noida-csv-listings.json');

type SeedListing = {
  operator: string;
  city: string;
  micro: string;
  type: string;
  seats: number;
  price: number;
  amenities?: string[];
  avail?: string;
  source: string;
  images?: string[];
  photoMeta?: unknown[];
  profile?: Record<string, unknown>;
  csvCentreName: string;
  csvMicro?: string;
};

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`[seed-noida] missing ${DATA_PATH} — run map-noida-csv.py first`);
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as SeedListing[];
  await connectDb();

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const centreName = row.csvCentreName
      || (row.profile as { identity?: { centreName?: string } })?.identity?.centreName;
    const micro = row.csvMicro || row.micro;
    if (!centreName) continue;

    const { csvCentreName: _c, csvMicro: _m, ...rest } = row;
    const verifiedAt = new Date();
    const payload = {
      ...rest,
      verifiedAt,
      fresh: freshOfDays(0),
      source: 'csv-noida',
    };

    const existing = await Listing.findOne({
      source: 'csv-noida',
      'profile.identity.centreName': centreName,
      micro,
    }).exec();

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      updated += 1;
    } else {
      await Listing.create(payload);
      inserted += 1;
    }
  }

  const total = await Listing.countDocuments({ source: 'csv-noida' }).exec();
  console.log(`[seed-noida] inserted=${inserted} updated=${updated} total csv-noida=${total}`);
  console.log(`[seed-noida] db=${env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-noida] failed', err);
  process.exit(1);
});
