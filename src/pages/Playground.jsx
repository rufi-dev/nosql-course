import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import Shell from '../components/Shell.jsx'
import DocTag from '../components/DocTag.jsx'
import Icon from '../components/Icon.jsx'
import { Highlight } from '../components/CodeBlock.jsx'
import { useDocTitle, EASE_EXPO } from '../components/ui.jsx'
import { createEngine, idKey } from '../engine/mongo.js'
import './Playground.css'

const STORAGE_KEY = 'nosql-playground-v1'
const PAGE = 24

/* ---------------- datasets ---------------- */

function rng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const CATALOG = [
  ['Earl Grey', 'tea'],
  ['Green Sencha', 'tea'],
  ['Rooibos', 'tea'],
  ['Chamomile', 'tea'],
  ['Assam Breakfast', 'tea'],
  ['Jasmine Pearl', 'tea'],
  ['Espresso Beans', 'coffee'],
  ['Colombian Ground', 'coffee'],
  ['Decaf Blend', 'coffee'],
  ['Cold Brew Pack', 'coffee'],
  ['Ethiopian Yirgacheffe', 'coffee'],
  ['Basmati Rice', 'grains'],
  ['Buckwheat', 'grains'],
  ['Rolled Oats', 'grains'],
  ['Pearl Barley', 'grains'],
  ['Quinoa', 'grains'],
  ['Rye Flour', 'grains'],
  ['Rye Bread Crisps', 'snacks'],
  ['Dark Chocolate', 'snacks'],
  ['Salted Almonds', 'snacks'],
  ['Sprat Crackers', 'snacks'],
  ['Honey Biscuits', 'snacks'],
  ['Dried Cranberries', 'snacks'],
  ['Kefir', 'dairy'],
  ['Cottage Cheese', 'dairy'],
  ['Butter', 'dairy'],
  ['Sour Cream', 'dairy'],
  ['Smoked Cheese', 'dairy'],
  ['Oat Milk', 'dairy'],
  ['Skyr', 'dairy'],
]
const CITIES = ['Riga', 'Tallinn', 'Vilnius']

function shopProducts() {
  const r = rng(4242)
  const start = Date.UTC(2026, 8, 1, 8)
  return CATALOG.map(([name, category], i) => {
    const tags = [category]
    if (r() > 0.6) tags.push('organic')
    if (r() > 0.7) tags.push('local')
    return {
      _id: `sku-${String(i + 1).padStart(3, '0')}`,
      name,
      category,
      warehouse: CITIES[Math.floor(r() * 3)],
      stock: r() > 0.78 ? Math.floor(r() * 5) : 5 + Math.floor(r() * 36),
      price: Math.round((1.2 + r() * 12.8) * 100) / 100,
      tags,
      createdAt: new Date(start + i * 2 * 86400000 + Math.floor(r() * 8) * 3600000),
    }
  })
}

function shopOrders() {
  const r = rng(77)
  const start = Date.UTC(2026, 10, 2, 9)
  const statuses = ['paid', 'shipped', 'delivered']
  return Array.from({ length: 20 }, (_, i) => ({
    _id: `o-${1001 + i}`,
    productId: `sku-${String(1 + Math.floor(r() * 30)).padStart(3, '0')}`,
    qty: 1 + Math.floor(r() * 5),
    city: CITIES[Math.floor(r() * 3)],
    status: statuses[Math.floor(r() * 3)],
    createdAt: new Date(start + i * 7 * 3600000 + Math.floor(r() * 50) * 60000),
  }))
}

const INVENTORY = [
  { _id: 'p1', name: 'Tea', stock: 3, tags: ['drink'] },
  { _id: 'p2', name: 'Rice', stock: 12, tags: ['food'] },
  { _id: 'p3', name: 'Coffee', stock: 2, tags: ['drink'] },
]

const DATASETS = [
  {
    id: 'inventory',
    title: 'Lesson inventory',
    desc: 'The three products from the lesson: Tea, Rice, Coffee.',
    target: 'inventory.products',
    load: (engine) => {
      const n = engine.load('inventory', 'products', INVENTORY)
      engine.use('inventory')
      return `Loaded ${n} documents into inventory.products and switched to inventory.`
    },
  },
  {
    id: 'shop',
    title: 'Corner shop catalogue',
    desc: '30 products across five categories and three warehouses, with createdAt dates.',
    target: 'shop.products',
    load: (engine) => {
      const n = engine.load('shop', 'products', shopProducts())
      engine.use('shop')
      return `Loaded ${n} documents into shop.products and switched to shop.`
    },
  },
  {
    id: 'orders',
    title: 'Corner shop orders',
    desc: '20 orders that reference products by productId. Try $lookup.',
    target: 'shop.orders',
    load: (engine) => {
      let extra = ''
      if (!engine.peek('shop', 'products').docs.length) {
        engine.load('shop', 'products', shopProducts())
        extra = ' The products they reference were loaded too.'
      }
      const n = engine.load('shop', 'orders', shopOrders())
      engine.use('shop')
      return `Loaded ${n} documents into shop.orders and switched to shop.${extra}`
    },
  },
]

const CHEATS = [
  {
    group: 'Read',
    items: [
      ['Every product', 'db.products.find()'],
      ['Low stock', 'db.products.find({ stock: { $lt: 5 } })'],
      ['Tea or coffee', 'db.products.find({ category: { $in: ["tea", "coffee"] } })'],
      ['Five scarcest, label fields only', 'db.products.find({}, { name: 1, stock: 1, _id: 0 }).sort({ stock: 1 }).limit(5)'],
      ['Count per warehouse', 'db.products.countDocuments({ warehouse: "Riga" })'],
      ['Distinct categories', 'db.products.distinct("category")'],
    ],
  },
  {
    group: 'Write',
    items: [
      ['Insert one', 'db.products.insertOne({ name: "Matcha", category: "tea", stock: 7, price: 9.5 })'],
      ['Restock a category', 'db.products.updateMany({ category: "tea" }, { $inc: { stock: 5 } })'],
      ['Push a tag', 'db.products.updateOne({ name: "Matcha" }, { $push: { tags: "new" } })'],
      ['Upsert', 'db.products.updateOne({ name: "Kvass" }, { $set: { stock: 10 } }, { upsert: true })'],
      ['Delete one', 'db.products.deleteOne({ name: "Matcha" })'],
    ],
  },
  {
    group: 'Indexes',
    items: [
      ['Compound index', 'db.products.createIndex({ category: 1, stock: 1 })'],
      ['List indexes', 'db.products.getIndexes()'],
      ['Read the plan', 'db.products.find({ category: "tea" }).explain("executionStats")'],
      ['Drop it again', 'db.products.dropIndex("category_1_stock_1")'],
    ],
  },
  {
    group: 'Aggregate',
    items: [
      [
        'Stock by category',
        'db.products.aggregate([\n  { $group: { _id: "$category", items: { $sum: 1 }, stock: { $sum: "$stock" } } },\n  { $sort: { stock: -1 } }\n])',
      ],
      [
        'Orders with product names',
        'db.orders.aggregate([\n  { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },\n  { $unwind: "$product" },\n  { $project: { qty: 1, city: 1, product: "$product.name" } },\n  { $limit: 5 }\n])',
      ],
      ['Units sold per city', 'db.orders.aggregate([\n  { $group: { _id: "$city", orders: { $sum: 1 }, units: { $sum: "$qty" } } }\n])'],
    ],
  },
]

/* ---------------- persistence ---------------- */

function loadEngine() {
  const engine = createEngine({ db: 'test' })
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) engine.restore(JSON.parse(raw).snapshot)
  } catch {
    /* ignore unreadable storage */
  }
  return engine
}
function saveEngine(engine) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshot: engine.snapshot(), savedAt: Date.now() }))
  } catch {
    /* storage full or blocked */
  }
}

/* ---------------- page ---------------- */

export default function Playground() {
  useDocTitle('Playground')
  const engine = useMemo(() => loadEngine(), [])
  const shellRef = useRef(null)
  const [tick, setTick] = useState(0)
  const [selected, setSelected] = useState(null) // { db, coll }
  const [limit, setLimit] = useState(PAGE)
  const [confirmReset, setConfirmReset] = useState(false)
  const [loadedId, setLoadedId] = useState(null)

  useEffect(() => {
    if (!confirmReset) return
    const t = setTimeout(() => setConfirmReset(false), 3500)
    return () => clearTimeout(t)
  }, [confirmReset])

  const refresh = useCallback(() => {
    saveEngine(engine)
    setTick((t) => t + 1)
  }, [engine])

  const onResult = useCallback(() => refresh(), [refresh])

  const dbs = useMemo(
    () => engine.listDatabases().map((d) => ({ ...d, colls: engine.listCollections(d.name) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, tick],
  )
  const totals = dbs.reduce(
    (acc, d) => ({ colls: acc.colls + d.colls.length, docs: acc.docs + d.colls.reduce((s, c) => s + c.count, 0) }),
    { colls: 0, docs: 0 },
  )

  // default browse target: first collection of the current db
  const browse = useMemo(() => {
    if (selected && engine.peek(selected.db, selected.coll).docs.length) return selected
    const cur = dbs.find((d) => d.name === engine.currentDb) || dbs[0]
    if (!cur || !cur.colls.length) return null
    return { db: cur.name, coll: cur.colls[0].name }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, dbs, engine, tick])
  const browseDocs = browse ? engine.peek(browse.db, browse.coll).docs : []

  const loadDataset = (ds) => {
    const msg = ds.load(engine)
    const [db, coll] = ds.target.split('.')
    setSelected({ db, coll })
    setLimit(PAGE)
    setLoadedId(ds.id)
    setTimeout(() => setLoadedId(null), 1600)
    shellRef.current?.print(msg, 'info')
    refresh()
  }

  const switchDb = (name) => {
    shellRef.current?.run(`use ${name}`)
  }

  const resetAll = () => {
    engine.reset()
    engine.use('test')
    setSelected(null)
    shellRef.current?.clear()
    shellRef.current?.print('Everything erased. You are back on an empty test database.', 'info')
    refresh()
  }

  const insertCheat = (code) => {
    shellRef.current?.setInput(code)
    shellRef.current?.element?.()?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div className="pg page page--wide">
      <header className="pg-head">
        <div className="pg-head__text">
          <span className="kicker">Playground</span>
          <h1 className="pg-title">A MongoDB shell that lives in this page</h1>
          <p className="pg-lead">
            Load a dataset, try any command from the course, break things on purpose. Nothing to install, and nothing leaves
            your browser.
          </p>
        </div>
        <div className="pg-head__side">
          <dl className="pg-stats" aria-label="Your playground">
            <div>
              <dt>databases</dt>
              <dd className="tabular">{dbs.length}</dd>
            </div>
            <div>
              <dt>collections</dt>
              <dd className="tabular">{totals.colls}</dd>
            </div>
            <div>
              <dt>documents</dt>
              <dd className="tabular">{totals.docs}</dd>
            </div>
          </dl>
          <div className="pg-head__actions">
            <Link to="/module/1/lab/shell" className="btn btn--sm">
              <Icon name="flask" />
              Guided Lab 1
            </Link>
            <a className="btn btn--dark btn--sm" href="https://play.db-ai.dev/" target="_blank" rel="noreferrer">
              Real MongoDB playground
              <Icon name="external" />
            </a>
          </div>
        </div>
      </header>

      <div className="pg-grid">
        <aside className="pg-side" aria-label="Playground tools">
          <section className="pg-box">
            <h2 className="pg-box__title">
              <Icon name="database" />
              Datasets
            </h2>
            <ul className="pg-datasets">
              {DATASETS.map((ds) => (
                <li key={ds.id}>
                  <button
                    type="button"
                    className={`pg-dataset ${loadedId === ds.id ? 'is-loaded' : ''}`}
                    onClick={() => loadDataset(ds)}
                  >
                    <span className="pg-dataset__title">
                      {ds.title}
                      <span className="pg-dataset__target mono">{ds.target}</span>
                    </span>
                    <span className="pg-dataset__desc">{ds.desc}</span>
                    <span className="pg-dataset__cta">
                      {loadedId === ds.id ? (
                        <>
                          <Icon name="check" /> Loaded
                        </>
                      ) : (
                        <>
                          <Icon name="download" /> Load
                        </>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="pg-note">Loading replaces that collection with fresh data.</p>
          </section>

          <section className="pg-box">
            <h2 className="pg-box__title">
              <Icon name="layers" />
              Explorer
            </h2>
            {dbs.length === 0 ? (
              <p className="pg-note">No data yet. Load a dataset or insert a document and it shows up here.</p>
            ) : (
              <ul className="pg-tree">
                {dbs.map((d) => (
                  <li key={d.name}>
                    <button
                      type="button"
                      className={`pg-tree__db ${d.name === engine.currentDb ? 'is-current' : ''}`}
                      onClick={() => switchDb(d.name)}
                      title={`use ${d.name}`}
                    >
                      <Icon name="database" />
                      <span className="mono">{d.name}</span>
                      {d.name === engine.currentDb && <span className="chip chip--done">current</span>}
                    </button>
                    <ul>
                      {d.colls.map((c) => {
                        const active = browse && browse.db === d.name && browse.coll === c.name
                        return (
                          <li key={c.name}>
                            <button
                              type="button"
                              className={`pg-tree__coll ${active ? 'is-active' : ''}`}
                              aria-pressed={active}
                              onClick={() => {
                                setSelected({ db: d.name, coll: c.name })
                                setLimit(PAGE)
                              }}
                            >
                              <span className="mono">{c.name}</span>
                              <span className="pg-tree__count tabular">{c.count}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pg-box">
            <h2 className="pg-box__title">
              <Icon name="book" />
              Cheat sheet
            </h2>
            <p className="pg-note">Click a command to put it in the shell, then press Enter.</p>
            <div className="pg-cheats">
              {CHEATS.map((g, gi) => (
                <details key={g.group} className="pg-cheat" open={gi === 0}>
                  <summary>
                    {g.group}
                    <Icon name="chevron-down" />
                  </summary>
                  <ul>
                    {g.items.map(([label, code]) => (
                      <li key={label}>
                        <button type="button" className="pg-cheat__item" onClick={() => insertCheat(code)}>
                          <span className="pg-cheat__label">{label}</span>
                          <code className="pg-cheat__code">
                            <Highlight code={code.replace(/\n\s*/g, ' ')} />
                          </code>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          <button
            type="button"
            className={`btn btn--sm ${confirmReset ? 'btn--danger' : 'btn--ghost'} pg-reset`}
            onClick={() => {
              if (confirmReset) {
                setConfirmReset(false)
                resetAll()
              } else setConfirmReset(true)
            }}
          >
            <Icon name="trash" />
            {confirmReset ? 'Click again to erase everything' : 'Reset the playground'}
          </button>
        </aside>

        <div className="pg-main">
          <Shell
            ref={shellRef}
            engine={engine}
            onResult={onResult}
            minHeight={320}
            maxHeight={520}
            welcome="Playground ready. Load a dataset on the left, or start typing: use shop, then db.products.insertOne({ ... })."
          />

          <section className="pg-browse" aria-label="Collection browser">
            <header className="pg-browse__head">
              <div>
                <span className="kicker kicker--ink">Browse</span>
                <h2 className="pg-browse__title">
                  {browse ? (
                    <>
                      <span className="mono">
                        {browse.db}.{browse.coll}
                      </span>
                      <span className="chip chip--mono">{browseDocs.length} docs</span>
                    </>
                  ) : (
                    'Nothing to browse yet'
                  )}
                </h2>
              </div>
              {browse && browseDocs.length > 0 && (
                <span className="faint pg-browse__hint">Updates after every command</span>
              )}
            </header>
            {!browse || !browseDocs.length ? (
              <div className="pg-empty">
                <p>
                  <strong>Empty shelves.</strong> Load the lesson inventory to start with the three products from class.
                </p>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => loadDataset(DATASETS[0])}>
                  <Icon name="download" />
                  Load lesson inventory
                </button>
              </div>
            ) : (
              <>
                <div className="pg-docs">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {browseDocs.slice(0, limit).map((d, i) => (
                      <motion.div
                        key={`${browse.db}.${browse.coll}.${idKey(d._id)}`}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.4, ease: EASE_EXPO, delay: Math.min(i, 12) * 0.02 }}
                      >
                        <DocTag doc={d} compact />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {browseDocs.length > limit && (
                  <button type="button" className="btn btn--sm pg-more" onClick={() => setLimit((l) => l + PAGE * 2)}>
                    Show more ({browseDocs.length - limit} left)
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
