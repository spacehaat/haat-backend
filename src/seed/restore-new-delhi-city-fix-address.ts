/**
 * Restore city=New Delhi for csv-new-delhi listings.
 * Rebuild address as: Building, Location, Delhi (not New Delhi).
 */
import { connectDb } from '../config/db.js';
import { Listing } from '../modules/listings/listings.model.js';

async function main() {
  await connectDb();

  const rows = await Listing.find({ source: 'csv-new-delhi' }).exec();
  let cityRestored = 0;
  let addressUpdated = 0;

  for (const doc of rows) {
    let changed = false;

    if (doc.city !== 'New Delhi') {
      doc.city = 'New Delhi';
      cityRestored += 1;
      changed = true;
    }

    const profile = (doc.profile || {}) as {
      identity?: Record<string, unknown>;
    };
    const identity = { ...(profile.identity || {}) };
    const micro = String(doc.micro || '').trim();
    const building = String(identity.buildingType || '').trim();
    const before = String(identity.address || '').trim();

    const rebuilt = [building, micro, 'Delhi'].filter(Boolean).join(', ');

    if (rebuilt && rebuilt !== before) {
      identity.address = rebuilt;
      profile.identity = identity;
      doc.profile = profile as typeof doc.profile;
      addressUpdated += 1;
      changed = true;
    }

    if (changed) await doc.save();
  }

  const counts = {
    csvNewDelhi: await Listing.countDocuments({ source: 'csv-new-delhi' }).exec(),
    cityNewDelhi: await Listing.countDocuments({ city: 'New Delhi' }).exec(),
    cityDelhi: await Listing.countDocuments({ city: 'Delhi' }).exec(),
  };

  console.log(`[restore-new-delhi] cityRestored=${cityRestored} addressUpdated=${addressUpdated}`);
  console.log('[restore-new-delhi] counts', counts);

  const sample = await Listing.findOne({ source: 'csv-new-delhi' }).lean();
  console.log('[restore-new-delhi] sample', {
    city: sample?.city,
    micro: sample?.micro,
    address: (sample as { profile?: { identity?: { address?: string } } })?.profile?.identity?.address,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('[restore-new-delhi] failed', err);
  process.exit(1);
});
