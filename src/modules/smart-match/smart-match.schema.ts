import { z } from 'zod';

export const MatchRequirementsSchema = z.object({
  city: z.string().optional().default(''),
  locality: z.string().optional().default(''),
  teamSize: z.number().int().min(0).optional().default(0),
  budgetPerSeat: z.number().min(0).optional().default(0),
  spaceTypes: z.array(z.string()).optional().default([]),
  amenities: z.array(z.string()).optional().default([]),
  moveIn: z.string().optional().default(''),
  tierPreference: z.enum(['premium', 'standard', 'any']).optional().default('any'),
  notes: z.string().optional().default(''),
});

export type MatchRequirements = z.infer<typeof MatchRequirementsSchema>;

export const SmartMatchParseSchema = z.object({
  enquiry: z.string().min(3, 'Paste a client message to parse'),
});

export const SmartMatchRunSchema = z.object({
  enquiry: z.string().optional(),
  requirements: MatchRequirementsSchema.optional(),
  limit: z.number().int().min(1).max(30).optional().default(12),
  cityFilter: z.string().optional(),
});

export type SmartMatchRunInput = z.infer<typeof SmartMatchRunSchema>;
