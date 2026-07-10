import PDFDocument from 'pdfkit';

const ORANGE = '#E8541A';
const ORANGE_SOFT = '#FDEEE7';
const INK = '#1A1A1A';
const MUTED = '#6B6B6B';
const BORDER = '#EFEDE8';
const FRESH = '#2E9E5B';
const FRESH_SOFT = '#E6F4EC';

export type PdfGalleryPhoto = { src: string; label: string };

export type PdfListing = {
  operator: string;
  type: string;
  city: string;
  micro: string;
  seats: number;
  price: number;
  avail: string;
  freshLabel: string;
  amenities: string[];
  buildingType: string;
  nearestMetro: string;
  carpet: number;
  securityDeposit: string;
  noticePeriod: string;
  gallery: PdfGalleryPhoto[];
};

export type PdfProposal = {
  title?: string;
  clientName: string;
  clientCompany: string;
  coverNote: string;
  listings: PdfListing[];
};

function inr(n: number) {
  return `Rs.${Number(n).toLocaleString('en-IN')}`;
}

// PDFKit only supports JPEG and PNG. Detect by magic bytes so an unsupported
// format (or an HTML/error body) is dropped rather than crashing doc.image().
function isSupportedImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return isJpeg || isPng;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || !isSupportedImage(buf)) return null;
    return buf;
  } catch {
    return null;
  }
}

function clientLabel(name: string, company: string) {
  if (name && company) return `${name} · ${company}`;
  return name || company || '[Client name]';
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function drawImageLabel(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, label: string) {
  const lbl = label.slice(0, 28);
  doc.font('Helvetica-Bold').fontSize(8);
  const pillW = Math.min(w - 16, doc.widthOfString(lbl) + 18);
  const pillH = 16;
  const px = x + 8;
  const py = y + h - pillH - 8;
  doc.roundedRect(px, py, pillW, pillH, 8).fill('#FFFFFF');
  doc.fillColor(INK).text(lbl, px + 7, py + 4, { width: pillW - 14 });
}

function drawImageCell(
  doc: PDFKit.PDFDocument,
  buf: Buffer | null,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  overlay?: string,
) {
  doc.roundedRect(x, y, w, h, 10).fill('#F4F2EE');
  if (buf) {
    doc.save();
    try {
      doc.roundedRect(x, y, w, h, 10).clip();
      // `cover` fills the whole cell (cropping overflow) to mirror the live
      // preview's CSS `object-fit: cover`, instead of letterboxing with `fit`.
      doc.image(buf, x, y, { cover: [w, h], align: 'center', valign: 'center' });
    } catch {
      /* corrupt/undecodable image — keep the placeholder */
    } finally {
      // Always restore so a failed image can't leave the clip region active,
      // which would otherwise hide everything drawn afterwards (e.g. metrics).
      doc.restore();
    }
  }
  if (overlay) {
    doc.save();
    doc.roundedRect(x, y, w, h, 10).clip();
    doc.rect(x, y, w, h).fillOpacity(0.55).fill('#1A1A1A').fillOpacity(1);
    doc.restore();
    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
      .text(overlay, x, y + h / 2 - 8, { width: w, align: 'center' });
  } else if (label) {
    drawImageLabel(doc, x, y, w, h, label);
  }
}

const GAL_GAP = 8;

function galleryCellSize(innerW: number, single: boolean) {
  if (single) {
    const w = innerW;
    return { cellW: w, cellH: w * (8 / 16) };
  }
  const cellW = (innerW - GAL_GAP) / 2;
  return { cellW, cellH: cellW * (11 / 16) };
}

function pageBottom(doc: PDFKit.PDFDocument) {
  return doc.page.height - doc.page.margins.bottom;
}

// Flows every photo in a 2-per-row grid, advancing doc.y and breaking to a new
// page only when a row genuinely doesn't fit — so pages stay filled, never blank.
function drawGalleryFlow(
  doc: PDFKit.PDFDocument,
  left: number,
  innerW: number,
  photos: PdfGalleryPhoto[],
  buffers: (Buffer | null)[],
) {
  if (!photos.length) return;

  if (photos.length === 1) {
    const { cellH } = galleryCellSize(innerW, true);
    if (doc.y + cellH > pageBottom(doc)) doc.addPage();
    drawImageCell(doc, buffers[0] ?? null, left, doc.y, innerW, cellH, photos[0]?.label || '');
    doc.y += cellH;
    return;
  }

  const { cellW, cellH } = galleryCellSize(innerW, false);
  for (let i = 0; i < photos.length; i += 2) {
    if (doc.y + cellH > pageBottom(doc)) doc.addPage();
    const rowY = doc.y;

    drawImageCell(doc, buffers[i] ?? null, left, rowY, cellW, cellH, photos[i]?.label || '');
    const b = photos[i + 1];
    if (b) {
      drawImageCell(doc, buffers[i + 1] ?? null, left + cellW + GAL_GAP, rowY, cellW, cellH, b.label || '');
    }
    doc.y = rowY + cellH + GAL_GAP;
  }
  doc.y -= GAL_GAP;
}

// The metrics + facts + amenities block lives in a self-contained rounded
// panel that always renders on a single page (kept together via ensureSpace).
function drawInfoPanel(doc: PDFKit.PDFDocument, left: number, pageW: number, listing: PdfListing) {
  const pad = 14;
  const innerW = pageW - pad * 2;
  const metH = 46;

  const facts = [
    listing.buildingType,
    listing.nearestMetro,
    listing.securityDeposit ? `Deposit ${listing.securityDeposit}` : '',
    listing.noticePeriod ? `${listing.noticePeriod} notice` : '',
  ].filter(Boolean);
  const factsStr = facts.join('   ·   ');
  doc.font('Helvetica').fontSize(9);
  const factsH = facts.length ? doc.heightOfString(factsStr, { width: innerW, lineGap: 2 }) + 12 : 0;

  const amenText = (listing.amenities || []).map((a) => `✓  ${a}`).join('      ');
  doc.font('Helvetica').fontSize(8.5);
  const amenH = amenText ? doc.heightOfString(amenText, { width: innerW, lineGap: 4 }) + 6 : 0;

  const blockH = pad + metH + factsH + amenH + pad;
  ensureSpace(doc, blockH);

  const boxTop = doc.y;
  doc.roundedRect(left, boxTop, pageW, blockH, 12).fill('#FAFAF8');
  doc.roundedRect(left, boxTop, pageW, blockH, 12).strokeColor(BORDER).lineWidth(1).stroke();

  let y = boxTop + pad;
  const ix = left + pad;

  // Metrics bar (white panel inside the soft container)
  doc.roundedRect(ix, y, innerW, metH, 8).fill('#FFFFFF');
  doc.roundedRect(ix, y, innerW, metH, 8).strokeColor(BORDER).lineWidth(1).stroke();
  const colW = innerW / 4;
  const metrics = [
    { label: 'CAPACITY', value: `${listing.seats} seats`, highlight: false },
    { label: 'PRICE / SEAT', value: `${inr(listing.price)}/mo`, highlight: true },
    { label: 'CARPET AREA', value: `${Number(listing.carpet || 0).toLocaleString('en-IN')} sq ft`, highlight: false },
    { label: 'AVAILABILITY', value: listing.avail, highlight: false },
  ];
  metrics.forEach((m, i) => {
    const mx = ix + i * colW;
    if (m.highlight) doc.rect(mx, y + 1, colW, metH - 2).fill(ORANGE_SOFT);
    if (i > 0) doc.moveTo(mx, y + 6).lineTo(mx, y + metH - 6).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(MUTED).fontSize(7).font('Helvetica').text(m.label, mx + 10, y + 9, { width: colW - 14 });
    doc.fillColor(m.highlight ? ORANGE : INK).fontSize(10.5).font('Helvetica-Bold')
      .text(m.value, mx + 10, y + 22, { width: colW - 14 });
  });
  y += metH + (factsH ? 12 : 0);

  if (facts.length) {
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(factsStr, ix, y, { width: innerW, lineGap: 2 });
    y = doc.y + 10;
  }
  if (amenText) {
    doc.fillColor('#404040').fontSize(8.5).font('Helvetica').text(amenText, ix, y, { width: innerW, lineGap: 4 });
  }

  doc.y = boxTop + blockH;
}

// Renders one workspace as a continuous, page-filling editorial block.
function drawListingCard(
  doc: PDFKit.PDFDocument,
  left: number,
  pageW: number,
  listing: PdfListing,
  index: number,
  total: number,
  imageBuffers: (Buffer | null)[],
) {
  const headerH = 54;
  const single = listing.gallery.length === 1;
  const { cellH: firstRowH } = galleryCellSize(pageW, single);

  // Avoid orphaning a header at the bottom of a page: only break if there isn't
  // room for the header plus a meaningful slice of the gallery.
  const top = doc.page.margins.top;
  if (doc.y > top + 1 && doc.y + headerH + Math.min(firstRowH, 150) > pageBottom(doc)) {
    doc.addPage();
  }

  let y = doc.y;

  // Header — numbered index, title, location, freshness badge
  doc.fillColor(ORANGE).fontSize(28).font('Helvetica-Bold')
    .text(String(index + 1).padStart(2, '0'), left, y, { width: 52 });
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
    .text(`OF ${String(total).padStart(2, '0')}`, left, y + 32, { width: 52, characterSpacing: 1 });

  const titleX = left + 58;
  const titleW = pageW - 58 - 130;
  doc.fillColor(INK).fontSize(20).font('Helvetica-Bold')
    .text(listing.operator, titleX, y, { width: titleW });
  doc.fillColor(MUTED).fontSize(10.5).font('Helvetica')
    .text(`${listing.micro}, ${listing.city}`, titleX, y + 26, { width: titleW });

  const badgeText = listing.freshLabel;
  doc.font('Helvetica-Bold').fontSize(8);
  const badgeW = doc.widthOfString(badgeText) + 24;
  const badgeX = left + pageW - badgeW;
  doc.roundedRect(badgeX, y + 4, badgeW, 19, 9.5).fill(FRESH_SOFT);
  doc.circle(badgeX + 11, y + 13.5, 3).fill(FRESH);
  doc.fillColor(FRESH).fontSize(8).font('Helvetica-Bold').text(badgeText, badgeX + 18, y + 8);

  y += headerH;
  doc.moveTo(left, y).lineTo(left + pageW, y).lineWidth(1).strokeColor(BORDER).stroke();
  doc.y = y + 14;

  // Gallery (flows across pages, keeping pages full)
  if (listing.gallery.length) {
    drawGalleryFlow(doc, left, pageW, listing.gallery, imageBuffers);
    doc.y += 14;
  }

  // Metrics / facts / amenities panel
  drawInfoPanel(doc, left, pageW, listing);

  // Breathing room before the next space
  doc.y += index < total - 1 ? 26 : 14;
}

export async function buildProposalPdf(data: PdfProposal): Promise<{ buffer: Buffer; pageCount: number }> {
  const prices = data.listings.map((l) => l.price);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const cities = [...new Set(data.listings.map((l) => l.city))].join(', ');
  const who = clientLabel(data.clientName, data.clientCompany);
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const allPhotoUrls = data.listings.flatMap((l) => l.gallery.map((g) => g.src));
  const allBuffers = await Promise.all(allPhotoUrls.map((url) => fetchImageBuffer(url)));

  let bufIdx = 0;
  const listingBuffers = data.listings.map((l) => {
    const n = l.gallery.length;
    const slice = allBuffers.slice(bufIdx, bufIdx + n);
    bufIdx += n;
    return slice;
  });

  return new Promise<{ buffer: Buffer; pageCount: number }>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    let y = doc.page.margins.top;

    doc.rect(left, y, 28, 28).fill(ORANGE);
    doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold')
      .text('C', left + 8, y + 6, { width: 28, align: 'center' });
    doc.fillColor(INK).fontSize(17).font('Helvetica-Bold').text('Spacehaat', left + 36, y + 2);
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text('WORKSPACE PROPOSAL', left + 36, y + 20);
    doc.fillColor(MUTED).fontSize(10).font('Helvetica')
      .text(dateStr, left, y + 8, { width: pageW, align: 'right' });

    y += 40;
    doc.moveTo(left, y).lineTo(left + pageW, y).lineWidth(2).strokeColor(INK).stroke();
    y += 16;

    if (data.title) {
      doc.fillColor(INK).fontSize(16).font('Helvetica-Bold')
        .text(data.title, left, y, { width: pageW });
      y = doc.y + 8;
    }

    doc.fillColor(MUTED).fontSize(11).font('Helvetica')
      .text('Prepared for ', left, y, { continued: true, width: pageW });
    doc.fillColor(INK).font('Helvetica-Bold').text(who);
    y = doc.y + 8;

    doc.fillColor('#404040').font('Helvetica').fontSize(11)
      .text(data.coverNote || 'Curated workspace options matched to your requirement.', left, y, {
        width: pageW,
        lineGap: 3,
      });
    y = doc.y + 14;

    const sumH = 52;
    doc.roundedRect(left, y, pageW, sumH, 8).fillAndStroke('#FAFAF8', BORDER);
    const colW = pageW / 4;
    const summaryItems = [
      { label: 'Options', value: String(data.listings.length) },
      { label: 'Price range', value: `${inr(minP)}–${inr(maxP)}` },
      { label: 'Cities', value: cities || '—' },
      { label: 'All verified', value: 'Live' },
    ];
    summaryItems.forEach((item, i) => {
      const x = left + i * colW + 10;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(item.label, x, y + 10, { width: colW - 12 });
      doc.fillColor(i === 3 ? FRESH : INK).fontSize(11).font('Helvetica-Bold')
        .text(item.value, x, y + 24, { width: colW - 12 });
    });
    doc.y = y + sumH + 18;

    data.listings.forEach((listing, i) => {
      drawListingCard(doc, left, pageW, listing, i, data.listings.length, listingBuffers[i] || []);
    });

    // Consistent footer + page numbers on every page (premium polish).
    const range = doc.bufferedPageRange();
    const pageCount = range.count;
    for (let p = range.start; p < range.start + pageCount; p += 1) {
      doc.switchToPage(p);
      // Drop the bottom margin while stamping the footer so writing inside the
      // margin band doesn't trigger PDFKit's auto page-break.
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 34;
      doc.fillColor('#9A968E').fontSize(8).font('Helvetica')
        .text('Spacehaat · Real-time workspace inventory · proposals@spacehaat.in', left, fy, {
          width: pageW,
          align: 'left',
          lineBreak: false,
        });
      doc.fillColor('#9A968E').fontSize(8).font('Helvetica')
        .text(`${p - range.start + 1} / ${pageCount}`, left, fy, {
          width: pageW,
          align: 'right',
          lineBreak: false,
        });
      doc.page.margins.bottom = savedBottom;
    }

    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pageCount }));
    doc.end();
  });
}

// Kept in sync with the frontend (src/utils/helpers.js) so the fallback PDF
// matches the live preview when no explicit render payload is supplied.
const WORKSPACE_IMGS = [
  'photo-1497366754035-f200968a6e72', 'photo-1497366811353-6870744d04b2', 'photo-1524758631624-e2822e304c36',
  'photo-1556761175-5973dc0f32e7', 'photo-1497215728101-856f4ea42174', 'photo-1604328698692-f76ea9498e76',
  'photo-1521737604893-d14cc237f11d', 'photo-1531973576160-7125cd663d86', 'photo-1600508774634-4e11d34730e2',
  'photo-1542744173-8e7e53415bb0', 'photo-1505373877841-8d25f7d46678', 'photo-1568992687947-868a62a9f521',
  'photo-1604328471151-b52226907017', 'photo-1556761175-b413da4baf72', 'photo-1572025442646-866d16c84a54',
];

const GALLERY_DEFS = [
  'Hero photo', 'Reception & entrance', 'Private cabin', 'Meeting room', 'Cafeteria & breakout',
  'Dedicated desk bay', 'Hot desk zone', 'Conference room', 'Phone booth', 'Lounge & breakout',
  'Pantry', 'Terrace / balcony', 'Car parking', 'Corridor & common area', 'Washrooms', 'Building facade',
];

function hashStr(s: string) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function imgUrl(seed: string, w = 400, h = 300) {
  const idx = hashStr(seed) % WORKSPACE_IMGS.length;
  return `https://images.unsplash.com/${WORKSPACE_IMGS[idx]}?auto=format&fit=crop&w=${w}&h=${h}&q=70`;
}

function buildGalleryFromListing(l: {
  type: string;
  id?: string;
  images?: string[];
  photoMeta?: { label?: string }[];
}) {
  const ups = l.images || [];
  const meta = l.photoMeta || [];
  if (ups.length) {
    return ups.map((src, i) => ({
      src,
      label: meta[i]?.label || GALLERY_DEFS[i] || `Photo ${i + 1}`,
    }));
  }
  const id = l.id || 'x';
  return GALLERY_DEFS.map((label, i) => ({
    src: imgUrl(`${id}-g${i}`),
    label: i === 0 ? l.type : label,
  }));
}

export function mapListingToPdf(l: {
  operator: string;
  type: string;
  city: string;
  micro: string;
  seats: number;
  price: number;
  avail?: string;
  fresh?: { label?: string };
  amenities?: string[];
  images?: string[];
  photoMeta?: { label?: string }[];
  profile?: {
    identity?: { buildingType?: string; nearestMetro?: string; carpet?: number };
    pricing?: { securityDeposit?: string; noticePeriod?: string };
  } | null;
  _id?: unknown;
  id?: string;
}) {
  const p = l.profile || {};
  const identity = p.identity || {};
  const pricing = p.pricing || {};
  const gallery = buildGalleryFromListing({
    type: l.type,
    id: String(l.id || l._id || ''),
    images: l.images,
    photoMeta: l.photoMeta as { label?: string }[] | undefined,
  });

  return {
    operator: l.operator,
    type: l.type,
    city: l.city,
    micro: l.micro,
    seats: l.seats,
    price: l.price,
    avail: l.avail || 'Available now',
    freshLabel: l.fresh?.label || 'Verified',
    amenities: l.amenities || [],
    buildingType: identity.buildingType || '',
    nearestMetro: identity.nearestMetro || '',
    carpet: identity.carpet || 0,
    securityDeposit: pricing.securityDeposit || '—',
    noticePeriod: pricing.noticePeriod || '—',
    gallery,
  };
}
