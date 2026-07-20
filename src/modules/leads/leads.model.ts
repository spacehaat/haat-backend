import mongoose, { Schema, Types } from 'mongoose';

export const LEAD_STAGES = [
  'new',
  'qualified',
  'proposal_sent',
  'visit_scheduled',
  'negotiation',
  'won',
  'lost',
] as const;

/** @deprecated use LEAD_STAGES — kept for migration reads */
export const LEAD_STATUSES = LEAD_STAGES;

export const LEAD_SOURCES = [
  'smart_match',
  'manual',
  'referral',
  'website',
  'whatsapp',
] as const;

export const LEAD_PRIORITIES = ['low', 'normal', 'high'] as const;

export const LEAD_INTERESTED_IN = [
  'Hot desk',
  'Dedicated desk',
  'Private office',
  'Managed office',
] as const;

const LeadNoteSchema = new Schema(
  {
    text: { type: String, required: true },
    who: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

export const LeadSchema = new Schema(
  {
    leadDate: { type: Date, default: () => new Date(), index: true },
    name: { type: String, default: '', trim: true, index: true },
    contact: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, index: true },
    company: { type: String, default: '', trim: true, index: true },
    interestedIn: [{ type: String, enum: LEAD_INTERESTED_IN }],
    city: { type: String, default: '', trim: true, index: true },
    microlocation: { type: String, default: '', trim: true, index: true },
    seats: { type: Number, default: 0, min: 0 },
    seatRange: { type: String, default: '', trim: true },
    stage: { type: String, enum: LEAD_STAGES, default: 'new', index: true },
    source: { type: String, enum: LEAD_SOURCES, default: 'manual', index: true },
    budget: { type: Number, default: 0, min: 0 },
    moveIn: { type: String, default: '' },
    rawEnquiry: { type: String, default: '' },
    amenities: [{ type: String }],

    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listingIds: [{ type: Schema.Types.ObjectId, ref: 'Listing' }],
    proposalIds: [{ type: Schema.Types.ObjectId, ref: 'Proposal' }],
    visitIds: [{ type: Schema.Types.ObjectId }],
    priority: { type: String, enum: LEAD_PRIORITIES, default: 'normal' },
    dueAt: { type: Date, index: true },
    reminderSentAt: { type: Date, default: null },
    lostReason: { type: String, default: '' },
    notes: { type: [LeadNoteSchema], default: [] },
  },
  { timestamps: true },
);

export type LeadDoc = mongoose.InferSchemaType<typeof LeadSchema> & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export const Lead =
  (mongoose.models.Lead as mongoose.Model<LeadDoc> | undefined) ??
  mongoose.model<LeadDoc>('Lead', LeadSchema);

export const ClientDirectorySchema = new Schema(
  {
    name: { type: String, default: '', index: true },
    company: { type: String, default: '', index: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    lastContactAt: { type: Date, default: () => new Date() },
    leadCount: { type: Number, default: 0 },
    wonCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type ClientDoc = mongoose.InferSchemaType<typeof ClientDirectorySchema> & {
  _id: Types.ObjectId;
};

export const ClientDirectory =
  (mongoose.models.ClientDirectory as mongoose.Model<ClientDoc> | undefined) ??
  mongoose.model<ClientDoc>('ClientDirectory', ClientDirectorySchema);
