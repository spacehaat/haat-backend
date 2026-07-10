import { z } from 'zod';

export const ProposalClientSchema = z.object({
  name: z.string().optional().default(''),
  company: z.string().optional().default(''),
});

export const ProposalDraftUpdateSchema = z.object({
  client: ProposalClientSchema.optional(),
  listingIds: z.array(z.string()).optional(),
  coverNote: z.string().optional(),
  coverNoteIdx: z.number().int().min(0).optional(),
  title: z.string().max(120).optional(),
  leadId: z.string().optional().nullable(),
});

const ProposalRenderPhotoSchema = z.object({
  src: z.string(),
  label: z.string().optional().default(''),
});

const ProposalRenderListingSchema = z.object({
  operator: z.string().optional().default(''),
  type: z.string().optional().default(''),
  city: z.string().optional().default(''),
  micro: z.string().optional().default(''),
  seats: z.number().optional().default(0),
  price: z.number().optional().default(0),
  avail: z.string().optional().default('Available now'),
  freshLabel: z.string().optional().default('Verified'),
  carpet: z.number().optional().default(0),
  buildingType: z.string().optional().default(''),
  nearestMetro: z.string().optional().default(''),
  securityDeposit: z.string().optional().default(''),
  noticePeriod: z.string().optional().default(''),
  amenities: z.array(z.string()).optional().default([]),
  gallery: z.array(ProposalRenderPhotoSchema).optional().default([]),
});

export const ProposalRenderSchema = z.object({
  listings: z.array(ProposalRenderListingSchema),
});

export const ProposalSendSchema = z.object({
  channel: z.enum(['whatsapp', 'email']),
  sentBy: z.string().optional().default('Rohit'),
  title: z.string().max(120).optional(),
  render: ProposalRenderSchema.optional(),
  leadId: z.string().optional(),
});

export const ProposalPdfSchema = z.object({
  title: z.string().max(120).optional(),
  render: ProposalRenderSchema.optional(),
  updateProposalId: z.string().optional(),
  leadId: z.string().optional(),
});

export const PublicProposalFeedbackSchema = z.object({
  listingId: z.string().optional(),
  status: z.enum(['shortlisted', 'rejected', 'none']).optional(),
  comment: z.string().trim().max(1000).optional(),
  preferredDates: z.array(z.string().trim().max(80)).max(3).optional(),
  visitNote: z.string().trim().max(1000).optional(),
});

export type ProposalRenderInput = z.infer<typeof ProposalRenderSchema>;
export type ProposalDraftUpdateInput = z.infer<typeof ProposalDraftUpdateSchema>;
export type ProposalSendInput = z.infer<typeof ProposalSendSchema>;
export type ProposalPdfInput = z.infer<typeof ProposalPdfSchema>;
export type PublicProposalFeedbackInput = z.infer<typeof PublicProposalFeedbackSchema>;
