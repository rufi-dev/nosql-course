// Learner progress (canonical, gated server-side) and the server-graded quiz.
import { Router } from 'express'
import { z } from 'zod'
import { one, query } from '../db.js'
import { requireUser } from '../auth.js'
import { parse, bad, conflict, forbidden, notFound, ms } from '../util.js'
import { requireStudentClass, recompute, saveFromClient, loadFacts } from '../learner.js'
import { activityOpen } from '../../src/lib/progressRules.js'
import { QUESTIONS, QUIZ_SECONDS, QUIZ_SIZE, drawQuiz, isCorrect, questionById } from '../data/quiz.js'
import { OUTCOMES } from '../../src/data/course.js'

const router = Router()
router.use(requireUser)

const stateBody = z.object({ state: z.record(z.string(), z.any()) })

router.get('/progress', async (req, res) => {
  const cls = await requireStudentClass(req)
  const state = await recompute(req.user.id, cls.id)
  res.json({ classId: cls.id, className: cls.name, state })
})

router.put('/progress', async (req, res) => {
  const cls = await requireStudentClass(req)
  const { state } = parse(stateBody, req.body)
  res.json({ classId: cls.id, state: await saveFromClient(req.user.id, cls.id, state) })
})

// navigator.sendBeacon on page hide (POST only).
router.post('/progress/beacon', async (req, res) => {
  const cls = await requireStudentClass(req)
  const { state } = parse(stateBody, req.body)
  await saveFromClient(req.user.id, cls.id, state)
  res.status(204).end()
})

// Clears the learner's own activity progress in this class. Submissions,
// reviews, posts and quiz history stay: classmates and the teacher rely on them.
router.post('/progress/reset', async (req, res) => {
  const cls = await requireStudentClass(req)
  await query('DELETE FROM progress WHERE user_id = $1 AND class_id = $2', [req.user.id, cls.id])
  res.json({ classId: cls.id, state: await recompute(req.user.id, cls.id) })
})

// ---------------- Quiz ----------------

const publicQuestion = (q, start) => ({
  id: q.id,
  type: q.type,
  outcome: q.outcome,
  prompt: q.prompt,
  ...(q.code ? { code: q.code } : null),
  options: q.options.map((o) => ({ id: o.id, label: o.label })),
  ...(start ? { start } : null),
})

const fullQuestion = (q) => ({
  ...publicQuestion(q),
  correct: q.correct,
  explanation: q.explanation,
  misconceptions: Object.fromEntries(q.options.filter((o) => o.misconception).map((o) => [o.id, o.misconception])),
})

const GRACE_MS = 30_000

async function ownAttempt(req, id) {
  const a = await one('SELECT * FROM quiz_attempts WHERE id = $1 AND user_id = $2', [id, req.user.id])
  if (!a) throw notFound('That quiz attempt does not exist.')
  return a
}

router.get('/quiz', async (req, res) => {
  const cls = await requireStudentClass(req)
  const facts = await loadFacts(req.user.id, cls.id)
  const best = facts.quizAttempts.reduce((m, a) => Math.max(m, a.pct), 0)
  res.json({ attempts: facts.quizAttempts, best, size: QUIZ_SIZE, bank: QUESTIONS.length, seconds: QUIZ_SECONDS })
})

router.post('/quiz/attempts', async (req, res) => {
  const cls = await requireStudentClass(req)
  const state = await recompute(req.user.id, cls.id)
  if (!activityOpen(state, 'quiz')) throw forbidden('The quiz opens when you finish the labs.', 'stage_locked')
  // Starting a new attempt abandons any unfinished one (it is not recorded).
  await query('DELETE FROM quiz_attempts WHERE user_id = $1 AND class_id = $2 AND finished_at IS NULL', [req.user.id, cls.id])
  const drawn = drawQuiz(QUIZ_SIZE)
  const row = await one('INSERT INTO quiz_attempts (user_id, class_id, questions) VALUES ($1, $2, $3) RETURNING id, started_at', [
    req.user.id,
    cls.id,
    JSON.stringify(drawn),
  ])
  res.status(201).json({
    id: row.id,
    startedAt: ms(row.started_at),
    seconds: QUIZ_SECONDS,
    questions: drawn.map((d) => publicQuestion(questionById(d.id), d.start)),
  })
})

router.post('/quiz/attempts/:id/answer', async (req, res) => {
  const body = parse(
    z.object({ questionId: z.string().max(60), answer: z.union([z.string().max(60), z.array(z.string().max(60)).max(12)]) }),
    req.body,
  )
  const a = await ownAttempt(req, req.params.id)
  if (a.finished_at) throw conflict('This attempt is already finished.')
  if (Date.now() > new Date(a.started_at).getTime() + QUIZ_SECONDS * 1000 + GRACE_MS) throw conflict('Time is up for this attempt.', 'time_up')
  if (!a.questions.some((q) => q.id === body.questionId)) throw bad('That question is not part of this attempt.')
  if (a.answers[body.questionId]) throw conflict('You already answered this question.')
  const q = questionById(body.questionId)
  const correct = isCorrect(q, body.answer)
  await query(`UPDATE quiz_attempts SET answers = answers || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1`, [
    a.id,
    body.questionId,
    JSON.stringify({ value: body.answer, correct }),
  ])
  const chosen = Array.isArray(body.answer) ? body.answer : [body.answer]
  const misconceptions = Object.fromEntries(q.options.filter((o) => o.misconception && chosen.includes(o.id)).map((o) => [o.id, o.misconception]))
  res.json({ correct, correctAnswer: q.correct, explanation: q.explanation, misconceptions })
})

router.post('/quiz/attempts/:id/finish', async (req, res) => {
  const cls = await requireStudentClass(req)
  const a = await ownAttempt(req, req.params.id)
  if (a.finished_at) throw conflict('This attempt is already finished.')
  const total = a.questions.length
  const score = a.questions.filter((q) => a.answers[q.id]?.correct).length
  await query('UPDATE quiz_attempts SET score = $2, total = $3, finished_at = now() WHERE id = $1', [a.id, score, total])

  const review = a.questions.map((d) => {
    const q = questionById(d.id)
    return { question: fullQuestion(q), answer: a.answers[d.id]?.value ?? null, correct: Boolean(a.answers[d.id]?.correct) }
  })
  const byOutcome = OUTCOMES.map((o) => {
    const items = review.filter((r) => r.question.outcome === o.id)
    return { outcome: o.id, correct: items.filter((r) => r.correct).length, total: items.length }
  }).filter((x) => x.total > 0)
  const state = await recompute(req.user.id, cls.id)
  res.json({ score, total, pct: Math.round((score / total) * 100), byOutcome, review, state })
})

export default router
