// Teacher dashboard API. Every route is scoped to classes the teacher owns.
import { Router } from 'express'
import { z } from 'zod'
import { one, query } from '../db.js'
import { requireTeacher, requireAdmin, hashPassword, destroyAllSessions } from '../auth.js'
import { parse, bad, conflict, forbidden, notFound, makeJoinCode, ms, csvCell } from '../util.js'
import { loadClassFacts, loadFacts, recompute, storedState, submissionView, reviewRowAccuracy } from '../learner.js'
import { canonicalize } from '../../src/lib/progressRules.js'
import { computeGrades } from '../../src/lib/grades.js'
import { stageStatus } from '../../src/lib/stages.js'
import { moduleProgress, nextActivity } from '../../src/lib/progress.js'
import { rubricScore } from '../../src/lib/assignmentCheck.js'
import { ACTIVITIES, STAGES, OUTCOMES, LABS, COURSE, activityById } from '../../src/data/course.js'
import { RUBRIC, PEERS } from '../../src/data/peers.js'

const router = Router()
router.use(requireTeacher)

const classView = (c) => ({
  id: c.id,
  name: c.name,
  joinCode: c.join_code,
  archived: c.archived,
  stageOverrides: c.stage_overrides,
  students: c.students ?? undefined,
  createdAt: ms(c.created_at),
})

async function ownClass(req, id = req.params.classId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw notFound('Class not found.')
  const c = await one('SELECT * FROM classes WHERE id = $1', [id])
  if (!c) throw notFound('Class not found.')
  if (c.teacher_id !== req.user.id) throw forbidden('That is not one of your classes.')
  return c
}

async function enrolled(classId, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId))) throw notFound('Student not found.')
  const s = await one(
    `SELECT u.id, u.name, u.email, u.last_seen_at, u.created_at, e.joined_at
       FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.class_id = $1 AND e.user_id = $2`,
    [classId, userId],
  )
  if (!s) throw notFound('That student is not in this class.')
  return s
}

async function insertClassWithCode(name, teacherId) {
  for (let i = 0; i < 8; i++) {
    try {
      return await one('INSERT INTO classes (name, teacher_id, join_code) VALUES ($1, $2, $3) RETURNING *', [name, teacherId, makeJoinCode()])
    } catch (err) {
      if (err.code !== '23505') throw err
    }
  }
  throw conflict('Could not generate a unique join code. Try again.')
}

// Summary of one student's canonical state for the class list.
function summarise(state) {
  const { done, total, pct } = moduleProgress(state.activities)
  const next = nextActivity(state.activities)
  const stages = Object.fromEntries(
    STAGES.map((s) => {
      const st = stageStatus(state, s.id)
      return [s.id, { done: st.done, total: st.total, open: st.open, complete: st.complete }]
    }),
  )
  const grades = computeGrades({ ...state, workshop: state.workshop })
  return {
    done,
    total,
    pct,
    current: next ? { id: next.id, short: next.short, stage: STAGES.find((s) => s.activities.includes(next.id)).id } : null,
    stages,
    grades: { total: grades.total, soFar: grades.soFar, onTrack: grades.onTrack, items: grades.items.map(({ key, pct }) => ({ key, pct })) },
    quizBest: state.quiz.best,
    quizAttempts: state.quiz.attempts.length,
    submitted: Boolean(state.assignment.submittedAt),
    graded: state.assignment.status === 'graded',
    reviewsGiven: Object.keys(state.workshop.reviews).length,
    reflected: Boolean(state.reflection?.submittedAt),
  }
}

// Canonical states for every student in a class (read-only: no writes).
async function classStates(cls) {
  const [{ rows: students }, { rows: progress }, facts] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.last_seen_at, e.joined_at
         FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.class_id = $1 ORDER BY lower(u.name)`,
      [cls.id],
    ),
    query('SELECT user_id, state, updated_at FROM progress WHERE class_id = $1', [cls.id]),
    loadClassFacts(cls.id),
  ])
  const byUser = new Map(progress.map((p) => [p.user_id, p]))
  return students.map((s) => {
    const stored = byUser.get(s.id)?.state || {}
    const state = canonicalize({ prev: stored, next: stored, facts: facts.get(s.id), overrides: cls.stage_overrides })
    return { student: s, state, updatedAt: ms(byUser.get(s.id)?.updated_at) }
  })
}

// ---------------- Classes ----------------

router.get('/classes', async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, (SELECT count(*)::int FROM enrollments e WHERE e.class_id = c.id) AS students
       FROM classes c WHERE c.teacher_id = $1 ORDER BY c.archived, c.created_at DESC`,
    [req.user.id],
  )
  res.json({ classes: rows.map(classView) })
})

router.post('/classes', async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(2, 'name the class').max(100) }), req.body)
  const c = await insertClassWithCode(name, req.user.id)
  res.status(201).json({ class: classView({ ...c, students: 0 }) })
})

router.patch('/classes/:classId', async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(100).optional(), archived: z.boolean().optional() }), req.body)
  const c = await ownClass(req)
  const row = await one('UPDATE classes SET name = $2, archived = $3 WHERE id = $1 RETURNING *', [
    c.id,
    body.name ?? c.name,
    body.archived ?? c.archived,
  ])
  res.json({ class: classView(row) })
})

router.post('/classes/:classId/code', async (req, res) => {
  const c = await ownClass(req)
  for (let i = 0; i < 8; i++) {
    try {
      const row = await one('UPDATE classes SET join_code = $2 WHERE id = $1 RETURNING *', [c.id, makeJoinCode()])
      return res.json({ class: classView(row) })
    } catch (err) {
      if (err.code !== '23505') throw err
    }
  }
  throw conflict('Could not generate a unique join code. Try again.')
})

router.put('/classes/:classId/stages', async (req, res) => {
  const body = parse(z.object({ stageId: z.enum(STAGES.slice(1).map((s) => s.id)), open: z.boolean() }), req.body)
  const c = await ownClass(req)
  const row = body.open
    ? await one(`UPDATE classes SET stage_overrides = stage_overrides || jsonb_build_object($2::text, true) WHERE id = $1 RETURNING *`, [
        c.id,
        body.stageId,
      ])
    : await one('UPDATE classes SET stage_overrides = stage_overrides - $2::text WHERE id = $1 RETURNING *', [c.id, body.stageId])
  res.json({ class: classView(row) })
})

// ---------------- Class overview (class list) ----------------

router.get('/classes/:classId/overview', async (req, res) => {
  const c = await ownClass(req)
  const states = await classStates(c)
  const students = states.map(({ student, state, updatedAt }) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    joinedAt: ms(student.joined_at),
    lastSeenAt: ms(student.last_seen_at),
    updatedAt,
    ...summarise(state),
  }))
  // Where students stop: how many finished each activity.
  const funnel = ACTIVITIES.map((a) => ({
    id: a.id,
    short: a.short,
    stage: STAGES.find((s) => s.activities.includes(a.id)).id,
    done: states.filter(({ state }) => state.activities[a.id]?.done).length,
  }))
  const stuck = Object.fromEntries(ACTIVITIES.map((a) => [a.id, 0]))
  for (const s of students) if (s.current) stuck[s.current.id] += 1
  const pending = await one(`SELECT count(*)::int AS n FROM submissions WHERE class_id = $1 AND status = 'submitted'`, [c.id])
  res.json({
    class: classView({ ...c, students: students.length }),
    students,
    funnel,
    stuck,
    pendingGrading: pending.n,
    averages: {
      pct: students.length ? Math.round(students.reduce((s, x) => s + x.pct, 0) / students.length) : 0,
      grade: students.length ? Math.round(students.reduce((s, x) => s + x.grades.total, 0) / students.length) : 0,
    },
  })
})

// ---------------- One student ----------------

router.get('/classes/:classId/students/:userId', async (req, res) => {
  const c = await ownClass(req)
  const s = await enrolled(c.id, req.params.userId)
  const [stored, facts] = await Promise.all([storedState(s.id, c.id), loadFacts(s.id, c.id)])
  const state = canonicalize({ prev: stored, next: stored, facts, overrides: c.stage_overrides })
  const [{ rows: attempts }, sub, { rows: given }, { rows: posts }] = await Promise.all([
    query(
      'SELECT score, total, started_at, finished_at FROM quiz_attempts WHERE user_id = $1 AND class_id = $2 AND finished_at IS NOT NULL ORDER BY finished_at',
      [s.id, c.id],
    ),
    one('SELECT * FROM submissions WHERE user_id = $1 AND class_id = $2', [s.id, c.id]),
    query(
      `SELECT ra.*, s2.teacher_scores AS target_teacher_scores, u.name AS target_name
         FROM review_assignments ra
         LEFT JOIN submissions s2 ON s2.id = ra.submission_id
         LEFT JOIN users u ON u.id = s2.user_id
        WHERE ra.class_id = $1 AND ra.reviewer_id = $2 ORDER BY ra.position`,
      [c.id, s.id],
    ),
    query('SELECT id, parent_id, body, created_at FROM posts WHERE class_id = $1 AND author_id = $2 ORDER BY created_at', [c.id, s.id]),
  ])
  const samples = Object.fromEntries(PEERS.map((p) => [p.id, p]))
  let received = []
  if (sub) {
    const { rows } = await query(
      `SELECT ra.scores, ra.comment, ra.reviewed_at, u.name AS reviewer FROM review_assignments ra JOIN users u ON u.id = ra.reviewer_id
        WHERE ra.submission_id = $1 AND ra.reviewed_at IS NOT NULL ORDER BY ra.reviewed_at`,
      [sub.id],
    )
    received = rows.map((r) => ({ reviewer: r.reviewer, scores: r.scores, comment: r.comment, reviewedAt: ms(r.reviewed_at) }))
  }
  res.json({
    student: { id: s.id, name: s.name, email: s.email, joinedAt: ms(s.joined_at), lastSeenAt: ms(s.last_seen_at) },
    summary: summarise(state),
    state,
    grades: computeGrades(state),
    labs: Object.entries(LABS).map(([key, l]) => ({
      key,
      title: l.title,
      checkpoints: l.checkpoints.map((cp) => ({ ...cp, at: state.labs?.[key]?.checkpoints?.[cp.id] || null })),
    })),
    quizAttempts: attempts.map((a) => ({ score: a.score, total: a.total, pct: Math.round((a.score / a.total) * 100), at: ms(a.finished_at) })),
    submission: submissionView(sub),
    reviewsGiven: given.map((r) => ({
      kind: r.sample_id ? 'sample' : 'peer',
      target: r.sample_id ? samples[r.sample_id]?.label : r.target_name,
      scores: r.scores,
      comment: r.comment,
      accuracy: reviewRowAccuracy(r, samples),
      reviewedAt: ms(r.reviewed_at),
    })),
    reviewsReceived: received,
    posts: posts.map((p) => ({ id: p.id, isReply: Boolean(p.parent_id), body: p.body, at: ms(p.created_at) })),
  })
})

router.delete('/classes/:classId/students/:userId', async (req, res) => {
  const c = await ownClass(req)
  const s = await enrolled(c.id, req.params.userId)
  await query('DELETE FROM enrollments WHERE class_id = $1 AND user_id = $2', [c.id, s.id])
  await query('UPDATE users SET current_class_id = NULL WHERE id = $1 AND current_class_id = $2', [s.id, c.id])
  res.json({ ok: true })
})

router.post('/classes/:classId/students/:userId/password', async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(8, 'use at least 8 characters').max(200) }), req.body)
  const c = await ownClass(req)
  const s = await enrolled(c.id, req.params.userId)
  const target = await one('SELECT role FROM users WHERE id = $1', [s.id])
  if (target.role !== 'student') throw forbidden('You can only reset student passwords.')
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), s.id])
  await destroyAllSessions(s.id)
  res.json({ ok: true })
})

// ---------------- Submissions and grading ----------------

router.get('/classes/:classId/submissions', async (req, res) => {
  const c = await ownClass(req)
  const { rows } = await query(
    `SELECT s.*, u.name AS student_name,
            (SELECT count(*)::int FROM review_assignments ra WHERE ra.submission_id = s.id AND ra.reviewed_at IS NOT NULL) AS reviews
       FROM submissions s JOIN users u ON u.id = s.user_id
      WHERE s.class_id = $1 AND s.status <> 'withdrawn'
      ORDER BY (s.status = 'graded'), s.submitted_at`,
    [c.id],
  )
  res.json({
    submissions: rows.map((r) => ({ ...submissionView(r), student: { id: r.user_id, name: r.student_name }, reviewsReceived: r.reviews })),
  })
})

async function ownSubmission(req) {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('Submission not found.')
  const sub = await one(
    `SELECT s.*, c.teacher_id, u.name AS student_name FROM submissions s
       JOIN classes c ON c.id = s.class_id JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [req.params.id],
  )
  if (!sub) throw notFound('Submission not found.')
  if (sub.teacher_id !== req.user.id) throw forbidden('That submission is not from one of your classes.')
  return sub
}

router.get('/submissions/:id', async (req, res) => {
  const sub = await ownSubmission(req)
  const { rows } = await query(
    `SELECT ra.scores, ra.comment, ra.reviewed_at, u.name AS reviewer FROM review_assignments ra JOIN users u ON u.id = ra.reviewer_id
      WHERE ra.submission_id = $1 AND ra.reviewed_at IS NOT NULL ORDER BY ra.reviewed_at`,
    [sub.id],
  )
  res.json({
    submission: { ...submissionView(sub), classId: sub.class_id, student: { id: sub.user_id, name: sub.student_name } },
    reviewsReceived: rows.map((r) => ({ reviewer: r.reviewer, scores: r.scores, comment: r.comment, reviewedAt: ms(r.reviewed_at) })),
    rubric: RUBRIC,
  })
})

router.put('/submissions/:id/grade', async (req, res) => {
  const scoreShape = Object.fromEntries(RUBRIC.map((c) => [c.id, z.number().int().min(0).max(5)]))
  const body = parse(z.object({ scores: z.object(scoreShape), feedback: z.string().trim().max(5000).default('') }), req.body)
  const sub = await ownSubmission(req)
  if (sub.status === 'withdrawn') throw bad('The student withdrew this submission.')
  const row = await one(
    `UPDATE submissions SET teacher_scores = $2, teacher_score = $3, teacher_feedback = $4, status = 'graded', graded_at = now()
      WHERE id = $1 RETURNING *`,
    [sub.id, JSON.stringify(body.scores), rubricScore(body.scores), body.feedback],
  )
  // The student's grade changes, and so does the accuracy of everyone who reviewed it.
  const { rows: reviewers } = await query('SELECT DISTINCT reviewer_id FROM review_assignments WHERE submission_id = $1', [sub.id])
  await Promise.all([recompute(sub.user_id, sub.class_id), ...reviewers.map((r) => recompute(r.reviewer_id, sub.class_id))])
  res.json({ submission: { ...submissionView(row), student: { id: sub.user_id, name: sub.student_name } } })
})

router.delete('/submissions/:id/grade', async (req, res) => {
  const sub = await ownSubmission(req)
  const row = await one(
    `UPDATE submissions SET teacher_scores = NULL, teacher_score = NULL, teacher_feedback = NULL, status = 'submitted', graded_at = NULL
      WHERE id = $1 RETURNING *`,
    [sub.id],
  )
  await recompute(sub.user_id, sub.class_id)
  res.json({ submission: submissionView(row) })
})

// ---------------- Feedback (reflections) ----------------

router.get('/classes/:classId/feedback', async (req, res) => {
  const c = await ownClass(req)
  const states = await classStates(c)
  const reflections = states
    .filter(({ state }) => state.reflection?.submittedAt)
    .map(({ student, state }) => ({ student: { id: student.id, name: student.name }, ...state.reflection }))
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  res.json({
    reflections,
    averages: {
      rating: avg(reflections.map((r) => r.rating).filter(Boolean)),
      minutes: avg(reflections.map((r) => Number(r.minutes)).filter((n) => Number.isFinite(n) && n > 0)),
      confidence: Object.fromEntries(OUTCOMES.map((o) => [o.id, avg(reflections.map((r) => r.confidence?.[o.id]).filter(Boolean))])),
    },
  })
})

// ---------------- CSV export ----------------

router.get('/classes/:classId/export.csv', async (req, res) => {
  const c = await ownClass(req)
  const states = await classStates(c)
  const header = [
    'Name',
    'Email',
    'Joined',
    'Last active',
    'Activities done',
    'Current activity',
    ...STAGES.map((s) => `${s.title} (done/total)`),
    'Labs %',
    'Quiz best %',
    'Assignment %',
    'Assignment graded by teacher',
    'Peer review %',
    `Module total /100 (pass ${COURSE.passMark})`,
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const { student, state } of states) {
    const sum = summarise(state)
    const g = computeGrades(state)
    const item = (k) => g.items.find((i) => i.key === k)?.pct ?? ''
    lines.push(
      [
        student.name,
        student.email,
        student.joined_at ? new Date(student.joined_at).toISOString().slice(0, 10) : '',
        student.last_seen_at ? new Date(student.last_seen_at).toISOString().slice(0, 16).replace('T', ' ') : '',
        `${sum.done}/${sum.total}`,
        sum.current ? activityById(sum.current.id).short : 'Finished',
        ...STAGES.map((s) => `${sum.stages[s.id].done}/${sum.stages[s.id].total}`),
        item('labs'),
        item('quiz'),
        item('assignment'),
        state.assignment.status === 'graded' ? 'yes' : 'no',
        item('peer'),
        g.total,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  const safeName = c.name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'class'
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-grades.csv"`)
  res.send(`﻿${lines.join('\r\n')}\r\n`)
})

// ---------------- Admin: user roles ----------------

export const adminRouter = Router()
adminRouter.use(requireAdmin)

adminRouter.get('/users', async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.created_at, u.last_seen_at,
            (SELECT count(*)::int FROM classes c WHERE c.teacher_id = u.id) AS classes_taught,
            (SELECT count(*)::int FROM enrollments e WHERE e.user_id = u.id) AS classes_joined
       FROM users u ORDER BY u.created_at DESC`,
  )
  res.json({
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: ms(u.created_at),
      lastSeenAt: ms(u.last_seen_at),
      classesTaught: u.classes_taught,
      classesJoined: u.classes_joined,
    })),
  })
})

adminRouter.patch('/users/:id', async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(['student', 'teacher', 'admin']) }), req.body)
  if (req.params.id === req.user.id) throw bad('You cannot change your own role.')
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('User not found.')
  const u = await one('SELECT id, role FROM users WHERE id = $1', [req.params.id])
  if (!u) throw notFound('User not found.')
  if (u.role !== 'student' && role === 'student') {
    const owns = await one('SELECT count(*)::int AS n FROM classes WHERE teacher_id = $1', [u.id])
    if (owns.n > 0) throw conflict('This teacher still owns classes. Archive or hand them over first.')
  }
  if (role !== 'student') await query('UPDATE users SET current_class_id = NULL WHERE id = $1', [u.id])
  const row = await one('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, email, role', [u.id, role])
  res.json({ user: row })
})

export default router
