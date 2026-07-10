import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { ApiError } from '../../utils/apiError.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { PERMISSIONS, cityScope } from '../auth/permissions.js';
import { ListingCreateSchema, ListingUpdateSchema } from './listings.schema.js';
import {
  createListing,
  getListing,
  listListings,
  updateListing,
  verifyListing,
  type ListListingsOptions,
} from './listings.service.js';

export const listingsRouter = Router();

function assertCityAllowed(req: import('express').Request, city: string | undefined) {
  const scope = cityScope(req.user);
  if (scope === null) return;
  if (!city || !scope.includes(city)) {
    throw new ApiError(403, 'This listing is outside your assigned cities', 'CITY_FORBIDDEN');
  }
}

function parseFreshness(query: import('express').Request['query']) {
  const raw = typeof query.fresh === 'string'
    ? query.fresh
    : typeof query.freshness === 'string'
      ? query.freshness
      : undefined;
  return raw === 'fresh' || raw === 'stale' || raw === 'expired' ? raw : undefined;
}

listingsRouter.get('/listings', requirePermission(PERMISSIONS.LISTINGS_READ), async (req, res) => {
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const freshness = parseFreshness(req.query);

  const maxPrice = typeof req.query.maxPrice === 'string' ? Number(req.query.maxPrice) : undefined;
  const minSeats = typeof req.query.minSeats === 'string' ? Number(req.query.minSeats) : undefined;
  const amenitiesRaw = req.query.amenities;
  const amenities =
    typeof amenitiesRaw === 'string'
      ? amenitiesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(amenitiesRaw)
        ? amenitiesRaw.map(String).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
        : undefined;

  const buildingType = typeof req.query.buildingType === 'string' ? req.query.buildingType : undefined;
  const virtualOffice = req.query.virtualOffice === 'true';
  const managedOffice = req.query.managedOffice === 'true';
  const hotDesk = req.query.hotDesk === 'true';
  const vastu = req.query.vastu === 'true';

  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const pageRaw = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  const options: ListListingsOptions = { search };
  if (pageRaw !== undefined || limitRaw !== undefined) {
    options.page = Number.isFinite(pageRaw) ? pageRaw! : 1;
    options.limit = Number.isFinite(limitRaw) ? limitRaw! : 20;
  }

  const result = await listListings(
    {
      city,
      type,
      freshness,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
      minSeats: Number.isFinite(minSeats) ? minSeats : undefined,
      amenities,
      buildingType,
      virtualOffice,
      managedOffice,
      hotDesk,
      vastu,
      allowedCities: cityScope(req.user),
    },
    options,
  );

  res.json(result);
});

listingsRouter.get('/listings/:id', requirePermission(PERMISSIONS.LISTINGS_READ), async (req, res) => {
  const item = await getListing(String(req.params.id));
  if (!item) throw new ApiError(404, 'Listing not found', 'NOT_FOUND');
  assertCityAllowed(req, item.city);
  res.json({ item });
});

listingsRouter.post(
  '/listings',
  requirePermission(PERMISSIONS.LISTINGS_WRITE),
  validateBody(ListingCreateSchema),
  async (req, res) => {
    assertCityAllowed(req, req.body.city);
    const item = await createListing(req.body);
    res.status(201).json({ item });
  },
);

listingsRouter.patch(
  '/listings/:id',
  requirePermission(PERMISSIONS.LISTINGS_WRITE),
  validateBody(ListingUpdateSchema),
  async (req, res) => {
    const existing = await getListing(String(req.params.id));
    if (!existing) throw new ApiError(404, 'Listing not found', 'NOT_FOUND');
    assertCityAllowed(req, existing.city as string);
    if (req.body.city) assertCityAllowed(req, req.body.city);
    const item = await updateListing(String(req.params.id), req.body);
    if (!item) throw new ApiError(404, 'Listing not found', 'NOT_FOUND');
    res.json({ item });
  },
);

listingsRouter.post(
  '/listings/:id/verify',
  requirePermission(PERMISSIONS.LISTINGS_WRITE),
  async (req, res) => {
    const existing = await getListing(String(req.params.id));
    if (!existing) throw new ApiError(404, 'Listing not found', 'NOT_FOUND');
    assertCityAllowed(req, existing.city as string);
    const item = await verifyListing(String(req.params.id));
    if (!item) throw new ApiError(404, 'Listing not found', 'NOT_FOUND');
    res.json({ item });
  },
);
