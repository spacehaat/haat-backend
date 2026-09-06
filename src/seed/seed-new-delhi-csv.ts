/**
 * Seed New Delhi listings from mapped CSV JSON.
 * Downloads Cloudinary images → uploads to S3 → stores https://img.spacehaat.com/... URLs.
 *
 * Usage:
 *   python3 src/seed/map-new-delhi-csv.py
 *   tsx src/seed/seed-new-delhi-csv.ts
 *   tsx src/seed/seed-new-delhi-csv.ts --dry-run
 *   tsx src/seed/seed-new-delhi-csv.ts --skip-images   # use cached CDN urls only / leave empty
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { s3 } from '../config/s3.js';
import { Listing } from '../modules/listings/listings.model.js';
import { freshOfDays } from '../modules/listings/listings.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'new-delhi-csv-listings.json');
const CACHE_PATH = path.join(__dirname, 'new-delhi-image-cache.json');
const CDN_BASE = 'https://img.spacehaat.com';
const CONCURRENCY = 6;

type SeedListing = {
  csvIndex: number;
  operator: string;
  city: string;
  micro: string;
  type: string;
  seats: number;
  price: number;
  amenities?: string[];
  avail?: string;
  source: string;
  sourceImages?: string[];
  images?: string[];
  photoMeta?: unknown[];
  profile?: Record<string, unknown>;
  csvCentreName: string;
  csvMicro?: string;
  csvSpaceName?: string;
  csvBuildingName?: string;
  csvRegion?: string;
  csvConnectivity?: string;
  csvPriceRaw?: string;
  csvLayoutRaw?: string;
};

type ImageCache = Record<string, string>;

function loadCache(): ImageCache {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as ImageCache;
  } catch {
    return {};
  }
}

function saveCache(cache: ImageCache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

function extFromUrlOrType(url: string, contentType: string | null) {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (fromUrl && fromUrl.length <= 5) return fromUrl;
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('gif')) return '.gif';
  return '.jpg';
}

function contentTypeFromExt(ext: string) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SpacehaatImporter/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const contentType = res.headers.get('content-type');
  const ext = extFromUrlOrType(url, contentType);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error(`Empty body for ${url}`);
  return { buffer, contentType: contentTypeFromExt(ext), ext };
}

async function uploadToSpacehaat(sourceUrl: string, buffer: Buffer, contentType: string, ext: string) {
  const hash = createHash('sha1').update(sourceUrl).digest('hex');
  const key = `images/new-delhi/${hash}${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return `${CDN_BASE}/${key}`;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipImages = process.argv.includes('--skip-images');

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`[seed-new-delhi] missing ${DATA_PATH} — run map-new-delhi-csv.py first`);
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as SeedListing[];
  const cache = loadCache();

  console.log(`[seed-new-delhi] rows=${rows.length} dryRun=${dryRun} skipImages=${skipImages}`);
  console.log(`[seed-new-delhi] image cache entries=${Object.keys(cache).length}`);

  // Pre-upload all unique source images (faster than per-listing sequential)
  const uniqueSources = [...new Set(rows.flatMap((r) => r.sourceImages || []))];
  console.log(`[seed-new-delhi] unique source images=${uniqueSources.length}`);

  let totalUploaded = 0;
  let totalCached = 0;
  let totalFailed = 0;

  if (!skipImages) {
    const pending = uniqueSources.filter((u) => !cache[u]);
    console.log(`[seed-new-delhi] images to upload=${pending.length} (others cached)`);

    await mapPool(pending, CONCURRENCY, async (src, i) => {
      if (dryRun) return;
      try {
        const { buffer, contentType, ext } = await downloadImage(src);
        const cdnUrl = await uploadToSpacehaat(src, buffer, contentType, ext);
        cache[src] = cdnUrl;
        totalUploaded += 1;
        if ((i + 1) % 25 === 0 || i === pending.length - 1) {
          saveCache(cache);
          console.log(`[seed-new-delhi] uploaded ${i + 1}/${pending.length}`);
        }
      } catch (err) {
        totalFailed += 1;
        console.warn(`[seed-new-delhi] image failed: ${src} → ${(err as Error).message}`);
      }
    });
    saveCache(cache);
    totalCached = uniqueSources.length - pending.length;
  }

  if (dryRun) {
    console.log('[seed-new-delhi] dry-run complete (no DB writes)');
    process.exit(0);
  }

  await connectDb();

  // Replace previous New Delhi CSV import only (leave city=Delhi untouched)
  const deleted = await Listing.deleteMany({ source: 'csv-new-delhi' }).exec();
  console.log(`[seed-new-delhi] removed previous csv-new-delhi listings=${deleted.deletedCount || 0}`);

  let inserted = 0;
  for (const row of rows) {
    const sourceImages = row.sourceImages || [];
    const urls = sourceImages.map((src) => cache[src]).filter(Boolean);

    const profile = { ...(row.profile || {}) } as Record<string, unknown>;
    const contacts = {
      ...((profile.contactsMedia as Record<string, unknown>) || {}),
      gallery: urls,
    };
    profile.contactsMedia = contacts;

    const {
      csvIndex: _i,
      csvCentreName: _c,
      csvMicro: _m,
      csvSpaceName: _s,
      csvBuildingName: _b,
      csvRegion: _r,
      csvConnectivity: _conn,
      csvPriceRaw: _p,
      csvLayoutRaw: _l,
      sourceImages: _src,
      ...rest
    } = row;

    await Listing.create({
      ...rest,
      images: urls,
      profile,
      verifiedAt: new Date(),
      fresh: freshOfDays(0),
      source: 'csv-new-delhi',
    });
    inserted += 1;
  }

  const total = await Listing.countDocuments({ source: 'csv-new-delhi' }).exec();
  const cityTotal = await Listing.countDocuments({ city: 'New Delhi' }).exec();
  const delhiLeft = await Listing.countDocuments({ city: 'Delhi' }).exec();

  console.log(`[seed-new-delhi] inserted=${inserted} total csv-new-delhi=${total}`);
  console.log(`[seed-new-delhi] New Delhi city listings=${cityTotal} (Delhi untouched=${delhiLeft})`);
  console.log(`[seed-new-delhi] images uploaded=${totalUploaded} cached=${totalCached} failed=${totalFailed}`);
  console.log(`[seed-new-delhi] db=${env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-new-delhi] failed', err);
  process.exit(1);
});
