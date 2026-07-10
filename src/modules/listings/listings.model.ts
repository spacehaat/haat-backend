import mongoose, { Schema } from 'mongoose';

const FreshSchema = new Schema(
  {
    state: { type: String, enum: ['fresh', 'stale', 'expired'], required: true },
    label: { type: String, required: true },
    days: { type: Number, required: true },
  },
  { _id: false }
);

const PersonSchema = new Schema(
  {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: false }
);

const IdentitySchema = new Schema(
  {
    centreName: { type: String, default: '' },
    address: { type: String, default: '' },
    mapsLink: { type: String, default: '' },
    nearestMetro: { type: String, default: '' },
    nearestRail: { type: String, default: '' },
    floors: { type: String, default: '' },
    buildingType: { type: String, default: '' },
    ownership: { type: String, default: '' },
    entranceFacing: { type: String, default: '' },
    zoning: { type: String, default: '' },
    vastu: { type: Boolean, default: false },
    superBuiltUp: { type: Number, default: 0 },
    carpet: { type: Number, default: 0 },
    layoutType: { type: String, default: '' },
    deskSize: { type: String, default: '' },
  },
  { _id: false }
);

const CapacitySchema = new Schema(
  {
    totalSeats: { type: Number, default: 0 },
    totalWorkstations: { type: Number, default: 0 },
    totalCabins: { type: Number, default: 0 },
    cabinSeatsEach: { type: Number, default: 4 },
    meetingRooms: { type: Number, default: 0 },
    meetingRoomSeats: { type: Number, default: 0 },
    conferenceRooms: { type: Number, default: 0 },
    conferenceSeats: { type: Number, default: 0 },

    // dynamic / live fields
    availWorkstations: { type: Number, default: 0 },
    availCabins: { type: Number, default: 0 },
    availCabinSeats: { type: Number, default: 4 },
    hotDeskAvailable: { type: Boolean, default: false },
    hotDeskCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const PricingSchema = new Schema(
  {
    hotDesk: { type: Number, default: 0 },
    dedicatedDesk: { type: Number, default: 0 },
    privateCabin: { type: Number, default: 0 },
    confRoomHour: { type: Number, default: 0 },
    confRoomDay: { type: Number, default: 0 },
    meetingRoomHour: { type: Number, default: 0 },
    dayPass: { type: Number, default: 0 },
    managedPerSqft: { type: Number, default: 0 },
    carParking: { type: Number, default: 0 },
    twoWheeler: { type: Number, default: 0 },
    beyondHours: { type: String, default: '' },
    signageBoard: { type: Number, default: 0 },
    securityDeposit: { type: String, default: '' },
    noticePeriod: { type: String, default: '' },
  },
  { _id: false }
);

const SalesIntelSchema = new Schema(
  {
    pitchingPrice: { type: Number, default: 0 },
    closingPrice: { type: Number, default: 0 },
    yoyIncrement: { type: String, default: '' },
    competitors: { type: [String], default: [] },
    expansionPlans: { type: String, default: '' },
    commissionAccount: { type: String, default: '' },
  },
  { _id: false }
);

const OperationsSchema = new Schema(
  {
    timings: { type: String, default: '' },
    daysOpen: { type: String, default: '' },
    sundayVisits: { type: Boolean, default: false },
    managedOfficeAvailable: { type: Boolean, default: false },
    virtualOfficeAvailable: { type: Boolean, default: false },
  },
  { _id: false }
);

const ContactsMediaSchema = new Schema(
  {
    centerManager: { type: PersonSchema, default: () => ({}) },
    communityManager: { type: PersonSchema, default: () => ({}) },
    salesPhone: { type: String, default: '' },
    salesEmail: { type: String, default: '' },
    accountEmail: { type: String, default: '' },
    carParkingAvailable: { type: Boolean, default: false },
    carParkingSpaces: { type: Number, default: 0 },
    twoWheelerSpaces: { type: Number, default: 0 },
    extraAmenities: { type: [String], default: [] },
    gallery: { type: [String], default: [] },
    brochure: { type: String, default: '' },
    website: { type: String, default: '' },
    instagram: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    virtualTour: { type: String, default: '' },
  },
  { _id: false }
);

const ListingProfileSchema = new Schema(
  {
    identity: { type: IdentitySchema, default: () => ({}) },
    capacity: { type: CapacitySchema, default: () => ({}) },
    pricing: { type: PricingSchema, default: () => ({}) },
    salesIntel: { type: SalesIntelSchema, default: () => ({}) },
    operations: { type: OperationsSchema, default: () => ({}) },
    contactsMedia: { type: ContactsMediaSchema, default: () => ({}) },
  },
  { _id: false }
);

export const ListingSchema = new Schema(
  {
    operator: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    micro: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true, index: true },
    seats: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    amenities: { type: [String], default: [] },
    tier: { type: String, default: 'Standard' },
    avail: { type: String, default: 'Available now' },

    verifiedAt: { type: Date, default: () => new Date(), index: true },
    fresh: { type: FreshSchema, required: true },

    // A–F profile (full design schema)
    profile: { type: ListingProfileSchema, default: null },

    images: { type: [String], default: [] },
    photoMeta: { type: [Schema.Types.Mixed], default: [] },
    source: { type: String, default: 'system' },
  },
  { timestamps: true }
);

export type ListingDoc = mongoose.InferSchemaType<typeof ListingSchema>;

export const Listing =
  (mongoose.models.Listing as mongoose.Model<ListingDoc> | undefined) ??
  mongoose.model<ListingDoc>('Listing', ListingSchema);

