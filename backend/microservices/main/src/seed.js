'use strict';

// Idempotent demo seed: inserts a handful of events (both models) if the table
// is empty, so the frontend has something to show. Redis state for each event
// is created lazily on first WS connect / checkout (rehydration, Sec.9).
const { Event } = require('./db');
const config = require('./config');

const price = config.pricePerSeatDefault;

const SAMPLE = [
  {
    code: 'ROCK01', name: 'Skyline Rock Fest', model: 'general',
    description: 'An open-air night of indie and rock headliners.',
    artists: 'The Lumen, Neon Tigers, Aria Vale',
    venue: 'Riverfront Grounds', location: 'Raipur',
    totalSeats: 500, daysFromNow: 14, price,
    bannerurl: 'https://picsum.photos/seed/rock/1200/400',
    thumbnailurl: 'https://picsum.photos/seed/rock/600/400',
  },
  {
    code: 'JAZZ02', name: 'Midnight Jazz Lounge', model: 'seat_map',
    description: 'An intimate reserved-seating jazz evening.',
    artists: 'Cole Marsh Quartet',
    venue: 'The Velvet Room', location: 'Raipur',
    totalSeats: 120, daysFromNow: 7, price,
    bannerurl: 'https://picsum.photos/seed/jazz/1200/400',
    thumbnailurl: 'https://picsum.photos/seed/jazz/600/400',
  },
  {
    code: 'TECH03', name: 'DevConf Summit', model: 'general',
    description: 'A full-day developer conference with workshops.',
    artists: '',
    venue: 'Grand Convention Center', location: 'Bengaluru',
    totalSeats: 800, daysFromNow: 30, price,
    bannerurl: 'https://picsum.photos/seed/tech/1200/400',
    thumbnailurl: 'https://picsum.photos/seed/tech/600/400',
  },
  {
    code: 'PLAY04', name: 'Hamlet — Reserved Seating', model: 'seat_map',
    description: 'A modern staging of the classic. Pick your exact seat.',
    artists: 'National Theatre Company',
    venue: 'City Playhouse', location: 'Mumbai',
    totalSeats: 200, daysFromNow: 10, price,
    bannerurl: 'https://picsum.photos/seed/play/1200/400',
    thumbnailurl: 'https://picsum.photos/seed/play/600/400',
  },
  {
    code: 'EDM005', name: 'Pulse Electronic Night', model: 'general',
    description: 'A high-energy electronic music showcase.',
    artists: 'DJ Vortex, Solene',
    venue: 'Warehouse 9', location: 'Mumbai',
    totalSeats: 1000, daysFromNow: 3, price,
    bannerurl: 'https://picsum.photos/seed/edm/1200/400',
    thumbnailurl: 'https://picsum.photos/seed/edm/600/400',
  },
  {
    code: 'CINE06', name: 'Premiere Gala Screening', model: 'seat_map',
    description: 'Red-carpet premiere with assigned seats.',
    artists: '',
    venue: 'Empire Cinemas', location: 'Bengaluru',
    totalSeats: 150, daysFromNow: 21, price,
    bannerurl: 'https://picsum.photos/seed/cine/1200/400',
    thumbnailurl: 'https://picsum.photos/seed/cine/600/400',
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
