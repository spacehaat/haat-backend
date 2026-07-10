import mongoose, { Schema, Types } from 'mongoose';

const ClientSchema = new Schema(
  {
    name: { type: String, default: '' },
    company: { type: String, default: '' },
  },
  { _id: false },
);

// Snapshot of the listings at generation time so a stored proposal stays
// meaningful even if the underlying inventory later changes.
const SummarySchema = new Schema(
  {
    listingCount: { type: Number, default: 0 },
    cities: [{ type: String }],
    operators: [{ type: String }],
    priceMin: { type: Number, default: 0 },
    priceMax: { type: Number, default: 0 },
  },
  { _id: false },
);

const ClientSpaceInteractionSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    status: { type: String, enum: ['shortlisted', 'rejected'], required: true },
    comment: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ClientCommentSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const VisitRequestSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing' },
    preferredDates: [{ type: String }],
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ProposalSchema = new Schema(
  {
    title: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'sent', 'generated'], default: 'draft', index: true },
    client: { type: ClientSchema, default: () => ({}) },
    listingIds: [{ type: Schema.Types.ObjectId, ref: 'Listing' }],
    coverNote: { type: String, default: '' },
    coverNoteIdx: { type: Number, default: 0 },
    summary: { type: SummarySchema, default: () => ({}) },
    sendChannel: { type: String, enum: ['whatsapp', 'email'] },
    sentAt: { type: Date },
    sentBy: { type: String, default: 'Rohit' },
    pdfUrl: { type: String, default: '' },
    pdfKey: { type: String, default: '' },
    pdfGeneratedAt: { type: Date, index: true },
    shareToken: { type: String, index: true, unique: true, sparse: true },
    shareExpiresAt: { type: Date, index: true },
    clientInteractions: { type: [ClientSpaceInteractionSchema], default: [] },
    clientComments: { type: [ClientCommentSchema], default: [] },
    visitRequests: { type: [VisitRequestSchema], default: [] },
    clientFeedbackSeenAt: { type: Date },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
    // Owner — drafts and stored proposals are scoped per user.
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true },
);

export const Proposal = mongoose.model('Proposal', ProposalSchema);

export type ProposalDoc = mongoose.InferSchemaType<typeof ProposalSchema> & {
  _id: Types.ObjectId;
};
