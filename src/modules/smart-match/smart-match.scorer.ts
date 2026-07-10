import type { MatchRequirements } from './smart-match.schema.js';

export type MatchReason = { text: string; ok: boolean; weight?: number };

export type ScoredListing = {
  score: number;
  verdict: string;
  nearMiss: boolean;
  reasons: MatchReason[];
};

type ListingRow = {
  _id?: { toString(): string };
  id?: string;
  operator: string;
  city: string;
  micro: string;
  type: string;
  seats: number;
  price: number;
  tier?: string;
  avail?: string;
  amenities?: string[];
  fresh?: { state: string; days?: number };
  profile?: {
    identity?: { centreName?: string; address?: string; nearestMetro?: string };
    capacity?: { availWorkstations?: number; totalSeats?: number };
  } | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fuzzyIncludes(needle: string, haystack: string): boolean {
  const n = norm(needle);
  const h = norm(haystack);
  if (!n || !h) return false;
  if (h.includes(n) || n.includes(h)) return true;
  const tokens = n.split(' ').filter((t) => t.length > 2);
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => h.includes(t));
  return hits.length >= Math.ceil(tokens.length * 0.6);
}

function scoreCity(listing: ListingRow, req: MatchRequirements): { pts: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  if (!req.city) {
    return { pts: 11, reasons: [{ text: `Located in ${listing.city}`, ok: true }] };
  }
  if (listing.city === req.city) {
    reasons.push({ text: `City match — ${listing.city}`, ok: true });
    return { pts: 22, reasons };
  }
  reasons.push({ text: `Wrong city — ${listing.city} (need ${req.city})`, ok: false });
  return { pts: 0, reasons };
}

function scoreLocality(listing: ListingRow, req: MatchRequirements): { pts: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const loc = req.locality?.trim();
  const micro = listing.micro || '';
  const identity = listing.profile?.identity || {};
  const hay = [micro, identity.centreName, identity.address, identity.nearestMetro].filter(Boolean).join(' ');

  if (!loc) {
    reasons.push({ text: `Micro-market — ${micro}`, ok: true });
    return { pts: 9, reasons };
  }
  if (fuzzyIncludes(loc, micro)) {
    reasons.push({ text: `Exact locality — ${micro}`, ok: true });
    return { pts: 18, reasons };
  }
  if (fuzzyIncludes(loc, hay)) {
    reasons.push({ text: `Near requested area — ${micro}`, ok: true });
    return { pts: 14, reasons };
  }
  if (req.city && listing.city === req.city) {
    reasons.push({ text: `Same city, different micro — ${micro}`, ok: false });
    return { pts: 6, reasons };
  }
  reasons.push({ text: `Locality mismatch — ${micro}`, ok: false });
  return { pts: 2, reasons };
}

function effectiveSeats(listing: ListingRow): number {
  const avail = listing.profile?.capacity?.availWorkstations;
  if (typeof avail === 'number' && avail > 0) return avail;
  return listing.seats;
}

function scoreCapacity(listing: ListingRow, req: MatchRequirements): { pts: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const need = req.teamSize;
  const have = effectiveSeats(listing);
  if (!need) {
    reasons.push({ text: `${have} seats available`, ok: true });
    return { pts: 9, reasons };
  }
  if (have >= need) {
    reasons.push({ text: `${have} seats — fits team of ${need}`, ok: true });
    const surplus = have - need;
    const bonus = surplus <= need * 0.5 ? 3 : surplus <= need ? 1 : 0;
    return { pts: 15 + bonus, reasons };
  }
  const short = need - have;
  const ratio = have / need;
  reasons.push({ text: `Only ${have} seats — ${short} short`, ok: false });
  return { pts: Math.round(ratio * 12), reasons };
}

function scoreBudget(listing: ListingRow, req: MatchRequirements): { pts: number; reasons: MatchReason[]; nearMiss: boolean } {
  const reasons: MatchReason[] = [];
  const budget = req.budgetPerSeat;
  const price = listing.price;
  if (!budget) {
    reasons.push({ text: `${price.toLocaleString('en-IN')}/seat`, ok: true });
    return { pts: 11, reasons, nearMiss: false };
  }
  if (price <= budget) {
    const headroom = (budget - price) / budget;
    reasons.push({ text: `₹${price.toLocaleString('en-IN')}/seat — within budget`, ok: true });
    return { pts: 18 + Math.round(headroom * 4), reasons, nearMiss: false };
  }
  const overPct = (price - budget) / budget;
  if (overPct <= 0.1) {
    reasons.push({ text: `₹${price.toLocaleString('en-IN')}/seat — slightly over budget`, ok: false });
    return { pts: 12, reasons, nearMiss: true };
  }
  if (overPct <= 0.2) {
    reasons.push({ text: `₹${price.toLocaleString('en-IN')}/seat — over budget`, ok: false });
    return { pts: 6, reasons, nearMiss: true };
  }
  reasons.push({ text: `₹${price.toLocaleString('en-IN')}/seat — well over budget`, ok: false });
  return { pts: 0, reasons, nearMiss: false };
}

function scoreSpaceType(listing: ListingRow, req: MatchRequirements): { pts: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const prefs = req.spaceTypes || [];
  if (!prefs.length) return { pts: 4, reasons };
  const hit = prefs.some((t) => norm(t) === norm(listing.type) || listing.type.toLowerCase().includes(t.toLowerCase()));
  if (hit) {
    reasons.push({ text: `Space type — ${listing.type}`, ok: true });
    return { pts: 8, reasons };
  }
  reasons.push({ text: `${listing.type} — not preferred type`, ok: false });
  return { pts: 1, reasons };
}

function scoreAmenities(listing: ListingRow, req: MatchRequirements): { pts: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const want = req.amenities || [];
  const have = listing.amenities || [];
  if (!want.length) return { pts: 3, reasons };
  const matched = want.filter((a) => have.some((h) => norm(h) === norm(a) || norm(h).includes(norm(a))));
  const ratio = matched.length / want.length;
  if (matched.length) {
    reasons.push({ text: `Has ${matched.join(', ')}`, ok: true });
  }
  const missing = want.filter((a) => !matched.includes(a));
  if (missing.length) {
    reasons.push({ text: `Missing ${missing.join(', ')}`, ok: false });
  }
  return { pts: Math.round(ratio * 7), reasons };
}

function scoreFreshness(listing: ListingRow): { pts: number; reasons: MatchReason[] } {
  const state = listing.fresh?.state || 'stale';
  if (state === 'fresh') {
    return { pts: 5, reasons: [{ text: 'Fresh — verified recently', ok: true }] };
  }
  if (state === 'stale') {
    return { pts: 2, reasons: [{ text: 'Stale — verify before sharing', ok: false }] };
  }
  return { pts: 0, reasons: [{ text: 'Expired — re-verify needed', ok: false }] };
}

function scoreTier(listing: ListingRow, req: MatchRequirements): { pts: number; reasons: MatchReason[] } {
  if (req.tierPreference === 'any') return { pts: 0, reasons: [] };
  const tier = listing.tier || 'Standard';
  if (req.tierPreference === 'premium' && tier === 'Premium') {
    return { pts: 3, reasons: [{ text: 'Premium fit-out', ok: true }] };
  }
  if (req.tierPreference === 'standard' && tier !== 'Premium') {
    return { pts: 2, reasons: [{ text: 'Standard tier — budget-friendly', ok: true }] };
  }
  return { pts: 0, reasons: [{ text: `${tier} tier — preference mismatch`, ok: false }] };
}

function verdictFor(score: number, nearMiss: boolean): string {
  if (score >= 88) return 'Strong match';
  if (score >= 72) return 'Good match';
  if (nearMiss || score >= 58) return 'Near miss';
  if (score >= 45) return 'Possible';
  return 'Low fit';
}

export function scoreListingMatch(listing: ListingRow, req: MatchRequirements): ScoredListing {
  const city = scoreCity(listing, req);
  const locality = scoreLocality(listing, req);
  const capacity = scoreCapacity(listing, req);
  const budget = scoreBudget(listing, req);
  const spaceType = scoreSpaceType(listing, req);
  const amenities = scoreAmenities(listing, req);
  const freshness = scoreFreshness(listing);
  const tier = scoreTier(listing, req);

  let raw =
    city.pts + locality.pts + capacity.pts + budget.pts +
    spaceType.pts + amenities.pts + freshness.pts + tier.pts;

  // Hard cap when city is wrong but a city was specified.
  if (req.city && listing.city !== req.city) {
    raw = Math.min(raw, 38);
  }

  const score = clamp(Math.round(raw), 0, 99);
  const reasons = [
    ...city.reasons,
    ...locality.reasons,
    ...capacity.reasons,
    ...budget.reasons,
    ...spaceType.reasons,
    ...amenities.reasons,
    ...freshness.reasons,
    ...tier.reasons,
  ].filter(Boolean);

  const nearMiss = budget.nearMiss && score >= 55 && score < 72;

  return {
    score,
    verdict: verdictFor(score, nearMiss),
    nearMiss,
    reasons: reasons.slice(0, 6),
  };
}

export function listingToMatchResponse(listing: ListingRow) {
  const id = listing._id ? String(listing._id) : String(listing.id);
  return {
    id,
    operator: listing.operator,
    city: listing.city,
    micro: listing.micro,
    type: listing.type,
    seats: listing.seats,
    price: listing.price,
    tier: listing.tier,
    avail: listing.avail,
    amenities: listing.amenities || [],
    fresh: listing.fresh,
    images: (listing as { images?: string[] }).images || [],
  };
}
