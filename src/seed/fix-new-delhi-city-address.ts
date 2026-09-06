/**
 * Fix csv-new-delhi listings: city → Delhi, strip location/city from fabricated addresses.
 */
import { connectDb } from '../config/db.js';
import { Listing } from '../modules/listings/listings.model.js';

async function main() {
  await connectDb();

  const rows = await Listing.find({ source: 'csv-new-delhi' }).exec();
  let cityUpdated = 0;
  let addressUpdated = 0;

  for (const doc of rows) {
    let changed = false;

    if (doc.city === 'New Delhi') {
      doc.city = 'Delhi';
      cityUpdated += 1;
      changed = true;
    }

    const identity = (doc.profile && (doc.profile as { identity?: Record<string, string> }).identity) || {};
    const micro = String(doc.micro || '').trim();
    let address = String(identity.address || '').trim();
    const before = address;

    // Remove trailing city / microlocation that we fabricated during seed.
    address = address.replace(/,\s*New Delhi\s*$/i, '').trim();
    address = address.replace(/,\s*Delhi\s*$/i, '').trim();
    if (micro) {
      const suffix = `, ${micro}`;
      if (address.toLowerCase().endsWith(suffix.toLowerCase())) {
        address = address.slice(0, -suffix.length).trim();
      }
    }

    if (address !== before) {
      if (!doc.profile) doc.profile = {} as typeof doc.profile;
      const profile = doc.profile as { identity?: Record<string, unknown> };
      profile.identity = { ...(profile.identity || {}), address };
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

  console.log(`[fix-new-delhi] cityUpdated=${cityUpdated} addressUpdated=${addressUpdated}`);
  console.log('[fix-new-delhi] counts', counts);
  process.exit(0);
}

main().catch((err) => {
  console.error('[fix-new-delhi] failed', err);
  process.exit(1);
});
