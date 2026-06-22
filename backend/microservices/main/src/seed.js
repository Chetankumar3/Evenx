'use strict';

// Idempotent demo seed: inserts a handful of events (both models) if the table
// is empty, so the frontend has something to show. Redis state for each event
// is created lazily on first WS connect / checkout (rehydration, Sec.9).
const { Event } = require('./db');
const config = require('./config');

const price = config.pricePerSeatDefault;

const SAMPLE = [
  {
    code: 'COM001', name: 'Laugh Riot India Tour', model: 'general',
    description: 'An open-air evening of raw, unfiltered standup comedy.',
    artists: 'Zakir Khan, Anubhav Singh Bassi',
    venue: 'Jawaharlal Nehru Stadium Grounds', location: 'Delhi',
    totalSeats: 500, daysFromNow: 14, price,
    bannerurl: 'https://storage.googleapis.com/evenx-banners/seven.jpg',
    thumbnailurl: 'https://storage.googleapis.com/evenx-banners/three.jpg',
  },
  {
    code: 'CLA002', name: 'Ragas by the Lake', model: 'seat_map',
    description: 'An intimate reserved-seating Hindustani classical music evening.',
    artists: 'Kaushiki Chakraborty, Niladri Kumar',
    venue: 'Chowdiah Memorial Hall', location: 'Bengaluru',
    totalSeats: 120, daysFromNow: 7, price,
    bannerurl: 'https://storage.googleapis.com/evenx-banners/twelve.jpg',
    thumbnailurl: 'https://storage.googleapis.com/evenx-banners/one.jpg',
  },
  {
    code: 'TECH03', name: 'SaaSBoomi Annual', model: 'general',
    description: 'A full-day conference for Indian SaaS founders and developers.',
    artists: '',
    venue: 'ITC Grand Chola', location: 'Chennai',
    totalSeats: 800, daysFromNow: 30, price,
    bannerurl: 'https://storage.googleapis.com/evenx-banners/five.jpg',
    thumbnailurl: 'https://storage.googleapis.com/evenx-banners/nine.jpg',
  },
  {
    code: 'PLAY04', name: 'Mughal-e-Azam: The Musical', model: 'seat_map',
    description: 'A grand stage adaptation of the classic cinema. Pick your exact seat.',
    artists: 'Feroz Abbas Khan Production',
    venue: 'NCPA', location: 'Mumbai',
    totalSeats: 200, daysFromNow: 10, price,
    bannerurl: 'https://storage.googleapis.com/evenx-banners/two.jpg',
    thumbnailurl: 'https://storage.googleapis.com/evenx-banners/eight.jpg',
  },
  {
    code: 'BWD005', name: 'Arijit Singh Live', model: 'general',
    description: 'A high-energy Bollywood music showcase.',
    artists: 'Arijit Singh',
    venue: 'MMRDA Grounds', location: 'Mumbai',
    totalSeats: 1000, daysFromNow: 3, price,
    bannerurl: 'https://storage.googleapis.com/evenx-banners/four.jpg',
    thumbnailurl: 'https://storage.googleapis.com/evenx-banners/six.jpg',
  },
  {
    code: 'CINE06', name: 'IMAX Gala Screening', model: 'seat_map',
    description: 'Red-carpet IMAX premiere with assigned seats.',
    artists: '',
    venue: 'Prasads IMAX', location: 'Hyderabad',
    totalSeats: 150, daysFromNow: 21, price,
    bannerurl: 'https://storage.googleapis.com/evenx-banners/eleven.jpg',
    thumbnailurl: 'https://storage.googleapis.com/evenx-banners/ten.jpg',
  },
];

async function seedIfEmpty() {
  const count = await Event.count();
  if (count > 0) return;
  const now = Date.now();
  const rows = SAMPLE.map((s) => {
    const { daysFromNow, ...rest } = s;
    return {
      ...rest,
      dateTime: new Date(now + daysFromNow * 24 * 60 * 60 * 1000),
      availableSeats: s.totalSeats,
    };
  });
  await Event.bulkCreate(rows);
  console.log(`[seed] inserted ${rows.length} demo events`);
}

module.exports = { seedIfEmpty };

// Allow `npm run seed` to run it standalone.
if (require.main === module) {
  const { sequelize } = require('./db');
  sequelize
    .sync()
    .then(seedIfEmpty)
    .then(() => { console.log('[seed] done'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
