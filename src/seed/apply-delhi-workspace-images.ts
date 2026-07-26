import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { Listing } from '../modules/listings/listings.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_PATH = path.join(__dirname, 'delhi-workspace-image-match.json');

type MatchRow = {
  listingId: string;
  csvName: string;
  dbCentreName: string;
  csvImageCount: number;
  dbImageCount: number;
  images_url: string[];
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const report = JSON.parse(fs.readFileSync(MATCH_PATH, 'utf8')) as {
    matched: MatchRow[];
  };

  const rows = report.matched.filter(
    (row) => row.images_url?.length > 0 && row.dbImageCount === 0,
  );

  if (!rows.length) {
    console.log('[apply-delhi-images] No listings to update.');
    return;
  }

  await connectDb();

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!mongoose.Types.ObjectId.isValid(row.listingId)) {
      console.warn(`[skip] invalid id for ${row.csvName}`);
      skipped += 1;
      continue;
    }

    const listing = await Listing.findById(row.listingId).lean();
    if (!listing) {
      console.warn(`[skip] listing not found: ${row.listingId} (${row.csvName})`);
      skipped += 1;
      continue;
    }

    const existingImages = listing.images?.length
      ? listing.images
      : listing.profile?.contactsMedia?.gallery || [];

    if (existingImages.length > 0) {
      console.log(`[skip] already has images: ${row.dbCentreName || row.csvName}`);
      skipped += 1;
      continue;
    }

    const images = row.images_url.map((url) => url.trim()).filter(Boolean);
    if (!images.length) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] ${row.csvName} -> ${row.dbCentreName} (${images.length} images)`);
      updated += 1;
      continue;
    }

    await Listing.updateOne(
      { _id: row.listingId },
      {
        $set: {
          images,
          'profile.contactsMedia.gallery': images,
        },
      },
    );

    console.log(`[updated] ${row.csvName} -> ${row.dbCentreName} (${images.length} images)`);
    updated += 1;
  }

  console.log(`\n[apply-delhi-images] done: updated=${updated}, skipped=${skipped}, total=${rows.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
