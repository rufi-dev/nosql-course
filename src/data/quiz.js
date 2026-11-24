// Quiz 1 question bank. Ten questions are drawn at random per attempt.
// type: 'single' | 'multi' | 'order' | 'code'
//   single / code: correct is one option id
//   multi: correct is an array of option ids (all-or-nothing)
//   order: options are the items; correct is the ids in the right order
// misconception: shown when a learner picks that wrong option.

export const QUIZ_SIZE = 10
export const QUIZ_SECONDS = 15 * 60

const SLIDE7 = `db.products.insertMany([
  { _id: "p1", name: "Tea",    stock: 3,  tags: ["drink"] },
  { _id: "p2", name: "Rice",   stock: 12, tags: ["food"] },
  { _id: "p3", name: "Coffee", stock: 2,  tags: ["drink"] }
]);`

export const QUESTIONS = [
  {
    id: 'q-kv-cart',
    type: 'single',
    outcome: 'o1',
    prompt:
      'A shopping cart is always loaded and saved as one unit, looked up by its session ID, and never queried by its contents. Which model fits most directly?',
    options: [
      { id: 'a', label: 'Key-value: session ID as the key, the cart as the value' },
      {
        id: 'b',
        label: 'Column-family: one wide row per product',
        misconception: 'Column-family stores shine for huge partitions read by key and range, like time series. A cart is one small blob read whole.',
      },
      {
        id: 'c',
        label: 'Relational: a carts table joined to a cart_items table',
        misconception: 'It works, but every read pays for a join you never needed. The access pattern is "get by key", nothing more.',
      },
      {
        id: 'd',
        label: 'Graph: carts linked to products by edges',
        misconception: 'Graphs pay off when you traverse relationships. Nothing here walks a relationship.',
      },
    ],
    correct: 'a',
    explanation:
      'The whole workload is "get this cart by ID" and "put this cart back". A key-value store does exactly that, fast, and the value can stay opaque.',
  },
  {
    id: 'q-doc-query',
    type: 'single',
    outcome: 'o1',
    prompt:
      'You need "all products with stock below 5" without reading every record in your application. Which model supports that query on a field inside the record?',
    options: [
      {
        id: 'a',
        label: 'A pure key-value store',
        misconception: 'In a pure key-value store the value is opaque to the database, so you would fetch every value and filter it yourself.',
      },
      { id: 'b', label: 'A document store with an index on stock' },
      {
        id: 'c',
        label: 'Any model, because all databases index every field automatically',
        misconception: 'Most databases index only the primary key by default. You create secondary indexes on purpose, and each one slows writes a little.',
      },
      {
        id: 'd',
        label: 'None: NoSQL databases cannot filter on values',
        misconception: 'Document stores such as MongoDB filter on any field, nested fields and array elements.',
      },
    ],
    correct: 'b',
    explanation:
      'A document store understands the fields inside each document, so it can filter on stock and use a secondary index on it to avoid a full collection scan.',
  },
  {
    id: 'q-column-family',
    type: 'single',
    outcome: 'o1',
    prompt:
      'A sensor platform writes millions of readings a minute and reads them back as "device X between 10:00 and 11:00". Which model is designed for this?',
    options: [
      {
        id: 'a',
        label: 'Key-value, one key per reading',
        misconception: 'You would lose the ability to read a time range in one sorted scan; each reading becomes a separate lookup.',
      },
      {
        id: 'b',
        label: 'Document, one document per device holding every reading',
        misconception: 'An ever-growing document hits size limits and rewrites a huge object on every insert.',
      },
      { id: 'c', label: 'Column-family: partition by device, cluster rows by time' },
      {
        id: 'd',
        label: 'Graph, linking readings in time order',
        misconception: 'Time order is a sort key, not a relationship worth traversing.',
      },
    ],
    correct: 'c',
    explanation:
      'Wide-column stores such as Cassandra keep each partition (one device) together and sorted by a clustering key (time), so a range read is one sequential scan and writes are cheap appends.',
  },
  {
    id: 'q-workload',
    type: 'multi',
    outcome: 'o1',
    prompt: 'Workload-driven modelling. Which statements are true?',
    options: [
      { id: 'a', label: 'Start from the queries and operations users run most often' },
      { id: 'b', label: 'Duplicating a field can be the right call if it serves the hottest read' },
      {
        id: 'c',
        label: 'Normalise everything first, then think about queries later',
        misconception: 'That is the relational habit. In NoSQL the access pattern shapes the model, because joins are expensive or missing.',
      },
      {
        id: 'd',
        label: 'The model should mirror the entity-relationship diagram exactly',
        misconception: 'The ER diagram describes the domain, not how it is read. Two systems with the same ER diagram can need very different models.',
      },
    ],
    correct: ['a', 'b'],
    explanation:
      'Ask "which query matters most to the user?" first. You then shape documents, keys and indexes around that path, and accept some duplication where it makes the hot path a single read.',
  },
  {
    id: 'q-find-low',
    type: 'code',
    outcome: 'o2',
    prompt: 'After this insert, which products does the find return?',
    code: `${SLIDE7}\ndb.products.find({ stock: { $lt: 5 } });`,
    options: [
      { id: 'a', label: 'Tea and Coffee' },
      {
        id: 'b',
        label: 'Rice only',
        misconception: '$lt means "less than". Rice has 12, which is not less than 5.',
      },
      {
        id: 'c',
        label: 'Tea, Rice and Coffee',
        misconception: 'The filter is applied; only documents whose stock is below 5 come back.',
      },
      {
        id: 'd',
        label: 'Coffee only',
        misconception: 'Tea has 3, which is also below 5.',
      },
    ],
    correct: 'a',
    explanation: '$lt is strictly less than. Tea (3) and Coffee (2) match; Rice (12) does not.',
  },
  {
    id: 'q-inc',
    type: 'code',
    outcome: 'o2',
    prompt: 'After the slide 7 insert, you run this update. What is Tea\'s stock now?',
    code: `db.products.updateOne(\n  { _id: "p1" },\n  { $inc: { stock: 10 } }\n);`,
    options: [
      {
        id: 'a',
        label: '10',
        misconception: 'That is what $set: { stock: 10 } would do. $inc adds to the current value.',
      },
      { id: 'b', label: '13' },
      {
        id: 'c',
        label: '3, because updateOne only returns a preview',
        misconception: 'updateOne writes the change. It returns { acknowledged, matchedCount: 1, modifiedCount: 1 }.',
      },
      {
        id: 'd',
        label: 'An error, because stock is not an array',
        misconception: '$inc works on numbers. You are thinking of $push, which needs an array.',
      },
    ],
    correct: 'b',
    explanation: '$inc adds the given amount to the existing number atomically: 3 + 10 = 13.',
  },
  {
    id: 'q-reverify',
    type: 'code',
    outcome: 'o2',
    prompt: 'Tea has been restocked to 13. You run the low-stock query again. What comes back?',
    code: `db.products.find({ stock: { $lt: 5 } });`,
    options: [
      {
        id: 'a',
        label: 'Tea and Coffee, because results are cached',
        misconception: 'find reads the current data each time. There is no result cache between queries.',
      },
      { id: 'b', label: 'Coffee only' },
      {
        id: 'c',
        label: 'Nothing',
        misconception: 'Coffee still has 2 and still matches.',
      },
      {
        id: 'd',
        label: 'Tea only',
        misconception: 'Tea now has 13, so it no longer matches. Coffee does.',
      },
    ],
    correct: 'b',
    explanation: 'Only Coffee (2) is still below 5. This is the "verify" step: re-run the query to prove the update worked.',
  },
  {
    id: 'q-path',
    type: 'order',
    outcome: 'o2',
    prompt: 'Put the path of find({ stock: { $lt: 5 } }) through a sharded cluster in order.',
    options: [
      { id: 'client', label: 'The client sends the find operation' },
      { id: 'logical', label: 'It is expressed against the logical model: products collection, stock field' },
      { id: 'router', label: 'The router decides which shards might hold matching documents' },
      { id: 'physical', label: 'Each shard uses its stock index to locate documents on disk' },
      { id: 'result', label: 'Partial results are merged and returned to the client' },
    ],
    correct: ['client', 'logical', 'router', 'physical', 'result'],
    explanation:
      'Client operation, logical model, physical layout and index, result. Routing sits between the logical and physical layers: the shard key decides where the data lives.',
  },
  {
    id: 'q-collscan',
    type: 'single',
    outcome: 'o2',
    prompt: 'explain() on the low-stock query shows a COLLSCAN stage. What does that mean, and what is the usual fix?',
    options: [
      { id: 'a', label: 'Every document was read; create an index on stock' },
      {
        id: 'b',
        label: 'The collection was sharded; add more shards',
        misconception: 'COLLSCAN is about how one node finds documents, not about sharding.',
      },
      {
        id: 'c',
        label: 'The query was cached; nothing to fix',
        misconception: 'COLLSCAN means a full scan. An index scan would show IXSCAN.',
      },
      {
        id: 'd',
        label: 'The query failed; rewrite it with $lte',
        misconception: 'The query worked. It was just slower than it needed to be.',
      },
    ],
    correct: 'a',
    explanation:
      'COLLSCAN reads the whole collection. db.products.createIndex({ stock: 1 }) lets the planner use IXSCAN and read only the matching range.',
  },
  {
    id: 'q-monotonic',
    type: 'single',
    outcome: 'o3',
    prompt: 'You range-shard an orders collection on { createdAt: 1 }. What happens as new orders arrive?',
    options: [
      {
        id: 'a',
        label: 'Writes spread evenly because time is high-cardinality',
        misconception: 'High cardinality is not enough. New values are always the largest, so they always fall in the last range.',
      },
      { id: 'b', label: 'Every insert lands in the chunk with the highest range, so one shard takes all writes' },
      {
        id: 'c',
        label: 'The balancer prevents any imbalance in real time',
        misconception: 'The balancer moves chunks after the fact. It cannot stop every new insert from targeting the same top chunk.',
      },
      {
        id: 'd',
        label: 'Inserts fail once a chunk is full',
        misconception: 'Chunks split and migrate. Inserts do not fail, they just pile onto one shard.',
      },
    ],
    correct: 'b',
    explanation:
      'A monotonically increasing key sends every new document to the "max" chunk: a hot shard. Hash the key, or lead with a well-spread field, to distribute writes.',
  },
  {
    id: 'q-good-key',
    type: 'multi',
    outcome: 'o3',
    prompt: 'Which properties make a good shard key?',
    options: [
      { id: 'a', label: 'High cardinality: many distinct values' },
      { id: 'b', label: 'Low frequency: no single value dominates the writes' },
      { id: 'c', label: 'Present in the most common queries, so they can be targeted' },
      {
        id: 'd',
        label: 'Monotonically increasing, so data stays sorted',
        misconception: 'Sorted inserts create a hot shard. Sorting is what indexes are for.',
      },
      {
        id: 'e',
        label: 'A field that changes often, such as stock',
        misconception: 'A frequently changing key forces documents to move between shards, and stock has very few distinct values.',
      },
    ],
    correct: ['a', 'b', 'c'],
    explanation:
      'Cardinality and frequency decide how evenly data and writes spread; query isolation decides whether reads hit one shard or all of them.',
  },
  {
    id: 'q-scatter',
    type: 'single',
    outcome: 'o3',
    prompt: 'The inventory is sharded on { _id: "hashed" }. How does the router handle find({ stock: { $lt: 5 } })?',
    options: [
      {
        id: 'a',
        label: 'It targets the single shard that owns low stock',
        misconception: 'No shard "owns" low stock. Data is placed by the hash of _id, so low-stock products are everywhere.',
      },
      { id: 'b', label: 'It sends the query to every shard and merges the results (scatter-gather)' },
      {
        id: 'c',
        label: 'It rejects the query because stock is not the shard key',
        misconception: 'Queries on non-key fields are allowed. They are just broadcast.',
      },
      {
        id: 'd',
        label: 'It reads from the config servers only',
        misconception: 'Config servers hold the chunk map, not product documents.',
      },
    ],
    correct: 'b',
    explanation:
      'Without the shard key in the filter, the router cannot narrow the target, so it broadcasts. Fine for a rare query, costly for the hottest one.',
  },
  {
    id: 'q-stale',
    type: 'single',
    outcome: 'o4',
    prompt:
      'You set Tea to 13 on the primary with w: 1, then immediately read Tea from a secondary that is 2 seconds behind. What do you see?',
    options: [
      { id: 'a', label: 'stock: 3, the old value (a stale read)' },
      {
        id: 'b',
        label: 'stock: 13, because writes are synchronous to all members',
        misconception: 'Replication is asynchronous. w: 1 is acknowledged as soon as the primary has the write.',
      },
      {
        id: 'c',
        label: 'An error, because secondaries cannot serve reads',
        misconception: 'With readPreference "secondary" they can. That is exactly why lag matters.',
      },
      {
        id: 'd',
        label: 'stock: 8, halfway through replication',
        misconception: 'Operations replicate whole. A secondary has either applied the $inc or not.',
      },
    ],
    correct: 'a',
    explanation:
      'The secondary has not applied the oplog entry yet, so it returns the old value. Read from the primary, or use causal consistency, when a user must see their own write.',
  },
  {
    id: 'q-majority',
    type: 'single',
    outcome: 'o4',
    prompt: 'What does write concern w: "majority" guarantee in a three-member replica set?',
    options: [
      {
        id: 'a',
        label: 'All three members have the write before it is acknowledged',
        misconception: 'Majority of three is two. Waiting for all three would be w: 3.',
      },
      { id: 'b', label: 'Two of three members have the write, so it survives a failover and will not be rolled back' },
      {
        id: 'c',
        label: 'The write is faster than with w: 1',
        misconception: 'It is slower: the primary waits for a secondary to confirm.',
      },
      {
        id: 'd',
        label: 'Reads from any secondary will now see it',
        misconception: 'The third member may still be behind. Majority writes pair with majority reads for that guarantee.',
      },
    ],
    correct: 'b',
    explanation:
      'Any new primary must come from the majority, and the majority already has the write, so it cannot be lost. The price is extra latency on every write.',
  },
  {
    id: 'q-cap',
    type: 'multi',
    outcome: 'o4',
    prompt: 'CAP in practice. Which statements are true?',
    options: [
      { id: 'a', label: 'The choice between consistency and availability is forced only while a network partition exists' },
      {
        id: 'b',
        label: 'A MongoDB primary cut off from the majority steps down and stops accepting writes',
      },
      {
        id: 'c',
        label: 'You pick two of the three properties once, at design time, and keep them forever',
        misconception: 'CAP describes behaviour during a partition. When the network is healthy you can have consistency and availability together.',
      },
      {
        id: 'd',
        label: 'Eventual consistency means replicas may never agree',
        misconception: 'Eventual consistency promises convergence once writes stop and messages get through. It just does not promise when.',
      },
    ],
    correct: ['a', 'b'],
    explanation:
      'CAP bites during a partition. MongoDB chooses consistency there: the isolated primary steps down, and the majority side elects a new one.',
  },
  {
    id: 'q-quorum',
    type: 'single',
    outcome: 'o4',
    prompt: 'A leaderless store keeps N = 3 copies. Which setting guarantees that a read overlaps the latest acknowledged write?',
    options: [
      {
        id: 'a',
        label: 'W = 1, R = 1',
        misconception: '1 + 1 = 2, not more than 3. The read can hit a replica the write never reached.',
      },
      {
        id: 'b',
        label: 'W = 1, R = 2',
        misconception: '1 + 2 = 3, which equals N. You need strictly more than N for a guaranteed overlap.',
      },
      { id: 'c', label: 'W = 2, R = 2' },
      {
        id: 'd',
        label: 'W = 2, R = 1',
        misconception: '2 + 1 = 3. Still no guaranteed overlap.',
      },
    ],
    correct: 'c',
    explanation: 'R + W > N forces the read set and the write set to share at least one replica: 2 + 2 = 4 > 3.',
  },
  {
    id: 'q-2pc-crash',
    type: 'single',
    outcome: 'o5',
    prompt:
      'In two-phase commit, both participants have voted YES. The coordinator crashes before sending COMMIT or ABORT. What happens?',
    options: [
      {
        id: 'a',
        label: 'Each participant commits on its own after a timeout',
        misconception: 'A participant that voted YES cannot decide alone: the coordinator might have decided ABORT because of someone else.',
      },
      { id: 'b', label: 'Participants stay blocked, holding locks, until the coordinator recovers' },
      {
        id: 'c',
        label: 'Each participant aborts on its own after a timeout',
        misconception: 'After voting YES it gave up that right. The coordinator might already have told someone to commit.',
      },
      {
        id: 'd',
        label: 'Nothing; 2PC cannot fail after PREPARE',
        misconception: 'This exact window is 2PC\'s best-known weakness: it is a blocking protocol.',
      },
    ],
    correct: 'b',
    explanation:
      'This is why 2PC is called blocking. Locks stay held and other transactions wait. NewSQL systems replicate the coordinator\'s state with consensus to shorten this window.',
  },
  {
    id: 'q-2pc-cost',
    type: 'single',
    outcome: 'o5',
    prompt: 'A failure-free 2PC with one coordinator and two participants. What is the message cost?',
    options: [
      {
        id: 'a',
        label: 'One round trip: 2 messages',
        misconception: 'That is a single-node commit. 2PC needs a vote and then a decision.',
      },
      { id: 'b', label: 'Two round trips: PREPARE and votes (4 messages), then COMMIT and acks (4 messages)' },
      {
        id: 'c',
        label: 'No extra messages; it piggybacks on replication',
        misconception: 'Coordination is extra work on top of replication, which is exactly its cost.',
      },
      {
        id: 'd',
        label: 'One message per participant, sent in parallel',
        misconception: 'Each participant must both vote and learn the decision.',
      },
    ],
    correct: 'b',
    explanation:
      'Two round trips and 4 messages per participant pair, plus forced log writes at each step. Every cross-shard transaction pays this latency.',
  },
  {
    id: 'q-2pc-order',
    type: 'order',
    outcome: 'o5',
    prompt: 'Put a successful two-phase commit in order.',
    options: [
      { id: 'prepare', label: 'Coordinator sends PREPARE to every participant' },
      { id: 'vote', label: 'Participants write the change to their log and vote YES' },
      { id: 'decide', label: 'Coordinator logs the COMMIT decision' },
      { id: 'commit', label: 'Coordinator sends COMMIT to every participant' },
      { id: 'ack', label: 'Participants apply, release locks and acknowledge' },
    ],
    correct: ['prepare', 'vote', 'decide', 'commit', 'ack'],
    explanation:
      'Phase 1 collects votes, phase 2 delivers the decision. The decision is durable in the coordinator\'s log before anyone is told, so it survives a crash.',
  },
  {
    id: 'q-newsql',
    type: 'multi',
    outcome: 'o5',
    prompt: 'Which are goals of NewSQL systems such as Spanner or CockroachDB?',
    options: [
      { id: 'a', label: 'SQL and ACID transactions' },
      { id: 'b', label: 'Horizontal scale-out across many nodes' },
      { id: 'c', label: 'Data split into ranges, each replicated with consensus (Raft or Paxos)' },
      {
        id: 'd',
        label: 'Give up joins to scale',
        misconception: 'NewSQL keeps joins and SQL. That is the point of the "SQL" in the name.',
      },
      {
        id: 'e',
        label: 'Eventual consistency by default',
        misconception: 'NewSQL defaults to strong (often serializable) consistency and pays for it in latency.',
      },
    ],
    correct: ['a', 'b', 'c'],
    explanation:
      'NewSQL aims for the relational model and ACID with NoSQL-style horizontal scale, using consensus-replicated ranges and distributed transactions under the hood.',
  },
]

export const questionById = (id) => QUESTIONS.find((q) => q.id === id)

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Draw a fresh attempt. Order questions get a shuffled starting order that
// is never already correct.
export function drawQuiz(size = QUIZ_SIZE) {
  return shuffle(QUESTIONS)
    .slice(0, size)
    .map((q) => {
      if (q.type !== 'order') return { id: q.id }
      let start = shuffle(q.correct)
      let guard = 0
      while (start.every((x, i) => x === q.correct[i]) && guard++ < 10) start = shuffle(q.correct)
      return { id: q.id, start }
    })
}

export function isCorrect(q, value) {
  if (value === undefined || value === null) return false
  if (q.type === 'multi') {
    const v = new Set(value)
    return v.size === q.correct.length && q.correct.every((c) => v.has(c))
  }
  if (q.type === 'order') return value.length === q.correct.length && value.every((x, i) => x === q.correct[i])
  return value === q.correct
}
