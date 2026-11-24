// Learner state, persisted in localStorage. Everything a learner does lives
// here so grades, badges and progress are always derived from one place.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ACTIVITIES, LABS, BADGES, STAGES, badgeById } from './data/course.js'
import { newlyOpenedStages } from './lib/stages.js'

const now = () => Date.now()
let toastSeq = 0

const emptyLabs = () =>
  Object.fromEntries(Object.keys(LABS).map((k) => [k, { checkpoints: {}, data: {} }]))

const initialState = () => ({
  profile: { name: '' },
  settings: { motion: 'system' }, // 'system' | 'reduce' | 'full'
  activities: {}, // { [activityId]: { done: true, at } }
  diagnostic: { answers: {}, done: false },
  lectures: {}, // { [lectureId]: { t, max, answers: { [qId]: choice } } }
  reading: { visited: {}, last: null },
  explore: { seen: {} },
  labs: emptyLabs(), // { [lab]: { checkpoints: { [cp]: at }, data: {...} } }
  quiz: { attempts: [], best: 0 },
  assignment: { draft: {}, submittedAt: null, checks: [], score: null },
  workshop: { reviews: {} }, // { [peerId]: { scores: { [criterion]: n }, comment, at, accuracy } }
  forum: { posts: [], likes: {} },
  reflection: { confidence: {}, unclear: '', minutes: '', rating: 0, submittedAt: null },
  badges: {}, // { [badgeId]: at }
  stages: { opened: {}, unlocked: {} }, // opened: reached by progress; unlocked: { via: 'teacher' | 'code', at }
  lastVisited: null, // path
})

// Lecture coverage is tracked in buckets of this many seconds of actual playback.
export const LECTURE_BUCKET = 5

export const useStore = create(
  persist(
    (set, get) => ({
      ...initialState(),
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
      setMotion: (motion) => set((s) => ({ settings: { ...s.settings, motion } })),
      setLastVisited: (path) => set({ lastVisited: path }),

      // ---------- Activities ----------
      completeActivity: (id) => {
        if (get().activities[id]?.done) return
        set((s) => ({ activities: { ...s.activities, [id]: { done: true, at: now() } } }))
        get().syncStages(true)
        const allDone = ACTIVITIES.every((a) => get().activities[a.id]?.done)
        if (allDone) get().awardBadge('module-complete')
      },

      // ---------- Stage gating ----------
      // Records stages whose prerequisites are met. announce => toast for each.
      syncStages: (announce = false) => {
        const fresh = newlyOpenedStages(get())
        if (!fresh.length) return
        set((s) => ({
          stages: {
            ...s.stages,
            opened: { ...s.stages.opened, ...Object.fromEntries(fresh.map((st) => [st.id, now()])) },
          },
        }))
        if (announce) {
          fresh.forEach((st) =>
            get().pushToast({ icon: 'lock', title: `${st.title} is open`, body: st.lead, duration: 6000 }),
          )
        }
      },
      unlockStage: (id, via = 'teacher') =>
        set((s) => ({ stages: { ...s.stages, unlocked: { ...s.stages.unlocked, [id]: { via, at: now() } } } })),
      relockStage: (id) =>
        set((s) => {
          const unlocked = { ...s.stages.unlocked }
          delete unlocked[id]
          return { stages: { ...s.stages, unlocked } }
        }),
      redeemStageCode: (code) => {
        const clean = String(code || '').trim().toUpperCase()
        const stage = STAGES.find((st) => st.code && st.code.toUpperCase() === clean)
        if (!stage) return null
        get().unlockStage(stage.id, 'code')
        get().pushToast({ icon: 'lock', title: `${stage.title} opened by your teacher`, body: stage.lead })
        return stage
      },
      uncompleteActivity: (id) =>
        set((s) => {
          const next = { ...s.activities }
          delete next[id]
          return { activities: next }
        }),
      isDone: (id) => Boolean(get().activities[id]?.done),

      // ---------- Badges ----------
      awardBadge: (id) => {
        if (get().badges[id]) return
        const badge = badgeById(id)
        set((s) => ({ badges: { ...s.badges, [id]: now() } }))
        if (badge) {
          get().pushToast({
            kind: 'badge',
            icon: badge.icon,
            title: `Badge earned: ${badge.title}`,
            body: badge.how,
          })
        }
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
      // Called by the player only while it is actually playing, so seeking
      // to the end never counts as watching.
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
          return {
            lectures: { ...s.lectures, [lectureId]: { ...prev, answers: { ...prev.answers, [qid]: choice } } },
          }
        }),

      // ---------- Reading / explore ----------
      visitChapter: (chapterId) =>
        set((s) => ({ reading: { visited: { ...s.reading.visited, [chapterId]: now() }, last: chapterId } })),
      seeHotspot: (hotspotId) => set((s) => ({ explore: { seen: { ...s.explore.seen, [hotspotId]: now() } } })),

      // ---------- Labs ----------
      setLabCheckpoint: (lab, checkpointId) => {
        const def = LABS[lab]
        if (!def) return
        const current = get().labs[lab] || { checkpoints: {}, data: {} }
        if (current.checkpoints[checkpointId]) return
        set((s) => ({
          labs: {
            ...s.labs,
            [lab]: { ...current, checkpoints: { ...current.checkpoints, [checkpointId]: now() } },
          },
        }))
        const cp = def.checkpoints.find((c) => c.id === checkpointId)
        const done = def.checkpoints.filter((c) => get().labs[lab].checkpoints[c.id]).length
        if (cp) {
          get().pushToast({
            icon: 'check',
            title: `Checkpoint ${done} of ${def.checkpoints.length}`,
            body: cp.label,
            duration: 3600,
          })
        }
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
        set((s) => ({ labs: { ...s.labs, [lab]: { checkpoints: {}, data: {} } } })),

      // ---------- Quiz ----------
      recordQuizAttempt: (attempt) => {
        // attempt: { score, total, answers, at }
        const pct = Math.round((attempt.score / attempt.total) * 100)
        set((s) => ({
          quiz: {
            attempts: [...s.quiz.attempts, { ...attempt, pct, at: now() }],
            best: Math.max(s.quiz.best, pct),
          },
        }))
        if (pct >= 70) {
          get().completeActivity('quiz')
          get().awardBadge('quiz-pass')
        }
        return pct
      },

      // ---------- Assignment ----------
      saveAssignmentDraft: (patch) =>
        set((s) => ({ assignment: { ...s.assignment, draft: { ...s.assignment.draft, ...patch } } })),
      submitAssignment: ({ checks, score }) => {
        set((s) => ({ assignment: { ...s.assignment, submittedAt: now(), checks, score } }))
        get().completeActivity('assignment')
      },
      withdrawAssignment: () =>
        set((s) => ({ assignment: { ...s.assignment, submittedAt: null, checks: [], score: null } })),

      // ---------- Workshop ----------
      saveReview: (peerId, review) => {
        set((s) => ({
          workshop: { reviews: { ...s.workshop.reviews, [peerId]: { ...review, at: now() } } },
        }))
        if (Object.keys(get().workshop.reviews).length >= 3) {
          get().completeActivity('workshop')
          get().awardBadge('peer-reviewer')
        }
      },

      // ---------- Forum ----------
      addPost: (post) => {
        const id = `u${now()}${Math.random().toString(36).slice(2, 6)}`
        set((s) => ({ forum: { ...s.forum, posts: [...s.forum.posts, { ...post, id, at: now(), mine: true }] } }))
        get().completeActivity('discussion')
        return id
      },
      deletePost: (id) =>
        set((s) => ({ forum: { ...s.forum, posts: s.forum.posts.filter((p) => p.id !== id && p.parentId !== id) } })),
      toggleLike: (id) =>
        set((s) => {
          const likes = { ...s.forum.likes }
          if (likes[id]) delete likes[id]
          else likes[id] = true
          return { forum: { ...s.forum, likes } }
        }),

      // ---------- Reflection ----------
      saveReflection: (patch) => set((s) => ({ reflection: { ...s.reflection, ...patch } })),
      submitReflection: () => {
        set((s) => ({ reflection: { ...s.reflection, submittedAt: now() } }))
        get().completeActivity('wrap-up')
      },

      // ---------- Data management ----------
      resetAll: () => set({ ...initialState() }),
      importState: (data) => {
        const base = initialState()
        const next = {}
        for (const key of Object.keys(base)) if (key in data) next[key] = data[key]
        set({ ...base, ...next, stages: { ...base.stages, ...(next.stages || {}) } })
        get().syncStages(false)
      },
    }),
    {
      name: 'nosql-course-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        // eslint-disable-next-line no-unused-vars
        const { toasts, ...rest } = s
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function'))
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted || {}) }
        merged.labs = { ...emptyLabs(), ...(persisted?.labs || {}) }
        merged.stages = { opened: {}, unlocked: {}, ...(persisted?.stages || {}) }
        return merged
      },
    },
  ),
)

// ---------- Derived selectors ----------

export const labProgress = (labs, lab) => {
  const def = LABS[lab]
  const done = def.checkpoints.filter((c) => labs[lab]?.checkpoints?.[c.id]).length
  return { done, total: def.checkpoints.length, pct: Math.round((done / def.checkpoints.length) * 100) }
}

export const moduleProgress = (activities) => {
  const done = ACTIVITIES.filter((a) => activities[a.id]?.done).length
  return { done, total: ACTIVITIES.length, pct: Math.round((done / ACTIVITIES.length) * 100) }
}

export const nextActivity = (activities) => ACTIVITIES.find((a) => !activities[a.id]?.done) || null

// Share of a lecture actually played, 0-100.
export const lectureWatchedPct = (lectureState, duration) => {
  const buckets = Math.ceil(duration / LECTURE_BUCKET)
  const watched = new Set(lectureState?.watched || []).size
  return Math.min(100, Math.round((watched / buckets) * 100))
}

export const exportState = () => {
  const s = useStore.getState()
  const out = {}
  for (const key of Object.keys(initialState())) out[key] = s[key]
  return out
}

export { BADGES }
