import { z } from 'zod';
import {
  LEAD_INTERESTED_IN,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STAGES,
} from './leads.model.js';

const interestedInSchema = z.array(z.enum(LEAD_INTERESTED_IN)).optional().default([]);

export const LeadCreateSchema = z.object({
  leadDate: z.string().optional(),
  name: z.string().optional().default(''),
  contact: z.string().optional().default(''),
  email: z.string().optional().default(''),
  company: z.string().optional().default(''),
  interestedIn: interestedInSchema,
  city: z.string().optional().default(''),
  microlocation: z.string().optional().default(''),
  seats: z.number().optional().default(0),
  seatRange: z.string().optional().default(''),
  stage: z.enum(LEAD_STAGES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  budget: z.number().optional().default(0),
  moveIn: z.string().optional().default(''),
  rawEnquiry: z.string().optional().default(''),
  amenities: z.array(z.string()).optional().default([]),
  assigneeId: z.string().optional(),
  listingIds: z.array(z.string()).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  dueAt: z.string().optional().nullable(),
});

export const LeadUpdateSchema = z.object({
  leadDate: z.string().optional().nullable(),
  name: z.string().optional(),
  contact: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
  interestedIn: interestedInSchema,
  city: z.string().optional(),
  microlocation: z.string().optional(),
  seats: z.number().optional(),
  seatRange: z.string().optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  assigneeId: z.string().optional().nullable(),
  budget: z.number().optional(),
  moveIn: z.string().optional(),
  rawEnquiry: z.string().optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  dueAt: z.string().optional().nullable(),
  lostReason: z.string().optional(),
  listingIds: z.array(z.string()).optional(),
});

export const LeadNoteSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const LeadParseSchema = z.object({
  enquiry: z.string().min(1).max(8000),
});

export const LeadFromMatchSchema = z.object({
  enquiry: z.string().optional().default(''),
  city: z.string().optional().default(''),
  microlocation: z.string().optional().default(''),
  locality: z.string().optional(),
  seats: z.number().optional(),
  teamSize: z.number().optional(),
  budget: z.number().optional(),
  budgetPerSeat: z.number().optional(),
  moveIn: z.string().optional().default(''),
  amenities: z.array(z.string()).optional().default([]),
  interestedIn: interestedInSchema,
  spaceTypes: z.array(z.string()).optional(),
  listingIds: z.array(z.string()).min(1),
  name: z.string().optional().default(''),
  contact: z.string().optional().default(''),
  email: z.string().optional().default(''),
  company: z.string().optional().default(''),
  client: z.object({
    name: z.string().optional().default(''),
    company: z.string().optional().default(''),
    email: z.string().optional().default(''),
    phone: z.string().optional().default(''),
  }).optional(),
});

export type LeadCreateInput = z.infer<typeof LeadCreateSchema>;
export type LeadUpdateInput = z.infer<typeof LeadUpdateSchema>;
export type LeadFromMatchInput = z.infer<typeof LeadFromMatchSchema>;
