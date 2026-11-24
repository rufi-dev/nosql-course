// Canonical learner state, computed on the server.
//
// The browser sends what the learner did; the server keeps only what the rules
// allow. Stage gating is enforced here, in course order: an activity can only
// be completed (and its data saved) when its stage is open for this learner in
// this class. Completions are re-derived from evidence, never trusted blindly.
// Pure: no I/O, shared with tests.
import {
  ACTIVITIES,
  LABS,
  STAGES,
  OUTCOMES,
  BADGES,
  COURSE,
  READING_CHAPTER_IDS,
  HOTSPOT_IDS,
  LECTURE_BUCKET,
} from '../data/course.js'
import { LECTURES } from '../data/lectures.js'
import { stageStatus, newlyOpenedStages } from './stages.js'
import { labProgress, lectureWatchedPct } from './progress.js'

const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {})
const arr = (x) => (Array.isArray(x) ? x : [])
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d)
const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '')
const ts = (x) => (Number.isFinite(x) && x > 0 ? x : null)
const jsonSize = (x) => {
  try {
    return JSON.stringify(x).length
  } catch {
    return Infinity
  }
}

const LECTURE_BY_ACTIVITY = Object.fromEntries(Object.values(LECTURES).map((l) => [l.activity, l]))
const LAB_BY_ACTIVITY = Object.fromEntries(Object.entries(LABS).map(([key, l]) => [l.activity, key]))
const STAGE_KEYS = {
  begin: ['diagnostic'],
  learn: ['lectures', 'reading', 'explore'],
  practise: ['labs'],
  apply: ['assignmentDraft'],
  reflect: ['reflection'],
}

// ---------- Slice sanitisers (shape + size only) ----------

function cleanDiagnostic(d) {
  const answers = {}
  for (const [k, v] of Object.entries(obj(d?.answers)).slice(0, 10)) {
    if (typeof v === 'string') answers[k] = v.slice(0, 40)
    else if (Array.isArray(v)) answers[k] = v.filter((x) => typeof x === 'string').slice(0, 10)
  }
  return { answers, done: Boolean(d?.done) }
}

function cleanLectures(l) {
  const out = {}
  for (const lec of Object.values(LECTURES)) {
    const s = obj(l?.[lec.id])
    if (!Object.keys(s).length) continue
    const buckets = Math.ceil(lec.duration / LECTURE_BUCKET)
    const watched = [...new Set(arr(s.watched).map((b) => Math.floor(num(b, -1))))].filter((b) => b >= 0 && b < buckets)
    const answers = {}
    for (const [k, v] of Object.entries(obj(s.answers)).slice(0, 10)) answers[k.slice(0, 40)] = typeof v === 'string' ? v.slice(0, 40) : v
    out[lec.id] = {
      t: Math.min(lec.duration, Math.max(0, num(s.t))),
      max: Math.min(lec.duration, Math.max(0, num(s.max))),
      answers,
      watched,
    }
  }
  return out
}

function cleanReading(r) {
  const visited = {}
  for (const id of READING_CHAPTER_IDS) if (r?.visited?.[id]) visited[id] = num(r.visited[id], 1)
  const last = READING_CHAPTER_IDS.includes(r?.last) ? r.last : null
  return { visited, last }
}

function cleanExplore(e) {
  const seen = {}
  for (const id of HOTSPOT_IDS) if (e?.seen?.[id]) seen[id] = num(e.seen[id], 1)
  return { seen }
}

function cleanLabs(l, prevLabs) {
  const out = {}
  for (const [key, def] of Object.entries(LABS)) {
    const s = obj(l?.[key])
    const checkpoints = {}
    for (const c of def.checkpoints) if (s.checkpoints?.[c.id]) checkpoints[c.id] = num(s.checkpoints[c.id], 1)
    // Lab data (simulator snapshots, choices) is opaque but size-limited.
    const data = jsonSize(s.data) <= 400_000 ? obj(s.data) : obj(prevLabs?.[key]?.data)
    out[key] = { checkpoints, data }
  }
  return out
}

function cleanDraft(d) {
  const x = obj(d)
  const out = {}
  for (const k of ['schema', 'queries', 'result', 'shardKey', 'justification']) if (typeof x[k] === 'string') out[k] = x[k].slice(0, 20_000)
  if (x.selfCheck) {
    out.selfCheck = {}
    for (const [k, v] of Object.entries(obj(x.selfCheck)).slice(0, 12)) out.selfCheck[k.slice(0, 40)] = Boolean(v)
  }
  if (x.attachment && typeof x.attachment === 'object') {
    const a = x.attachment
    out.attachment = { name: str(a.name, 200), size: num(a.size) }
    if (typeof a.text === 'string') out.attachment.text = a.text.slice(0, 50_000)
  }
  return out
}

function cleanReflection(r) {
  const x = obj(r)
  const confidence = {}
  for (const o of OUTCOMES) {
    const v = num(x.confidence?.[o.id], 0)
    if (v >= 1 && v <= 5) confidence[o.id] = Math.round(v)
  }
  return {
    confidence,
    unclear: str(x.unclear, 5000),
    minutes: str(String(x.minutes ?? ''), 10),
    rating: Math.max(0, Math.min(5, Math.round(num(x.rating)))),
    submittedAt: ts(x.submittedAt),
  }
}

// ---------- Server-owned mirrors ----------

export function quizMirror(attempts) {
  const list = arr(attempts)
    .map((a) => ({ score: a.score, total: a.total, pct: a.pct, at: a.at }))
    .sort((a, b) => a.at - b.at)
  return { attempts: list, best: list.reduce((m, a) => Math.max(m, a.pct), 0) }
}

export function assignmentMirror(submission, draft) {
  if (!submission || submission.status === 'withdrawn') {
    return { draft, submittedAt: null, checks: [], score: null, autoScore: null, teacherScore: null, status: null }
  }
  return {
    draft,
    submittedAt: submission.submittedAt,
    checks: submission.checks,
    autoScore: submission.autoScore,
    teacherScore: submission.teacherScore ?? null,
    teacherScores: submission.teacherScores ?? null,
    teacherFeedback: submission.teacherFeedback ?? null,
    gradedAt: submission.gradedAt ?? null,
    status: submission.status,
    score: submission.teacherScore ?? submission.autoScore,
  }
}

export function workshopMirror(reviews) {
  const out = {}
  for (const r of arr(reviews)) if (r.reviewedAt) out[r.key] = { accuracy: r.accuracy ?? null, at: r.reviewedAt }
  return { reviews: out }
}

// ---------- Completion rules ----------

function evidenceComplete(id, s, facts) {
  if (id === 'start') return Boolean(s.diagnostic?.done)
  if (LECTURE_BY_ACTIVITY[id]) {
    const lec = LECTURE_BY_ACTIVITY[id]
    return lectureWatchedPct(s.lectures?.[lec.id], lec.duration) >= 90
  }
  if (id === 'reading') return READING_CHAPTER_IDS.every((c) => s.reading?.visited?.[c])
  if (id === 'explore') return HOTSPOT_IDS.every((h) => s.explore?.seen?.[h])
  if (LAB_BY_ACTIVITY[id]) return labProgress(s.labs, LAB_BY_ACTIVITY[id]).pct === 100
  if (id === 'quiz') return s.quiz.best >= COURSE.quizPass
  if (id === 'assignment') return Boolean(s.assignment.submittedAt)
  if (id === 'workshop') return Object.keys(s.workshop.reviews).length >= 3
  if (id === 'discussion') return (facts.postsCount || 0) >= 1
  if (id === 'wrap-up') return Boolean(s.reflection?.submittedAt)
  return false
}

// Manual activities also need the learner's own "Mark as done".
const MANUAL = new Set(ACTIVITIES.filter((a) => a.completion === 'manual').map((a) => a.id))

/**
 * @param {object} p
 * @param {object} p.prev       stored state (already canonical) or {}
 * @param {object} p.next       state sent by the browser (or prev, to recompute)
 * @param {object} p.facts      { quizAttempts, submission, reviews, postsCount }
 * @param {object} p.overrides  class stage overrides { [stageId]: true }
 * @param {number} p.now
 */
export function canonicalize({ prev = {}, next = {}, facts = {}, overrides = {}, now = Date.now() }) {
  prev = obj(prev)
  next = obj(next)
  const prevActs = obj(prev.activities)
  const nextActs = obj(next.activities)

  const unlocked = {}
  for (const [id, on] of Object.entries(obj(overrides))) if (on && STAGES.some((s) => s.id === id)) unlocked[id] = { via: 'teacher', at: now }

  const out = {
    lastVisited: typeof next.lastVisited === 'string' ? next.lastVisited.slice(0, 200) : prev.lastVisited ?? null,
    activities: {},
    stages: { opened: { ...obj(prev.stages?.opened) }, unlocked },
    quiz: quizMirror(facts.quizAttempts),
    workshop: workshopMirror(facts.reviews),
    // filled per stage below
    diagnostic: cleanDiagnostic(prev.diagnostic),
    lectures: cleanLectures(prev.lectures),
    reading: cleanReading(prev.reading),
    explore: cleanExplore(prev.explore),
    labs: cleanLabs(prev.labs, prev.labs),
    reflection: cleanReflection(prev.reflection),
  }
  let draft = cleanDraft(prev.assignment?.draft)

  for (const stage of STAGES) {
    const open = stageStatus(out, stage.id).open
    if (open) {
      // Accept the browser's data for this stage.
      for (const key of STAGE_KEYS[stage.id]) {
        if (key === 'diagnostic') out.diagnostic = cleanDiagnostic(next.diagnostic ?? prev.diagnostic)
        if (key === 'lectures') out.lectures = cleanLectures(next.lectures ?? prev.lectures)
        if (key === 'reading') out.reading = cleanReading(next.reading ?? prev.reading)
        if (key === 'explore') out.explore = cleanExplore(next.explore ?? prev.explore)
        if (key === 'labs') out.labs = cleanLabs(next.labs ?? prev.labs, prev.labs)
        if (key === 'assignmentDraft') draft = cleanDraft(next.assignment?.draft ?? prev.assignment?.draft)
        if (key === 'reflection') out.reflection = cleanReflection(next.reflection ?? prev.reflection)
      }
    }
    if (stage.id === 'apply') out.assignment = assignmentMirror(facts.submission, draft)

    for (const id of stage.activities) {
      const evidence = evidenceComplete(id, out, facts)
      const wanted = MANUAL.has(id) ? Boolean(nextActs[id]?.done) : true
      // Locked stage: keep completions earned while it was open, accept nothing new.
      const keepOld = !open && prevActs[id]?.done && evidence
      if ((open && evidence && wanted) || keepOld) {
        const at = ts(prevActs[id]?.at) || Math.min(ts(nextActs[id]?.at) || now, now)
        out.activities[id] = { done: true, at }
      }
    }
    for (const s of newlyOpenedStages(out)) out.stages.opened[s.id] = now
  }

  // Badges are derived, never trusted.
  const prevBadges = obj(prev.badges)
  const badges = {}
  const give = (id, cond) => {
    if (cond) badges[id] = ts(prevBadges[id]) || now
  }
  for (const def of Object.values(LABS)) give(def.badge, Boolean(out.activities[def.activity]))
  give('quiz-pass', out.quiz.best >= COURSE.quizPass)
  give('peer-reviewer', Object.keys(out.workshop.reviews).length >= 3)
  give('module-complete', ACTIVITIES.every((a) => out.activities[a.id]?.done))
  out.badges = Object.fromEntries(BADGES.filter((b) => badges[b.id]).map((b) => [b.id, badges[b.id]]))

  return out
}

// Which activity a server action belongs to, to check its stage is open.
export function activityOpen(state, activityId) {
  const stage = STAGES.find((s) => s.activities.includes(activityId))
  return stageStatus(state, stage.id).open
}
