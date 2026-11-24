import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import { Predict, Meter, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import { useStore } from '../store.js'
import './Explore.css'

/* ---------------- Geometry (viewBox 1000 x 640) ---------------- */
const APP = { x: 30, y: 173, w: 170, h: 110 }
const MONGOS = { x: 250, y: 200, w: 140, h: 56 }
const CONFIG = { x: 250, y: 40, w: 140, h: 124 }
const MY = 228 // mongos centre line
const SHARD = (dy) => ({ x: 470, y: 24 + dy, w: 510, h: 288 })
const PRIM = (dy) => ({ x: 490, y: 56 + dy, w: 300, h: 240 })
const SEC = (dy, i) => ({ x: 820, y: 60 + dy + i * 120, w: 140, h: 100 })
const B_DY = 312

const HOTSPOTS = [
  {
    id: 'app',
    title: 'Application and driver',
    body: 'The shop web app never talks to a disk. It calls a MongoDB driver, which keeps a pool of connections, retries after a failover and sends every operation with its read preference and write concern.',
    why: 'This is where you choose readPreference and writeConcern for the restock and the low-stock requests.',
    at: [200, 173],
    region: APP,
  },
  {
    id: 'mongos',
    title: 'mongos query router',
    body: 'mongos is a stateless router. It looks up which shard owns which range of shard-key values in its cached chunk map, forwards the operation, and merges the replies. You run several of them for availability.',
    why: 'The low-stock filter does not contain the shard key, so mongos must ask every shard and merge the answers.',
    at: [390, 200],
    region: { x: MONGOS.x, y: MONGOS.y, w: MONGOS.w + 8, h: MONGOS.h + 8 },
  },
  {
    id: 'config',
    title: 'Config server replica set',
    body: 'The config servers hold the cluster metadata: the shard key, the chunk ranges and which shard owns each chunk. The balancer moves chunks between shards to keep them even and records every move here.',
    why: 'Your shard key choice lives here. Changing it later means resharding the whole collection.',
    at: [390, 40],
    region: CONFIG,
  },
  {
    id: 'shard',
    title: 'Shard A',
    body: 'A shard holds a subset of the collection: one or more chunks. Every shard is itself a replica set, so it can lose a machine and keep serving.',
    why: 'With { _id: "hashed" } as the shard key, Tea, Rice and Coffee spread evenly across Shard A and Shard B.',
    at: [980, 24],
    region: SHARD(0),
  },
  {
    id: 'primary',
    title: 'Primary',
    body: 'Only the primary of a shard accepts writes. It applies each write to its data and records it in the oplog. If it fails, the secondaries hold an election and one of them takes over.',
    why: 'updateOne({ _id: "p1" }, { $inc: { stock: 10 } }) is applied here first.',
    at: [790, 56],
    region: PRIM(0),
  },
  {
    id: 'index',
    title: 'B-tree index on { stock: 1 }',
    body: 'An index keeps stock values sorted in a B-tree, each key pointing at its document. A range query walks down to the first key and reads along the leaves until it passes 5. The explain plan calls this IXSCAN. Without the index it is a COLLSCAN of every document.',
    why: 'find({ stock: { $lt: 5 } }) examines 2 index keys instead of every product.',
    at: [776, 132],
    region: { x: 500, y: 108, w: 280, h: 80 },
  },
  {
    id: 'storage',
    title: 'Storage engine',
    body: 'WiredTiger stores each document as BSON inside compressed pages and writes a journal, so acknowledged writes survive a crash. A document is always read and written whole.',
    why: 'Keep together the fields you read together: one product document holds name, stock and tags.',
    at: [776, 196],
    region: { x: 500, y: 192, w: 280, h: 52 },
  },
  {
    id: 'oplog',
    title: 'Oplog',
    body: 'The oplog is an ordered, capped log of every change, written in an idempotent form such as "set stock to 13". Secondaries tail it and replay each entry in the same order.',
    why: 'Replica lag is how far a secondary’s position in the oplog trails the primary.',
    at: [776, 252],
    region: { x: 500, y: 248, w: 280, h: 38 },
  },
  {
    id: 'secondary',
    title: 'Secondaries',
    body: 'Secondaries copy the oplog and keep a full replica of the shard. They can serve reads with readPreference "secondary" or "nearest", but those reads may be stale. They vote when a new primary is elected.',
    why: 'A shopper in Vilnius reading from a lagging secondary may still see stock 3 after it became 13.',
    at: [960, 280],
    region: { x: 816, y: 56, w: 148, h: 228 },
  },
]

/* ---------------- Query trace ---------------- */
const P_APP = [
  [200, MY],
  [250, MY],
]
const toPrim = (dy) => [
  [390, MY],
  [440, MY],
  [440, 176 + dy],
  [490, 176 + dy],
]
const inPrim = (dy) => [
  [490, 176 + dy],
  [640, 133 + dy],
  [608, 171 + dy],
  [640, 219 + dy],
]
const backPrim = (dy) => [
  [640, 219 + dy],
  [490, 176 + dy],
  [440, 176 + dy],
  [440, MY],
  [390, MY],
]
const WINDOWS = [
  [0, 1.2],
  [1.2, 2.6],
  [2.6, 3.8],
  [3.8, 5.4],
  [5.4, 6.8],
  [6.8, 8],
]
const TOTAL = 8

const TRACES = {
  hashed: {
    label: '{ _id: "hashed" }',
    shards: [0, B_DY],
    steps: [
      'The app sends find({ stock: { $lt: 5 } }) through the driver to mongos.',
      'mongos checks its cached chunk map. The shard key is _id, hashed, and the filter has no _id, so any shard might hold matches.',
      'Scatter: mongos sends the query to Shard A and Shard B in parallel.',
      'Each primary uses its { stock: 1 } index: an IXSCAN over [MinKey, 5), then it fetches only the matching documents.',
      'Gather: mongos merges the partial results. Shard A returns Tea, Shard B returns Coffee.',
      'The app receives 2 documents. Shards contacted: 2 of 2.',
    ],
    result: 'Scatter-gather · 2 of 2 shards',
  },
  range: {
    label: '{ stock: 1 }',
    shards: [0],
    steps: [
      'The app sends find({ stock: { $lt: 5 } }) through the driver to mongos.',
      'mongos checks the chunk map. The shard key is stock: chunk [MinKey, 10) lives on Shard A, [10, MaxKey] on Shard B. The range stock < 5 fits inside one chunk.',
      'Targeted: mongos sends the query to Shard A only.',
      'Shard A walks its stock index over [MinKey, 5) and fetches Tea and Coffee.',
      'Nothing to merge: a single shard answered.',
      'The app receives 2 documents. Shards contacted: 1 of 2. The catch: stock changes on every sale, so documents keep moving between chunks.',
    ],
    result: 'Targeted · 1 of 2 shards',
  },
}

function pointAt(points, k) {
  const segs = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    segs.push(len)
    total += len
  }
  let d = Math.max(0, Math.min(1, k)) * total
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 1
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f]
    }
    d -= segs[i]
  }
  return points[points.length - 1]
}
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const prog = (t, [a, b]) => ease(Math.max(0, Math.min(1, (t - a) / (b - a))))
const stepAt = (t) => {
  if (t >= TOTAL) return WINDOWS.length - 1
  return Math.max(0, WINDOWS.findIndex(([a, b]) => t >= a && t < b))
}

function tracePackets(mode, t) {
  const tr = TRACES[mode]
  const out = []
  const s = stepAt(t)
  if (t <= 0) return out
  if (s === 0) out.push(pointAt(P_APP, prog(t, WINDOWS[0])))
  else if (s === 1) out.push([320, MY])
  else if (s === 2) tr.shards.forEach((dy) => out.push(pointAt(toPrim(dy), prog(t, WINDOWS[2]))))
  else if (s === 3) tr.shards.forEach((dy) => out.push(pointAt(inPrim(dy), prog(t, WINDOWS[3]))))
  else if (s === 4) tr.shards.forEach((dy) => out.push(pointAt(backPrim(dy), prog(t, WINDOWS[4]))))
  else if (s === 5 && t < TOTAL) out.push(pointAt([...P_APP].reverse(), prog(t, WINDOWS[5])))
  return out
}

/* ---------------- Diagram ---------------- */
function Box({ r, className = '', rx = 10 }) {
  return <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={rx} className={className} />
}

function PrimaryInternals({ dy, faded, hlLeaf }) {
  const p = PRIM(dy)
  return (
    <g className={faded ? 'exp-faded' : ''}>
      <Box r={p} className="exp-prim" rx={12} />
      <text x={p.x + 14} y={p.y + 22} className="exp-role exp-role--primary">
        PRIMARY
      </text>
      <text x={p.x + 14} y={p.y + 42} className="exp-mono">
        inventory.products
      </text>
      {/* index */}
      <text x={p.x + 14} y={p.y + 70} className="exp-mono exp-mono--sm">
        index
      </text>
      <text x={p.x + 14} y={p.y + 84} className="exp-mono exp-mono--sm exp-saffron">
        {'{ stock: 1 }'}
      </text>
      <line x1={p.x + 150} y1={p.y + 88} x2={p.x + 118} y2={p.y + 104} className="exp-edge" />
      <line x1={p.x + 150} y1={p.y + 88} x2={p.x + 245} y2={p.y + 104} className="exp-edge" />
      <rect x={p.x + 122} y={p.y + 66} width={56} height={22} rx={5} className="exp-bnode" />
      <text x={p.x + 150} y={p.y + 81} className="exp-mono exp-center">
        5
      </text>
      <rect x={p.x + 80} y={p.y + 104} width={76} height={22} rx={5} className={`exp-bnode ${hlLeaf ? 'is-hit' : ''}`} />
      <text x={p.x + 118} y={p.y + 119} className={`exp-mono exp-center ${hlLeaf ? 'exp-hit' : ''}`}>
        2 · 3
      </text>
      <rect x={p.x + 220} y={p.y + 104} width={50} height={22} rx={5} className="exp-bnode" />
      <text x={p.x + 245} y={p.y + 119} className="exp-mono exp-center">
        12
      </text>
      {/* storage */}
      <rect x={p.x + 14} y={p.y + 140} width={272} height={46} rx={8} className="exp-store" />
      <text x={p.x + 28} y={p.y + 160} className="exp-label">
        WiredTiger
      </text>
      <text x={p.x + 28} y={p.y + 176} className="exp-mono exp-mono--sm">
        BSON pages · journal
      </text>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={p.x + 200 + i * 26} y={p.y + 150} width={20} height={26} rx={3} className="exp-docsq" />
      ))}
      {/* oplog */}
      <rect x={p.x + 14} y={p.y + 196} width={272} height={30} rx={8} className="exp-oplog" />
      <text x={p.x + 28} y={p.y + 216} className="exp-mono exp-mono--sm">
        oplog
      </text>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={p.x + 82 + i * 30} y={p.y + 204} width={24} height={14} rx={3} className={`exp-opentry ${i === 5 ? 'is-new' : ''}`} />
      ))}
    </g>
  )
}

function Secondaries({ dy, faded }) {
  return (
    <g className={faded ? 'exp-faded' : ''}>
      {[0, 1].map((i) => {
        const s = SEC(dy, i)
        return (
          <g key={i}>
            <path
              d={`M ${PRIM(dy).x + 286} ${PRIM(dy).y + 211} C ${s.x - 14} ${PRIM(dy).y + 211}, ${s.x - 24} ${s.y + 50}, ${s.x} ${s.y + 50}`}
              className="exp-repl"
              markerEnd="url(#exp-arrow)"
            />
            <Box r={s} className="exp-sec" rx={10} />
            <text x={s.x + 12} y={s.y + 22} className="exp-role">
              SECONDARY
            </text>
            <text x={s.x + 12} y={s.y + 44} className="exp-mono exp-mono--sm">
              full copy
            </text>
            <text x={s.x + 12} y={s.y + 60} className="exp-mono exp-mono--sm">
              tails oplog
            </text>
            {[0, 1, 2].map((j) => (
              <rect key={j} x={s.x + 12 + j * 22} y={s.y + 70} width={16} height={18} rx={2} className="exp-docsq" />
            ))}
          </g>
        )
      })}
    </g>
  )
}

function Diagram({ selected, mode, traceMode, traceT }) {
  const sel = HOTSPOTS.find((h) => h.id === selected)
  const step = stepAt(traceT)
  const tracing = mode === 'trace' && traceT > 0
  const packets = mode === 'trace' ? tracePackets(traceMode, traceT) : []
  const activeShards = TRACES[traceMode].shards
  const shardBDim = mode === 'trace' && traceMode === 'range' && tracing && step >= 2

  return (
    <svg viewBox="0 0 1000 640" className="exp-svg" role="img" aria-labelledby="exp-title exp-desc">
      <title id="exp-title">Anatomy of a sharded MongoDB cluster</title>
      <desc id="exp-desc">
        An application with a driver connects to a mongos router, which reads metadata from a config server replica set and routes
        queries to two shards. Each shard is a replica set with one primary and two secondaries. Inside the primary: the products
        collection, a B-tree index on stock, the storage engine and the oplog that secondaries copy.
      </desc>
      <defs>
        <marker id="exp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="exp-arrowhead" />
        </marker>
        <marker id="exp-arrow-hl" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="exp-arrowhead exp-arrowhead--hl" />
        </marker>
      </defs>

      {/* connections */}
      <path d={`M 200 ${MY} H 248`} className="exp-wire" markerEnd="url(#exp-arrow)" />
      <path
        d={`M 320 ${MONGOS.y} V ${CONFIG.y + CONFIG.h + 4}`}
        className={`exp-wire exp-wire--meta ${tracing && step === 1 ? 'is-hl' : ''}`}
      />
      <path d={`M 390 ${MY} H 440 V 176 H 488`} className={`exp-wire ${tracing && step >= 2 && activeShards.includes(0) ? 'is-hl' : ''}`} markerEnd="url(#exp-arrow)" />
      <path
        d={`M 390 ${MY} H 440 V ${176 + B_DY} H 488`}
        className={`exp-wire ${shardBDim ? 'is-dim' : ''} ${tracing && step >= 2 && activeShards.includes(B_DY) ? 'is-hl' : ''}`}
        markerEnd="url(#exp-arrow)"
      />

      {/* app */}
      <Box r={APP} className="exp-node" rx={12} />
      <text x={APP.x + 16} y={APP.y + 28} className="exp-title">
        Shop web app
      </text>
      <text x={APP.x + 16} y={APP.y + 48} className="exp-mono exp-mono--sm">
        Riga · Tallinn · Vilnius
      </text>
      <rect x={APP.x + 16} y={APP.y + 64} width={110} height={28} rx={7} className="exp-chip" />
      <text x={APP.x + 30} y={APP.y + 83} className="exp-mono">
        driver
      </text>

      {/* mongos (two routers) */}
      <rect x={MONGOS.x + 8} y={MONGOS.y + 8} width={MONGOS.w} height={MONGOS.h} rx={10} className="exp-node exp-node--ghost" />
      <Box r={MONGOS} className={`exp-node exp-node--router ${tracing && (step === 1 || step === 4) ? 'is-active' : ''}`} rx={10} />
      <text x={MONGOS.x + 16} y={MONGOS.y + 25} className="exp-title">
        mongos
      </text>
      <text x={MONGOS.x + 16} y={MONGOS.y + 43} className="exp-mono exp-mono--sm">
        query router
      </text>

      {/* config */}
      <Box r={CONFIG} className={`exp-node ${tracing && step === 1 ? 'is-active' : ''}`} rx={12} />
      <text x={CONFIG.x + 14} y={CONFIG.y + 24} className="exp-title">
        Config servers
      </text>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={CONFIG.x + 22 + i * 18} cy={CONFIG.y + 44} r={6} className={i === 0 ? 'exp-dot exp-dot--p' : 'exp-dot'} />
      ))}
      <text x={CONFIG.x + 14} y={CONFIG.y + 74} className="exp-mono exp-mono--sm">
        chunk map
      </text>
      <text x={CONFIG.x + 14} y={CONFIG.y + 92} className="exp-mono exp-mono--sm exp-faint">
        {traceMode === 'range' && mode === 'trace' ? '[Min, 10) → A' : 'hash range 1 → A'}
      </text>
      <text x={CONFIG.x + 14} y={CONFIG.y + 108} className="exp-mono exp-mono--sm exp-faint">
        {traceMode === 'range' && mode === 'trace' ? '[10, Max] → B' : 'hash range 2 → B'}
      </text>

      {/* shards */}
      {[0, B_DY].map((dy) => {
        const faded = dy === B_DY && (mode !== 'trace' ? true : shardBDim)
        return (
          <g key={dy}>
            <Box r={SHARD(dy)} className={`exp-shard ${dy ? 'exp-shard--b' : ''}`} rx={16} />
            <text x={SHARD(dy).x + 18} y={SHARD(dy).y + 20} className="exp-shardlabel">
              {dy ? 'SHARD B · replica set' : 'SHARD A · replica set'}
            </text>
            <PrimaryInternals dy={dy} faded={faded} hlLeaf={tracing && step === 3 && activeShards.includes(dy)} />
            <Secondaries dy={dy} faded={faded} />
          </g>
        )
      })}

      {/* selected hotspot highlight */}
      {mode === 'hotspots' && sel && (
        <rect
          key={sel.id}
          x={sel.region.x - 4}
          y={sel.region.y - 4}
          width={sel.region.w + 8}
          height={sel.region.h + 8}
          rx={14}
          className="exp-hl"
        />
      )}

      {/* trace packets */}
      {packets.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={14} className="exp-packet-glow" />
          <circle cx={x} cy={y} r={7} className="exp-packet" />
        </g>
      ))}
      {mode === 'trace' && traceT >= TOTAL && (
        <g>
          <rect x={30} y={296} width={176} height={30} rx={15} className="exp-result" />
          <text x={118} y={316} className="exp-resulttext exp-center">
            2 documents returned
          </text>
        </g>
      )}
    </svg>
  )
}

/* ---------------- Page ---------------- */
function HotspotPanel({ current, idx, open, go }) {
  if (!current) {
    return (
      <>
        <span className="exp-count">{HOTSPOTS.length} hotspots</span>
        <h2 className="exp-panel__title">One query, from the client to the disk</h2>
        <p className="exp-panel__body">
          This is the architecture path from the lesson: client operation, logical model, physical layout and index, result. Open each
          hotspot, then switch to <em>Trace a query</em>.
        </p>
        <div>
          <button type="button" className="btn btn--primary" onClick={() => open(HOTSPOTS[0].id)}>
            Start at hotspot 1
            <Icon name="arrow-right" />
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      <div className="exp-panel__top">
        <span className="exp-count">
          Hotspot {idx + 1} of {HOTSPOTS.length}
        </span>
        <span className="exp-panel__nav">
          <button type="button" className="btn btn--ghost btn--sm btn--icon" onClick={() => go(-1)} aria-label="Previous hotspot">
            <Icon name="arrow-left" />
          </button>
          <button type="button" className="btn btn--dark btn--sm" onClick={() => go(1)}>
            Next hotspot
            <Icon name="arrow-right" />
          </button>
        </span>
      </div>
      <h2 className="exp-panel__title">{current.title}</h2>
      <p className="exp-panel__body">{current.body}</p>
      <div className="exp-why">
        <Icon name="box" />
        <p>
          <strong>Why it matters for the inventory.</strong> {current.why}
        </p>
      </div>
    </>
  )
}

function TracePanel({ traceMode, switchTrace, traceT, playing, setPlaying, startTrace, stepTo, step }) {
  const tr = TRACES[traceMode]
  const started = traceT > 0
  const finished = traceT >= TOTAL
  return (
    <>
      <div className="exp-panel__top">
        <span className="exp-count">Trace a query</span>
        <span className="exp-tracectl">
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => stepTo(step - 1)}
            aria-label="Previous step"
            disabled={!started}
          >
            <Icon name="chevron-left" />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => stepTo(started ? step + 1 : 0)}
            aria-label="Next step"
          >
            <Icon name="chevron-right" />
          </button>
          {playing ? (
            <button type="button" className="btn btn--dark btn--sm" onClick={() => setPlaying(false)}>
              <Icon name="pause" />
              Pause
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--sm" onClick={startTrace}>
              <Icon name={finished ? 'reset' : 'play'} />
              {finished ? 'Replay' : started ? 'Resume' : 'Play trace'}
            </button>
          )}
        </span>
      </div>
      <code className="exp-query">{'db.products.find({ stock: { $lt: 5 } })'}</code>
      <div className="exp-keyrow">
        <span className="label" id="exp-shardkey">
          Shard key
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="exp-shardkey">
          {Object.entries(TRACES).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={traceMode === k} onClick={() => switchTrace(k)}>
              <span className="mono">{v.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="exp-stepcard">
        <div className="exp-stepcard__head">
          <span className="exp-stepcard__n">{started ? `Step ${step + 1} of ${tr.steps.length}` : 'Ready'}</span>
          <span className="exp-dots" aria-hidden="true">
            {tr.steps.map((_, i) => (
              <span
                key={i}
                className={`${started && i === step && !finished ? 'is-on' : ''} ${started && (i < step || finished) ? 'is-past' : ''}`}
              />
            ))}
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={`${traceMode}-${started ? step : 'ready'}-${finished}`}
            className="exp-stepcard__text"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            {finished ? (
              <>
                <strong>{tr.result}.</strong>{' '}
                {traceMode === 'range'
                  ? 'Targeted reads are cheap, but a shard key that changes on every sale makes every write expensive.'
                  : 'Even with an index on every shard, a query without the shard key has to visit them all.'}
              </>
            ) : started ? (
              tr.steps[step]
            ) : (
              'Press Play trace, or step through with the arrows, and watch the request travel the path.'
            )}
          </motion.p>
        </AnimatePresence>
      </div>
    </>
  )
}

export default function Explore() {
  const seen = useStore((s) => s.explore.seen)
  const seeHotspot = useStore((s) => s.seeHotspot)
  const reduce = useReducedMotion()
  const [mode, setMode] = useState('hotspots')
  const [selected, setSelected] = useState(null)
  const [traceMode, setTraceMode] = useState('hashed')
  const [traceT, setTraceT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [overlay, setOverlay] = useState(true)
  const stageRef = useRef(null)
  const raf = useRef(0)
  const seenCount = HOTSPOTS.filter((h) => seen[h.id]).length
  const idx = HOTSPOTS.findIndex((h) => h.id === selected)
  const current = idx >= 0 ? HOTSPOTS[idx] : null

  // Dock the panel inside the diagram when there is room; otherwise put it below.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setOverlay(entry.contentRect.width >= 940))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const panelRef = useRef(null)
  const open = (id) => {
    setSelected(id)
    seeHotspot(id)
    // When the panel sits below the diagram, bring it into view.
    if (!overlay) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }
  const go = (d) => {
    const n = idx < 0 ? 0 : (idx + d + HOTSPOTS.length) % HOTSPOTS.length
    open(HOTSPOTS[n].id)
  }

  const tRef = useRef(0)
  const setT = (v) => {
    tRef.current = v
    setTraceT(v)
  }
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      const next = Math.min(TOTAL, tRef.current + dt * (reduce ? 3 : 1))
      tRef.current = next
      setTraceT(next)
      if (next >= TOTAL) {
        setPlaying(false)
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, reduce])

  const step = stepAt(traceT)
  const startTrace = () => {
    setT(tRef.current >= TOTAL ? 0.001 : Math.max(tRef.current, 0.001))
    setPlaying(true)
  }
  const stepTo = (n) => {
    setPlaying(false)
    const c = Math.max(0, Math.min(WINDOWS.length - 1, n))
    setT(c === WINDOWS.length - 1 ? TOTAL : WINDOWS[c][0] + (WINDOWS[c][1] - WINDOWS[c][0]) * 0.55)
  }
  const switchTrace = (m) => {
    setTraceMode(m)
    setPlaying(false)
    setT(0)
  }

  const markers = useMemo(() => HOTSPOTS.map((h, i) => ({ ...h, n: i + 1 })), [])

  const panel = (
    <aside
      ref={panelRef}
      className={`exp-panel ${overlay ? 'exp-panel--overlay' : 'exp-panel--below'}`}
      aria-live="polite"
      aria-label="Diagram details"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode === 'hotspots' ? current?.id || 'intro' : 'trace'}
          className="exp-panel__inner"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.4, ease: EASE_EXPO }}
        >
          {mode === 'hotspots' ? (
            <HotspotPanel current={current} idx={idx} open={open} go={go} />
          ) : (
            <TracePanel
              traceMode={traceMode}
              switchTrace={switchTrace}
              traceT={traceT}
              playing={playing}
              setPlaying={setPlaying}
              startTrace={startTrace}
              stepTo={stepTo}
              step={step}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  )

  return (
    <ActivityFrame
      id="explore"
      canComplete={seenCount === HOTSPOTS.length}
      completeHint={`Open all ${HOTSPOTS.length} hotspots to mark the diagram done. ${seenCount} of ${HOTSPOTS.length} explored so far.`}
    >
      <div className="exp">
        <div className="exp-toolbar">
          <div className="segmented" role="tablist" aria-label="Diagram mode">
            <button type="button" role="tab" aria-selected={mode === 'hotspots'} onClick={() => setMode('hotspots')}>
              Explore hotspots
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'trace'}
              onClick={() => {
                setMode('trace')
                setSelected(null)
              }}
            >
              Trace a query
            </button>
          </div>
          <div className="exp-progress">
            <span className="exp-progress__label">
              <span className="tabular">
                <strong>{seenCount}</strong> of {HOTSPOTS.length} hotspots explored
              </span>
              {seenCount === HOTSPOTS.length && (
                <span className="chip chip--done">
                  <Icon name="check" />
                  All explored
                </span>
              )}
            </span>
            <Meter value={(seenCount / HOTSPOTS.length) * 100} label="Hotspots explored" />
          </div>
        </div>

        <div className="exp-stage panel" ref={stageRef}>
          <div className="exp-scroll">
            <div className="exp-diagram">
              <Diagram selected={selected} mode={mode} traceMode={traceMode} traceT={traceT} />
              {mode === 'hotspots' &&
                markers.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`exp-marker ${selected === h.id ? 'is-on' : ''} ${seen[h.id] ? 'is-seen' : ''}`}
                    style={{ left: `${(h.at[0] / 1000) * 100}%`, top: `${(h.at[1] / 640) * 100}%` }}
                    onClick={() => open(h.id)}
                    aria-pressed={selected === h.id}
                    aria-label={`Hotspot ${h.n}: ${h.title}${seen[h.id] ? ', explored' : ''}`}
                  >
                    {h.n}
                  </button>
                ))}
              {overlay && panel}
            </div>
          </div>
        </div>
        <p className="exp-scrollhint">
          <Icon name="arrow-right" /> Swipe the diagram sideways to see both shards.
        </p>
        {!overlay && panel}

        {seenCount === HOTSPOTS.length && mode === 'hotspots' && (
          <div className="callout callout--success">
            <Icon name="check-circle" />
            <div>
              <strong>All nine hotspots explored.</strong> Switch to <em>Trace a query</em>, answer the check below, then mark this
              activity as done.
            </div>
          </div>
        )}

        <details className="exp-alt">
          <summary>Text description of the diagram</summary>
          <ol>
            <li>Shop web app with a MongoDB driver. It connects to the mongos router.</li>
            <li>mongos query routers (two, for availability). They read the chunk map from the config servers.</li>
            <li>Config server replica set: three members holding the shard key, chunk ranges and chunk owners.</li>
            <li>Shard A and Shard B: each one is a replica set holding part of the products collection.</li>
            <li>Inside each shard, the primary accepts all writes for that shard.</li>
            <li>
              The primary keeps a B-tree index on stock. Root key 5; the left leaf holds 2 (Coffee) and 3 (Tea); the right leaf holds 12
              (Rice).
            </li>
            <li>The storage engine (WiredTiger) stores documents as BSON in compressed pages, with a journal.</li>
            <li>The oplog is an ordered log of changes on the primary.</li>
            <li>Two secondaries per shard tail the oplog, keep full copies, can serve possibly stale reads and vote in elections.</li>
          </ol>
        </details>

        <section className="exp-check" aria-labelledby="exp-check-title">
          <h2 id="exp-check-title" className="exp-check__title">
            Check your mental model
          </h2>
          <Predict
            prompt="If the shard key were { category: 1 }, how many shards would the low-stock query contact?"
            options={[
              { id: 'one', label: 'Only one shard' },
              { id: 'all', label: 'Every shard that holds products: scatter-gather' },
              { id: 'none', label: 'None. mongos answers from the config servers' },
              { id: 'two', label: 'Exactly two shards, always' },
            ]}
            correct="all"
            explain="The filter is on stock, not on category, so mongos cannot use the chunk map to narrow it down. It broadcasts to every shard and merges the replies. Only a filter that includes the shard key can be targeted."
          />
        </section>
      </div>
    </ActivityFrame>
  )
}
