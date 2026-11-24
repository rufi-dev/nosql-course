// Animated lectures. Times are in seconds of lecture time (at 1x speed).
// cues double as captions and transcript; scenes map to components in
// src/pages/lecture/; questions pause playback (Ask, predict, verify).

export const LECTURES = {
  1: {
    id: '1',
    activity: 'lecture-1',
    number: '1.1',
    title: 'The design problem',
    duration: 214,
    chapters: [
      { t: 0, title: 'A corner shop' },
      { t: 48, title: 'Four ways to store a product' },
      { t: 118, title: 'Model for the workload' },
      { t: 160, title: 'From query to result' },
    ],
    scenes: [
      { start: 0, end: 48, id: 'shop' },
      { start: 48, end: 118, id: 'models' },
      { start: 118, end: 160, id: 'workload' },
      { start: 160, end: 214, id: 'path' },
    ],
    cues: [
      { start: 0, end: 6.5, text: 'Meet a small corner shop. Three products sit on the shelf: Tea, Rice and Coffee.' },
      { start: 6.5, end: 13, text: 'Each product has a stock count. Tea has 3 left, Rice has 12, and Coffee has only 2.' },
      {
        start: 13,
        end: 21.5,
        text: 'Before choosing any database, ask one question: which query or operation matters most to the user?',
      },
      { start: 21.5, end: 29, text: 'For the shop owner the answer is clear: which products are about to run out?' },
      { start: 29, end: 37.5, text: 'Tea and Coffee are below five. Those are the shelves that need restocking today.' },
      {
        start: 37.5,
        end: 48,
        text: 'That one question shapes everything that follows: the data model, the index, and later, how the data is spread across machines.',
      },
      {
        start: 48,
        end: 56,
        text: 'Let us store the same three products four ways. First, a relational table: one row per product, fixed columns.',
      },
      {
        start: 56,
        end: 64.5,
        text: 'Stock is a column, so filtering on it is natural, and an index on that column makes the filter fast.',
      },
      {
        start: 64.5,
        end: 73,
        text: 'Next, a key-value store. Each product is a key, and everything else is packed into one opaque value.',
      },
      {
        start: 73,
        end: 82,
        text: 'Lookups by key are extremely fast. But the store cannot see inside the value, so it cannot filter on stock.',
      },
      {
        start: 82,
        end: 90.5,
        text: 'Now a document store. Each product is a self-describing document, and a field like tags can hold an array.',
      },
      {
        start: 90.5,
        end: 99.5,
        text: 'The database understands the fields, so it can query and index stock directly, with no fixed schema.',
      },
      {
        start: 99.5,
        end: 108.5,
        text: 'Finally, a column-family store: a row key, then groups of columns stored together, here info and inventory.',
      },
      {
        start: 108.5,
        end: 117,
        text: 'Reading just the inventory family is cheap, but queries are designed around the row key, not arbitrary fields.',
      },
      {
        start: 118,
        end: 126,
        text: 'So which model is right? That depends on the workload: the mix of reads and writes your users actually perform.',
      },
      {
        start: 126,
        end: 136,
        text: 'Here, showing low stock runs on every page view. Recording a sale happens a few thousand times a day. The monthly report runs once.',
      },
      {
        start: 136,
        end: 145,
        text: 'Workload-driven modelling means you model the data for the questions you ask, not for the data you happen to have.',
      },
      {
        start: 145,
        end: 160,
        text: 'For this shop, one document per product with an index on stock answers the most important query directly.',
      },
      {
        start: 160,
        end: 168,
        text: 'Now follow one request through the system. It starts as a client operation: find products with stock below five.',
      },
      { start: 168, end: 176, text: 'The logical model interprets it: the products collection, with a filter on the stock field.' },
      {
        start: 176,
        end: 186,
        text: 'The physical layout decides how it runs. With a B-tree index on stock, the database walks only the part of the tree below five.',
      },
      {
        start: 186,
        end: 194,
        text: 'It finds Coffee with 2 and Tea with 3, then stops. Rice, with 12, is never read. No full collection scan.',
      },
      {
        start: 194,
        end: 204,
        text: 'Two documents return to the client. Client operation, logical model, physical layout and index, result.',
      },
      {
        start: 204,
        end: 214,
        text: 'Keep this path in mind. In the next lecture, the same request has to cross a network of machines.',
      },
    ],
    questions: [
      {
        t: 21.3,
        id: 'l1q1',
        prompt: 'Ask before you model: which operation should this inventory serve best?',
        options: [
          { id: 'a', label: 'A monthly sales report' },
          { id: 'b', label: 'Showing which products are about to run out' },
          { id: 'c', label: 'Renaming a product' },
          { id: 'd', label: 'Storing product photos' },
        ],
        correct: 'b',
        explain:
          'It runs on every page view and drives restocking. Good design starts from the query that matters most to the user, not from the shape of the data.',
      },
      {
        t: 116.8,
        id: 'l1q2',
        prompt: 'In the key-value model, how does the store find every product with stock below 5?',
        options: [
          { id: 'a', label: 'One key lookup is enough' },
          { id: 'b', label: 'It must read and decode every value, because stock is hidden inside an opaque blob' },
          { id: 'c', label: 'It uses an automatic secondary index on stock' },
          { id: 'd', label: 'It reads the stock column family' },
        ],
        correct: 'b',
        explain:
          'A key-value store only understands keys. To filter on stock you either scan and decode every value in the application, or maintain an extra key yourself, such as lowstock:p3.',
      },
    ],
  },
  2: {
    id: '2',
    activity: 'lecture-2',
    number: '1.2',
    title: 'Partitions, replicas and CAP',
    duration: 226,
    chapters: [
      { t: 0, title: 'One shop, three cities' },
      { t: 55, title: 'Replication and lag' },
      { t: 112, title: 'When the network fails' },
      { t: 170, title: 'Two-phase commit and NewSQL' },
    ],
    scenes: [
      { start: 0, end: 55, id: 'cities' },
      { start: 55, end: 112, id: 'replication' },
      { start: 112, end: 170, id: 'partition' },
      { start: 170, end: 226, id: 'twopc' },
    ],
    cues: [
      {
        start: 0,
        end: 8,
        text: 'The corner shop is growing. It now sells in Riga, Tallinn and Vilnius, and every city reads and writes the same inventory.',
      },
      {
        start: 8,
        end: 16,
        text: 'One database server handles every request. As traffic grows, its CPU, memory and disk become the bottleneck.',
      },
      {
        start: 16,
        end: 25,
        text: 'Partitioning, also called sharding, splits the data across several machines so that each one owns only part of it.',
      },
      {
        start: 25,
        end: 34,
        text: 'A shard key decides where each document lives. Here we hash the _id, so products spread evenly across three shards.',
      },
      { start: 34, end: 44, text: 'Tea lands on shard A, Rice on shard B, Coffee on shard C. Every new product follows the same rule.' },
      {
        start: 44,
        end: 55,
        text: 'A query that includes the shard key goes to one shard. A query that does not, like low stock, must ask every shard and merge the answers.',
      },
      {
        start: 55,
        end: 64,
        text: 'Sharding spreads the load, but each shard is still a machine that can fail. So each shard is replicated.',
      },
      { start: 64, end: 73, text: 'A replica set has one primary, which accepts writes, and secondaries, which copy every change.' },
      {
        start: 73,
        end: 82,
        text: 'Restock Tea to 13. The primary applies the change and records it in its oplog, an ordered log of operations.',
      },
      { start: 82, end: 90, text: 'Secondaries pull the oplog and apply it. That takes time, and the delay is called replica lag.' },
      { start: 90, end: 96, text: 'Tallinn has applied the change. Vilnius is still two seconds behind.' },
      { start: 96, end: 104, text: 'A read from the Vilnius secondary right now returns 3, not 13. That read is stale.' },
      {
        start: 104,
        end: 112,
        text: 'Read from the primary, or wait for a majority to acknowledge the write, and you trade latency for fresher data.',
      },
      {
        start: 112,
        end: 120,
        text: 'Now the hard case. The network between Riga and the other two cities fails. This is a network partition.',
      },
      {
        start: 120,
        end: 128,
        text: 'Both sides are still running, and both sides still have customers. They just cannot talk to each other.',
      },
      {
        start: 128,
        end: 135,
        text: 'The CAP theorem describes the choice you face during a partition: consistency or availability.',
      },
      {
        start: 135,
        end: 144,
        text: 'Choose consistency, and the side that cannot reach a majority refuses writes. Riga returns an error rather than risk selling the same Coffee twice.',
      },
      {
        start: 144,
        end: 153,
        text: 'Choose availability, and both sides keep accepting writes. Riga and Vilnius each sell the last Coffee, and the two sides now hold conflicting histories.',
      },
      {
        start: 153,
        end: 161,
        text: 'When the network heals, replicas exchange changes and reconcile. With no new writes, they converge. That is eventual consistency.',
      },
      {
        start: 161,
        end: 170,
        text: 'MongoDB leans towards consistency: the majority side elects a new primary, and the isolated old primary steps down.',
      },
      {
        start: 170,
        end: 179,
        text: 'Some operations touch two shards. An order lowers stock on shard A and inserts the order on shard B.',
      },
      {
        start: 179,
        end: 188,
        text: 'Two-phase commit coordinates them. In phase one, the coordinator asks each participant to prepare, and each votes yes or no.',
      },
      {
        start: 188,
        end: 196,
        text: 'In phase two, if every vote is yes, the coordinator sends commit. A single no, and everyone aborts.',
      },
      {
        start: 196,
        end: 205,
        text: 'That costs at least two network round trips, with locks held in between. If the coordinator crashes after prepare, participants are left blocked.',
      },
      {
        start: 205,
        end: 216,
        text: 'NewSQL systems aim to keep SQL and ACID transactions while scaling horizontally. They replicate each range with a consensus protocol such as Raft, so one failure does not block forever.',
      },
      {
        start: 216,
        end: 226,
        text: 'Every design here trades consistency, availability, latency and coordination cost. In the labs, you will make these choices yourself.',
      },
    ],
    questions: [
      {
        t: 95.8,
        id: 'l2q1',
        prompt:
          'Tea was just restocked to 13 on the primary. Vilnius is two seconds behind. A shopper in Vilnius reads from the nearest node right now. What stock do they see?',
        options: [
          { id: 'a', label: '13, the latest value' },
          { id: 'b', label: '3, the old value' },
          { id: 'c', label: 'An error, because the node is lagging' },
          { id: 'd', label: 'Nothing until the node catches up' },
        ],
        correct: 'b',
        explain:
          'The Vilnius secondary has not applied the oplog entry yet, so it answers with the value it has: 3. That is replica lag, and it is why reads from secondaries can be stale.',
      },
      {
        t: 134.8,
        id: 'l2q2',
        prompt:
          'Riga is cut off from Tallinn and Vilnius. A customer in Riga tries to buy the last Coffee. If the system chooses consistency, what happens?',
        options: [
          { id: 'a', label: 'The sale is accepted everywhere at once' },
          { id: 'b', label: 'The write is refused, or waits, until a majority can be reached' },
          { id: 'c', label: 'Riga and Vilnius both sell it and merge later' },
          { id: 'd', label: 'The product is deleted to stay safe' },
        ],
        correct: 'b',
        explain:
          'Choosing consistency during a partition means the minority side cannot safely accept the write, so it refuses or times out. Selling on both sides and merging later is the availability choice.',
      },
    ],
  },
}

export const lectureList = Object.values(LECTURES)
