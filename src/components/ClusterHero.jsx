import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import './ClusterHero.css'

// The lesson's story as a living diagram: a shop app writes to a three-city
// replica set, the write replicates, a read hits a secondary, the network
// splits, Riga steps down, Tallinn wins an election, and after the network
// heals Riga's unreplicated write is rolled back.

const LOOP = 17

// ---------------------------------------------------------------- geometry

const cubic = (a, b, c, d, t) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}
const curve = (p0, p1, p2, p3) => ({
  p: [p0, p1, p2, p3],
  d: `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`,
})
const straight = (a, b) =>
  curve(a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3], b)
const pointAt = (l, t) => [cubic(l.p[0][0], l.p[1][0], l.p[2][0], l.p[3][0], t), cubic(l.p[0][1], l.p[1][1], l.p[2][1], l.p[3][1], t)]

// Where a link crosses the partition line (axis x = at, or y = at), as a curve parameter.
function crossing(l, axis, at) {
  const k = axis === 'x' ? 0 : 1
  let prev = pointAt(l, 0)[k] - at
  for (let i = 1; i <= 400; i++) {
    const t = i / 400
    const cur = pointAt(l, t)[k] - at
    if (prev === 0) return (i - 1) / 400
    if (Math.sign(cur) !== Math.sign(prev)) return t - cur / (cur - prev) / 400
    prev = cur
  }
  return null
}

const RAW = {
  wide: {
    view: [640, 480],
    nodes: {
      client: { cx: 128, cy: 72, w: 176, h: 96 },
      riga: { cx: 128, cy: 252, w: 200, h: 112 },
      tallinn: { cx: 508, cy: 120, w: 200, h: 112 },
      vilnius: { cx: 508, cy: 376, w: 200, h: 112 },
    },
    links: {
      'client-riga': straight([128, 120], [128, 196]),
      'client-tallinn': curve([216, 72], [318, 72], [318, 100], [408, 100]),
      'riga-tallinn': curve([228, 234], [318, 234], [318, 140], [408, 140]),
      'riga-vilnius': curve([228, 270], [318, 270], [318, 376], [408, 376]),
      'tallinn-vilnius': straight([508, 176], [508, 320]),
    },
    partition: { axis: 'x', at: 318, from: 14, to: 448, label: [318, 464] },
    term: [608, 44],
    legend: [28, 356],
    spot: 200,
  },
  tall: {
    view: [360, 590],
    nodes: {
      client: { cx: 180, cy: 58, w: 184, h: 92 },
      riga: { cx: 180, cy: 214, w: 200, h: 112 },
      tallinn: { cx: 88, cy: 470, w: 164, h: 112 },
      vilnius: { cx: 272, cy: 470, w: 164, h: 112 },
    },
    links: {
      'client-riga': straight([180, 104], [180, 158]),
      'client-tallinn': curve([88, 58], [26, 58], [22, 300], [50, 414]),
      'riga-tallinn': curve([150, 270], [150, 342], [88, 342], [88, 414]),
      'riga-vilnius': curve([210, 270], [210, 342], [272, 342], [272, 414]),
      'tallinn-vilnius': straight([170, 470], [190, 470]),
    },
    partition: { axis: 'y', at: 342, from: 6, to: 354, label: [306, 342] },
    term: [350, 562],
    legend: null,
    spot: 160,
  },
}

// Partition line: a zigzag that passes exactly through each link crossing.
function buildLayout(raw) {
  const { axis, at, from, to } = raw.partition
  const along = (pt) => (axis === 'x' ? pt[1] : pt[0])
  const mk = (a, off) => (axis === 'x' ? [at + off, a] : [a, at + off])
  const crossings = {}
  const list = []
  for (const [id, l] of Object.entries(raw.links)) {
    const tc = crossing(l, axis, at)
    if (tc == null) continue
    const pt = pointAt(l, tc)
    crossings[id] = tc
    list.push({ id, pt })
  }
  list.sort((a, b) => along(a.pt) - along(b.pt))
  const pts = [mk(from, 7)]
  let prev = from
  list.forEach((c, i) => {
    pts.push(mk((prev + along(c.pt)) / 2, i % 2 ? 13 : -13))
    pts.push(c.pt)
    prev = along(c.pt)
  })
  pts.push(mk((prev + to) / 2, list.length % 2 ? 13 : -13))
  pts.push(mk(to, -5))
  // Fraction of the line's length at each crossing, for timing the sparks.
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  const total = seg.reduce((a, b) => a + b, 0)
  let acc = 0
  const sparks = []
  pts.forEach((p, i) => {
    if (i > 0) acc += seg[i - 1]
    const hit = list.find((c) => c.pt === p)
    if (hit) sparks.push({ pt: p, s: acc / total })
  })
  const mid = list.length ? list[Math.floor(list.length / 2)].pt : mk((from + to) / 2, 0)
  return {
    ...raw,
    crossings,
    sparks,
    cutPath: 'M ' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L '),
    cutMid: mid,
  }
}
const LAYOUTS = { wide: buildLayout(RAW.wide), tall: buildLayout(RAW.tall) }

// ---------------------------------------------------------------- timing

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const prog = (t, a, b) => clamp01((t - a) / (b - a))
const easeOut = (p) => 1 - Math.pow(1 - p, 3)
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const lerp = (a, b, p) => a + (b - a) * p

const PHASES = [
  { id: 'write', label: 'Write', start: 0, end: 1.5, jump: 0.36, still: 0.85 },
  {
    id: 'replicate',
    label: 'Replicate',
    start: 1.5,
    end: 4.3,
    jump: 1.5,
    still: 2.15,
  },
  { id: 'read', label: 'Read', start: 4.3, end: 6.3, jump: 4.3, still: 5.55 },
  {
    id: 'partition',
    label: 'Partition',
    start: 6.3,
    end: 9.3,
    jump: 6.3,
    still: 9.15,
  },
  {
    id: 'election',
    label: 'Election',
    start: 9.3,
    end: 11.9,
    jump: 9.3,
    still: 10.55,
  },
  {
    id: 'heal',
    label: 'Heal',
    start: 11.9,
    end: LOOP,
    jump: 11.9,
    still: 13.95,
  },
]
const REST = 3.6 // the still frame shown with reduced motion: replicated and acknowledged

const ROUTES = {
  'client>riga': ['client-riga', 1],
  'riga>client': ['client-riga', -1],
  'client>tallinn': ['client-tallinn', 1],
  'tallinn>client': ['client-tallinn', -1],
  'riga>tallinn': ['riga-tallinn', 1],
  'tallinn>riga': ['riga-tallinn', -1],
  'riga>vilnius': ['riga-vilnius', 1],
  'tallinn>vilnius': ['tallinn-vilnius', 1],
  'vilnius>tallinn': ['tallinn-vilnius', -1],
}

// Messages on the wire: [from, to, start, end, kind, label]
const MESSAGES = [
  ['client', 'riga', 0.4, 1.3, 'write', '$inc: 10'],
  ['riga', 'tallinn', 1.6, 2.6, 'repl', 'oplog +10'],
  ['riga', 'vilnius', 1.6, 2.6, 'repl'],
  ['riga', 'client', 2.7, 3.3, 'ack', 'ack'],
  ['client', 'tallinn', 4.4, 5.1, 'read', 'find'],
  ['tallinn', 'client', 5.2, 5.9, 'read', '13'],
  ['client', 'riga', 7.2, 8.0, 'write', '$inc: 1 · w:1'],
  ['riga', 'client', 8.1, 8.6, 'ack', 'ack'],
  ['riga', 'tallinn', 8.3, 9.3, 'lost', 'oplog +1'],
  ['riga', 'vilnius', 8.3, 9.3, 'lost'],
  ['tallinn', 'vilnius', 9.8, 10.3, 'vote', 'vote?'],
  ['vilnius', 'tallinn', 10.3, 10.8, 'vote', 'yes'],
  ['tallinn', 'riga', 12.8, 13.6, 'repl', 'sync'],
]

const VALUES = {
  riga: [
    [0, 3],
    [1.3, 13, 'up'],
    [8.0, 14, 'bad'],
    [13.6, 13, 'rollback'],
  ],
  tallinn: [
    [0, 3],
    [2.6, 13, 'up'],
  ],
  vilnius: [
    [0, 3],
    [2.6, 13, 'up'],
  ],
  client: [
    [0, 3],
    [3.3, 13, 'up'],
    [5.9, 13, 'read'],
    [8.6, 14, 'bad'],
  ],
}

const OPLOG = {
  riga: [
    { at: 1.3, label: '+10' },
    { at: 8.0, label: '+1', tone: 'bad', removeAt: 13.6 },
  ],
  tallinn: [{ at: 2.6, label: '+10' }],
  vilnius: [{ at: 2.6, label: '+10' }],
}

const RIPPLES = [
  ['riga', 1.3, 'up'],
  ['tallinn', 2.6, 'repl'],
  ['vilnius', 2.6, 'repl'],
  ['client', 3.3, 'repl'],
  ['tallinn', 5.1, 'read'],
  ['client', 5.9, 'read'],
  ['riga', 8.0, 'bad'],
  ['client', 8.6, 'bad'],
  ['tallinn', 10.8, 'primary'],
  ['riga', 13.6, 'repl'],
  ['riga', 14.5, 'soft'],
  ['tallinn', 14.75, 'soft'],
  ['vilnius', 15.0, 'soft'],
]

const STATUS = [
  [0, 'in stock', 'muted'],
  [0.4, 'saving…', 'write'],
  [3.3, 'saved · majority', 'ok'],
  [4.4, 'reading…', 'read'],
  [5.9, 'read from Tallinn', 'read'],
  [7.2, 'saving · w:1…', 'write'],
  [8.6, 'saved · w:1 only', 'bad'],
  [13.6, "ack'd 14 · rolled back", 'bad'],
]

const LINES = [
  [0, 'db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } })', 'ok'],
  [1.3, 'Riga applies it · oplog → Tallinn, Vilnius (waiting for a majority)', 'ok'],
  [2.7, 'acknowledged · w: "majority" · every node holds stock 13', 'ok'],
  [4.3, 'find({ _id: "p1" }) · readPreference: "secondary" → Tallinn returns 13', 'ok'],
  [6.3, 'network partition: Riga and its shop app lose Tallinn and Vilnius', 'bad'],
  [7.2, 'w: 1 write accepted by Riga · stock 14 never reaches a majority', 'bad'],
  [9.3, 'Riga cannot see a majority → steps down', 'bad'],
  [9.8, 'Tallinn and Vilnius hold an election · Tallinn is primary for term 2', 'warn'],
  [11.9, 'network healed · Riga rejoins as a secondary and syncs', 'warn'],
  [13.6, 'rollback: the unreplicated stock 14 is undone · all nodes agree on 13', 'ok'],
]

// Where the soft spotlight sits over time.
const FOCUS = [
  [0, 'client'],
  [0.9, 'riga'],
  [1.6, 'riga'],
  [2.4, 'right'],
  [3.0, 'client'],
  [4.3, 'client'],
  [5.0, 'tallinn'],
  [5.8, 'client'],
  [6.5, 'cut'],
  [7.6, 'riga'],
  [8.7, 'cut'],
  [9.5, 'riga'],
  [10.2, 'right'],
  [10.9, 'tallinn'],
  [12.3, 'cut'],
  [13.5, 'riga'],
  [14.4, 'riga'],
  [15.4, 'center'],
  [LOOP, 'client'],
]

const lastAt = (list, t) => {
  let hit = list[0]
  for (const e of list) if (e[0] <= t) hit = e
  return hit
}

function valueAt(id, t) {
  const list = VALUES[id]
  let i = 0
  for (let k = 0; k < list.length; k++) if (list[k][0] <= t) i = k
  const [at, value, tone] = list[i]
  const prev = i > 0 ? list[i - 1][1] : value
  return {
    value,
    prev,
    p: i === 0 ? 1 : easeOut(prog(t, at, at + 0.5)),
    flash: i > 0 && t - at < 1 ? tone : null,
  }
}

function scene(t) {
  const cutIn = easeOut(prog(t, 6.3, 6.9))
  const cutOut = easeOut(prog(t, 11.9, 12.5))
  const cut = t < 11.9 ? cutIn : 1 - cutOut

  const roles = {
    riga: t < 9.3 ? 'primary' : 'secondary',
    tallinn: t < 9.8 ? 'secondary' : t < 10.8 ? 'candidate' : 'primary',
    vilnius: 'secondary',
  }
  const primary = roles.riga === 'primary' ? 'riga' : roles.tallinn === 'primary' ? 'tallinn' : null

  const packets = []
  for (const [from, to, a, b, kind, label] of MESSAGES) {
    if (t < a || t >= b) continue
    const [link, dir] = ROUTES[`${from}>${to}`]
    packets.push({ link, dir, p: prog(t, a, b), kind, label })
  }

  // Heartbeats both ways on the replica links, every 2.2 s.
  const beats = []
  ;['riga-tallinn', 'riga-vilnius', 'tallinn-vilnius'].forEach((link, i) => {
    for (const dir of [1, -1]) {
      const phase = (t + i * 0.37 + (dir < 0 ? 1.1 : 0)) % 2.2
      if (phase < 0.9) beats.push({ link, dir, p: phase / 0.9 })
    }
  })

  const [, line, tone] = lastAt(LINES, t)
  const [, status, statusTone] = lastAt(STATUS, t)
  const term =
    t < 9.3
      ? { n: 1, text: 'TERM 1 · PRIMARY RIGA', tone: 'ok' }
      : t < 10.8
        ? { n: 1, text: 'TERM 1 · NO PRIMARY', tone: 'bad' }
        : {
            n: 2,
            text: 'TERM 2 · PRIMARY TALLINN',
            tone: t < 11.8 ? 'flash' : 'ok',
          }

  let fade = 1
  if (t < 0.35) fade = prog(t, 0, 0.35)
  else if (t > 16.3) fade = 1 - prog(t, 16.3, 16.8)

  return {
    t,
    cut,
    roles,
    primary,
    packets,
    beats,
    line,
    tone,
    status,
    statusTone,
    term,
    fade,
    down: t >= 9.3 && t < 12.5,
  }
}

// ---------------------------------------------------------------- drawing

function resolveFocus(L, key) {
  if (key === 'right') return [(L.nodes.tallinn.cx + L.nodes.vilnius.cx) / 2, (L.nodes.tallinn.cy + L.nodes.vilnius.cy) / 2]
  if (key === 'cut') return L.cutMid
  if (key === 'center') return [L.view[0] / 2, L.view[1] / 2]
  return [L.nodes[key].cx, L.nodes[key].cy]
}
function focusAt(L, t) {
  let i = 0
  while (i < FOCUS.length - 2 && FOCUS[i + 1][0] <= t) i++
  const [ta, a] = FOCUS[i]
  const [tb, b] = FOCUS[i + 1]
  const p = easeInOut(prog(t, ta, tb))
  const pa = resolveFocus(L, a)
  const pb = resolveFocus(L, b)
  return [lerp(pa[0], pb[0], p), lerp(pa[1], pb[1], p)]
}

const along = (L, link, dir, q) => pointAt(L.links[link], dir > 0 ? q : 1 - q)
const stopFor = (L, link, dir) => {
  const tc = L.crossings[link]
  return tc == null ? null : dir > 0 ? tc : 1 - tc
}
const labelWidth = (s) => Math.round(s.length * 6.1 + 14)

function Packet({ L, pk }) {
  let q
  let burst = 0
  if (pk.kind === 'lost') {
    const stop = stopFor(L, pk.link, pk.dir) ?? 0.5
    q = stop * easeInOut(clamp01(pk.p / 0.55))
    burst = prog(pk.p, 0.55, 1)
  } else {
    q = easeInOut(pk.p)
  }
  const [x, y] = along(L, pk.link, pk.dir, q)
  const trail = []
  if (!burst) {
    for (let k = 1; k <= 5; k++) {
      const qk = q - k * 0.035
      if (qk <= 0) break
      const [tx, ty] = along(L, pk.link, pk.dir, qk)
      trail.push(<circle key={k} cx={tx} cy={ty} r={5.2 - k * 0.75} opacity={0.42 - k * 0.07} />)
    }
  }
  const showLabel = pk.label && !burst
  const lw = showLabel ? labelWidth(pk.label) : 0
  return (
    <g className={`ch-packet ch-packet--${pk.kind}`}>
      {trail}
      <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
        {burst ? (
          <>
            <circle className="ch-packet__ring" r={7 + burst * 16} opacity={1 - burst} />
            <path className="ch-packet__x" d="M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5" opacity={1 - burst} />
          </>
        ) : (
          <circle r="6.5" filter="url(#ch-glow)" />
        )}
        {showLabel && (
          <g className="ch-chip" transform="translate(0 -24)">
            <rect x={-lw / 2} y="-10" width={lw} height="19" rx="9.5" />
            <text y="3.5" textAnchor="middle">
              {pk.label}
            </text>
          </g>
        )}
      </g>
    </g>
  )
}

function Beat({ L, b, cut }) {
  const stop = cut > 0.5 ? stopFor(L, b.link, b.dir) : null
  let q = b.p
  let o = Math.sin(Math.PI * b.p)
  if (stop != null && q > stop) {
    o *= Math.max(0, 1 - (q - stop) * 6)
    q = stop
  }
  if (o <= 0.02) return null
  const [x, y] = along(L, b.link, b.dir, q)
  return <circle className="ch-beat" cx={x} cy={y} r="2.3" opacity={o * 0.8} />
}

function Sparks({ L, t }) {
  const out = []
  for (const [i, sp] of L.sparks.entries()) {
    const start = 6.3 + 0.6 * (1 - Math.cbrt(1 - sp.s))
    const q = prog(t, start, start + 0.75)
    if (q <= 0 || q >= 1) continue
    const e = easeOut(q)
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + i
      const d = 3 + e * (14 + (k % 3) * 5)
      out.push(
        <circle
          key={`${i}-${k}`}
          className="ch-spark"
          cx={sp.pt[0] + Math.cos(a) * d}
          cy={sp.pt[1] + Math.sin(a) * d}
          r={1.8 * (1 - q) + 0.3}
          opacity={1 - q}
        />,
      )
    }
  }
  return out
}

function Ripples({ L, t }) {
  return RIPPLES.map(([id, at, tone], i) => {
    const q = prog(t, at, at + (tone === 'primary' ? 1.2 : 0.9))
    if (q <= 0 || q >= 1) return null
    const n = L.nodes[id]
    const grow = tone === 'primary' ? 22 : tone === 'soft' ? 10 : 16
    const e = easeOut(q)
    const w = n.w + e * grow * 2
    const h = n.h + e * grow * 2
    return (
      <rect
        key={i}
        className={`ch-ripple tone-${tone}`}
        x={n.cx - w / 2}
        y={n.cy - h / 2}
        width={w}
        height={h}
        rx={14 + e * grow * 0.6}
        opacity={(1 - q) * (tone === 'soft' ? 0.5 : 0.9)}
      />
    )
  })
}

function Odometer({ id, v, x, y, size, clip }) {
  const shift = size * 1.15
  return (
    <g clipPath={`url(#${clip})`}>
      {v.p < 1 && (
        <text className="ch-num" x={x} y={y - v.p * shift} opacity={1 - v.p} textAnchor="end" fontSize={size}>
          {v.prev}
        </text>
      )}
      <text
        key={`${id}-${v.value}`}
        className={`ch-num ${v.flash ? `flash-${v.flash}` : ''}`}
        x={x}
        y={y + (1 - v.p) * shift}
        opacity={v.p}
        textAnchor="end"
        fontSize={size}
      >
        {v.value}
      </text>
    </g>
  )
}

const PILL = {
  primary: { text: 'PRIMARY', wide: 62, compact: 54 },
  secondary: { text: 'SECONDARY', wide: 76, compact: 62 },
  candidate: { text: 'CANDIDATE', wide: 76, compact: 62 },
}

function DbNode({ L, id, s }) {
  const n = L.nodes[id]
  const compact = n.w < 180
  const role = s.roles[id]
  const v = valueAt(id, s.t)
  const isolated = id === 'riga' && s.cut > 0.5
  const down = id === 'riga' && s.down
  const clip = `ch-clip-${id}`
  const ops = OPLOG[id]
  return (
    <g
      className={`ch-node role-${role} ${isolated ? 'is-isolated' : ''} ${down ? 'is-down' : ''} ${v.flash ? `flash-${v.flash}` : ''}`}
      transform={`translate(${n.cx - n.w / 2} ${n.cy - n.h / 2})`}
    >
      <rect className="ch-node__halo" x="-3" y="-3" width={n.w + 6} height={n.h + 6} rx="17" />
      <rect className="ch-node__box" width={n.w} height={n.h} rx="14" />
      <defs>
        <clipPath id={clip}>
          <rect x={n.w - 84} y="46" width="72" height="36" />
        </clipPath>
      </defs>
      <g className="ch-node__content">
        <text className="ch-node__city" x="14" y="27" fontSize={compact ? 11 : 12.5} style={compact ? { letterSpacing: '0.02em' } : undefined}>
          {id.toUpperCase()}
        </text>
        {Object.entries(PILL).map(([r, pill]) => {
          const w = compact ? pill.compact : pill.wide
          return (
            <g key={r} className={`ch-pill ch-pill--${r} ${role === r ? 'is-on' : ''}`} transform={`translate(${n.w - 12 - w} 14)`}>
              <rect width={w} height="18" rx="9" />
              <text x={w / 2} y="12.4" textAnchor="middle" fontSize={compact ? 6.8 : 8}>
                {pill.text}
              </text>
            </g>
          )
        })}
        <line className="ch-node__rule" x1="14" x2={n.w - 14} y1="40" y2="40" />
        <text className="ch-node__key" x="14" y="68">
          {compact ? 'Tea · stock' : 'p1 · Tea · stock'}
        </text>
        <Odometer id={id} v={v} x={n.w - 14} y={75} size={24} clip={clip} />
        <text className="ch-node__oplabel" x="14" y={n.h - 13}>
          oplog
        </text>
        {[0, 1].map((i) => (
          <rect key={i} className="ch-op__slot" x={52 + i * 32} y={n.h - 24} width="28" height="13" rx="3.5" />
        ))}
        {ops.map((op, i) => {
          const appear = easeOut(prog(s.t, op.at, op.at + 0.4))
          if (appear <= 0) return null
          const strike = op.removeAt ? prog(s.t, op.removeAt, op.removeAt + 0.3) : 0
          const gone = op.removeAt ? easeOut(prog(s.t, op.removeAt + 0.3, op.removeAt + 0.8)) : 0
          if (gone >= 1) return null
          const x = 52 + i * 32
          return (
            <g
              key={i}
              className={`ch-op ${op.tone === 'bad' ? 'is-bad' : ''}`}
              transform={`translate(${x - (1 - appear) * 8} ${n.h - 24 - gone * 7})`}
              opacity={appear * (1 - gone)}
            >
              <rect width="28" height="13" rx="3.5" />
              <text x="14" y="9.6" textAnchor="middle">
                {op.label}
              </text>
              {strike > 0 && <line className="ch-op__strike" x1="3" y1="6.5" x2={3 + 22 * strike} y2="6.5" />}
            </g>
          )
        })}
      </g>
    </g>
  )
}

function ClientNode({ L, s }) {
  const n = L.nodes.client
  const v = valueAt('client', s.t)
  const sending = s.packets.some((p) => p.link.startsWith('client') && ((p.dir > 0 && p.p < 0.35) || (p.dir < 0 && p.p > 0.65)))
  return (
    <g className={`ch-client ${v.flash ? `flash-${v.flash}` : ''}`} transform={`translate(${n.cx - n.w / 2} ${n.cy - n.h / 2})`}>
      <rect className="ch-client__box" width={n.w} height={n.h} rx="14" />
      <defs>
        <clipPath id="ch-clip-client">
          <rect x={n.w - 76} y="38" width="54" height="26" />
        </clipPath>
      </defs>
      <text className="ch-client__label" x="14" y="21">
        SHOP APP
      </text>
      <circle className={`ch-client__dot ${sending ? 'is-busy' : ''}`} cx={n.w - 18} cy="17" r="3.5" />
      <rect className="ch-client__screen" x="10" y="30" width={n.w - 20} height={n.h - 40} rx="9" />
      <text className="ch-client__item" x="22" y="56">
        Tea
      </text>
      <Odometer id="client" v={v} x={n.w - 22} y={58} size={18} clip="ch-clip-client" />
      <text key={s.status} className={`ch-client__status tone-${s.statusTone}`} x="22" y={n.h - 18}>
        {s.status}
      </text>
    </g>
  )
}

const LEGEND = [
  ['write', 'write'],
  ['repl', 'replication'],
  ['read', 'read'],
  ['beat', 'heartbeat'],
]

// ---------------------------------------------------------------- component

export default function ClusterHero() {
  const reduce = useReducedMotion()
  const [t, setT] = useState(reduce ? REST : 0.36)
  const [playing, setPlaying] = useState(!reduce)
  const [layout, setLayout] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 560 ? 'tall' : 'wide'))
  const ref = useRef(null)
  const timeRef = useRef(t)
  const visible = useRef(true)

  // Reduced motion (it can resolve after the first render): stop on a meaningful still frame.
  const [reduceSeen, setReduceSeen] = useState(reduce)
  if (reduce !== reduceSeen) {
    setReduceSeen(reduce)
    if (reduce) {
      setPlaying(false)
      setT(REST)
    }
  }

  // Pick the layout from the space the diagram actually gets.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLayout(e.contentRect.width < 500 ? 'tall' : 'wide'))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = ref.current
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.05 })
    if (el) io.observe(el)
    if (!playing) return () => io.disconnect()
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visible.current && !document.hidden) {
        timeRef.current = (timeRef.current + dt) % LOOP
        setT(timeRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [playing])

  const jump = (ph) => {
    const nt = playing ? ph.jump : ph.still
    timeRef.current = nt
    setT(nt)
  }
  const toggle = () => {
    if (!playing && reduce) {
      timeRef.current = 0.36
      setT(0.36)
    }
    setPlaying((p) => !p)
  }

  const L = LAYOUTS[layout]
  const s = scene(t)
  const [vw, vh] = L.view
  const [fx, fy] = focusAt(L, t)
  const active = new Set(s.packets.map((p) => p.link))
  const phaseIdx = PHASES.findIndex((ph) => t >= ph.start && t < ph.end)

  const linkClass = (id) => {
    const cut = s.cut > 0.5 && L.crossings[id] != null
    let flow = ''
    if (!cut && s.primary) {
      if (s.primary === 'riga' && (id === 'riga-tallinn' || id === 'riga-vilnius')) flow = 'is-flow'
      if (s.primary === 'tallinn' && id === 'tallinn-vilnius') flow = 'is-flow'
      if (s.primary === 'tallinn' && id === 'riga-tallinn') flow = 'is-flow is-rev'
    }
    return `ch-link ${id.startsWith('client') ? 'ch-link--client' : ''} ${cut ? 'is-cut' : ''} ${active.has(id) ? 'is-active' : ''} ${flow}`
  }

  return (
    <figure className={`cluster-hero layout-${layout} ${playing ? '' : 'is-paused'}`} ref={ref}>
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        className="cluster-hero__svg"
        role="img"
        aria-label="Animated diagram: a shop app writes to a three-node replica set in Riga, Tallinn and Vilnius. The write replicates, a read is served by Tallinn, a network partition isolates Riga, Tallinn and Vilnius elect Tallinn as primary, and after the network heals Riga's unreplicated write is rolled back."
      >
        <defs>
          <pattern id="ch-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" className="ch-dot" />
          </pattern>
          <radialGradient id="ch-spot-g">
            <stop offset="0" className="ch-spot__stop" stopOpacity="0.2" />
            <stop offset="1" className="ch-spot__stop" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ch-iso-g">
            <stop offset="0" className="ch-iso__stop" stopOpacity="0.16" />
            <stop offset="1" className="ch-iso__stop" stopOpacity="0" />
          </radialGradient>
          <filter id="ch-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ch-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={vw} height={vh} fill="url(#ch-dots)" opacity="0.5" />
        <circle className={`ch-spot tone-${s.tone}`} cx={fx} cy={fy} r={L.spot} fill="url(#ch-spot-g)" />

        <g opacity={s.fade}>
          {/* soft coral glow over the isolated side */}
          {s.cut > 0 && (
            <circle
              className="ch-iso"
              cx={L.nodes.riga.cx}
              cy={(L.nodes.riga.cy + L.nodes.client.cy) / 2}
              r={L.spot * 1.25}
              fill="url(#ch-iso-g)"
              opacity={s.cut}
            />
          )}

          {Object.entries(L.links).map(([id, l]) => (
            <path key={id} d={l.d} className={linkClass(id)} />
          ))}

          {s.beats.map((b, i) => (
            <Beat key={i} L={L} b={b} cut={s.cut} />
          ))}

          {/* partition */}
          {s.cut > 0 && (
            <g className="ch-cut">
              <path
                className="ch-cut__glow"
                d={L.cutPath}
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset={1 - s.cut}
                filter="url(#ch-soft)"
              />
              <path className="ch-cut__line" d={L.cutPath} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - s.cut} />
              <g transform={`translate(${L.partition.label[0]} ${L.partition.label[1]})`} opacity={clamp01(s.cut * 1.6 - 0.4)}>
                <rect x="-46" y="-11" width="92" height="22" rx="11" className="ch-cut__pill" />
                <text y="3.8" textAnchor="middle" className="ch-cut__label">
                  PARTITION
                </text>
              </g>
            </g>
          )}
          <Sparks L={L} t={t} />

          <Ripples L={L} t={t} />
          <ClientNode L={L} s={s} />
          <DbNode L={L} id="riga" s={s} />
          <DbNode L={L} id="tallinn" s={s} />
          <DbNode L={L} id="vilnius" s={s} />

          {s.packets.map((pk, i) => (
            <Packet key={i} L={L} pk={pk} />
          ))}

          <text className={`ch-term tone-${s.term.tone}`} x={L.term[0]} y={L.term[1]} textAnchor="end">
            {s.term.text}
          </text>

          {L.legend && (
            <g className="ch-legend" transform={`translate(${L.legend[0]} ${L.legend[1]})`}>
              {LEGEND.map(([kind, label], i) => (
                <g key={kind} transform={`translate(0 ${i * 19})`}>
                  <circle className={`ch-legend__dot ch-packet--${kind}`} cx="5" cy="-4" r={kind === 'beat' ? 2.3 : 4.5} />
                  <text x="18" y="0">
                    {label}
                  </text>
                </g>
              ))}
            </g>
          )}
        </g>
      </svg>

      <figcaption className="cluster-hero__caption">
        <div className={`cluster-hero__readout tone-${s.tone}`} aria-hidden="true">
          <span className="cluster-hero__prompt">›</span>
          <span className="cluster-hero__line" key={s.line}>
            {s.line}
          </span>
          <span className="cluster-hero__caret" />
        </div>
        <div className="cluster-hero__timeline">
          <button
            type="button"
            className="cluster-hero__play"
            onClick={toggle}
            aria-label={playing ? 'Pause the animation' : 'Play the animation'}
            aria-pressed={!playing}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3.5" y="3" width="3" height="10" rx="1" />
                <rect x="9.5" y="3" width="3" height="10" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.4 2.7a.6.6 0 0 0-.9.5z" />
              </svg>
            )}
          </button>
          <ol className="cluster-hero__phases">
            {PHASES.map((ph, i) => {
              const fill = i < phaseIdx ? 1 : i > phaseIdx ? 0 : prog(t, ph.start, ph.end)
              return (
                <li key={ph.id}>
                  <button
                    type="button"
                    className={`cluster-hero__phase ${i === phaseIdx ? 'is-current' : ''} ${i < phaseIdx ? 'is-done' : ''}`}
                    aria-current={i === phaseIdx ? 'step' : undefined}
                    onClick={() => jump(ph)}
                  >
                    <span className="cluster-hero__phasebar" aria-hidden="true">
                      <span style={{ transform: `scaleX(${fill})` }} />
                    </span>
                    <span className="cluster-hero__phaselabel">{ph.label}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </figcaption>
    </figure>
  )
}
