import { z } from 'zod';

const PersonSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
});

const ListingProfileSchema = z.object({
  identity: z.object({
    centreName: z.string().optional(),
    address: z.string().optional(),
    mapsLink: z.string().optional(),
    nearestMetro: z.string().optional(),
    nearestRail: z.string().optional(),
    floors: z.string().optional(),
    buildingType: z.string().optional(),
    ownership: z.string().optional(),
    entranceFacing: z.string().optional(),
    zoning: z.string().optional(),
    vastu: z.boolean().optional(),
    superBuiltUp: z.number().optional(),
    carpet: z.number().optional(),
    layoutType: z.string().optional(),
    deskSize: z.string().optional(),
  }).optional(),

  capacity: z.object({
    totalSeats: z.number().optional(),
    totalWorkstations: z.number().optional(),
    totalCabins: z.number().optional(),
    cabinSeatsEach: z.number().optional(),
    meetingRooms: z.number().optional(),
    meetingRoomSeats: z.number().optional(),
    conferenceRooms: z.number().optional(),
    conferenceSeats: z.number().optional(),

    availWorkstations: z.number().optional(),
    availCabins: z.number().optional(),
    availCabinSeats: z.number().optional(),
    hotDeskAvailable: z.boolean().optional(),
    hotDeskCount: z.number().optional(),
  }).optional(),

  pricing: z.object({
    hotDesk: z.number().optional(),
    dedicatedDesk: z.number().optional(),
    privateCabin: z.number().optional(),
    confRoomHour: z.number().optional(),
    confRoomDay: z.number().optional(),
    meetingRoomHour: z.number().optional(),
    dayPass: z.number().optional(),
    managedPerSqft: z.number().optional(),
    carParking: z.number().optional(),
    twoWheeler: z.number().optional(),
    beyondHours: z.string().optional(),
    signageBoard: z.number().optional(),
    securityDeposit: z.string().optional(),
    noticePeriod: z.string().optional(),
  }).optional(),

  salesIntel: z.object({
    pitchingPrice: z.number().optional(),
    closingPrice: z.number().optional(),
    yoyIncrement: z.string().optional(),
    competitors: z.array(z.string()).optional(),
    expansionPlans: z.string().optional(),
    commissionAccount: z.string().optional(),
  }).optional(),

  operations: z.object({
    timings: z.string().optional(),
    daysOpen: z.string().optional(),
    sundayVisits: z.boolean().optional(),
    managedOfficeAvailable: z.boolean().optional(),
    virtualOfficeAvailable: z.boolean().optional(),
  }).optional(),

  contactsMedia: z.object({
    centerManager: PersonSchema.optional(),
    communityManager: PersonSchema.optional(),
    salesPhone: z.string().optional(),
    salesEmail: z.string().optional(),
    accountEmail: z.string().optional(),
    carParkingAvailable: z.boolean().optional(),
    carParkingSpaces: z.number().optional(),
    twoWheelerSpaces: z.number().optional(),
    extraAmenities: z.array(z.string()).optional(),
    gallery: z.array(z.string()).optional(),
    brochure: z.string().optional(),
    website: z.string().optional(),
    instagram: z.string().optional(),
    linkedin: z.string().optional(),
    virtualTour: z.string().optional(),
  }).optional(),
});

export const ListingCreateSchema = z.object({
  operator: z.string().min(1),
  city: z.string().min(1),
  micro: z.string().min(1),
  type: z.string().min(1),
  seats: z.number().int().min(0),
  price: z.number().int().min(0),
  amenities: z.array(z.string()).optional().default([]),
  tier: z.string().optional().default('Standard'),
  avail: z.string().optional().default('Available now'),
  images: z.array(z.string()).optional().default([]),
  photoMeta: z.array(z.unknown()).optional().default([]),
  source: z.string().optional().default('system'),
  profile: ListingProfileSchema.optional().nullable(),
});

export const ListingUpdateSchema = ListingCreateSchema.partial();

export type ListingCreateInput = z.infer<typeof ListingCreateSchema>;
export type ListingUpdateInput = z.infer<typeof ListingUpdateSchema>;

