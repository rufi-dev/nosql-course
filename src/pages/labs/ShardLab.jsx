import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGroup, motion, AnimatePresence, useReducedMotion } from 'motion/react'
import ActivityFrame from '../../components/ActivityFrame.jsx'
import Icon from '../../components/Icon.jsx'
import { Callout, EASE_EXPO, EASE_OUT } from '../../components/ui.jsx'
import { useStore } from '../../store.js'
import { Mission, PredictGate, EventLog, Debrief, ControlGroup } from './LabKit.jsx'
import { mulberry32, hash32, checkpoint, wordCount, useEvents, useStopwatch } from './sim-utils.js'
import './ShardLab.css'

/* ------------------------------------------------------------------ */
/* Dataset: 90 products, deterministic.                                */
/* ------------------------------------------------------------------ */

const CATALOG = {
  drink: ['Tea', 'Coffee', 'Juice', 'Kefir', 'Mineral water', 'Cocoa', 'Kvass', 'Lemonade'],
  food: ['Rice', 'Oats', 'Lentils', 'Pasta', 'Flour', 'Buckwheat', 'Rye bread', 'Honey', 'Herring', 'Barley'],
  snack: ['Crisps', 'Nuts', 'Biscuits', 'Chocolate', 'Raisins', 'Pretzels'],
  household: ['Soap', 'Sponges', 'Candles', 'Detergent', 'Bin bags', 'Matches'],
}
const DAY = 86400000
const START = Date.UTC(2026, 0, 5)

function pickWeighted(rand, pairs) {
  const r = rand()
  let acc = 0
  for (const [v, w] of pairs) {
    acc += w
    if (r < acc) return v
  }
  return pairs[pairs.length - 1][0]
}

function makeProduct(rand, n, createdAt, skuPool) {
  const category = pickWeighted(rand, [
    ['food', 0.36],
    ['drink', 0.3],
    ['snack', 0.19],
    ['household', 0.15],
  ])
  const names = CATALOG[category]
  const warehouse = pickWeighted(rand, [
    ['RIX', 0.5],
    ['TLL', 0.25],
    ['VNO', 0.25],
  ])
  const low = rand() < 0.22
  const stock = low ? Math.floor(rand() * 5) : 5 + Math.floor(rand() * 36)
  const sku = skuPool.pop()
  return {
    _id: `p${String(n).padStart(3, '0')}`,
    sku: `SKU-${sku}`,
    name: names[Math.floor(rand() * names.length)],
    category,
    warehouse,
    stock,
    createdAt,
  }
}

function buildDataset() {
  const rand = mulberry32(20261124)
  const skuPool = Array.from({ length: 400 }, (_, i) => 1000 + i)
  for (let i = skuPool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[skuPool[i], skuPool[j]] = [skuPool[j], skuPool[i]]
  }
  const docs = []
  let t = START
  for (let n = 1; n <= 90; n++) {
    t += Math.round((0.4 + rand() * 2.6) * DAY)
    docs.push(makeProduct(rand, n, t, skuPool))
  }
  // The running case from Lab 1 opens the catalogue.
  Object.assign(docs[0], { name: 'Tea', category: 'drink', stock: 3 })
  Object.assign(docs[1], { name: 'Rice', category: 'food', stock: 12 })
  Object.assign(docs[2], { name: 'Coffee', category: 'drink', stock: 2 })
  return { docs, skuPool, lastT: t }
}

const DATA = buildDataset()
const BASE_DOCS = DATA.docs

function makeBurst(burstIndex, startN, lastT) {
  const rand = mulberry32(7000 + burstIndex * 131)
  const pool = DATA.skuPool.slice(burstIndex * 40, burstIndex * 40 + 40)
  const out = []
  let t = lastT
  for (let i = 0; i < 30; i++) {
    t += Math.round((0.05 + rand() * 0.3) * DAY)
    out.push(makeProduct(rand, startN + i, t, pool))
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Shard keys, chunks and routing                                      */
/* ------------------------------------------------------------------ */

const KEYS = [
  { id: 'hashed', spec: '{ _id: "hashed" }', kind: 'hashed', fields: ['_id'] },
  { id: 'category', spec: '{ category: 1 }', kind: 'range', fields: ['category'] },
  { id: 'createdAt', spec: '{ createdAt: 1 }', kind: 'range', fields: ['createdAt'] },
  { id: 'warehouse_sku', spec: '{ warehouse: 1, sku: 1 }', kind: 'range', fields: ['warehouse', 'sku'] },
  { id: 'stock', spec: '{ stock: 1 }', kind: 'range', fields: ['stock'] },
]
const keyById = (id) => KEYS.find((k) => k.id === id)

const SHARDS = [
  { id: 'A', rs: 'rs-a', color: 'var(--shard-a)', wash: 'var(--shard-a-wash)' },
  { id: 'B', rs: 'rs-b', color: 'var(--shard-b)', wash: 'var(--shard-b-wash)' },
  { id: 'C', rs: 'rs-c', color: 'var(--shard-c)', wash: 'var(--shard-c-wash)' },
]
const MIN = { min: true }
const MAX = { max: true }
const H32 = 4294967296

const tupleOf = (doc, key) => (key.kind === 'hashed' ? [hash32(doc._id)] : key.fields.map((f) => doc[f]))

function cmpVal(a, b) {
  if (a === b) return 0
  if (a?.min || b?.max) return -1
  if (a?.max || b?.min) return 1
  return a < b ? -1 : 1
}
function cmpTuple(a, b) {
  if (a === MIN || b === MAX) return a === b ? 0 : -1
  if (a === MAX || b === MIN) return a === b ? 0 : 1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const c = cmpVal(a[i], b[i])
    if (c !== 0) return c
  }
  return 0
}

function computeChunks(key) {
  if (key.kind === 'hashed') {
    const b1 = [Math.floor(H32 / 3)]
    const b2 = [Math.floor((2 * H32) / 3)]
    return [
      { shard: 0, min: MIN, max: b1 },
      { shard: 1, min: b1, max: b2 },
      { shard: 2, min: b2, max: MAX },
    ]
  }
  const sorted = BASE_DOCS.map((d) => tupleOf(d, key)).sort(cmpTuple)
  const n = sorted.length
  const isBoundary = (j) => j > 0 && j < n && cmpTuple(sorted[j - 1], sorted[j]) !== 0
  const nearest = (target, after) => {
    let best = null
    for (let d = 0; d < n; d++) {
      const back = target - d
      const fwd = target + d
      if (back > after && isBoundary(back)) {
        best = back
        break
      }
      if (fwd > after && isBoundary(fwd)) {
        best = fwd
        break
      }
    }
    return best
  }
  const s1 = nearest(Math.round(n / 3), 0)
  const s2 = s1 ? nearest(Math.max(Math.round((2 * n) / 3), s1 + 1), s1) : null
  const bounds = [s1, s2].filter(Boolean).map((j) => sorted[j])
  const edges = [MIN, ...bounds, MAX]
  return edges.slice(0, -1).map((min, i) => ({ shard: i, min, max: edges[i + 1] }))
}

function routeTuple(tuple, chunks) {
  for (const c of chunks) {
    if (cmpTuple(c.min, tuple) <= 0 && cmpTuple(tuple, c.max) < 0) return c.shard
  }
  return chunks[chunks.length - 1].shard
}

function fmtBound(b, key) {
  if (b === MIN) return 'MinKey'
  if (b === MAX) return 'MaxKey'
  if (key.kind === 'hashed') return `0x${b[0].toString(16).padStart(8, '0').slice(0, 4)}…`
  return b
    .map((v, i) => {
      const f = key.fields[i]
      if (f === 'createdAt') return new Date(v).toISOString().slice(0, 10)
      if (typeof v === 'string') return `"${v}"`
      return String(v)
    })
    .join(', ')
}

/* Queries the router can receive */
const WH_DOC = BASE_DOCS.find((d, i) => i > 8 && d.warehouse === 'RIX')
const QUERIES = [
  { id: 'byId', code: 'find({ _id: "p042" })', label: 'One product by _id', match: (d) => d._id === 'p042' },
  { id: 'lowStock', code: 'find({ stock: { $lt: 5 } })', label: 'Low stock', match: (d) => d.stock < 5 },
  { id: 'drink', code: 'find({ category: "drink" })', label: 'All drinks', match: (d) => d.category === 'drink' },
  {
    id: 'whSku',
    code: `find({ warehouse: "RIX", sku: "${WH_DOC.sku}" })`,
    label: 'One SKU in Riga',
    match: (d) => d.warehouse === 'RIX' && d.sku === WH_DOC.sku,
  },
]

// Which shards must mongos contact for this query under this key?
function shardsFor(queryId, key, chunks) {
  const all = new Set(chunks.map((c) => c.shard))
  const forTuple = (t) => new Set([routeTuple(t, chunks)])
  const overlapping = (lo, hi) => {
    // chunks overlapping the half-open tuple range [lo, hi)
    const s = new Set()
    for (const c of chunks) if (cmpTuple(c.min, hi) < 0 && cmpTuple(lo, c.max) < 0) s.add(c.shard)
    return s
  }
  if (key.kind === 'hashed') {
    if (queryId === 'byId') return forTuple([hash32('p042')])
    return all
  }
  const f0 = key.fields[0]
  if (queryId === 'byId' && f0 === '_id') return forTuple(['p042'])
  if (queryId === 'lowStock' && f0 === 'stock') return overlapping(MIN, [5])
  if (queryId === 'drink' && f0 === 'category') return overlapping(['drink'], ['drink', MAX])
  if (queryId === 'whSku' && f0 === 'warehouse') {
    if (key.fields[1] === 'sku') return forTuple(['RIX', WH_DOC.sku])
    return overlapping(['RIX', MIN], ['RIX', MAX])
  }
  return all
}

/* Scorecard */
function scorecard(key, chunks) {
  const tuples = BASE_DOCS.map((d) => JSON.stringify(key.kind === 'hashed' ? [d._id] : key.fields.map((f) => d[f])))
  const counts = {}
  tuples.forEach((t) => (counts[t] = (counts[t] || 0) + 1))
  const distinct = Object.keys(counts).length
  const maxShare = Math.max(...Object.values(counts)) / BASE_DOCS.length
  const lowStock = shardsFor('lowStock', key, chunks).size
  const card =
    distinct >= 60
      ? { text: `High (${distinct})`, tone: 'good' }
      : distinct >= 12
        ? { text: `Medium (${distinct})`, tone: 'warn' }
        : { text: `Low (${distinct})`, tone: 'bad' }
  const freqPct = Math.round(maxShare * 100)
  let freq =
    maxShare <= 0.03
      ? { text: `${freqPct}% max`, tone: 'good' }
      : maxShare <= 0.12
        ? { text: `${freqPct}% max`, tone: 'warn' }
        : { text: `${freqPct}% max`, tone: 'bad' }
  if (key.id === 'warehouse_sku') freq = { text: 'Unique, but RIX prefix 50%', tone: 'warn' }
  const mono = key.id === 'createdAt' ? { text: 'Yes, always grows', tone: 'bad' } : { text: 'No', tone: 'good' }
  const iso = lowStock === 1 ? { text: 'Targeted, 1 shard', tone: 'good' } : { text: `Scatter, ${lowStock} shards`, tone: 'warn' }
  const mut = key.id === 'stock' ? { text: 'Changes on every sale', tone: 'bad' } : { text: 'Stable', tone: 'good' }
  return { card, freq, mono, iso, mut }
}

const FEEDBACK = {
  hashed:
    'Writes spread evenly and no shard runs hot, because the hash scatters neighbouring ids. Lookups by _id are targeted, but the low-stock query and category queries must ask every shard. A safe default when the query mix is unknown; you pay with scatter-gather reads.',
  category:
    'Only four distinct values, so the collection can never have more than four chunks, and a popular category becomes a jumbo chunk that cannot be split or moved. Category pages are targeted, everything else scatters. Low cardinality is the main risk.',
  createdAt:
    'Monotonic: every new product sorts after the last one, so all inserts land in the final chunk and one shard takes the whole write load. Range queries by date are targeted, but the hot shard caps write throughput. If you need time ordering, hash it or put it second in a compound key.',
  warehouse_sku:
    'High cardinality from the SKU, and queries for one warehouse or one SKU in a warehouse are targeted. Writes spread by warehouse, though Riga holds about half of the catalogue, so expect some skew. A strong choice when most traffic is per warehouse; the low-stock report still scatters.',
  stock:
    'It isolates the low-stock query on one shard, which is tempting. But stock changes on every sale, so documents would keep moving between shards, values cluster near zero, and cardinality is limited. Usually a poor shard key; serve the low-stock report with an index instead.',
}

/* ------------------------------------------------------------------ */

export default function ShardLab() {
  const reduce = useReducedMotion()
  const labData = useStore((s) => s.labs.shard?.data || {})
  const cps = useStore((s) => s.labs.shard?.checkpoints || {})
  const setLabData = useStore((s) => s.setLabData)

  const [keyId, setKeyId] = useState(null)
  const [tried, setTried] = useState(() => labData.tried || [])
  const [inserted, setInserted] = useState([]) // docs from bursts
  const [burstCount, setBurstCount] = useState(0)
  const [streaming, setStreaming] = useState(null) // { key, counts: [a,b,c], total, done }
  const [flying, setFlying] = useState([]) // packets for inserts
  const [spreads, setSpreads] = useState(() => labData.spreads || {})
  const [lastBurst, setLastBurst] = useState(null) // { keyId, counts, burst }
  const [query, setQuery] = useState(null) // { id, shards: [], counts: [], run }
  const [routing, setRouting] = useState(() => labData.routing || { targeted: false, scatter: false })
  const [lockBurst, setLockBurst] = useState(null)
  const [choice, setChoice] = useState(labData.choice || '')
  const [justification, setJustification] = useState(labData.justification || '')
  const [savedChoice, setSavedChoice] = useState(labData.choice || null)
  const { events, log, clear } = useEvents()
  const stamp = useStopwatch()
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  const key = keyId ? keyById(keyId) : null
  const chunks = useMemo(() => (key ? computeChunks(key) : null), [key])
  const allDocs = useMemo(() => [...BASE_DOCS, ...inserted], [inserted])
  const newIds = useMemo(() => new Set(inserted.map((d) => d._id)), [inserted])

  const placement = useMemo(() => {
    const cols = [[], [], []]
    for (const d of allDocs) {
      const s = key ? routeTuple(tupleOf(d, key), chunks) : 0
      cols[s].push(d)
    }
    if (key) cols.forEach((c) => c.sort((a, b) => cmpTuple(tupleOf(a, key), tupleOf(b, key))))
    return cols
  }, [allDocs, key, chunks])

  const card = useMemo(() => (key ? scorecard(key, chunks) : null), [key, chunks])

  // Prediction: what will the next burst actually do under this key?
  const nextBurst = useMemo(
    () => makeBurst(burstCount, 91 + burstCount * 30, inserted.length ? inserted[inserted.length - 1].createdAt : DATA.lastT),
    [burstCount, inserted],
  )
  const predictedAnswer = useMemo(() => {
    if (!key) return null
    const counts = [0, 0, 0]
    nextBurst.forEach((d) => counts[routeTuple(tupleOf(d, key), chunks)]++)
    return Math.max(...counts) / nextBurst.length >= 0.6 ? 'one' : 'spread'
  }, [key, chunks, nextBurst])

  const persist = (patch) => setLabData('shard', patch)

  function chooseKey(id) {
    if (streaming && !streaming.done) return
    const k = keyById(id)
    setKeyId(id)
    setQuery(null)
    setLockBurst(null)
    log(
      <>
        <code>sh.shardCollection("inventory.products", {k.spec})</code>. Chunks are split and the balancer moves documents to their shards.
      </>,
      'info',
      stamp(),
    )
    if (!tried.includes(id)) {
      const next = [...tried, id]
      setTried(next)
      persist({ tried: next })
      if (next.length >= 3) checkpoint('shard', 'compare')
    }
  }

  function unshard() {
    setKeyId(null)
    setQuery(null)
    log('Back to an unsharded collection: every document lives on the primary shard, Shard A.', 'info', stamp())
  }

  function runBurst() {
    if (!key || (streaming && !streaming.done) || burstCount >= 3) return
    const burst = nextBurst
    const k = key
    const ch = chunks
    const counts = [0, 0, 0]
    setStreaming({ key: k.id, counts: [0, 0, 0], total: burst.length, done: false })
    log(`Inserting 30 new products with shard key ${k.spec}.`, 'write', stamp())
    const step = reduce ? 0 : 75
    burst.forEach((doc, i) => {
      later(() => {
        const s = routeTuple(tupleOf(doc, k), ch)
        counts[s]++
        setInserted((prev) => [...prev, doc])
        setStreaming((st) => (st ? { ...st, counts: [...counts] } : st))
        if (!reduce) {
          const pid = `f-${doc._id}`
          setFlying((f) => [...f, { id: pid, shard: s }])
          later(() => setFlying((f) => f.filter((x) => x.id !== pid)), 700)
        }
        if (i === burst.length - 1) {
          const shares = counts.map((c) => c / burst.length)
          const max = Math.max(...shares)
          const hot = shares.indexOf(max)
          setStreaming({ key: k.id, counts: [...counts], total: burst.length, done: true })
          setBurstCount((b) => b + 1)
          setLastBurst({ keyId: k.id, counts: [...counts] })
          const nextSpreads = { ...spreads, [k.id]: counts }
          setSpreads(nextSpreads)
          persist({ spreads: nextSpreads })
          if (max >= 0.8) {
            log(`Hot shard: Shard ${SHARDS[hot].id} took ${counts[hot]} of 30 inserts. The other shards sat idle.`, 'bad', stamp())
          } else {
            log(`Writes spread: A ${counts[0]}, B ${counts[1]}, C ${counts[2]}.`, 'ok', stamp())
          }
          if (k.id === 'createdAt' && max >= 0.8) checkpoint('shard', 'hotspot')
        }
      }, i * step + 20)
    })
  }

  function runQuery(q) {
    const shards = key ? [...shardsFor(q.id, key, chunks)].sort() : [0]
    const counts = [0, 1, 2].map((s) => placement[s].filter(q.match).length)
    const run = Date.now()
    setQuery({ id: q.id, shards, counts, run })
    const total = counts.reduce((a, b) => a + b, 0)
    if (!key) {
      log(<>Unsharded collection: <code>{q.code}</code> goes to the primary shard only and returns {total}.</>, 'read', stamp())
      return
    }
    const targeted = shards.length < SHARDS.length
    const wasted = shards.filter((s) => counts[s] === 0).length
    log(
      <>
        <code>{q.code}</code>: {targeted ? 'targeted' : 'scatter-gather'} to {shards.map((s) => SHARDS[s].id).join(', ')}.{' '}
        {total} result{total === 1 ? '' : 's'}
        {wasted && !targeted ? `, ${wasted} shard${wasted > 1 ? 's' : ''} searched for nothing` : ''}.
      </>,
      targeted ? 'ok' : 'warn',
      stamp(),
    )
    const next = { ...routing, [targeted ? 'targeted' : 'scatter']: true }
    if (next.targeted !== routing.targeted || next.scatter !== routing.scatter) {
      setRouting(next)
      persist({ routing: next })
    }
    if (next.targeted && next.scatter) checkpoint('shard', 'routing')
  }

  function saveChoice() {
    if (!choice || wordCount(justification) < 15) return
    const k = keyById(choice)
    persist({ choice, choiceLabel: k.spec, justification: justification.trim(), savedAt: Date.now() })
    setSavedChoice(choice)
    log(`Final choice saved: ${k.spec}.`, 'ok', stamp())
    checkpoint('shard', 'choose')
  }

  // Resets the simulator view. Progress (keys tried, saved choice, checkpoints) is kept.
  function reset() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setKeyId(null)
    setInserted([])
    setBurstCount(0)
    setStreaming(null)
    setFlying([])
    setLastBurst(null)
    setQuery(null)
    setLockBurst(null)
    clear()
  }

  const streamingNow = streaming && !streaming.done
  const counts = placement.map((c) => c.length)
  const maxCount = Math.max(1, ...counts)
  const words = wordCount(justification)
  const predictVerified = lockBurst !== null && burstCount > lockBurst && lastBurst?.keyId === keyId
  const actualAnswer = lastBurst ? (Math.max(...lastBurst.counts) / 30 >= 0.6 ? 'one' : 'spread') : null
  const gateAnswer = predictVerified ? actualAnswer : predictedAnswer
  const queryShards = query ? new Set(query.shards) : null
  const qDef = query ? QUERIES.find((q) => q.id === query.id) : null

  const ariaSummary = key
    ? `Sharded on ${key.spec}. Shard A holds ${counts[0]} products, Shard B ${counts[1]}, Shard C ${counts[2]}.`
    : `Unsharded. All ${counts[0]} products are on Shard A.`

  return (
    <ActivityFrame id="lab-shard">
      <div className="lk-intro">
        <Mission
          lab="shard"
          hints={{
            compare: `Pick keys in the panel. Tried so far: ${tried.length}.`,
            hotspot: 'Shard on { createdAt: 1 }, then insert 30 new products.',
            routing: 'Run a query that hits one shard, and one that hits all three.',
            choose: 'At the bottom of the page: pick a key and defend it.',
          }}
        />
        {key ? (
          <PredictGate
            key={keyId}
            prompt={
              <>
                With <code>{key.spec}</code>, where will the next 30 new products land?
              </>
            }
            options={[
              { id: 'spread', label: 'Spread across all three shards' },
              { id: 'one', label: 'Almost all on one shard' },
            ]}
            correct={gateAnswer}
            verified={predictVerified}
            runHint="Now press Insert 30 new products and watch where they go."
            onLock={() => setLockBurst(burstCount)}
            explain={
              gateAnswer === 'one'
                ? 'New values sort after every existing value (or share one value), so they all fall into the same chunk and one shard takes every write.'
                : 'The key values of new products fall into all the chunk ranges, so the router sends inserts to every shard.'
            }
          />
        ) : (
          <div className="shd-start">
            <span className="kicker kicker--ink">The setup</span>
            <p>
              The inventory has grown to <strong>90 products</strong> in three warehouses: Riga (RIX), Tallinn (TLL) and Vilnius
              (VNO). It still lives on one replica set. Three shards are ready.
            </p>
            <p className="muted">
              Choose a shard key on the left. The router (<code>mongos</code>) will split the key range into chunks and move each
              product to the shard that owns its chunk.
            </p>
          </div>
        )}
      </div>

      <div className="lk-sim shd-sim">
        <div className="lk-sim__controls">
          <ControlGroup label="1 · Shard key" id="shd-key-label">
            <div className="shd-keys" role="radiogroup" aria-labelledby="shd-key-label">
              {KEYS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={keyId === k.id}
                  className={`option shd-keybtn ${keyId === k.id ? 'is-on' : ''}`}
                  onClick={() => chooseKey(k.id)}
                  disabled={Boolean(streamingNow)}
                >
                  <span className="option__mark">
                    <Icon name="check" strokeWidth={3} />
                  </span>
                  <code className="shd-spec">{k.spec}</code>
                  {tried.includes(k.id) ? <span className="shd-tried">tried</span> : null}
                </button>
              ))}
            </div>
            {key ? (
              <button type="button" className="btn btn--ghost btn--sm shd-unshard" onClick={unshard} disabled={Boolean(streamingNow)}>
                Show unsharded
              </button>
            ) : null}
          </ControlGroup>

          <ControlGroup
            label={
              <>
                2 · Writes <span className="lk-val">{burstCount}/3 bursts</span>
              </>
            }
            id="shd-write-label"
          >
            <button
              type="button"
              className="btn btn--primary"
              onClick={runBurst}
              disabled={!key || Boolean(streamingNow) || burstCount >= 3}
            >
              <Icon name="plus" />
              Insert 30 new products
            </button>
            <span className="hint">
              {!key ? 'Shard the collection first.' : burstCount >= 3 ? 'Reset the lab to insert more.' : 'New products get the newest createdAt.'}
            </span>
          </ControlGroup>

          <ControlGroup label="3 · Queries through mongos" id="shd-q-label">
            <div className="shd-queries">
              {QUERIES.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className={`shd-query ${query?.id === q.id ? 'is-on' : ''}`}
                  onClick={() => runQuery(q)}
                  disabled={Boolean(streamingNow)}
                >
                  <span className="shd-query__label">{q.label}</span>
                  <code className="shd-query__code">{q.code}</code>
                </button>
              ))}
            </div>
          </ControlGroup>

          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
            <Icon name="reset" />
            Reset simulation
          </button>
        </div>

        <div className="lk-sim__stage">
          <div className="shd-cmd" aria-live="polite">
            <span className="shd-cmd__prompt">inventory&gt;</span>
            <code>{key ? `sh.shardCollection("inventory.products", ${key.spec})` : 'db.products  // not sharded yet'}</code>
          </div>

          <Router query={query} keyed={Boolean(key)} flying={flying} reduce={reduce} qDef={qDef} />

          <LayoutGroup>
            <div className="shd-shards" role="img" aria-label={ariaSummary}>
              {SHARDS.map((s, i) => {
                const chunk = chunks?.find((c) => c.shard === i)
                const contacted = queryShards ? queryShards.has(i) : null
                const isHot = streaming?.done && streaming.key === keyId && streaming.counts[i] / streaming.total >= 0.8
                return (
                  <div
                    key={s.id}
                    className={`shd-shard ${contacted === false ? 'is-skipped' : ''} ${contacted ? 'is-contacted' : ''} ${isHot ? 'is-hot' : ''}`}
                    style={{ '--c': s.color, '--w': s.wash }}
                  >
                    <div className="shd-shard__head">
                      <span className="shd-shard__dot" />
                      <span className="shd-shard__name">Shard {s.id}</span>
                      <span className="shd-shard__count tabular">{counts[i]}</span>
                    </div>
                    <div className="shd-shard__chunk" title="Chunk range owned by this shard">
                      {key && chunk ? (
                        <code>
                          [{fmtBound(chunk.min, key)}, {fmtBound(chunk.max, key)})
                        </code>
                      ) : i === 0 ? (
                        <code>primary shard · whole collection</code>
                      ) : (
                        <code>no chunks yet</code>
                      )}
                    </div>
                    <div className="shd-dots">
                      {placement[i].map((d) => {
                        const hit = query && contacted && qDef?.match(d)
                        return (
                          <motion.span
                            key={d._id}
                            layoutId={d._id}
                            layout={!reduce}
                            className={`shd-doc ${d.stock < 5 ? 'is-low' : ''} ${newIds.has(d._id) ? 'is-new' : ''} ${hit ? 'is-hit' : ''}`}
                            title={`${d._id} · ${d.name} · ${d.category} · ${d.warehouse} · stock ${d.stock}`}
                            initial={streamingNow && newIds.has(d._id) && !reduce ? { opacity: 0, y: -26, scale: 0.3 } : false}
                            animate={{ opacity: 1, y: 0, scale: hit ? 1.35 : 1 }}
                            transition={{ duration: 0.7, ease: EASE_EXPO }}
                          />
                        )
                      })}
                      {placement[i].length === 0 ? <span className="shd-empty">empty</span> : null}
                    </div>
                    <div className="shd-bar" aria-hidden="true">
                      <span style={{ transform: `scaleX(${counts[i] / maxCount})` }} />
                    </div>
                    {query && contacted !== null ? (
                      <div className="shd-shard__q">
                        {contacted ? (
                          <span className={query.counts[i] ? 'shd-res' : 'shd-res shd-res--zero'}>
                            {query.counts[i]} result{query.counts[i] === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="shd-res shd-res--skip">not contacted</span>
                        )}
                      </div>
                    ) : null}
                    {streaming && streaming.key === keyId ? (
                      <div className="shd-shard__w tabular">+{streaming.counts[i]} writes</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </LayoutGroup>

          <div className="shd-legend lk-legend">
            <span>
              <i className="shd-lg shd-lg--doc" /> product
            </span>
            <span>
              <i className="shd-lg shd-lg--low" /> stock below 5
            </span>
            <span>
              <i className="shd-lg shd-lg--new" /> inserted in a burst
            </span>
            <span>
              <i className="shd-lg shd-lg--hit" /> matched by the query
            </span>
          </div>

          <AnimatePresence mode="wait">
            {query ? (
              <motion.div
                key={query.run}
                className={`shd-verdict ${key && query.shards.length < 3 ? 'is-targeted' : 'is-scatter'}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
              >
                <strong>
                  {!key ? 'Unsharded' : query.shards.length < 3 ? 'Targeted query' : 'Scatter-gather query'}
                </strong>
                <span>
                  {!key
                    ? 'One shard holds everything, so there is nothing to route.'
                    : query.shards.length < 3
                      ? `The query includes the shard key, so mongos asks only ${query.shards.map((s) => `Shard ${SHARDS[s].id}`).join(' and ')}.`
                      : 'The query does not pin down the shard key, so mongos must ask every shard and merge the answers.'}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="lk-row">
        <section className="shd-score" aria-label="Shard key comparison">
          <div className="lk-log__head">
            <span className="kicker kicker--ink">Compare the keys you tried</span>
          </div>
          <div className="table-wrap">
            <table className="table shd-table">
              <thead>
                <tr>
                  <th scope="col">Shard key</th>
                  <th scope="col">Cardinality</th>
                  <th scope="col">Frequency</th>
                  <th scope="col">Monotonic</th>
                  <th scope="col">Low-stock query</th>
                  <th scope="col">Mutable</th>
                  <th scope="col">30 inserts (A/B/C)</th>
                </tr>
              </thead>
              <tbody>
                {KEYS.map((k) => {
                  const isTried = tried.includes(k.id)
                  const sc = isTried ? scorecard(k, computeChunks(k)) : null
                  const sp = spreads[k.id]
                  return (
                    <tr key={k.id} className={keyId === k.id ? 'is-current' : ''}>
                      <th scope="row">
                        <code>{k.spec}</code>
                      </th>
                      {isTried ? (
                        <>
                          {['card', 'freq', 'mono', 'iso', 'mut'].map((f) => (
                            <td key={f}>
                              <span className={`shd-score__v shd-score__v--${sc[f].tone}`}>{sc[f].text}</span>
                            </td>
                          ))}
                          <td className="tabular">
                            {sp ? (
                              <span className={`shd-score__v shd-score__v--${Math.max(...sp) >= 24 ? 'bad' : 'good'}`}>{sp.join(' / ')}</span>
                            ) : (
                              <span className="faint">not run</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={6} className="faint">
                          <button type="button" className="shd-try" onClick={() => chooseKey(k.id)} disabled={Boolean(streamingNow)}>
                            Try this key
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {card ? (
            <p className="hint shd-score__note">
              Good shard keys have high cardinality, low frequency, no monotonic growth, rarely change, and appear in your most
              important queries.
            </p>
          ) : null}
        </section>
        <EventLog events={events} onClear={clear} />
      </div>

      <section className="shd-choose" aria-labelledby="shd-choose-title">
        <div className="lk-h">
          <div>
            <span className="kicker">Decide</span>
            <h2 id="shd-choose-title">Choose a shard key and defend it</h2>
            <p>
              There is no single right answer. Pick the key you would ship for this shop and say why, in terms of the queries that
              matter and the cost you accept. Your choice carries over to the assignment.
            </p>
          </div>
        </div>
        <div className="shd-choose__grid">
          <div className="field">
            <label className="label" htmlFor="shd-choice">
              Final shard key
            </label>
            <select id="shd-choice" className="select" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Select a key…</option>
              {KEYS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.spec}
                </option>
              ))}
            </select>
          </div>
          <div className="field shd-choose__why">
            <label className="label" htmlFor="shd-why">
              Justification
            </label>
            <textarea
              id="shd-why"
              className="textarea"
              placeholder="Most traffic is… so this key routes… The cost I accept is…"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              aria-describedby="shd-why-hint"
            />
            <span id="shd-why-hint" className={`hint ${words >= 15 ? 'shd-ok' : ''}`}>
              {words} words{words < 15 ? `, at least 15 needed` : ', ready to save'}
            </span>
          </div>
          <div className="shd-choose__act">
            <button type="button" className="btn btn--dark" onClick={saveChoice} disabled={!choice || words < 15}>
              <Icon name="check" />
              {savedChoice ? 'Update my choice' : 'Save my choice'}
            </button>
            {cps.choose ? <span className="chip chip--done">Saved, used in the assignment</span> : null}
          </div>
        </div>
        <AnimatePresence>
          {savedChoice ? (
            <motion.div
              key={savedChoice}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <Callout tone="info" title={`Trade-offs of ${keyById(savedChoice).spec}:`}>
                {FEEDBACK[savedChoice]}
              </Callout>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <Debrief show={Boolean(cps.hotspot || cps.choose)}>
        <p>
          The shard key decides which machine owns each product, for ever. Pick it from the queries the shop runs most: if staff
          check one warehouse at a time, put warehouse first; if lookups are mostly by id, hash it.
        </p>
        <p>
          Avoid keys that grow with time (all new stock lands on one shard) or change on every sale (documents migrate). The
          low-stock report can live with scatter-gather, served by an index on <code>stock</code> on every shard.
        </p>
      </Debrief>
    </ActivityFrame>
  )
}

/* Router band: mongos with links to the three shards, query and insert packets. */
function Router({ query, keyed, flying, reduce, qDef }) {
  const X = [100, 300, 500]
  const contacted = query ? new Set(query.shards) : null
  return (
    <svg
      className="shd-router"
      viewBox="0 0 600 118"
      role="img"
      aria-label={
        query
          ? `mongos routed ${qDef?.label || 'the query'} to ${query.shards.length} shard${query.shards.length > 1 ? 's' : ''}.`
          : 'mongos router connected to three shards.'
      }
    >
      {X.map((x, i) => {
        const on = contacted?.has(i)
        return (
          <line
            key={i}
            x1={300}
            y1={50}
            x2={x}
            y2={118}
            className={`shd-link ${on ? 'is-on' : ''} ${contacted && !on ? 'is-off' : ''}`}
            style={{ '--c': SHARDS[i].color }}
          />
        )
      })}
      <g className="shd-mongos">
        <rect x={232} y={12} width={136} height={38} rx={10} />
        <text x={300} y={30} textAnchor="middle" className="shd-mongos__t">
          mongos
        </text>
        <text x={300} y={43} textAnchor="middle" className="shd-mongos__s">
          {keyed ? 'routes by chunk' : 'primary shard only'}
        </text>
      </g>
      {!reduce && query
        ? query.shards.map((s, i) => (
            <g key={`${query.run}-${s}`}>
              <motion.circle
                r={5}
                className="shd-packet"
                initial={{ cx: 300, cy: 50, opacity: 1 }}
                animate={{ cx: [300, X[s], X[s], 300], cy: [50, 116, 116, 50], opacity: [1, 1, 1, 0] }}
                transition={{ duration: 1.3, times: [0, 0.42, 0.58, 1], ease: 'easeInOut', delay: i * 0.05 }}
                style={{ fill: SHARDS[s].color }}
              />
            </g>
          ))
        : null}
      {!reduce
        ? flying.map((f) => (
            <motion.circle
              key={f.id}
              r={4}
              className="shd-packet shd-packet--write"
              initial={{ cx: 300, cy: 50, opacity: 1 }}
              animate={{ cx: X[f.shard], cy: 118, opacity: 0.2 }}
              transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
            />
          ))
        : null}
    </svg>
  )
}
