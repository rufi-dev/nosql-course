// Learner state for the signed-in student in their current class.
//
// The server holds the canonical copy (see src/lib/progressRules.js and
// src/lib/sync.js): this store is loaded from the server on sign-in, every
// change is saved back automatically, and the server's answer (with stage
// locks enforced) is applied on return. Teachers get a local, unsaved preview.
import { create } from 'zustand'
import { ACTIVITIES, LABS, BADGES, badgeById } from './data/course.js'
import { newlyOpenedStages } from './lib/stages.js'
export { labProgress, moduleProgress, nextActivity, lectureWatchedPct } from './lib/progress.js'
export { LECTURE_BUCKET } from './data/course.js'

const now = () => Date.now()
let toastSeq = 0

const emptyLabs = () => Object.fromEntries(Object.keys(LABS).map((k) => [k, { checkpoints: {}, data: {} }]))

// Device-level preferences stay in this browser.
const SETTINGS_KEY = 'nosql-settings-v1'
const loadSettings = () => {
  try {
    return { motion: 'system', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { motion: 'system' }
  }
}

export const initialLearnerState = () => ({
  activities: {}, // { [activityId]: { done: true, at } }
  diagnostic: { answers: {}, done: false },
  lectures: {}, // { [lectureId]: { t, max, answers, watched: [bucket] } }
  reading: { visited: {}, last: null },
  explore: { seen: {} },
  labs: emptyLabs(), // { [lab]: { checkpoints: { [cp]: at }, data: {...} } }
  quiz: { attempts: [], best: 0 }, // server-owned mirror
  assignment: { draft: {}, submittedAt: null, checks: [], score: null }, // draft is ours, the rest server-owned
  workshop: { reviews: {} }, // server-owned mirror { [targetId]: { accuracy, at } }
  reflection: { confidence: {}, unclear: '', minutes: '', rating: 0, submittedAt: null },
  badges: {}, // server-derived { [badgeId]: at }
  stages: { opened: {}, unlocked: {} }, // server-derived
  lastVisited: null,
})

export const useStore = create((set, get) => ({
  ...initialLearnerState(),
  profile: { name: '' },
  settings: loadSettings(),
  toasts: [],

  // ---------- Toasts ----------
  pushToast: (toast) => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, icon: 'check', ...toast }] }))
    setTimeout(() => get().dismissToast(id), toast.duration ?? 5200)
    return id
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ---------- Profile & settings ----------
  setName: (name) => set((s) => ({ profile: { ...s.profile, name } })),
  setMotion: (motion) => {
    set((s) => ({ settings: { ...s.settings, motion } }))
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(get().settings))
    } catch {
      /* storage unavailable */
    }
  },
  setLastVisited: (path) => set({ lastVisited: path }),

  // Replace the learner state (sign-in, class switch, sign-out).
  resetLearner: (state = {}) => set({ ...initialLearnerState(), ...state }),

  // ---------- Activities ----------
  completeActivity: (id) => {
    if (get().activities[id]?.done) return
    set((s) => ({ activities: { ...s.activities, [id]: { done: true, at: now() } } }))
    get().syncStages(true)
    const allDone = ACTIVITIES.every((a) => get().activities[a.id]?.done)
    if (allDone) get().awardBadge('module-complete')
  },
  uncompleteActivity: (id) =>
    set((s) => {
      const next = { ...s.activities }
      delete next[id]
      return { activities: next }
    }),
  isDone: (id) => Boolean(get().activities[id]?.done),

  // Optimistic stage opening (the server confirms on the next save).
  syncStages: (announce = false) => {
    const fresh = newlyOpenedStages(get())
    if (!fresh.length) return
    set((s) => ({
      stages: { ...s.stages, opened: { ...s.stages.opened, ...Object.fromEntries(fresh.map((st) => [st.id, now()])) } },
    }))
    if (announce) fresh.forEach((st) => get().pushToast({ icon: 'lock', title: `${st.title} is open`, body: st.lead, duration: 6000 }))
  },

  // ---------- Badges (optimistic; the server derives the real set) ----------
  awardBadge: (id) => {
    if (get().badges[id]) return
    const badge = badgeById(id)
    set((s) => ({ badges: { ...s.badges, [id]: now() } }))
    if (badge) get().pushToast({ kind: 'badge', icon: badge.icon, title: `Badge earned: ${badge.title}`, body: badge.how })
  },

  // ---------- Diagnostic ----------
  answerDiagnostic: (qid, value) =>
    set((s) => ({ diagnostic: { ...s.diagnostic, answers: { ...s.diagnostic.answers, [qid]: value } } })),
  finishDiagnostic: () => {
    set((s) => ({ diagnostic: { ...s.diagnostic, done: true } }))
    get().completeActivity('start')
  },

  // ---------- Lectures ----------
  setLectureProgress: (lectureId, t) =>
    set((s) => {
      const prev = s.lectures[lectureId] || { t: 0, max: 0, answers: {} }
      return { lectures: { ...s.lectures, [lectureId]: { ...prev, t, max: Math.max(prev.max || 0, t) } } }
    }),
  // Called by the player only while it is actually playing.
  markLectureWatched: (lectureId, bucket) =>
    set((s) => {
      const prev = s.lectures[lectureId] || { t: 0, max: 0, answers: {} }
      const watched = prev.watched || []
      if (watched.includes(bucket)) return {}
      return { lectures: { ...s.lectures, [lectureId]: { ...prev, watched: [...watched, bucket] } } }
    }),
  answerLectureQuestion: (lectureId, qid, choice) =>
    set((s) => {
      const prev = s.lectures[lectureId] || { t: 0, max: 0, answers: {} }
      return { lectures: { ...s.lectures, [lectureId]: { ...prev, answers: { ...prev.answers, [qid]: choice } } } }
    }),

  // ---------- Reading / explore ----------
  visitChapter: (chapterId) =>
    set((s) => ({ reading: { visited: { ...s.reading.visited, [chapterId]: s.reading.visited[chapterId] || now() }, last: chapterId } })),
  seeHotspot: (hotspotId) =>
    set((s) => (s.explore.seen[hotspotId] ? {} : { explore: { seen: { ...s.explore.seen, [hotspotId]: now() } } })),

  // ---------- Labs ----------
  setLabCheckpoint: (lab, checkpointId) => {
    const def = LABS[lab]
    if (!def) return
    const current = get().labs[lab] || { checkpoints: {}, data: {} }
    if (current.checkpoints[checkpointId]) return
    set((s) => ({
      labs: { ...s.labs, [lab]: { ...current, checkpoints: { ...current.checkpoints, [checkpointId]: now() } } },
    }))
    const cp = def.checkpoints.find((c) => c.id === checkpointId)
    const done = def.checkpoints.filter((c) => get().labs[lab].checkpoints[c.id]).length
    if (cp) get().pushToast({ icon: 'check', title: `Checkpoint ${done} of ${def.checkpoints.length}`, body: cp.label, duration: 3600 })
    if (done === def.checkpoints.length) {
      get().completeActivity(def.activity)
      get().awardBadge(def.badge)
    }
  },
  setLabData: (lab, patch) =>
    set((s) => {
      const current = s.labs[lab] || { checkpoints: {}, data: {} }
      return { labs: { ...s.labs, [lab]: { ...current, data: { ...current.data, ...patch } } } }
    }),
  resetLab: (lab) =>
    set((s) => ({ labs: { ...s.labs, [lab]: { checkpoints: s.labs[lab]?.checkpoints || {}, data: {} } } })),

  // ---------- Assignment draft (synced; submission goes through the API) ----------
  saveAssignmentDraft: (patch) =>
    set((s) => ({ assignment: { ...s.assignment, draft: { ...s.assignment.draft, ...patch } } })),

  // ---------- Reflection ----------
  saveReflection: (patch) => set((s) => ({ reflection: { ...s.reflection, ...patch } })),
  submitReflection: () => {
    set((s) => ({ reflection: { ...s.reflection, submittedAt: now() } }))
    get().completeActivity('wrap-up')
  },
}))

export const exportState = () => {
  const s = useStore.getState()
  const out = {}
  for (const key of Object.keys(initialLearnerState())) out[key] = s[key]
  return out
}

export { BADGES }
