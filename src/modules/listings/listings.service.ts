import { Listing, type ListingDoc } from './listings.model.js';
import type { ListingCreateInput, ListingUpdateInput } from './listings.schema.js';

function daysSince(d: Date) {
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function freshOfDays(days: number): { state: 'fresh' | 'stale' | 'expired'; label: string; days: number } {
  if (days <= 5) return { state: 'fresh', label: `Verified ${days}d ago`, days };
  if (days <= 14) return { state: 'stale', label: `${days}d ago`, days };
  return { state: 'expired', label: `${days}d — re-verify`, days };
}

const MS_DAY = 1000 * 60 * 60 * 24;

function verifiedAtRangeForFreshness(freshness: 'fresh' | 'stale' | 'expired') {
  const now = Date.now();
  if (freshness === 'fresh') return { $gte: new Date(now - 5 * MS_DAY) };
  if (freshness === 'stale') {
    return { $gte: new Date(now - 14 * MS_DAY), $lt: new Date(now - 5 * MS_DAY) };
  }
  return { $lt: new Date(now - 14 * MS_DAY) };
}

export type ListingWithFresh = Omit<ListingDoc, 'fresh'> & {
  fresh: ReturnType<typeof freshOfDays>;
};

function mapListingRow(l: ListingDoc): ListingWithFresh {
  const days = l.verifiedAt ? daysSince(new Date(l.verifiedAt)) : 0;
  return { ...l, fresh: freshOfDays(days) };
}

const EMPTY_PAGE = { items: [], total: 0, page: 1, limit: 20, pageCount: 1 };

export type ListListingsFilters = {
  city?: string;
  type?: string;
  freshness?: 'fresh' | 'stale' | 'expired';
  maxPrice?: number;
  minSeats?: number;
  amenities?: string[];
  buildingType?: string;
  virtualOffice?: boolean;
  managedOffice?: boolean;
  hotDesk?: boolean;
  vastu?: boolean;
  allowedCities?: string[] | null;
};

export type ListListingsOptions = {
  page?: number;
  limit?: number;
  search?: string;
};

export async function listListings(
  filters: ListListingsFilters,
  options: ListListingsOptions = {},
) {
  const q: Record<string, unknown> = {};

  const allowed = filters.allowedCities;
  if (Array.isArray(allowed)) {
    if (allowed.length === 0) return { ...EMPTY_PAGE, limit: options.limit ?? 20 };
    if (filters.city && filters.city !== 'All cities') {
      if (!allowed.includes(filters.city)) return { ...EMPTY_PAGE, limit: options.limit ?? 20 };
      q.city = filters.city;
    } else {
      q.city = { $in: allowed };
    }
  } else if (filters.city && filters.city !== 'All cities') {
    q.city = filters.city;
  }

  if (filters.type && filters.type !== 'All') q.type = filters.type;
  if (filters.freshness) q.verifiedAt = verifiedAtRangeForFreshness(filters.freshness);
  if (typeof filters.maxPrice === 'number') {
    q.price = { ...(q.price as Record<string, unknown>), $lte: filters.maxPrice };
  }
  if (typeof filters.minSeats === 'number' && filters.minSeats > 0) {
    q.seats = { ...(q.seats as Record<string, unknown>), $gte: filters.minSeats };
  }
  if (filters.amenities?.length) q.amenities = { $all: filters.amenities };

  if (filters.buildingType && filters.buildingType !== 'All') {
    q['profile.identity.buildingType'] = filters.buildingType;
  }
  if (filters.virtualOffice) q['profile.operations.virtualOfficeAvailable'] = true;
  if (filters.managedOffice) q['profile.operations.managedOfficeAvailable'] = true;
  if (filters.hotDesk) q['profile.capacity.hotDeskAvailable'] = true;
  if (filters.vastu) q['profile.identity.vastu'] = true;

  const search = options.search?.trim();
  if (search) {
    const tokens = search.split(/\s+/).filter(Boolean);
    const tokenClauses = tokens.map((token) => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      return {
        $or: [
          { operator: re },
          { city: re },
          { micro: re },
          { type: re },
          { tier: re },
          { avail: re },
          { 'profile.identity.centreName': re },
          { 'profile.identity.address': re },
          { 'profile.identity.nearestMetro': re },
          { 'profile.identity.buildingType': re },
          { amenities: re },
        ],
      };
    });
    q.$and = [...((q.$and as unknown[]) || []), ...tokenClauses];
  }

  const paginate = options.page !== undefined || options.limit !== undefined;
  const page = Math.max(1, options.page ?? 1);
  const limit = paginate
    ? Math.min(100, Math.max(1, options.limit ?? 20))
    : undefined;

  const sortQuery = Listing.find(q).sort({ verifiedAt: -1 });

  let items: ListingWithFresh[];
  let total: number;

  if (paginate) {
    const skip = (page - 1) * limit!;
    const [rawRows, count] = await Promise.all([
      sortQuery.clone().skip(skip).limit(limit!).lean().exec(),
      Listing.countDocuments(q),
    ]);
    items = (rawRows as ListingDoc[]).map(mapListingRow);
    total = count;
  } else {
    const rawRows = (await sortQuery.lean().exec()) as ListingDoc[];
    items = rawRows.map(mapListingRow);
    total = items.length;
  }

  return {
    items,
    total,
    page: paginate ? page : 1,
    limit: paginate ? limit! : total,
    pageCount: paginate ? Math.max(1, Math.ceil(total / limit!)) : 1,
  };
}

export async function getListing(id: string) {
  const item = await Listing.findById(id).lean().exec();
  if (!item) return null;
  return mapListingRow(item as ListingDoc);
}

export async function createListing(input: ListingCreateInput) {
  const verifiedAt = new Date();
  const fresh = freshOfDays(0);
  const doc = await Listing.create({ ...input, verifiedAt, fresh });
  return doc.toObject();
}

export async function updateListing(id: string, input: ListingUpdateInput) {
  const doc = await Listing.findByIdAndUpdate(id, input, { new: true }).lean().exec();
  if (!doc) return null;
  return mapListingRow(doc as ListingDoc);
}

export async function verifyListing(id: string) {
  const verifiedAt = new Date();
  const doc = await Listing.findByIdAndUpdate(
    id,
    { verifiedAt, fresh: freshOfDays(0) },
    { new: true },
  ).lean().exec();
  if (!doc) return null;
  return doc;
}

export async function deleteListing(id: string) {
  const doc = await Listing.findByIdAndDelete(id).lean().exec();
  if (!doc) return null;
  return mapListingRow(doc as ListingDoc);
}
