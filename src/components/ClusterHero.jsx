import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import './ClusterHero.css'

// Ambient but meaningful: a three-city replica set that loops through the
// lesson's story. Write, replicate, read, partition, election, heal, rollback.

const LOOP = 15.5
const NODES = {
  client: { x: 70, y: 96, label: 'Shop app' },
  riga: { x: 214, y: 262, label: 'Riga' },
  tallinn: { x: 512, y: 112, label: 'Tallinn' },
  vilnius: { x: 506, y: 418, label: 'Vilnius' },
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const easeOut = (p) => 1 - Math.pow(1 - p, 3)
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const prog = (t, a, b) => clamp01((t - a) / (b - a))
const lerp = (a, b, p) => a + (b - a) * p

function packetPos(from, to, p, stopAt = 1) {
  const q = Math.min(p, stopAt)
  const e = easeInOut(q)
  return { x: lerp(NODES[from].x, NODES[to].x, e), y: lerp(NODES[from].y, NODES[to].y, e) }
}

// Narrative state at time t (seconds into the loop)
function stateAt(t) {
  const s = {
    values: { riga: 3, tallinn: 3, vilnius: 3 },
    flash: {},
    primary: 'riga',
    stepping: false,
    cut: 0, // 0..1 draw progress of the partition line
    packets: [],
    line: '',
    tone: 'ok',
    fade: 1,
  }

  // Phase A: write + replicate
  if (t >= 0.3 && t < 1.2) s.packets.push({ ...packetPos('client', 'riga', prog(t, 0.3, 1.2)), kind: 'write', label: '$inc 10' })
  if (t >= 1.2) {
    s.values.riga = 13
    if (t < 2.0) s.flash.riga = 'up'
  }
  if (t >= 1.5 && t < 2.5) {
    const p = prog(t, 1.5, 2.5)
    s.packets.push({ ...packetPos('riga', 'tallinn', p), kind: 'repl' })
    s.packets.push({ ...packetPos('riga', 'vilnius', p), kind: 'repl' })
  }
  if (t >= 2.5) {
    s.values.tallinn = 13
    s.values.vilnius = 13
    if (t < 3.3) {
      s.flash.tallinn = 'up'
      s.flash.vilnius = 'up'
    }
  }
  if (t >= 2.6 && t < 3.3) s.packets.push({ ...packetPos('riga', 'client', prog(t, 2.6, 3.3)), kind: 'ack' })

  if (t < 1.2) s.line = 'db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } })'
  else if (t < 2.6) s.line = 'oplog → Tallinn, Vilnius   (waiting for majority)'
  else if (t < 4.5) s.line = 'acknowledged · w: "majority" · 2 of 3 nodes hold stock 13'

  // Phase B: read from a secondary
  if (t >= 4.6 && t < 5.4) s.packets.push({ ...packetPos('client', 'vilnius', prog(t, 4.6, 5.4)), kind: 'read' })
  if (t >= 5.4 && t < 6.1) s.packets.push({ ...packetPos('vilnius', 'client', prog(t, 5.4, 6.1)), kind: 'read', label: '13' })
  if (t >= 4.5 && t < 6.4) s.line = 'read  readPreference: "secondary"  →  Vilnius returns stock 13'

  // Phase C: partition
  if (t >= 6.4) s.cut = easeOut(prog(t, 6.4, 7.0))
  if (t >= 6.4 && t < 7.0) {
    s.line = 'network partition: Riga loses Tallinn and Vilnius'
    s.tone = 'bad'
  }
  if (t >= 7.0 && t < 7.8) s.packets.push({ ...packetPos('client', 'riga', prog(t, 7.0, 7.8)), kind: 'write', label: 'w: 1' })
  if (t >= 7.8) {
    s.values.riga = 14
    if (t < 8.6) s.flash.riga = 'bad'
  }
  if (t >= 8.0 && t < 8.9) {
    const p = prog(t, 8.0, 8.9)
    s.packets.push({ ...packetPos('riga', 'tallinn', p, 0.42), kind: 'lost', dead: p > 0.55 })
    s.packets.push({ ...packetPos('riga', 'vilnius', p, 0.42), kind: 'lost', dead: p > 0.55 })
  }
  if (t >= 7.0 && t < 9.0) {
    s.line = 'w: 1 accepted by Riga · stock 14 never reaches a majority'
    s.tone = 'bad'
  }
  if (t >= 9.0) s.stepping = true
  if (t >= 9.0 && t < 9.8) {
    s.line = 'Riga cannot see a majority → steps down'
    s.tone = 'bad'
  }
  if (t >= 9.8) s.primary = 'tallinn'
  if (t >= 9.8 && t < 11.2) {
    s.line = 'Tallinn + Vilnius elect a new primary · writes continue there'
    s.tone = 'warn'
  }

  // Phase D: heal + rollback
  if (t >= 11.2) s.cut = 1 - easeOut(prog(t, 11.2, 11.8))
  if (t >= 11.8 && t < 12.5) s.packets.push({ ...packetPos('tallinn', 'riga', prog(t, 11.8, 12.5)), kind: 'repl' })
  if (t >= 12.5) {
    s.values.riga = 13
    if (t < 13.3) s.flash.riga = 'rollback'
  }
  if (t >= 11.2 && t < 12.5) {
    s.line = 'network healed · Riga rejoins as a secondary'
    s.tone = 'warn'
  }
  if (t >= 12.5 && t < 14.6) {
    s.line = 'rollback: the unreplicated stock 14 is undone · all nodes agree on 13'
    s.tone = 'ok'
  }

  // Phase E: fade and reset
  if (t >= 14.6) s.fade = 1 - prog(t, 14.6, 15.2)
  if (t >= 15.2) s.fade = prog(t, 15.2, LOOP)
  return s
}

function Node({ id, state }) {
  const n = NODES[id]
  const isPrimary = state.primary === id
  const steppedDown = id === 'riga' && state.stepping && state.primary !== 'riga'
  const isolated = id === 'riga' && state.cut > 0.5
  const flash = state.flash[id]
  const w = 188
  const h = 92
  return (
    <g
      className={`ch-node ${isPrimary ? 'is-primary' : ''} ${steppedDown ? 'is-down' : ''} ${isolated ? 'is-isolated' : ''} ${flash ? `flash-${flash}` : ''}`}
      transform={`translate(${n.x - w / 2} ${n.y - h / 2})`}
    >
      <rect className="ch-node__box" width={w} height={h} rx="14" />
      <text className="ch-node__city" x="16" y="27">
        {n.label.toUpperCase()}
      </text>
      <g transform={`translate(${w - 16} 15)`}>
        <rect className="ch-node__role" x={isPrimary ? -62 : -74} y="0" width={isPrimary ? 62 : 74} height="18" rx="9" />
        <text className="ch-node__roletext" x={isPrimary ? -31 : -37} y="12.5" textAnchor="middle">
          {isPrimary ? 'PRIMARY' : 'SECONDARY'}
        </text>
      </g>
      <line className="ch-node__perf" x1="14" x2={w - 14} y1="42" y2="42" />
      <text className="ch-node__doc" x="16" y="66">
        <tspan className="ch-node__key">p1 · Tea · stock </tspan>
        <tspan className="ch-node__val">{state.values[id]}</tspan>
      </text>
      <g className="ch-node__leds" transform={`translate(${w - 40} 72)`}>
        <circle cx="0" cy="0" r="2.6" />
        <circle cx="9" cy="0" r="2.6" />
        <circle cx="18" cy="0" r="2.6" />
      </g>
    </g>
  )
}

export default function ClusterHero() {
  const reduce = useReducedMotion()
  const [t, setT] = useState(reduce ? 3.2 : 0)
  const ref = useRef(null)
  const visible = useRef(true)

  useEffect(() => {
    if (reduce) {
      setT(3.2)
      return
    }
    const el = ref.current
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.05 })
    if (el) io.observe(el)
    let raf
    let last = performance.now()
    let acc = 0
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visible.current && !document.hidden) {
        acc = (acc + dt) % LOOP
        setT(acc)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [reduce])

  const s = stateAt(t)
  const { client, riga, tallinn, vilnius } = NODES

  return (
    <figure className="cluster-hero" ref={ref}>
      <svg
        viewBox="0 0 620 520"
        className="cluster-hero__svg"
        role="img"
        aria-label="Animated diagram: a shop app writes to a three-node replica set in Riga, Tallinn and Vilnius. The write replicates, a network partition isolates Riga, Tallinn becomes primary, and after the network heals Riga's unreplicated write is rolled back."
        style={{ opacity: s.fade }}
      >
        <defs>
          <pattern id="ch-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" className="ch-dot" />
          </pattern>
          <filter id="ch-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="620" height="520" fill="url(#ch-dots)" opacity="0.55" />

        {/* links */}
        <line className="ch-link ch-link--client" x1={client.x} y1={client.y} x2={riga.x} y2={riga.y} />
        <line className="ch-link ch-link--client" x1={client.x} y1={client.y} x2={vilnius.x} y2={vilnius.y} />
        <line className={`ch-link ${s.cut > 0.5 ? 'is-cut' : ''}`} x1={riga.x} y1={riga.y} x2={tallinn.x} y2={tallinn.y} />
        <line className={`ch-link ${s.cut > 0.5 ? 'is-cut' : ''}`} x1={riga.x} y1={riga.y} x2={vilnius.x} y2={vilnius.y} />
        <line className="ch-link" x1={tallinn.x} y1={tallinn.y} x2={vilnius.x} y2={vilnius.y} />

        {/* partition */}
        {s.cut > 0 && (
          <g className="ch-cut" style={{ opacity: Math.min(1, s.cut * 1.4) }}>
            <path
              d="M 372 40 L 344 140 L 366 220 L 336 300 L 360 380 L 334 488"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - s.cut}
            />
            <g transform="translate(284 188)">
              <rect x="-4" y="-15" width="124" height="22" rx="11" className="ch-cut__pill" />
              <text x="58" y="0" textAnchor="middle" className="ch-cut__label">
                PARTITION
              </text>
            </g>
          </g>
        )}

        {/* client */}
        <g className="ch-client" transform={`translate(${client.x - 46} ${client.y - 30})`}>
          <rect width="92" height="60" rx="12" className="ch-client__box" />
          <rect x="16" y="14" width="60" height="22" rx="4" className="ch-client__screen" />
          <text x="46" y="51" textAnchor="middle" className="ch-client__label">
            SHOP APP
          </text>
        </g>

        <Node id="riga" state={s} />
        <Node id="tallinn" state={s} />
        <Node id="vilnius" state={s} />

        {/* packets */}
        {s.packets.map((p, i) => (
          <g key={i} className={`ch-packet ch-packet--${p.kind} ${p.dead ? 'is-dead' : ''}`} transform={`translate(${p.x} ${p.y})`}>
            <circle r="7" filter="url(#ch-glow)" />
            {p.kind === 'lost' && p.dead ? (
              <path d="M-5 -5 L5 5 M5 -5 L-5 5" className="ch-packet__x" />
            ) : null}
            {p.label ? (
              <text y="-14" textAnchor="middle" className="ch-packet__label">
                {p.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <figcaption className={`cluster-hero__readout tone-${s.tone}`} aria-hidden="true">
        <span className="cluster-hero__prompt">›</span>
        <span className="cluster-hero__line" key={s.line}>
          {s.line}
        </span>
        <span className="cluster-hero__caret" />
      </figcaption>
    </figure>
  )
}
