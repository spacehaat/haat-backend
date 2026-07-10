import { ApiError } from '../../utils/apiError.js';
import { cityScope } from '../auth/permissions.js';
import type { AuthUser } from '../auth/permissions.js';
import { listListings } from '../listings/listings.service.js';
import { parseRequirements, type ParseContext } from './smart-match.parser.js';
import { listingToMatchResponse, scoreListingMatch } from './smart-match.scorer.js';
import type { MatchRequirements, SmartMatchRunInput } from './smart-match.schema.js';

const KNOWN_AMENITIES = [
  'Wi-Fi', 'Parking', 'Cafeteria', 'Meeting rooms', '24x7 access', 'AC',
  'Reception', 'Phone booths', 'Printer', 'Pantry', 'Metro <5min', 'Gym',
];

const KNOWN_SPACE_TYPES = ['Hot desk', 'Dedicated desk', 'Private cabin', 'Managed office'];

export function buildParseContext(listings: Awaited<ReturnType<typeof listListings>>['items']): ParseContext {
  const cities = [...new Set(listings.map((l) => l.city).filter(Boolean))].sort();
  const localities = [...new Set(listings.map((l) => l.micro).filter(Boolean))].sort();
  const spaceTypes = [...new Set([
    ...KNOWN_SPACE_TYPES,
    ...listings.map((l) => l.type).filter(Boolean),
  ])];
  const amenities = [...new Set([
    ...KNOWN_AMENITIES,
    ...listings.flatMap((l) => l.amenities || []),
  ])];
  return { cities, localities, spaceTypes, amenities };
}

function mergeRequirements(base: MatchRequirements, patch?: Partial<MatchRequirements>): MatchRequirements {
  if (!patch) return base;
  return {
    city: patch.city ?? base.city,
    locality: patch.locality ?? base.locality,
    teamSize: patch.teamSize ?? base.teamSize,
    budgetPerSeat: patch.budgetPerSeat ?? base.budgetPerSeat,
    spaceTypes: patch.spaceTypes ?? base.spaceTypes,
    amenities: patch.amenities ?? base.amenities,
    moveIn: patch.moveIn ?? base.moveIn,
    tierPreference: patch.tierPreference ?? base.tierPreference,
    notes: patch.notes ?? base.notes,
  };
}

export async function parseEnquiry(enquiry: string, user: AuthUser) {
  const allowed = cityScope(user);
  const listings = await listListings({ allowedCities: allowed });
  const ctx = buildParseContext(listings.items);
  const { requirements, source } = await parseRequirements(enquiry, ctx);
  return { requirements, source, context: { cities: ctx.cities, amenities: ctx.amenities.slice(0, 16) } };
}

export async function runSmartMatch(input: SmartMatchRunInput, user: AuthUser) {
  const allowed = cityScope(user);
  const cityFilter = input.cityFilter && input.cityFilter !== 'All cities' ? input.cityFilter : undefined;

  const { items: listings } = await listListings({
    allowedCities: allowed,
    city: cityFilter,
  });

  const ctx = buildParseContext(listings);

  let requirements: MatchRequirements;
  let parseSource: 'openai' | 'rules' | 'manual' = 'manual';

  if (input.enquiry?.trim()) {
    const parsed = await parseRequirements(input.enquiry.trim(), ctx);
    requirements = mergeRequirements(parsed.requirements, input.requirements);
    parseSource = parsed.source;
  } else if (input.requirements) {
    requirements = input.requirements;
  } else {
    throw new ApiError(400, 'Provide an enquiry message or structured requirements', 'INVALID_INPUT');
  }

  const scored = listings
    .map((listing) => {
      const match = scoreListingMatch(listing, requirements);
      return {
        listing: listingToMatchResponse(listing),
        score: match.score,
        verdict: match.verdict,
        nearMiss: match.nearMiss,
        reasons: match.reasons,
      };
    })
    .filter((m) => m.score >= 35)
    .sort((a, b) => b.score - a.score);

  const limit = input.limit ?? 12;
  const matches = scored.slice(0, limit);

  return {
    requirements,
    parseSource,
    matches,
    meta: {
      totalScored: listings.length,
      qualified: scored.length,
      returned: matches.length,
    },
  };
}
