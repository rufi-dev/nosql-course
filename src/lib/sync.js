// Keeps the learner store and the server in step.
//
// - Every change to a synced slice is saved (debounced) with PUT /api/progress.
// - The server answers with the canonical state (stage locks enforced), which
//   is applied back; if the learner changed something meanwhile, only the
//   server-owned slices are applied and another save follows.
// - Offline or failing saves retry with backoff; a beacon flushes on page hide.
// - The state is refreshed on focus and every 45 s so stages a teacher opens
//   appear without a reload.
import { create } from 'zustand'
import { api } from './api.js'
import { useStore } from '../store.js'
import { STAGES, badgeById } from '../data/course.js'

const SYNC_KEYS = ['diagnostic', 'activities', 'lectures', 'reading', 'explore', 'labs', 'assignment', 'reflection', 'lastVisited']
const SERVER_KEYS = ['stages', 'badges', 'quiz', 'workshop']
const ALL_KEYS = [...new Set([...SYNC_KEYS, ...SERVER_KEYS])]

export const useSync = create(() => ({ status: 'idle', lastSavedAt: null, error: null }))

let enabled = false
let applying = false
let timer = null
let pollTimer = null
let inflight = null
let localRev = 0
let sentRev = 0
let failures = 0
let unsubscribe = null

const pick = (s, keys) => Object.fromEntries(keys.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]))
const snapshot = () => pick(useStore.getState(), SYNC_KEYS)

function announce(prev, next) {
  const st = useStore.getState()
  for (const id of Object.keys(next.badges || {})) {
    if (!prev.badges?.[id]) {
      const b = badgeById(id)
      if (b) st.pushToast({ kind: 'badge', icon: b.icon, title: `Badge earned: ${b.title}`, body: b.how })
    }
  }
  for (const id of Object.keys(next.stages?.unlocked || {})) {
    if (!prev.stages?.unlocked?.[id] && !prev.stages?.opened?.[id]) {
      const stage = STAGES.find((s) => s.id === id)
      if (stage) st.pushToast({ icon: 'lock', title: `Your teacher opened ${stage.title}`, body: stage.lead, duration: 7000 })
    }
  }
}

// Apply a canonical state from the server. partial: keep local client slices.
export function applyServerState(state, { partial = false, silent = false } = {}) {
  if (!state) return
  const prev = useStore.getState()
  applying = true
  try {
    if (partial) {
      const patch = pick(state, SERVER_KEYS)
      // Keep local completions the server has not seen yet; add server ones.
      patch.activities = { ...state.activities, ...prev.activities }
      patch.assignment = { ...state.assignment, draft: prev.assignment?.draft ?? state.assignment?.draft }
      useStore.setState(patch)
    } else {
      useStore.setState(pick(state, ALL_KEYS))
    }
  } finally {
    applying = false
  }
  if (!silent) announce(prev, state)
}

function schedule(delay = 900) {
  if (!enabled) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flush()
  }, delay)
  if (useSync.getState().status !== 'offline') useSync.setState({ status: 'pending' })
}

export async function flush() {
  if (!enabled) return
  if (inflight) return inflight
  if (sentRev === localRev) return
  const rev = localRev
  useSync.setState({ status: 'saving' })
  inflight = (async () => {
    try {
      const { state } = await api.put('/api/progress', { state: snapshot() })
      sentRev = rev
      failures = 0
      applyServerState(state, { partial: localRev !== rev })
      useSync.setState({ status: localRev === rev ? 'saved' : 'pending', lastSavedAt: Date.now(), error: null })
    } catch (err) {
      failures += 1
      const offline = err.status === 0
      useSync.setState({ status: offline ? 'offline' : 'error', error: err.message })
      if (err.status === 401 || err.status === 409) {
        enabled = false // signed out or removed from the class; the session layer takes over
        window.dispatchEvent(new Event('nsql:session-check'))
        return
      }
      clearTimeout(timer)
      timer = setTimeout(
        () => {
          timer = null
          flush()
        },
        Math.min(30_000, 2000 * 2 ** Math.min(failures, 4)),
      )
    } finally {
      inflight = null
    }
    if (enabled && localRev !== sentRev && !timer) schedule(300)
  })()
  return inflight
}

export async function refresh() {
  if (!enabled || inflight || document.hidden) return
  try {
    const { state } = await api.get('/api/progress')
    applyServerState(state, { partial: localRev !== sentRev })
  } catch (err) {
    if (err.status === 401 || err.status === 409) {
      stopSync()
      window.dispatchEvent(new Event('nsql:session-check'))
    }
  }
}

function onHide() {
  if (document.visibilityState !== 'hidden' || !enabled || sentRev === localRev) return
  try {
    const blob = new Blob([JSON.stringify({ state: snapshot() })], { type: 'application/json' })
    if (navigator.sendBeacon('/api/progress/beacon', blob)) sentRev = localRev
  } catch {
    /* best effort */
  }
}
const onFocus = () => refresh()
const onOnline = () => {
  failures = 0
  flush()
}

export function startSync(initialState) {
  stopSync()
  applyServerState(initialState, { silent: true })
  localRev = 0
  sentRev = 0
  failures = 0
  enabled = true
  useSync.setState({ status: 'saved', lastSavedAt: Date.now(), error: null })
  unsubscribe = useStore.subscribe((s, prev) => {
    if (applying || !enabled) return
    if (SYNC_KEYS.some((k) => s[k] !== prev[k])) {
      localRev += 1
      schedule()
    }
  })
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  pollTimer = setInterval(refresh, 45_000)
}

export function stopSync() {
  enabled = false
  clearTimeout(timer)
  timer = null
  clearInterval(pollTimer)
  unsubscribe?.()
  unsubscribe = null
  document.removeEventListener('visibilitychange', onHide)
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('online', onOnline)
  useSync.setState({ status: 'idle', error: null })
}

export const isSyncing = () => enabled
