import { Link } from 'react-router-dom'
import CodeBlock from '../../components/CodeBlock.jsx'
import { Callout, Predict } from '../../components/ui.jsx'
import { ModelSwitcher, ArchPath, Workload, CostTable, ShardKeyTable, ConsistencyDial } from './widgets.jsx'

function Ch1() {
  return (
    <>
      <p>
        A relational database stores normalised tables and can answer almost any question with joins. That generality
        has a price once data no longer fits on one machine: joins and multi-row transactions must now cross the
        network, and their cost becomes unpredictable.
      </p>
      <p>
        NoSQL families make the opposite bet. Each gives up some generality so that a <strong>specific access
        pattern</strong> stays fast and predictable when the data is spread across many machines. That only works if
        you know the access pattern first.
      </p>
      <blockquote>Model the data for the questions you ask, not for the data you have.</blockquote>
      <h3>Start from the workload</h3>
      <p>
        Workload-driven modelling begins with a list of operations, how often each runs, how fast it must be, and how
        wrong it is allowed to be. For the corner shop that list looks like this:
      </p>
      <Workload />
      <p>
        The low-stock list is the operation that matters most to the user: staff reorder from it. It must be correct,
        so it shapes the indexes and the read settings. The product page can tolerate staleness, so it can be served
        cheaply from replicas.
      </p>
      <Predict
        compact
        prompt="Which operation can safely read data that is a few seconds old?"
        options={[
          { id: 'low', label: 'The low-stock list staff reorder from' },
          { id: 'sale', label: 'Recording a sale' },
          { id: 'page', label: 'Showing a product page to a customer' },
        ]}
        correct="page"
        explain="A customer seeing a slightly old stock figure on a product page is harmless; the sale itself still checks stock atomically. The reorder list and the sale must see current data."
      />
    </>
  )
}

function Ch2() {
  return (
    <>
      <p>
        The three NoSQL families differ in one thing above all: <strong>how much the database understands about the
        value you store</strong>. The more it understands, the more it can query for you.
      </p>
      <ul>
        <li>
          <strong>Key-value</strong> stores (Redis, Riak, DynamoDB in its simplest use) map a key to an opaque value.
          GET and PUT by key are as fast as storage gets, but the store cannot look inside the value.
        </li>
        <li>
          <strong>Document</strong> stores (MongoDB, Couchbase) keep self-describing JSON or BSON documents. They can
          filter, index and update individual fields, including arrays such as tags, and related data can be embedded
          in one document.
        </li>
        <li>
          <strong>Column-family</strong> or wide-column stores (Cassandra, HBase, Bigtable) organise rows by a partition
          key, sort them within a partition by clustering columns, and group columns into families. Tables are designed
          per query.
        </li>
      </ul>
      <p>Switch between the models below and watch where stock lives, and what the low-stock query has to read.</p>
      <ModelSwitcher />
      <h3>What the comparison shows</h3>
      <p>
        The same three products produce four very different designs. The relational version needs a second table for
        tags. The key-value version hides stock inside a blob, so you either read everything or maintain a separate
        index yourself. The document version keeps each product whole and queryable. The column-family version answers
        the low-stock query brilliantly for one warehouse, but only because the table was built for that query.
      </p>
      <Callout tone="info" title="Rule of thumb:">
        choose the model whose natural access path matches your most important query, then check the other queries
        are still possible at an acceptable cost.
      </Callout>
    </>
  )
}

function Ch3() {
  return (
    <>
      <p>
        Every operation travels the same path: <strong>client operation, logical model, physical layout and index,
        result</strong>. Design decisions at each layer change the cost of the layers below it.
      </p>
      <ArchPath />
      <h3>Identity</h3>
      <p>
        Every document has an <code>_id</code> that is unique within its collection and cannot be changed. If you do not
        supply one, MongoDB generates an ObjectId, which embeds a timestamp and therefore increases over time. In the
        running case we choose readable ids: <code>p1</code>, <code>p2</code>, <code>p3</code>.
      </p>
      <p>
        Identity answers <em>which</em> record. In a distributed database a second question appears: <em>which
        machine</em> owns it. That is the job of the <strong>shard key</strong>. The two can be the same field, but they
        do not have to be.
      </p>
      <h3>Structure</h3>
      <p>
        Documents in one collection do not have to share a shape, but your queries assume they do. Treat the shape as a
        contract: the low-stock query silently skips any product whose stock is stored as a string, so a validation
        rule such as <code>{'{ stock: { $type: "int" } }'}</code> is cheap insurance.
      </p>
      <Callout tone="accent" icon="bulb" title="Predict, then verify in Lab 1:">
        without an index, how many documents does the low-stock query examine on three products? With an index on
        stock, how many? You will read the answer from explain() yourself.
      </Callout>
    </>
  )
}

function Ch4() {
  return (
    <>
      <p>
        The decision follows the workload. The same operation has a very different cost in each model, and the costs
        that hurt are rarely the ones in the demo. Hover a column to compare one model across every operation.
      </p>
      <CostTable />
      <h3>Read and write costs</h3>
      <p>
        Reads are cheap when the query uses the structure the store was built around: a key, an index, a partition.
        Writes are cheap when they touch one record. A single-document update in MongoDB is atomic, which is why
        <code>$inc</code> can restock Tea safely even when two shops sell at the same moment: the server applies the
        increment, rather than your code reading 3, adding 10 and writing 13 over someone else's change.
      </p>
      <h3>Integrity and persistence</h3>
      <p>
        Relational databases enforce integrity for you with constraints and foreign keys. Document and column stores
        mostly leave it to the application, with optional validation. Durability comes from a write-ahead journal on
        each node and from replication across nodes; how many nodes must hold a write before it is acknowledged is the
        <em> write concern</em>, which you will tune in Lab 3.
      </p>
      <h3>Schema-change costs</h3>
      <Predict
        compact
        prompt="The owner wants a supplier field on every product. Which store needs no change before new records can include it?"
        options={[
          { id: 'sql', label: 'Relational' },
          { id: 'doc', label: 'Document' },
          { id: 'cf', label: 'Column-family' },
        ]}
        correct="doc"
        explain="New documents can simply include supplier. Relational needs ALTER TABLE (plus a migration); column-family needs ALTER TABLE ADD, which is cheap but still a schema change. The document store's catch: old documents lack the field until you backfill them, so every reader must handle both shapes."
      />
    </>
  )
}

function Ch5() {
  return (
    <>
      <p>
        One machine eventually runs out of disk, memory or write throughput. <strong>Partitioning</strong> (sharding)
        splits a collection across machines by a shard key. <strong>Replication</strong> copies each partition to
        several machines so that a failure does not lose data or stop service. Real systems do both.
      </p>
      <h3>Choosing a shard key</h3>
      <p>Four properties decide whether a shard key scales:</p>
      <ul>
        <li>
          <strong>Cardinality</strong>: enough distinct values to split into many chunks.
        </li>
        <li>
          <strong>Frequency</strong>: no single value holds a large share of documents.
        </li>
        <li>
          <strong>Monotonicity</strong>: with range sharding, an ever-increasing key (a timestamp, an ObjectId) sends
          every insert to the last chunk, creating a hot shard. Hashing the key spreads inserts but gives up range
          queries on it.
        </li>
        <li>
          <strong>Query isolation</strong>: queries that include the shard key go to one shard (targeted); others are
          sent to every shard and merged (scatter-gather).
        </li>
      </ul>
      <ShardKeyTable />
      <p>
        A chain-wide low-stock query names no shard key value, so it is scatter-gather under every workable choice;
        a per-shop list with <code>{'{ warehouse: "RIX" }'}</code> is targeted under the compound key. Scatter-gather is
        acceptable here: the query runs every few minutes, each shard answers from its own stock index, and the router
        merges small results. You will see this trade-off animate in Lab 2.
      </p>
      <h3>Replication and replica lag</h3>
      <p>
        In a MongoDB replica set one node is primary and accepts writes; secondaries copy its operation log (the oplog)
        and apply it asynchronously. The delay between the primary applying a write and a secondary applying it is the
        <strong> replica lag</strong>: usually milliseconds, sometimes seconds under load or across regions. If the
        primary becomes unreachable, the remaining members hold an election and promote a secondary.
      </p>
      <ConsistencyDial />
    </>
  )
}

function Ch6() {
  return (
    <>
      <h3>CAP describes a choice during a partition</h3>
      <p>
        When the network splits a cluster into groups that cannot talk to each other, each group must decide: refuse
        requests it cannot answer correctly (<strong>consistency</strong>), or answer with what it has and reconcile
        later (<strong>availability</strong>). It cannot do both. That is the whole of CAP: a statement about behaviour
        during a partition, not a permanent label.
      </p>
      <p>
        When there is no partition you can have both, and the everyday trade-off is between latency and consistency:
        waiting for more replicas makes reads and writes more correct and slower. PACELC names this: if Partition, then
        Availability or Consistency; Else, Latency or Consistency.
      </p>
      <Callout tone="info" title="In practice:">
        MongoDB with majority writes behaves as CP: the side without a majority cannot elect a primary and stops
        accepting writes. Cassandra and other Dynamo-style stores let you tune each request: W = 1, R = 1 favours
        availability and latency; quorums with R + W &gt; N favour consistency. Lab 4 lets you find the boundary.
      </Callout>
      <h3>Eventual consistency</h3>
      <p>
        An eventually consistent system promises that if writes stop, all replicas converge to the same value. It does
        not say how soon, or which concurrent write wins. Last-write-wins silently drops one of two concurrent stock
        decrements; vector clocks or CRDTs can keep both. For a stock counter, prefer an atomic server-side increment
        on one authoritative copy.
      </p>
      <h3>Two-phase commit and its cost</h3>
      <p>
        When one business operation must change data on two shards (decrement stock on one, insert an order on
        another) atomically, a coordinator runs two-phase commit: it sends PREPARE, every participant locks its rows,
        writes a durable vote and answers YES or NO; then the coordinator sends COMMIT or ABORT. The cost is at least
        two network round trips and a forced log write per participant while locks are held. If the coordinator fails
        after PREPARE, participants that voted YES are <strong>blocked</strong>: they may not commit or abort on their
        own.
      </p>
      <h3>NewSQL goals</h3>
      <p>
        NewSQL systems (Google Spanner, CockroachDB, YugabyteDB, TiDB) aim to keep SQL and ACID transactions while
        scaling horizontally like NoSQL. They split tables into ranges and replicate each range with a consensus
        protocol (Paxos or Raft). Transactions still use two-phase commit across ranges, but each participant, and the
        transaction record, is a replicated group that survives a machine failure, so a single crash does not block
        forever. The price is latency: every write waits for a consensus round trip, which is far across regions.
      </p>
    </>
  )
}

function Ch7() {
  const setup = `use inventory

db.products.insertMany([
  { _id: "p1", name: "Tea",    stock: 3,  tags: ["drink"] },
  { _id: "p2", name: "Rice",   stock: 12, tags: ["food"]  },
  { _id: "p3", name: "Coffee", stock: 2,  tags: ["drink"] }
])
// { acknowledged: true, insertedIds: { '0': 'p1', '1': 'p2', '2': 'p3' } }`
  const query = `db.products.find({ stock: { $lt: 5 } })
// [
//   { _id: 'p1', name: 'Tea',    stock: 3, tags: [ 'drink' ] },
//   { _id: 'p3', name: 'Coffee', stock: 2, tags: [ 'drink' ] }
// ]`
  const update = `db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } })
// { acknowledged: true, insertedId: null, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }

db.products.find({ stock: { $lt: 5 } })
// [ { _id: 'p3', name: 'Coffee', stock: 2, tags: [ 'drink' ] } ]`
  const shard = `// At chain scale, each document is one product in one warehouse
// { _id: ..., warehouse: "RIX", sku: "p1", name: "Tea", stock: 3, tags: ["drink"] }
db.products.createIndex({ stock: 1 })
sh.shardCollection("inventory.products", { warehouse: 1, sku: 1 })`
  return (
    <>
      <p>This is the complete example from the lesson, from an empty database to a defended result.</p>
      <h3>1. Insert three documents</h3>
      <CodeBlock code={setup} title="mongosh · schema and data" />
      <h3>2. Query low stock</h3>
      <CodeBlock code={query} title="mongosh · the query that matters most" />
      <h3>3. Update one record, then verify</h3>
      <CodeBlock code={update} title="mongosh · restock with an atomic increment" />
      <h3>4. Map a shard key</h3>
      <CodeBlock code={shard} title="mongosh · topology decision" />
      <h3>5. Justify the trade-off</h3>
      <blockquote>
        We shard on {'{ warehouse, sku }'} so that each shop's reads and sales stay on one shard and inserts spread
        evenly; the low-stock list becomes scatter-gather, which is acceptable for a query that runs every few minutes
        and is served by a stock index on every shard. Sales use w: "majority" so an acknowledged sale survives a
        failover, and the reorder list reads from the primary so replica lag cannot hide a sold-out product. During a
        network partition the minority side stops taking writes: we accept lost availability in one city over
        overselling in two.
      </blockquote>
      <Callout tone="success" icon="check-circle" title="This is the shape of your assignment:">
        schema, query, result and a short trade-off justification. Build yours from your own lab results in{' '}
        <Link to="/module/1/lab/shell">Lab 1</Link> and <Link to="/module/1/lab/shard">Lab 2</Link>.
      </Callout>
    </>
  )
}

function Ch8() {
  const pitfalls = [
    ['Modelling the data before listing the queries.', 'Write the workload table first. The most important query picks the model.'],
    [
      'Range-sharding on a value that only grows, such as createdAt or an ObjectId.',
      'Every insert lands on the last chunk. Hash the key, or lead with a field that spreads writes.',
    ],
    ['Sharding on a field that changes on every sale, such as stock.', 'Documents migrate between shards as they sell. Shard on stable identity.'],
    [
      'Reading the reorder list from secondaries.',
      'Replica lag can hide a sold-out product. Read from the primary, or use majority read concern with causal consistency.',
    ],
    [
      'Acknowledging sales with w: 1.',
      'If the primary fails before replicating, the sale is rolled back. Use w: "majority" for writes that must survive failover.',
    ],
    [
      'Calling a system "AP" or "CP" with no partition in mind.',
      'CAP describes behaviour during a partition. The rest of the time the trade-off is latency against consistency.',
    ],
    [
      'Read-modify-write on a counter: read 3, add 10, write 13.',
      'Two shops doing this at once lose an update. Use the atomic $inc operator.',
    ],
    [
      'Reaching for a distributed transaction first.',
      'If the data that must change together can live in one document, one atomic update beats two-phase commit.',
    ],
  ]
  return (
    <>
      <p>The mistakes below come up in almost every first design. Each has a one-line fix.</p>
      <ol className="pitfalls">
        {pitfalls.map(([m, f], i) => (
          <li key={i}>
            <span className="pitfalls__n">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <p className="pitfalls__m">{m}</p>
              <p className="pitfalls__f">{f}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

export const CHAPTERS = [
  { id: 'design-problem', title: 'Why one model does not fit every workload', short: 'The design problem', minutes: 2, Body: Ch1 },
  { id: 'models', title: 'Key-value, document and column-family', short: 'Three models', minutes: 3, Body: Ch2 },
  { id: 'identity', title: 'Identity and structure', short: 'Identity and structure', minutes: 2, Body: Ch3 },
  { id: 'operations', title: 'Operations and persistence', short: 'Operations and costs', minutes: 2, Body: Ch4 },
  { id: 'partitioning', title: 'Partitioning and replication', short: 'Sharding and replicas', minutes: 3, Body: Ch5 },
  { id: 'cap', title: 'CAP, eventual consistency, 2PC and NewSQL', short: 'CAP, 2PC, NewSQL', minutes: 3, Body: Ch6 },
  { id: 'worked-example', title: 'Worked example: empty database to result', short: 'Worked example', minutes: 2, Body: Ch7 },
  { id: 'pitfalls', title: 'Common pitfalls', short: 'Common pitfalls', minutes: 1, Body: Ch8 },
]
