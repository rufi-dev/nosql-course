// Motion kit for the lecture scenes. Every scene renders deterministically
// from its local time t (seconds), so pausing and scrubbing always show the
// exact frame. Scenes draw on a fixed 960 x 540 canvas that the player scales.
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'
import { Highlight } from '../../components/CodeBlock.jsx'

export const W = 960
export const H = 540

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
export const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
export const lerp = (a, b, k) => a + (b - a) * k

export function makeFx(reduce) {
  const ramp = (t, start, dur = 0.9) => (reduce ? clamp01((t - start) / 0.35) : expoOut(clamp01((t - start) / dur)))
  // move along a path: smooth in-out, linear-ish for travelling packets
  const travel = (t, start, dur = 1.2) => (reduce ? (t >= start + dur ? 1 : t >= start ? 0.5 : 0) : inOut(clamp01((t - start) / dur)))
  // visible between a and b with fade in and out
  const win = (t, a, b, din = 0.8, dout = 0.5) => Math.min(ramp(t, a, din), 1 - ramp(t, b, dout))
  return { reduce, m: reduce ? 0 : 1, ramp, travel, win }
}

export const FxContext = createContext(makeFx(false))
export const useFx = () => useContext(FxContext)

// Point along a polyline for progress k in [0, 1].
export function pointAt(points, k) {
  if (points.length === 1) return points[0]
  const segs = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    const len = Math.hypot(x2 - x1, y2 - y1)
    segs.push(len)
    total += len
  }
  let d = clamp01(k) * total
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 1
      const [x1, y1] = points[i]
      const [x2, y2] = points[i + 1]
      return [lerp(x1, x2, f), lerp(y1, y2, f)]
    }
    d -= segs[i]
  }
  return points[points.length - 1]
}

// Absolutely positioned element that fades and rises in with progress k.
export function At({
  x,
  y,
  k = 1,
  dx = 0,
  dy = 14,
  from,
  blur = false,
  anchor,
  w,
  className = '',
  style,
  children,
  ...rest
}) {
  const fx = useFx()
  const inv = (1 - k) * fx.m
  const tf = []
  if (anchor === 'center') tf.push('translate(-50%, -50%)')
  else if (anchor === 'x') tf.push('translateX(-50%)')
  else if (anchor === 'y') tf.push('translateY(-50%)')
  else if (anchor === 'right') tf.push('translateX(-100%)')
  if (inv > 0.0005) tf.push(`translate(${dx * inv}px, ${dy * inv}px)`)
  if (from && inv > 0.0005) tf.push(`scale(${lerp(1, from, inv)})`)
  return (
    <div
      className={`lec-at ${className}`}
      style={{
        left: x,
        top: y,
        width: w,
        opacity: k,
        transform: tf.length ? tf.join(' ') : undefined,
        filter: blur && inv > 0.01 ? `blur(${(inv * 8).toFixed(2)}px)` : undefined,
        visibility: k <= 0.002 ? 'hidden' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

// Kinetic text: words rise in one after another.
export function Words({ text, t, start, per = 0.06, dur = 0.8, className = '' }) {
  const fx = useFx()
  const words = text.split(' ')
  return (
    <span className={className}>
      {words.map((w, i) => {
        const k = fx.ramp(t, start + i * per, dur)
        return (
          <span key={i}>
            <span
              className="lec-word"
              style={{ opacity: k, transform: fx.m && k < 1 ? `translateY(${((1 - k) * 0.45).toFixed(3)}em)` : undefined }}
            >
              {w}
            </span>{' '}
          </span>
        )
      })}
    </span>
  )
}

// SVG path that draws itself as k goes 0 -> 1.
export function Draw({ d, k = 1, color = 'var(--rack-ink-3)', width = 2, dashed = false, arrow, opacity = 1, className }) {
  if (k <= 0.001) return null
  const style = { stroke: color, strokeWidth: width, opacity: dashed ? opacity * k : opacity, fill: 'none' }
  return (
    <path
      d={d}
      className={className}
      style={style}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(dashed
        ? { strokeDasharray: '5 7' }
        : { pathLength: 1, strokeDasharray: '1', strokeDashoffset: (1 - k).toFixed(4) })}
      markerEnd={arrow && k > 0.97 ? `url(#${arrow})` : undefined}
    />
  )
}

export function ArrowDefs({ id = 'lec-arrow', color = 'var(--rack-ink-3)', extra = [] }) {
  const all = [{ id, color }, ...extra]
  return (
    <defs>
      {all.map((m) => (
        <marker key={m.id} id={m.id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" style={{ fill: m.color }} />
        </marker>
      ))}
    </defs>
  )
}

// A glowing packet travelling along points.
export function Packet({ points, k, color = 'var(--saffron)', r = 7, visible = true, label }) {
  if (!visible || k <= 0 || k > 1.0001) return null
  const [x, y] = pointAt(points, k)
  return (
    <g>
      <circle cx={x} cy={y} r={r + 7} style={{ fill: color, opacity: 0.18 }} />
      <circle cx={x} cy={y} r={r} style={{ fill: color }} />
      {label ? (
        <text x={x} y={y - r - 10} textAnchor="middle" className="lec-svgtext lec-svgtext--strong" style={{ fill: color }}>
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function Code({ children, className = '' }) {
  return (
    <code className={`lec-code ${className}`}>
      <Highlight code={children} lang="js" />
    </code>
  )
}

export function Pill({ tone = 'plain', children, className = '', style }) {
  return (
    <span className={`lec-pill lec-pill--${tone} ${className}`} style={style}>
      {children}
    </span>
  )
}

// Server / replica card.
export function NodeCard({ role, tone = 'plain', city, rows = [], className = '', style, badge, children }) {
  return (
    <div className={`lec-node lec-node--${tone} ${className}`} style={style}>
      <div className="lec-node__head">
        <span className={`lec-node__role lec-node__role--${tone}`}>{role}</span>
        {badge}
      </div>
      {city ? <div className="lec-node__city">{city}</div> : null}
      {rows.map((r) => (
        <div key={r.k} className={`lec-node__row ${r.flash ? 'is-flash' : ''} ${r.tone ? `is-${r.tone}` : ''}`}>
          <span>{r.k}</span>
          <strong>{r.v}</strong>
        </div>
      ))}
      {children}
    </div>
  )
}

// Small inline icons for scenes (person, lock, cross, check, clock).
export function Glyph({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  switch (name) {
    case 'person':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      )
    case 'crown':
      return (
        <svg {...common}>
          <path d="M4 17.5h16l-1.5-9-4.5 4-2-6-2 6-4.5-4-1.5 9Z" />
        </svg>
      )
    default:
      return null
  }
}
