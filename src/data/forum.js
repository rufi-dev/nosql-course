// Module 1 discussion: guided question and sample seed posts.
// Seed posts are written for the course and labelled as samples in the UI.

export const GUIDED = {
  title: 'Which query matters most to your user, and what would you shard on?',
  prompt:
    'Pick a real system you use or have built: a canteen app, a bike share, a ticket shop, a game. Name the one operation its users care about most, then propose a shard key and say what that key costs you.',
  thinking: [
    'Which single read or write would users notice first if it were slow or wrong?',
    'Does your shard key appear in that operation, so the router can target one shard?',
    'Which reads can tolerate a lagging secondary, and which must see the latest write?',
  ],
}

const t = (iso) => Date.parse(iso)

export const SEED_POSTS = [
  {
    id: 's1',
    parentId: null,
    author: 'Learner A',
    role: 'learner',
    at: t('2026-11-17T07:42:00Z'),
    helpful: 7,
    body: 'Campus canteen app. The query that matters most is "what is running low right now" at 7:30, before the doors open. That is `find({ stock: { $lt: 5 } })` filtered by canteen. I would shard on `{ canteenId: 1, sku: 1 }`: the morning query always includes canteenId, so it goes to one shard, and sku gives enough cardinality inside a canteen.',
  },
  {
    id: 's2',
    parentId: 's1',
    author: 'Teaching assistant',
    role: 'ta',
    at: t('2026-11-17T09:15:00Z'),
    helpful: 5,
    body: 'Good instinct to lead with the location. Now check the write side: if one canteen does most of the sales, its range of the key takes most of the writes. Lab 2 shows that as a hot shard. A hashed key would spread the writes but turn your morning query into scatter-gather. Which of those two costs would you rather pay?',
  },
  {
    id: 's3',
    parentId: 's1',
    author: 'Learner A',
    role: 'learner',
    at: t('2026-11-17T10:02:00Z'),
    helpful: 3,
    body: 'The main canteen is about 40% of sales, so I would switch to `{ canteenId: 1, sku: "hashed" }`. MongoDB supports compound hashed keys since 4.4, so a query on canteenId can still be routed to the shards holding that canteen, while its writes spread across several chunks.',
  },
  {
    id: 's4',
    parentId: null,
    author: 'Learner B',
    role: 'learner',
    at: t('2026-11-18T13:20:00Z'),
    helpful: 4,
    body: 'Bike share. The hot read is "bikes available at this dock", and it must not be stale or people walk to an empty dock. I would read it from the primary and let the weekly ride report read from secondaries. Shard key `{ cityId: 1, dockId: 1 }`, because every app screen is scoped to one city.',
  },
  {
    id: 's5',
    parentId: null,
    author: 'Learner C',
    role: 'learner',
    at: t('2026-11-19T16:48:00Z'),
    helpful: 6,
    body: 'Concert tickets. The operation that matters is "sell seat 14F exactly once". If one seat is one document, `updateOne({ _id: seat, status: "free" }, { $set: { status: "sold" } })` is atomic on its own, so two buyers cannot both win and no cross-shard transaction is needed.',
  },
  {
    id: 's6',
    parentId: 's5',
    author: 'Teaching assistant',
    role: 'ta',
    at: t('2026-11-19T18:05:00Z'),
    helpful: 4,
    body: 'Exactly right: make the unit of atomicity match the unit of the business rule. You only need a distributed transaction when one rule spans documents on different shards, such as the seat plus a payment ledger. That is where the two-phase commit cost from Lab 5 appears, and where NewSQL systems earn their keep.',
  },
]
