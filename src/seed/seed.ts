import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Listing } from '../modules/listings/listings.model.js';
import { freshOfDays } from '../modules/listings/listings.service.js';

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const DUMMY_LISTINGS = [
  {
    operator: 'Awfis',
    city: 'Bangalore',
    micro: 'Koramangala',
    type: 'Private cabin',
    seats: 18,
    price: 9000,
    amenities: ['Wi-Fi', 'Parking', 'Cafeteria', 'Meeting rooms', '24x7 access'],
    tier: 'Premium',
    avail: 'Available now',
    verifiedAt: daysAgo(2),
    source: 'seed',
    profile: {
      identity: {
        centreName: 'Awfis · Koramangala',
        address: '418, 100ft Road, Indiranagar, Bangalore 560038',
        buildingType: 'Mixed-use',
        vastu: true,
        carpet: 4200,
      },
      capacity: { totalSeats: 120, availWorkstations: 18, hotDeskAvailable: false },
      pricing: { dedicatedDesk: 9000, privateCabin: 10400, securityDeposit: '2 months', noticePeriod: '1 month' },
      operations: { timings: '9:00 AM – 9:00 PM', managedOfficeAvailable: true, virtualOfficeAvailable: false },
      contactsMedia: { extraAmenities: ['Wi-Fi', 'Parking', 'Cafeteria', 'Meeting rooms', '24x7 access'] },
    },
  },
  {
    operator: 'IndiQube',
    city: 'Bangalore',
    micro: 'Indiranagar',
    type: 'Dedicated desk',
    seats: 25,
    price: 8500,
    amenities: ['Wi-Fi', 'Cafeteria', 'Metro <5min', 'Phone booths'],
    tier: 'Standard',
    avail: 'Available now',
    verifiedAt: daysAgo(9),
    source: 'seed',
    profile: {
      identity: {
        centreName: 'IndiQube · Indiranagar',
        address: '100ft Road, Indiranagar, Bangalore 560038',
        buildingType: 'IT park',
        vastu: true,
        carpet: 3800,
      },
      capacity: { totalSeats: 140, availWorkstations: 25, hotDeskAvailable: true, hotDeskCount: 8 },
      pricing: { dedicatedDesk: 8500, hotDesk: 4675, securityDeposit: '2 months', noticePeriod: '2 months' },
      operations: { timings: '9:00 AM – 8:00 PM', managedOfficeAvailable: false, virtualOfficeAvailable: true },
      contactsMedia: { extraAmenities: ['Wi-Fi', 'Cafeteria', 'Metro <5min', 'Phone booths'] },
    },
  },
  {
    operator: 'Smartworks',
    city: 'Mumbai',
    micro: 'BKC',
    type: 'Managed office',
    seats: 60,
    price: 13200,
    amenities: ['Wi-Fi', 'Parking', 'Cafeteria', 'Gym', 'Reception', '24x7 access'],
    tier: 'Premium',
    avail: 'From 1 Jul',
    verifiedAt: daysAgo(1),
    source: 'seed',
    profile: {
      identity: {
        centreName: 'Smartworks · BKC',
        address: 'G Block, Bandra Kurla Complex, Mumbai 400051',
        buildingType: 'IT park',
        vastu: false,
        carpet: 8500,
      },
      capacity: { totalSeats: 240, availWorkstations: 60, hotDeskAvailable: false },
      pricing: { dedicatedDesk: 13200, managedPerSqft: 110, securityDeposit: '3 months', noticePeriod: '3 months' },
      operations: { timings: '24x7', managedOfficeAvailable: true, virtualOfficeAvailable: true },
      contactsMedia: { extraAmenities: ['Wi-Fi', 'Parking', 'Cafeteria', 'Gym', 'Reception', '24x7 access'] },
    },
  },
  {
    operator: 'Innov8',
    city: 'Gurugram',
    micro: 'Cyber City, Gurgaon',
    type: 'Private cabin',
    seats: 16,
    price: 12000,
    amenities: ['Wi-Fi', 'Parking', 'Cafeteria', 'Metro <5min', '24x7 access'],
    tier: 'Premium',
    avail: 'Available now',
    verifiedAt: daysAgo(20),
    source: 'seed',
    profile: {
      identity: {
        centreName: 'Innov8 · Cyber City',
        address: 'Building 8, DLF Cyber City, Gurgaon 122002',
        buildingType: 'IT park',
        vastu: true,
        carpet: 3200,
      },
      capacity: { totalSeats: 160, availWorkstations: 16, hotDeskAvailable: false },
      pricing: { privateCabin: 12000, dedicatedDesk: 12000, securityDeposit: '2 months', noticePeriod: '1 month' },
      operations: { timings: '9:00 AM – 9:00 PM', managedOfficeAvailable: false, virtualOfficeAvailable: false },
      contactsMedia: { extraAmenities: ['Wi-Fi', 'Parking', 'Cafeteria', 'Metro <5min', '24x7 access'] },
    },
  },
  {
    operator: '91Springboard',
    city: 'Pune',
    micro: 'Baner',
    type: 'Hot desk',
    seats: 45,
    price: 4600,
    amenities: ['Wi-Fi', 'Cafeteria', 'AC', 'Parking'],
    tier: 'Standard',
    avail: 'Available now',
    verifiedAt: daysAgo(7),
    source: 'seed',
    profile: {
      identity: {
        centreName: '91Springboard · Baner',
        address: 'Pentagon P4, Baner, Pune 411045',
        buildingType: 'Mixed-use',
        vastu: false,
        carpet: 2900,
      },
      capacity: { totalSeats: 130, availWorkstations: 45, hotDeskAvailable: true, hotDeskCount: 45 },
      pricing: { hotDesk: 4600, dedicatedDesk: 5500, securityDeposit: '1 month', noticePeriod: '1 month' },
      operations: { timings: '9:00 AM – 8:00 PM', managedOfficeAvailable: false, virtualOfficeAvailable: true },
      contactsMedia: { extraAmenities: ['Wi-Fi', 'Cafeteria', 'AC', 'Parking'] },
    },
  },
];

async function main() {
  await connectDb();

  await Listing.deleteMany({});

  const docs = DUMMY_LISTINGS.map((l) => {
    const days = Math.floor((Date.now() - l.verifiedAt.getTime()) / (1000 * 60 * 60 * 24));
    return { ...l, fresh: freshOfDays(days) };
  });

  const created = await Listing.insertMany(docs);

  // eslint-disable-next-line no-console
  console.log(`[seed] inserted ${created.length} listings into ${env.MONGODB_URI}`);
  created.forEach((l) => {
    // eslint-disable-next-line no-console
    console.log(`  - ${l.operator} · ${l.micro} (${l.city}) · ${l.fresh.state}`);
  });
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed', err);
  process.exit(1);
});
