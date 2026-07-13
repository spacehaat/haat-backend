import { env } from '../../config/env.js';
import type { MatchRequirements } from './smart-match.schema.js';

export type ParseContext = {
  cities: string[];
  localities: string[];
  spaceTypes: string[];
  amenities: string[];
};

const CITY_ALIASES: Record<string, string> = {
  bengaluru: 'Bangalore',
  bangalore: 'Bangalore',
  blr: 'Bangalore',
  mumbai: 'Mumbai',
  bombay: 'Mumbai',
  delhi: 'Delhi',
  'new delhi': 'Delhi',
  ncr: 'Delhi',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  noida: 'Noida',
  hyderabad: 'Hyderabad',
  hyd: 'Hyderabad',
  pune: 'Pune',
  chennai: 'Chennai',
  madras: 'Chennai',
  ahmedabad: 'Ahmedabad',
  ahmadabad: 'Ahmedabad',
  amdavad: 'Ahmedabad',
  jaipur: 'Jaipur',
  lucknow: 'Lucknow',
  indore: 'Indore',
};

const SPACE_TYPE_PATTERNS: [RegExp, string][] = [
  [/private\s*cabin/i, 'Private cabin'],
  [/dedicated\s*desk/i, 'Dedicated desk'],
  [/hot\s*desk/i, 'Hot desk'],
  [/managed\s*office/i, 'Managed office'],
  [/virtual\s*office/i, 'Virtual office'],
];

function normalizeCity(raw: string, ctx: ParseContext): string {
  const key = raw.trim().toLowerCase();
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  const hit = ctx.cities.find((c) => c.toLowerCase() === key || key.includes(c.toLowerCase()));
  return hit || raw.trim();
}

function parseBudget(text: string): number {
  const kMatch = text.match(/(?:budget|under|upto|up to|max|~|around|approx)?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch?.[1]) return Math.round(parseFloat(kMatch[1]) * 1000);

  const seatMatch = text.match(/(?:budget|under|upto|up to|max|~|around|approx)?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)\s*(?:\/|\s*per\s*)?seat/i);
  if (seatMatch?.[1]) return Math.round(parseFloat(seatMatch[1].replace(/,/g, '')));

  const plain = text.match(/(?:₹|rs\.?|inr)\s*(\d[\d,]*)/i);
  if (plain?.[1]) return Math.round(parseFloat(plain[1].replace(/,/g, '')));

  return 0;
}

function parseTeamSize(text: string): number {
  const patterns = [
    /(\d+)\s*(?:\+?\s*)?(?:seats?|people|pax|members?|employees?|headcount|team\s*of|workstations?)/i,
    /team\s*(?:of|size)?\s*(\d+)/i,
    /for\s*(\d+)\s*(?:people|seats?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return Number(m[1]);
  }
  return 0;
}

function parseLocality(text: string, ctx: ParseContext): string {
  const lower = text.toLowerCase();
  const sorted = [...ctx.localities].sort((a, b) => b.length - a.length);
  for (const loc of sorted) {
    if (lower.includes(loc.toLowerCase())) return loc;
  }
  const near = text.match(/(?:in|at|near|around)\s+([A-Za-z0-9][A-Za-z0-9\s,.-]{2,40})/i);
  if (near?.[1]) {
    const candidate = near[1].split(/[,.\n]/)[0]?.trim();
    if (candidate && candidate.length > 2) return candidate;
  }
  return '';
}

function parseCity(text: string, ctx: ParseContext): string {
  const lower = text.toLowerCase();
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias)) return city;
  }
  for (const city of ctx.cities) {
    if (city !== 'All cities' && lower.includes(city.toLowerCase())) return city;
  }
  return '';
}

function parseAmenities(text: string, ctx: ParseContext): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const a of ctx.amenities) {
    const key = a.toLowerCase();
    if (lower.includes(key) || (key.includes('24') && /24\s*x?\s*7|24\/7|round the clock/i.test(text))) {
      found.push(a);
    }
  }
  if (/meeting\s*room/i.test(text) && !found.includes('Meeting rooms')) found.push('Meeting rooms');
  if (/parking/i.test(text) && !found.includes('Parking')) found.push('Parking');
  if (/wifi|wi-fi/i.test(text) && !found.includes('Wi-Fi')) found.push('Wi-Fi');
  if (/gym|fitness/i.test(text) && !found.includes('Gym')) found.push('Gym');
  if (/cafeteria|pantry|coffee/i.test(text) && !found.includes('Cafeteria')) found.push('Cafeteria');
  return [...new Set(found)];
}

function parseSpaceTypes(text: string, ctx: ParseContext): string[] {
  const found: string[] = [];
  for (const [re, label] of SPACE_TYPE_PATTERNS) {
    if (re.test(text) && (ctx.spaceTypes.length === 0 || ctx.spaceTypes.includes(label))) {
      found.push(label);
    }
  }
  return [...new Set(found)];
}

function parseMoveIn(text: string): string {
  const wk = text.match(/(\d+)\s*week/i);
  if (wk?.[1]) return `In ${wk[1]} weeks`;
  const mo = text.match(/(\d+)\s*month/i);
  if (mo?.[1]) return `In ${mo[1]} months`;
  if (/immediate|asap|urgent|now/i.test(text)) return 'Immediate';
  return '';
}

function parseTier(text: string): 'premium' | 'standard' | 'any' {
  if (/premium|luxury|high[- ]end|quiet|executive/i.test(text)) return 'premium';
  if (/standard|budget|econom/i.test(text)) return 'standard';
  return 'any';
}

export function parseRequirementsRules(enquiry: string, ctx: ParseContext): MatchRequirements {
  const text = enquiry.trim();
  const city = parseCity(text, ctx);
  const locality = parseLocality(text, ctx);
  return {
    city,
    locality,
    teamSize: parseTeamSize(text),
    budgetPerSeat: parseBudget(text),
    spaceTypes: parseSpaceTypes(text, ctx),
    amenities: parseAmenities(text, ctx),
    moveIn: parseMoveIn(text),
    tierPreference: parseTier(text),
    notes: '',
  };
}

async function parseWithOpenAI(enquiry: string, ctx: ParseContext): Promise<MatchRequirements | null> {
  if (!env.OPENAI_API_KEY) return null;

  const system = `You extract coworking workspace requirements from client messages in India.
Return ONLY valid JSON with this exact shape:
{
  "city": string,
  "locality": string,
  "teamSize": number,
  "budgetPerSeat": number,
  "spaceTypes": string[],
  "amenities": string[],
  "moveIn": string,
  "tierPreference": "premium" | "standard" | "any",
  "notes": string
}
Rules:
- Cities must be one of: ${ctx.cities.filter((c) => c !== 'All cities').join(', ')}
- spaceTypes prefer: ${ctx.spaceTypes.join(', ')}
- amenities prefer: ${ctx.amenities.slice(0, 20).join(', ')}
- budgetPerSeat is INR per seat per month (parse "9k" as 9000)
- teamSize is number of seats/people needed
- If unknown, use empty string, 0, or [] as appropriate`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: enquiry },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as MatchRequirements;
    return {
      city: parsed.city ? normalizeCity(parsed.city, ctx) : '',
      locality: parsed.locality || '',
      teamSize: Number(parsed.teamSize) || 0,
      budgetPerSeat: Number(parsed.budgetPerSeat) || 0,
      spaceTypes: Array.isArray(parsed.spaceTypes) ? parsed.spaceTypes : [],
      amenities: Array.isArray(parsed.amenities) ? parsed.amenities : [],
      moveIn: parsed.moveIn || '',
      tierPreference: parsed.tierPreference || 'any',
      notes: parsed.notes || '',
    };
  } catch {
    return null;
  }
}

export async function parseRequirements(
  enquiry: string,
  ctx: ParseContext,
): Promise<{ requirements: MatchRequirements; source: 'openai' | 'rules' }> {
  const ai = await parseWithOpenAI(enquiry, ctx);
  if (ai && (ai.city || ai.teamSize || ai.budgetPerSeat || ai.locality)) {
    return { requirements: ai, source: 'openai' };
  }
  return { requirements: parseRequirementsRules(enquiry, ctx), source: 'rules' };
}
