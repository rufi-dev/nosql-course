import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import DocTag from '../../components/DocTag.jsx'
import Icon from '../../components/Icon.jsx'
import { Highlight } from '../../components/CodeBlock.jsx'
import { EASE_EXPO, EASE_OUT } from '../../components/ui.jsx'

const PRODUCTS = [
  { _id: 'p1', name: 'Tea', stock: 3, tags: ['drink'] },
  { _id: 'p2', name: 'Rice', stock: 12, tags: ['food'] },
  { _id: 'p3', name: 'Coffee', stock: 2, tags: ['drink'] },
]

const MODELS = [
  {
    id: 'relational',
    label: 'Relational',
    query: 'SELECT id, name, stock FROM products WHERE stock < 5;',
    lang: 'sql',
    reads: 'Any column can be filtered. An index on stock turns the scan into a range lookup.',
  },
  {
    id: 'kv',
    label: 'Key-value',
    query: 'GET product:p1   GET product:p2   GET product:p3   // then filter in the app',
    lang: 'js',
    reads: 'The store cannot look inside a value. Either read every product, or maintain your own "lowstock" set on every write.',
  },
  {
    id: 'document',
    label: 'Document',
    query: 'db.products.find({ stock: { $lt: 5 } })',
    lang: 'js',
    reads: 'Fields inside the document are queryable. A secondary index { stock: 1 } makes the low-stock query a range scan.',
  },
  {
    id: 'column',
    label: 'Column-family',
    query: "SELECT sku, name, stock FROM products_by_warehouse WHERE warehouse = 'RIX' AND stock < 5;",
    lang: 'sql',
    reads: 'You design the table for the query: partition by warehouse, cluster by stock. A different query needs a different table.',
  },
]

function Relational() {
  return (
    <div className="mw-rel">
      <table className="mw-table">
        <caption>products</caption>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th className="mw-hl">stock</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCTS.map((p) => (
            <tr key={p._id} className={p.stock < 5 ? 'is-hit' : ''}>
              <td>{p._id}</td>
              <td>{p.name}</td>
              <td className="mw-hl">{p.stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mw-table mw-table--side">
        <caption>product_tags</caption>
        <thead>
          <tr>
            <th>product_id</th>
            <th>tag</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCTS.map((p) => (
            <tr key={p._id}>
              <td>{p._id}</td>
              <td>{p.tags[0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KeyValue() {
  return (
    <ul className="mw-kv">
      {PRODUCTS.map((p) => (
        <li key={p._id}>
          <span className="mw-kv__key">product:{p._id}</span>
          <Icon name="arrow-right" />
          <span className="mw-kv__blob" title="Opaque value: the store sees bytes, not fields">
            {JSON.stringify({ name: p.name, stock: p.stock, tags: p.tags })}
          </span>
        </li>
      ))}
      <li className="mw-kv__extra">
        <span className="mw-kv__key">lowstock</span>
        <Icon name="arrow-right" />
        <span className="mw-kv__set">{'{ p1, p3 }'}</span>
        <span className="mw-kv__note">a set your code must keep in sync</span>
      </li>
    </ul>
  )
}

function Documents() {
  return (
    <div className="mw-docs">
      {PRODUCTS.map((p) => (
        <DocTag key={p._id} doc={p} compact state={p.stock < 5 ? 'match' : 'dim'} />
      ))}
    </div>
  )
}

function ColumnFamily() {
  const rows = [
    { sku: 'p3', name: 'Coffee', stock: 2, tags: 'drink' },
    { sku: 'p1', name: 'Tea', stock: 3, tags: 'drink' },
    { sku: 'p2', name: 'Rice', stock: 12, tags: 'food' },
  ]
  return (
    <div className="mw-cf">
      <div className="mw-cf__partition">
        <span className="mw-cf__pk">
          partition key <strong>warehouse = 'RIX'</strong>
        </span>
        <span className="mw-cf__ck">rows sorted by clustering key: stock, sku</span>
      </div>
      <div className="mw-cf__rows">
        {rows.map((r) => (
          <div key={r.sku} className={`mw-cf__row ${r.stock < 5 ? 'is-hit' : ''}`}>
            <span className="mw-cf__cell mw-cf__cell--ck">
              <small>stock</small>
              {r.stock}
            </span>
            <span className="mw-cf__cell mw-cf__cell--ck">
              <small>sku</small>
              {r.sku}
            </span>
            <span className="mw-cf__fam">
              <small>info</small>
              name: {r.name} · tags: {r.tags}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const VIEWS = { relational: Relational, kv: KeyValue, document: Documents, column: ColumnFamily }

export function ModelSwitcher() {
  const [id, setId] = useState('document')
  const model = MODELS.find((m) => m.id === id)
  const View = VIEWS[id]
  return (
    <figure className="widget mw" aria-label="The same three products in four data models">
      <div className="widget__bar">
        <span className="widget__title">Same inventory, four models</span>
        <div className="segmented" role="tablist" aria-label="Data model">
          {MODELS.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={m.id === id} onClick={() => setId(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mw__stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mw__query">
        <span className="mw__qlabel">Low-stock query</span>
        <code className="mw__code">
          <Highlight code={model.query} lang={model.lang} />
        </code>
      </div>
      <figcaption className="mw__reads">
        <Icon name="eye" /> {model.reads}
      </figcaption>
    </figure>
  )
}

const PATH = [
  {
    id: 'client',
    label: 'Client operation',
    title: 'The driver sends one find',
    body: 'The app calls db.products.find({ stock: { $lt: 5 } }). The driver serialises it to BSON and sends it to the database, or to the mongos router in a sharded cluster.',
  },
  {
    id: 'logical',
    label: 'Logical model',
    title: 'Collection, documents, fields',
    body: 'The server resolves the namespace inventory.products. Each document is identified by its _id; the filter names the field stock and the operator $lt. Nothing here says where bytes live.',
  },
  {
    id: 'physical',
    label: 'Physical layout and index',
    title: 'Scan the collection or walk an index',
    body: null,
  },
  {
    id: 'result',
    label: 'Result',
    title: 'A cursor comes back',
    body: 'Matching documents are returned in a first batch with a cursor id. Tea and Coffee arrive; the app renders the reorder list.',
  },
]

export function ArchPath() {
  const [step, setStep] = useState(0)
  const [indexed, setIndexed] = useState(false)
  const s = PATH[step]
  const physical = indexed
    ? 'With an index on { stock: 1 }, the planner chooses IXSCAN: it walks the B-tree from the lowest key up to 5, examining 2 index keys and fetching 2 documents.'
    : 'Without an index the planner can only choose COLLSCAN: it reads every document (3 here, 3 million in a real chain) and tests stock < 5 on each.'
  return (
    <figure className="widget ap" aria-label="Architecture path of a query">
      <div className="widget__bar">
        <span className="widget__title">Architecture path</span>
        <label className="switch">
          <input type="checkbox" checked={indexed} onChange={(e) => setIndexed(e.target.checked)} />
          Index on stock
        </label>
      </div>
      <ol className="ap__track">
        {PATH.map((p, i) => (
          <li key={p.id} className={`ap__node ${i <= step ? 'is-on' : ''} ${i === step ? 'is-current' : ''}`}>
            <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              <span className="ap__num">{i + 1}</span>
              <span className="ap__label">{p.label}</span>
            </button>
            {i < PATH.length - 1 && (
              <span className="ap__link" aria-hidden="true">
                <motion.span
                  className="ap__fill"
                  animate={{ scaleX: i < step ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: EASE_EXPO }}
                />
              </span>
            )}
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${step}-${indexed}`}
          className="ap__detail"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <div className="ap__dtitle">{s.title}</div>
          <p>{s.body || physical}</p>
          {s.id === 'physical' && (
            <div className="ap__stats">
              <span className={`chip ${indexed ? 'chip--done' : 'chip--warn'}`}>{indexed ? 'IXSCAN' : 'COLLSCAN'}</span>
              <span className="chip chip--mono">keysExamined: {indexed ? 2 : 0}</span>
              <span className="chip chip--mono">docsExamined: {indexed ? 2 : 3}</span>
              <span className="chip chip--mono">nReturned: 2</span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="ap__nav">
        <button type="button" className="btn btn--sm" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}>
          <Icon name="arrow-left" /> Back
        </button>
        <button
          type="button"
          className="btn btn--dark btn--sm"
          onClick={() => setStep((x) => Math.min(PATH.length - 1, x + 1))}
          disabled={step === PATH.length - 1}
        >
          Next step <Icon name="arrow-right" />
        </button>
      </div>
    </figure>
  )
}

export function Workload() {
  const rows = [
    ['Show the low-stock list', 'Staff, every few minutes', 'Must be correct', 'Drives indexes and read concern'],
    ['Record a sale', 'Every second at peak', 'Must never oversell', 'Drives atomic updates and write concern'],
    ['Show a product page', 'Customers, constantly', 'A few seconds stale is fine', 'Can read from secondaries or a cache'],
    ['Monthly sales report', 'Once a month', 'Slow is fine', 'Run on an analytics copy, not the hot path'],
  ]
  return (
    <div className="table-wrap widget-table">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Operation</th>
            <th scope="col">Who and how often</th>
            <th scope="col">Tolerance</th>
            <th scope="col">Design consequence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              <th scope="row">{r[0]}</th>
              <td>{r[1]}</td>
              <td>{r[2]}</td>
              <td className="muted">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const COST_COLS = ['Relational', 'Key-value', 'Document', 'Column-family']
const COST_ROWS = [
  {
    op: 'Read by key',
    cells: ['Fast via primary key index', 'Fastest: one lookup', 'Fast via the _id index', 'Fast via the partition key'],
  },
  {
    op: 'Query by another field',
    cells: [
      'Any column; add an index',
      'Not supported; keep your own index keys',
      'Secondary indexes on any field, including arrays',
      'Only by partition and clustering keys; otherwise a new table per query',
    ],
  },
  {
    op: 'Write one record',
    cells: ['Cheap', 'Cheap', 'Cheap; a single document update is atomic', 'Very cheap, append-friendly'],
  },
  {
    op: 'Atomic change to many records',
    cells: [
      'ACID transactions, native',
      'Limited, usually one node only',
      'Multi-document transactions exist but cost more; prefer embedding',
      'Per-partition lightweight transactions only',
    ],
  },
  {
    op: 'Integrity rules',
    cells: ['Constraints, foreign keys, CHECK', 'In application code', 'Optional schema validation; no foreign keys', 'Typed columns; no foreign keys'],
  },
  {
    op: 'Add a field (schema change)',
    cells: [
      'ALTER TABLE and a migration',
      'Change serialisation; old values keep the old shape',
      'New documents just include it; old ones lack it until backfilled',
      'ALTER TABLE ADD is cheap metadata (columns are sparse)',
    ],
  },
]

export function CostTable() {
  const [col, setCol] = useState(null)
  return (
    <div className="table-wrap widget-table cost">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Operation</th>
            {COST_COLS.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={col === i ? 'is-col' : ''}
                onMouseEnter={() => setCol(i)}
                onMouseLeave={() => setCol(null)}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COST_ROWS.map((r) => (
            <tr key={r.op}>
              <th scope="row">{r.op}</th>
              {r.cells.map((c, i) => (
                <td key={i} className={col === i ? 'is-col' : ''} onMouseEnter={() => setCol(i)} onMouseLeave={() => setCol(null)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ShardKeyTable() {
  const rows = [
    ['{ _id: "hashed" }', 'Very high', 'Even', 'No (hashed)', 'Scatter-gather', 'good'],
    ['{ warehouse: 1, sku: 1 }', 'High', 'Even if shops are similar', 'No', 'Targeted per warehouse', 'good'],
    ['{ category: 1 }', 'Very low (4 values)', 'Skewed, jumbo chunks', 'No', 'Targeted per category', 'bad'],
    ['{ createdAt: 1 }', 'High', 'Even', 'Yes: every insert hits the last chunk', 'Scatter-gather', 'bad'],
    ['{ stock: 1 }', 'Low, and it changes on every sale', 'Skewed', 'No', 'Targeted, but documents keep moving', 'bad'],
  ]
  return (
    <div className="table-wrap widget-table">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Shard key</th>
            <th scope="col">Cardinality</th>
            <th scope="col">Frequency</th>
            <th scope="col">Monotonic</th>
            <th scope="col">Low-stock query</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              <th scope="row">
                <code>{r[0]}</code>{' '}
                <span className={`chip ${r[5] === 'good' ? 'chip--done' : 'chip--warn'}`}>{r[5] === 'good' ? 'Workable' : 'Avoid'}</span>
              </th>
              <td>{r[1]}</td>
              <td>{r[2]}</td>
              <td>{r[3]}</td>
              <td>{r[4]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ConsistencyDial() {
  const [w, setW] = useState('majority')
  const [r, setR] = useState('primary')
  const stale = r !== 'primary'
  const lose = w === '1'
  return (
    <figure className="widget dial">
      <div className="widget__bar">
        <span className="widget__title">Two settings decide what the low-stock list can get wrong</span>
      </div>
      <div className="dial__grid">
        <div className="field">
          <span className="label">Write concern for sales</span>
          <div className="segmented" role="group" aria-label="Write concern">
            {['1', 'majority'].map((v) => (
              <button key={v} type="button" aria-pressed={w === v} onClick={() => setW(v)}>
                w: {v === '1' ? '1' : '"majority"'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Read preference for the list</span>
          <div className="segmented" role="group" aria-label="Read preference">
            {['primary', 'secondary'].map((v) => (
              <button key={v} type="button" aria-pressed={r === v} onClick={() => setR(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul className="dial__out" aria-live="polite">
        <li className={lose ? 'is-bad' : 'is-ok'}>
          <Icon name={lose ? 'alert' : 'check-circle'} />
          {lose
            ? 'A sale acknowledged by the primary alone can be rolled back if that primary fails before replicating it.'
            : 'A sale is acknowledged only once a majority holds it, so it survives a failover. Cost: one extra replication round trip.'}
        </li>
        <li className={stale ? 'is-bad' : 'is-ok'}>
          <Icon name={stale ? 'alert' : 'check-circle'} />
          {stale
            ? 'The list may be stale by the replica lag: a product sold out a second ago can still look available.'
            : 'The list reads the primary, so it sees every acknowledged write. Cost: all list traffic lands on one node.'}
        </li>
      </ul>
    </figure>
  )
}
