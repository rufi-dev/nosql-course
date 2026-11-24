// Shared helpers for the distributed-systems labs (Labs 2 to 5).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../../store.js'

// Deterministic PRNG so datasets are identical for every learner.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// FNV-1a 32-bit hash, used as a stand-in for MongoDB's hashed index.
export function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function fmtClock(ms) {
  const s = Math.max(0, ms) / 1000
  return `+${s.toFixed(s < 10 ? 2 : 1)}s`
}

export function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`
  return `${Math.round(ms)} ms`
}

export function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length
}

// Calls cb(dtMs, nowMs) every animation frame while active.
export function useFrame(cb, active = true) {
  const ref = useRef(cb)
  useLayoutEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    if (!active) return undefined
    let raf
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(64, now - last)
      last = now
      ref.current(dt, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])
}

export function checkpoint(lab, id) {
  const st = useStore.getState()
  if (!st.labs?.[lab]?.checkpoints?.[id]) st.setLabCheckpoint(lab, id)
}

export function hasCheckpoint(lab, id) {
  return Boolean(useStore.getState().labs?.[lab]?.checkpoints?.[id])
}

// Position along a straight segment for an in-flight message.
export function msgPos(from, to, progress) {
  const p = easeInOut(clamp(progress, 0, 1))
  return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) }
}

let uid = 0
export const nextId = (prefix = 'm') => `${prefix}${++uid}`

// Event log state for a lab: log(text, tone, t)
export function useEvents(limit = 80) {
  const [events, setEvents] = useState([])
  const log = (text, tone = 'info', t = null) =>
    setEvents((prev) => [...prev.slice(-(limit - 1)), { id: `${Date.now()}-${Math.random()}`, t, text, tone }])
  const clear = () => setEvents([])
  return { events, log, clear }
}

// Milliseconds since the component mounted (for event timestamps).
export function useStopwatch() {
  const t0 = useRef(0)
  useEffect(() => {
    t0.current = performance.now()
  }, [])
  return () => performance.now() - t0.current
}
