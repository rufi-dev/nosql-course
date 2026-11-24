// Learner state: load evidence from the tables, build the canonical state with
// the shared rules (src/lib/progressRules.js) and store it.
import { one, query } from './db.js'
import { ms, forbidden, HttpError } from './util.js'
import { canonicalize } from '../src/lib/progressRules.js'
import { reviewAccuracy } from '../src/data/peers.js'

export function submissionView(row) {
  if (!row) return null
  return {
    id: row.id,
    fields: row.fields,
    checks: row.checks,
    autoScore: row.auto_score,
    teacherScores: row.teacher_scores,
    teacherScore: row.teacher_score,
    teacherFeedback: row.teacher_feedback,
    status: row.status,
    submittedAt: ms(row.submitted_at),
    gradedAt: ms(row.graded_at),
  }
}

// Accuracy of a review: against the instructor reference for samples, against
// the teacher's rubric scores for real classmates once those are graded.
export function reviewRowAccuracy(row, samples) {
  if (!row.reviewed_at || !row.scores) return null
  if (row.sample_id) return row.accuracy ?? (samples[row.sample_id] ? reviewAccuracy(row.scores, samples[row.sample_id].reference) : null)
  if (row.target_teacher_scores) return reviewAccuracy(row.scores, row.target_teacher_scores)
  return null
}

let SAMPLES = null
async function samples() {
  if (!SAMPLES) {
    const { PEERS } = await import('../src/data/peers.js')
    SAMPLES = Object.fromEntries(PEERS.map((p) => [p.id, p]))
  }
  return SAMPLES
}

const REVIEWS_SQL = `
  SELECT ra.id, ra.reviewer_id, ra.sample_id, ra.submission_id, ra.scores, ra.accuracy, ra.reviewed_at,
         s.teacher_scores AS target_teacher_scores
    FROM review_assignments ra
    LEFT JOIN submissions s ON s.id = ra.submission_id
   WHERE ra.class_id = $1`

function attemptView(a) {
  return { score: a.score, total: a.total, pct: Math.round((a.score / a.total) * 100), at: ms(a.finished_at) }
}

// Evidence for one learner in one class.
export async function loadFacts(userId, classId) {
  const smp = await samples()
  const [attempts, submission, reviews, posts] = await Promise.all([
    query('SELECT score, total, finished_at FROM quiz_attempts WHERE user_id = $1 AND class_id = $2 AND finished_at IS NOT NULL', [
      userId,
      classId,
    ]),
    one('SELECT * FROM submissions WHERE user_id = $1 AND class_id = $2', [userId, classId]),
    query(`${REVIEWS_SQL} AND ra.reviewer_id = $2`, [classId, userId]),
    one('SELECT count(*)::int AS n FROM posts WHERE author_id = $1 AND class_id = $2', [userId, classId]),
  ])
  return {
    quizAttempts: attempts.rows.map(attemptView),
    submission: submissionView(submission),
    reviews: reviews.rows.map((r) => ({ key: r.id, accuracy: reviewRowAccuracy(r, smp), reviewedAt: ms(r.reviewed_at) })),
    postsCount: posts.n,
  }
}

// Evidence for every learner in a class at once (teacher dashboard, CSV).
export async function loadClassFacts(classId) {
  const smp = await samples()
  const [attempts, subs, reviews, posts] = await Promise.all([
    query('SELECT user_id, score, total, finished_at FROM quiz_attempts WHERE class_id = $1 AND finished_at IS NOT NULL', [classId]),
    query('SELECT * FROM submissions WHERE class_id = $1', [classId]),
    query(REVIEWS_SQL, [classId]),
    query('SELECT author_id, count(*)::int AS n FROM posts WHERE class_id = $1 GROUP BY author_id', [classId]),
  ])
  const facts = new Map()
  const get = (id) => {
    if (!facts.has(id)) facts.set(id, { quizAttempts: [], submission: null, reviews: [], postsCount: 0 })
    return facts.get(id)
  }
  for (const a of attempts.rows) get(a.user_id).quizAttempts.push(attemptView(a))
  for (const s of subs.rows) get(s.user_id).submission = submissionView(s)
  for (const r of reviews.rows)
    get(r.reviewer_id).reviews.push({ key: r.id, accuracy: reviewRowAccuracy(r, smp), reviewedAt: ms(r.reviewed_at) })
  for (const p of posts.rows) get(p.author_id).postsCount = p.n
  return { get }
}

export async function classOverrides(classId) {
  const row = await one('SELECT stage_overrides FROM classes WHERE id = $1', [classId])
  return row?.stage_overrides || {}
}

export async function storedState(userId, classId) {
  const row = await one('SELECT state FROM progress WHERE user_id = $1 AND class_id = $2', [userId, classId])
  return row?.state || {}
}

async function writeState(userId, classId, state) {
  await query(
    `INSERT INTO progress (user_id, class_id, state, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, class_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [userId, classId, JSON.stringify(state)],
  )
}

// Canonical state from what is stored (no new input), saved back if it changed.
export async function recompute(userId, classId) {
  const [prev, facts, overrides] = await Promise.all([storedState(userId, classId), loadFacts(userId, classId), classOverrides(classId)])
  const state = canonicalize({ prev, next: prev, facts, overrides })
  if (JSON.stringify(state) !== JSON.stringify(prev)) await writeState(userId, classId, state)
  return state
}

// Apply what the browser sent, keep only what the rules allow, save.
export async function saveFromClient(userId, classId, next) {
  const [prev, facts, overrides] = await Promise.all([storedState(userId, classId), loadFacts(userId, classId), classOverrides(classId)])
  const state = canonicalize({ prev, next, facts, overrides })
  await writeState(userId, classId, state)
  return state
}

// The learner's current class, verified against enrollments.
export async function requireStudentClass(req) {
  const user = req.user
  if (!user) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  if (user.role !== 'student') throw forbidden('Teachers preview the course without a class. Use a student account to save progress.', 'preview')
  if (!user.current_class_id) throw new HttpError(409, 'no_class', 'Join a class with the code from your teacher first.')
  const row = await one(
    `SELECT c.id, c.name, c.stage_overrides, c.archived FROM enrollments e JOIN classes c ON c.id = e.class_id
      WHERE e.user_id = $1 AND e.class_id = $2`,
    [user.id, user.current_class_id],
  )
  if (!row) throw new HttpError(409, 'no_class', 'Join a class with the code from your teacher first.')
  return row
}
