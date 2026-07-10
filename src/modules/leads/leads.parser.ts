import { env } from '../../config/env.js';
import { LEAD_INTERESTED_IN, LEAD_SOURCES } from './leads.model.js';
import {
  parseRequirements,
  parseRequirementsRules,
  type ParseContext,
} from '../smart-match/smart-match.parser.js';

export type ParsedLeadFields = {
  name: string;
  contact: string;
  email: string;
  company: string;
  city: string;
  microlocation: string;
  seats: number;
  interestedIn: string[];
  budget: number;
  moveIn: string;
  source: (typeof LEAD_SOURCES)[number];
  rawEnquiry: string;
};

const INTERESTED_SET = new Set<string>(LEAD_INTERESTED_IN);
const SOURCE_SET = new Set<string>(LEAD_SOURCES);

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91 ${digits.slice(1, 6)} ${digits.slice(6)}`;
  }
  return raw.trim();
}

export function parsePhone(text: string): string {
  const labeled = text.match(
    /(?:phone|mobile|contact|whatsapp|wa|tel)[\s:*-]*(?:\+?\d[\d\s\-().]{8,18}\d)/gi,
  );
  if (labeled?.[0]) {
    const num = labeled[0].match(/(?:\+?\d[\d\s\-().]{8,18}\d)/);
    if (num?.[0]) return normalizePhone(num[0]);
  }

  const patterns = [
    /\+91[\s-]?[6-9]\d{4}[\s-]?\d{5}/g,
    /\+91[\s-]?[6-9]\d{9}/g,
    /(?<![\d])[6-9]\d{4}[\s-]?\d{5}(?![\d])/g,
    /(?<![\d])[6-9]\d{9}(?![\d])/g,
  ];

  for (const re of patterns) {
    const matches = text.match(re);
    if (matches?.[0]) return normalizePhone(matches[0]);
  }
  return '';
}

export function parseEmail(text: string): string {
  const labeled = text.match(
    /(?:email|e-mail|mail)[\s:*-]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  );
  if (labeled?.[1]) return labeled[1].toLowerCase();
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m?.[0]?.toLowerCase() || '';
}

function parseLabeled(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-–—]\\s*(.+?)(?:\\n|$)`, 'i');
    const m = text.match(re);
    if (m?.[1]) return m[1].split(/[,|]/)[0]?.trim() || '';
  }
  return '';
}

function cleanName(name: string): string {
  return name
    .replace(/\s+from\s*$/i, '')
    .replace(/\s+at\s*$/i, '')
    .trim();
}

function parseName(text: string, email: string, company: string): string {
  const labeled = parseLabeled(text, ['name', 'client name', 'contact person', 'contact name']);
  if (labeled && labeled.length > 1 && labeled.length < 60) return cleanName(labeled);

  const hi = text.match(
    /(?:^|\n)\s*(?:hi|hello|hey)[,\s]+(?:this is|i am|i'm|im)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=\s|,|\.|$|\s+from\b|\s+at\b)/im,
  );
  if (hi?.[1]) return cleanName(hi[1].trim());

  const from = text.match(
    /(?:regards,?|thanks,?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=\s|,|\.|$)/i,
  );
  if (from?.[1] && from[1].toLowerCase() !== company.toLowerCase()) return cleanName(from[1].trim());

  if (email) {
    const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    if (local && /^[a-z\s]{2,30}$/i.test(local) && !/^(info|hello|contact|sales|admin)$/i.test(local)) {
      return local.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 2);
  if (firstLine && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(firstLine)) return firstLine;

  return '';
}

function parseCompany(text: string): string {
  const labeled = parseLabeled(text, ['company', 'organisation', 'organization', 'firm', 'client', 'business']);
  if (labeled && labeled.length > 1) return labeled;

  const fromCo = text.match(/\bfrom\s+([A-Z][A-Za-z0-9][A-Za-z0-9\s&.'-]{2,40})/);
  if (fromCo?.[1]) return fromCo[1].split(/[,.\n]/)[0]?.trim() || '';

  const atCo = text.match(/\bat\s+([A-Z][A-Za-z0-9][A-Za-z0-9\s&.'-]{2,40})/);
  if (atCo?.[1]) return atCo[1].split(/[,.\n]/)[0]?.trim() || '';

  return '';
}

function mapInterestedIn(spaceTypes: string[]): string[] {
  const out: string[] = [];
  for (const raw of spaceTypes) {
    const v = raw.trim();
    if (!v) continue;
    if (INTERESTED_SET.has(v)) {
      if (!out.includes(v)) out.push(v);
      continue;
    }
    if (/private\s*(cabin|office)/i.test(v) && !out.includes('Private office')) {
      out.push('Private office');
      continue;
    }
    if (/dedicated\s*desk/i.test(v) && !out.includes('Dedicated desk')) out.push('Dedicated desk');
    else if (/hot\s*desk/i.test(v) && !out.includes('Hot desk')) out.push('Hot desk');
    else if (/managed\s*office/i.test(v) && !out.includes('Managed office')) out.push('Managed office');
  }
  return out;
}

function parseSource(text: string): (typeof LEAD_SOURCES)[number] {
  const lower = text.toLowerCase();
  if (/whatsapp|\bwa\b|sent on whatsapp/i.test(lower)) return 'whatsapp';
  if (/referr|referred by|referral/i.test(lower)) return 'referral';
  if (/website|web form|landing page|inquiry form|enquiry form/i.test(lower)) return 'website';
  if (/smart\s*match/i.test(lower)) return 'smart_match';
  return 'manual';
}

function normalizeSource(value: string | undefined): (typeof LEAD_SOURCES)[number] {
  if (value && SOURCE_SET.has(value)) return value as (typeof LEAD_SOURCES)[number];
  return 'manual';
}

function parseLeadRules(enquiry: string, ctx: ParseContext): ParsedLeadFields {
  const text = enquiry.trim();
  const req = parseRequirementsRules(text, ctx);
  const email = parseEmail(text);
  const contact = parsePhone(text);
  const company = parseCompany(text);
  const name = parseName(text, email, company);

  return {
    name,
    contact,
    email,
    company,
    city: req.city,
    microlocation: req.locality,
    seats: req.teamSize,
    interestedIn: mapInterestedIn(req.spaceTypes),
    budget: req.budgetPerSeat,
    moveIn: req.moveIn,
    source: parseSource(text),
    rawEnquiry: text,
  };
}

type AiLeadPayload = Partial<ParsedLeadFields> & {
  locality?: string;
  teamSize?: number;
  budgetPerSeat?: number;
  spaceTypes?: string[];
};

async function parseLeadWithOpenAI(
  enquiry: string,
  ctx: ParseContext,
): Promise<ParsedLeadFields | null> {
  if (!env.OPENAI_API_KEY) return null;

  const system = `You extract coworking sales lead details from pasted client messages in India.
Return ONLY valid JSON with this exact shape:
{
  "name": string,
  "contact": string,
  "email": string,
  "company": string,
  "city": string,
  "microlocation": string,
  "seats": number,
  "interestedIn": string[],
  "budget": number,
  "moveIn": string,
  "source": "manual" | "referral" | "website" | "whatsapp" | "smart_match"
}
Rules:
- Cities must be one of: ${ctx.cities.filter((c) => c !== 'All cities').join(', ')}
- microlocation is the area/locality (e.g. Koramangala, BKC, HITEC City)
- interestedIn values must be from: ${LEAD_INTERESTED_IN.join(', ')} (map "private cabin" to "Private office")
- budget is INR per seat per month (parse "9k" as 9000)
- seats is team size / seat count
- Extract phone in Indian format when present; contact field is phone number
- source: whatsapp if message looks like WhatsApp; referral if referred; website if web enquiry; else manual
- If a field is not mentioned, use "" or 0 or []`;

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

    const parsed = JSON.parse(content) as AiLeadPayload;
    return {
      name: parsed.name?.trim() || '',
      contact: parsed.contact?.trim() || '',
      email: parsed.email?.trim().toLowerCase() || '',
      company: parsed.company?.trim() || '',
      city: parsed.city?.trim() || '',
      microlocation: parsed.microlocation?.trim() || parsed.locality?.trim() || '',
      seats: Number(parsed.seats ?? parsed.teamSize) || 0,
      interestedIn: mapInterestedIn(
        parsed.interestedIn?.length
          ? parsed.interestedIn
          : (parsed.spaceTypes || []),
      ),
      budget: Number(parsed.budget ?? parsed.budgetPerSeat) || 0,
      moveIn: parsed.moveIn?.trim() || '',
      source: normalizeSource(parsed.source) || parseSource(enquiry),
      rawEnquiry: enquiry.trim(),
    };
  } catch {
    return null;
  }
}

function pickString(...values: (string | undefined)[]): string {
  for (const v of values) {
    const s = v?.trim();
    if (s) return s;
  }
  return '';
}

function pickNumber(...values: (number | undefined)[]): number {
  for (const v of values) {
    if (typeof v === 'number' && v > 0) return v;
  }
  return 0;
}

function mergeParsed(
  text: string,
  rules: ParsedLeadFields,
  ai: ParsedLeadFields | null,
): ParsedLeadFields {
  const phoneFromText = parsePhone(text);
  const emailFromText = parseEmail(text);

  const merged: ParsedLeadFields = {
    name: cleanName(pickString(rules.name, ai?.name)),
    contact: pickString(phoneFromText, rules.contact, ai?.contact),
    email: pickString(emailFromText, rules.email, ai?.email),
    company: pickString(rules.company, ai?.company),
    city: pickString(ai?.city, rules.city),
    microlocation: pickString(ai?.microlocation, rules.microlocation),
    seats: pickNumber(ai?.seats, rules.seats),
    interestedIn: (ai?.interestedIn?.length ? ai.interestedIn : rules.interestedIn),
    budget: pickNumber(ai?.budget, rules.budget),
    moveIn: pickString(ai?.moveIn, rules.moveIn),
    source: ai?.source && ai.source !== 'manual' ? ai.source : rules.source,
    rawEnquiry: text.trim(),
  };

  if (!merged.name && merged.company) {
    merged.name = parseName(text, merged.email, merged.company);
  }

  return merged;
}

export async function parseLeadFromText(
  enquiry: string,
  ctx: ParseContext,
): Promise<{ fields: ParsedLeadFields; source: 'openai' | 'rules' }> {
  const text = enquiry.trim();
  const rules = parseLeadRules(text, ctx);

  const ai = await parseLeadWithOpenAI(text, ctx);
  if (ai && (ai.name || ai.city || ai.seats || ai.company || ai.contact || ai.email)) {
    return { fields: mergeParsed(text, rules, ai), source: 'openai' };
  }

  const reqAi = await parseRequirements(text, ctx);
  if (reqAi.source === 'openai') {
    const enriched = mergeParsed(text, rules, {
      ...rules,
      city: reqAi.requirements.city || rules.city,
      microlocation: reqAi.requirements.locality || rules.microlocation,
      seats: reqAi.requirements.teamSize || rules.seats,
      interestedIn: mapInterestedIn(reqAi.requirements.spaceTypes),
      budget: reqAi.requirements.budgetPerSeat || rules.budget,
      moveIn: reqAi.requirements.moveIn || rules.moveIn,
    });
    return { fields: enriched, source: 'openai' };
  }

  return { fields: mergeParsed(text, rules, null), source: 'rules' };
}
