// Small shared building blocks used across pages.
import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import Icon from './Icon.jsx'

export const EASE_OUT = [0.22, 1, 0.36, 1]
export const EASE_EXPO = [0.16, 1, 0.3, 1]

export function useDocTitle(title) {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} · NoSQL & Distributed Architectures` : 'NoSQL, NewSQL and Distributed Architectures'
    return () => {
      document.title = prev
    }
  }, [title])
}

// Scroll-triggered entrance. Rises and un-blurs once.
export function Reveal({ children, delay = 0, y = 18, as = 'div', className, style, amount = 0.25, ...rest }) {
  const reduce = useReducedMotion()
  const Comp = motion[as] || motion.div
  return (
    <Comp
      className={className}
      style={style}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.8, ease: EASE_EXPO, delay }}
      {...rest}
    >
      {children}
    </Comp>
  )
}

// Number that counts up when it enters the viewport.
export function CountUp({ to, duration = 1.2, suffix = '', className }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const [val, setVal] = useState(reduce ? to : 0)
  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) setVal(to)
      return
    }
    let raf
    const start = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - start) / (duration * 1000))
      const eased = 1 - Math.pow(1 - p, 4)
      setVal(Math.round(to * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, duration, reduce])
  return (
    <span ref={ref} className={className}>
      {val}
      {suffix}
    </span>
  )
}

export function Meter({ value, dark = false, label, className = '' }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div
      className={`meter ${dark ? 'meter--dark' : ''} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={label}
    >
      <div className="meter__fill" style={{ transform: `scaleX(${v / 100})` }} />
    </div>
  )
}

// Circular progress ring
export function Ring({ value, size = 36, stroke = 3.5, track = 'var(--paper-3)', color = 'var(--leaf)', children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={label || `${v}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      {children ? <span className="ring__label">{children}</span> : null}
    </span>
  )
}

export function Callout({ tone = 'info', icon, title, children, className = '' }) {
  const defaultIcon = { info: 'info', success: 'check-circle', warn: 'alert', accent: 'bulb', neutral: 'info' }[tone]
  return (
    <div className={`callout callout--${tone} ${className}`}>
      <Icon name={icon || defaultIcon} />
      <div>
        {title ? <strong>{title} </strong> : null}
        {children}
      </div>
    </div>
  )
}

// Ask · Predict · Verify ribbon. stage: 0 ask, 1 predict, 2 verify
export function APV({ stage = 0 }) {
  return (
    <span className="apv" aria-label={`Ask, predict, verify: step ${stage + 1} of 3`}>
      <span data-on={stage >= 0}>Ask</span>
      <span data-on={stage >= 1}>Predict</span>
      <span data-on={stage >= 2}>Verify</span>
    </span>
  )
}

// Generic Ask -> Predict -> Verify card for lectures and readings.
// options: [{ id, label }], correct: id or [ids], explain: string | node
export function Predict({ prompt, options, correct, multi = false, explain, onAnswer, initial, compact = false }) {
  const correctSet = new Set(Array.isArray(correct) ? correct : [correct])
  const [sel, setSel] = useState(() => (initial ? new Set(Array.isArray(initial) ? initial : [initial]) : new Set()))
  const [locked, setLocked] = useState(Boolean(initial))
  const toggle = (id) => {
    if (locked) return
    setSel((prev) => {
      const next = new Set(multi ? prev : [])
      if (prev.has(id) && multi) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const right = locked && sel.size === correctSet.size && [...sel].every((x) => correctSet.has(x))
  const lock = () => {
    setLocked(true)
    onAnswer?.(multi ? [...sel] : [...sel][0], sel.size === correctSet.size && [...sel].every((x) => correctSet.has(x)))
  }
  return (
    <div className={`predict ${compact ? 'predict--compact' : ''}`}>
      <div className="predict__head">
        <APV stage={locked ? 2 : sel.size ? 1 : 0} />
      </div>
      <p className="predict__prompt">{prompt}</p>
      <div className="predict__options" role={multi ? 'group' : 'radiogroup'}>
        {options.map((o) => {
          const isSel = sel.has(o.id)
          const state = locked ? (correctSet.has(o.id) ? 'option--correct' : isSel ? 'option--wrong' : '') : ''
          return (
            <button
              key={o.id}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={isSel}
              className={`option ${multi ? 'option--multi' : ''} ${state}`}
              onClick={() => toggle(o.id)}
              disabled={locked}
            >
              <span className="option__mark">
                <Icon name={locked && !correctSet.has(o.id) && isSel ? 'x' : 'check'} strokeWidth={3} />
              </span>
              <span>{o.label}</span>
            </button>
          )
        })}
      </div>
      {!locked ? (
        <div className="predict__actions">
          <button type="button" className="btn btn--dark btn--sm" disabled={!sel.size} onClick={lock}>
            Lock in my prediction
          </button>
          {multi && <span className="hint">Select all that apply.</span>}
        </div>
      ) : (
        <motion.div
          className={`callout ${right ? 'callout--success' : 'callout--warn'}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          <Icon name={right ? 'check-circle' : 'bulb'} />
          <div>
            <strong>{right ? 'Verified: your prediction holds.' : 'Not quite. Here is why.'}</strong> {explain}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} />
      </span>
      <div className="empty__title">{title}</div>
      {children ? <div className="empty__body">{children}</div> : null}
      {action}
    </div>
  )
}
