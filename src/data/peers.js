// Rubric, strong example, common errors and sample peer submissions.
// Shared by the Assignment (shown before writing) and the Workshop (peer review).

export const RUBRIC = [
  {
    id: 'schema',
    title: 'Schema and structure',
    short: 'Schema',
    levels: {
      1: 'Fields missing or inconsistent between documents; no clear _id.',
      3: 'Fields present, but types or names are inconsistent, or tags are not an array.',
      5: 'Consistent documents with _id, name, a numeric stock and a tags array; says why one product is one document.',
    },
  },
  {
    id: 'query',
    title: 'Query and correctness',
    short: 'Query',
    levels: {
      1: 'Queries missing or would fail.',
      3: 'Queries run, but one is wrong or imprecise (for example $lte instead of $lt, or $set where $inc is meant).',
      5: 'insertMany, find with $lt: 5 and updateOne with $inc are all correct and minimal.',
    },
  },
  {
    id: 'result',
    title: 'Result evidence',
    short: 'Result',
    levels: {
      1: 'No output shown.',
      3: 'Output shown for some steps, or it does not match the queries.',
      5: 'Shows the low-stock result (Tea and Coffee), the update acknowledgement, and Tea at 13 afterwards.',
    },
  },
  {
    id: 'tradeoff',
    title: 'Trade-off justification',
    short: 'Trade-off',
    levels: {
      1: 'Names a shard key with no reasoning.',
      3: 'Reasons about the shard key or about CAP, not both; claims are generic.',
      5: 'Justifies the shard key with cardinality, write spread and query isolation, and explains replica lag and what happens during a partition.',
    },
  },
]

export const RUBRIC_MAX = RUBRIC.length * 5

export const STRONG_EXAMPLE = {
  schema: `// One product = one document. Everything the low-stock
// screen needs is in one place, so it is one read.
{
  _id:      "p1",        // stable product code
  name:     "Tea",
  stock:    3,           // number, so $lt and $inc work
  tags:     ["drink"],   // array: a product can have many
  storeId:  "riga-01"    // added for sharding (see below)
}`,
  queries: `db.products.insertMany([
  { _id: "p1", name: "Tea",    stock: 3,  tags: ["drink"], storeId: "riga-01" },
  { _id: "p2", name: "Rice",   stock: 12, tags: ["food"],  storeId: "riga-01" },
  { _id: "p3", name: "Coffee", stock: 2,  tags: ["drink"], storeId: "riga-01" }
]);
db.products.createIndex({ stock: 1 });
db.products.find({ stock: { $lt: 5 } });
db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } });
db.products.find({ stock: { $lt: 5 } });`,
  result: `{ acknowledged: true, insertedIds: { '0': 'p1', '1': 'p2', '2': 'p3' } }
[ { _id: 'p1', name: 'Tea', stock: 3, ... },
  { _id: 'p3', name: 'Coffee', stock: 2, ... } ]
{ acknowledged: true, matchedCount: 1, modifiedCount: 1 }
[ { _id: 'p3', name: 'Coffee', stock: 2, ... } ]   // Tea is now 13`,
  shardKey: '{ storeId: 1, _id: "hashed" }',
  justification:
    'The query that matters most is "what is low in my store right now", and it always includes storeId, so leading with storeId lets the router target one store instead of broadcasting. A store alone has too few values and the biggest store would become a hot shard, so the hashed _id inside each store spreads its writes across chunks. I rejected createdAt: it only grows, so every insert would hit the last chunk. Reads for the low-stock screen go to the primary, because a secondary that lags by a second could still show Tea at 3 after the restock and a manager would reorder twice. The weekly report can read from secondaries. If a store\'s shard loses contact with the majority, its primary steps down and refuses writes until a new primary is elected: we choose consistency over availability, because selling stock we do not have costs more than a few seconds of "try again".',
}

export const COMMON_ERRORS = [
  {
    title: '$set where $inc is meant',
    body: 'Restocking by 10 is { $inc: { stock: 10 } }. { $set: { stock: 10 } } overwrites Tea to 10 and loses the 3 already on the shelf.',
  },
  {
    title: 'Low-stock result that includes Rice',
    body: 'Rice has 12, which is not below 5. If your output lists it, the query or the data is wrong. Paste the real output.',
  },
  {
    title: 'A timestamp as a range shard key',
    body: 'createdAt only grows, so every new document lands on the same chunk and one shard takes every write.',
  },
  {
    title: 'Sharding on stock',
    body: 'Stock has few distinct values and changes on every sale. Documents would keep migrating between shards.',
  },
  {
    title: '“MongoDB is CP” with nothing after it',
    body: 'Say what actually happens during a partition: the isolated primary steps down, writes on that side are refused, the majority elects a new primary.',
  },
  {
    title: 'Ignoring replica lag on reads',
    body: 'Reading the low-stock screen from a secondary can show the old value just after a restock. Say which reads tolerate that and which do not.',
  },
]

// Sample submissions for the Workshop. Reference scores are the instructor's.
export const PEERS = [
  {
    id: 'peer-a',
    label: 'Sample submission A',
    schema: `{
  _id:    "p1",
  name:   "Tea",
  stock:  3,
  tags:   ["drink"],
  region: "LV"
}
// Each product is one document because the low-stock
// view reads a product with its stock in one go.`,
    queries: `db.products.insertMany([
  { _id: "p1", name: "Tea",    stock: 3,  tags: ["drink"], region: "LV" },
  { _id: "p2", name: "Rice",   stock: 12, tags: ["food"],  region: "LV" },
  { _id: "p3", name: "Coffee", stock: 2,  tags: ["drink"], region: "EE" }
]);
db.products.find({ stock: { $lt: 5 } });
db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } });
db.products.findOne({ _id: "p1" });`,
    result: `[ { _id: 'p1', name: 'Tea', stock: 3, ... },
  { _id: 'p3', name: 'Coffee', stock: 2, ... } ]
{ acknowledged: true, matchedCount: 1, modifiedCount: 1 }
{ _id: 'p1', name: 'Tea', stock: 13, tags: [ 'drink' ], region: 'LV' }`,
    shardKey: '{ region: 1, _id: 1 }',
    justification:
      'Staff always look at low stock for their own region, so region in the key keeps that query on one shard instead of all of them. Region alone has only three values, so I added _id for cardinality and to let a busy region split into several chunks. _id is a product code, not a timestamp, so new products do not all land at the end. Restocking writes go to the primary with w: "majority" so a failover cannot roll a restock back. The low-stock screen reads from the primary: a secondary lagging by a second could still show Tea at 3. During a partition the side without a majority loses its primary and stops taking writes, which is what we want for stock counts.',
    reference: { schema: 5, query: 4, result: 5, tradeoff: 5 },
    rationale: {
      schema: 'Consistent fields and types, and the one-product-one-document choice is justified.',
      query: 'All correct. It checks the update with findOne rather than re-running the low-stock query, which the task asked for.',
      result: 'Clear evidence for every step, including Tea at 13.',
      tradeoff: 'Covers query isolation, cardinality, monotonicity, replica lag and partition behaviour with a concrete decision.',
    },
  },
  {
    id: 'peer-b',
    label: 'Sample submission B',
    schema: `{ _id: ObjectId(), name: "Tea", stock: 3, tags: "drink",
  createdAt: ISODate() }`,
    queries: `db.products.insertMany([
  { name: "Tea",    stock: 3,  tags: "drink", createdAt: new Date() },
  { name: "Rice",   stock: 12, tags: "food",  createdAt: new Date() },
  { name: "Coffee", stock: 2,  tags: "drink", createdAt: new Date() }
]);
db.products.find({ stock: { $lt: 5 } });
db.products.updateOne({ name: "Tea" }, { $inc: { stock: 10 } });`,
    result: `Tea and Coffee came back.
Update said modifiedCount: 1.`,
    shardKey: '{ createdAt: 1 }',
    justification:
      'createdAt has very high cardinality because every document gets a different time, so the data spreads well. MongoDB is CP so it is consistent. Replication makes it highly available.',
    reference: { schema: 3, query: 4, result: 3, tradeoff: 1 },
    rationale: {
      schema: 'tags is a string, not an array, so a product cannot carry two tags. Generated ObjectIds work but make the task\'s lookups by product code harder.',
      query: 'Queries are correct, and updating by name works here, but name is not guaranteed unique.',
      result: 'Results are described rather than pasted, and the final stock of Tea is never shown.',
      tradeoff: 'createdAt is monotonic, so every insert hits one shard; high cardinality does not fix that. “CP” and “highly available” are asserted, not explained.',
    },
  },
  {
    id: 'peer-c',
    label: 'Sample submission C',
    schema: `products: name, stock, tags`,
    queries: `db.products.insert({ name: "Tea", stock: 3 })
db.products.insert({ name: "Rice", stock: 12 })
db.products.insert({ name: "Coffee", stock: 2 })
db.products.find({ stock: { $lte: 12 } })
db.products.updateOne({ name: "Tea" }, { $set: { stock: 10 } })`,
    result: `Low stock: Tea, Rice, Coffee
Tea is now 10`,
    shardKey: '{ name: 1 }',
    justification: 'I would shard by name because it is easy to understand.',
    reference: { schema: 1, query: 2, result: 1, tradeoff: 1 },
    rationale: {
      schema: 'No _id strategy, tags missing from the data, and no reasoning about the document shape.',
      query: 'Uses $lte: 12 instead of $lt: 5, and $set overwrites the stock instead of adding to it.',
      result: 'The low-stock list includes Rice (12), and Tea ends at 10 instead of 13: the evidence contradicts the task.',
      tradeoff: 'Names a key without reasoning about cardinality, write spread, query isolation, lag or CAP.',
    },
  },
]

export const peerById = (id) => PEERS.find((p) => p.id === id)

// Accuracy of a learner's assessment against the instructor's reference.
export function reviewAccuracy(scores, reference) {
  const diffs = RUBRIC.map((c) => Math.abs((scores[c.id] ?? 0) - reference[c.id]))
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
  return Math.round(Math.max(0, Math.min(100, 100 - 20 * mean)))
}
