// Assignment submission, peer review (workshop) and the class forum.
import { Router } from 'express'
import { z } from 'zod'
import { one, query, tx } from '../db.js'
import { requireUser, isTeacher } from '../auth.js'
import { parse, bad, conflict, forbidden, notFound, ms } from '../util.js'
import { requireStudentClass, recompute, submissionView } from '../learner.js'
import { activityOpen } from '../../src/lib/progressRules.js'
import { autoCheck } from '../../src/lib/assignmentCheck.js'
import { PEERS, RUBRIC, reviewAccuracy } from '../../src/data/peers.js'

const router = Router()
router.use(requireUser)

const fieldsSchema = z.object({
  schema: z.string().max(20_000).default(''),
  queries: z.string().max(20_000).default(''),
  result: z.string().max(20_000).default(''),
  shardKey: z.string().max(500).default(''),
  justification: z.string().max(20_000).default(''),
  attachment: z
    .object({ name: z.string().max(200), size: z.number().nonnegative(), text: z.string().max(50_000).optional() })
    .nullable()
    .optional(),
})

// ---------------- Assignment ----------------

router.get('/assignment', async (req, res) => {
  const cls = await requireStudentClass(req)
  const sub = await one('SELECT * FROM submissions WHERE class_id = $1 AND user_id = $2', [cls.id, req.user.id])
  let received = []
  if (sub) {
    const { rows } = await query(
      `SELECT scores, comment, reviewed_at FROM review_assignments
        WHERE submission_id = $1 AND reviewed_at IS NOT NULL ORDER BY reviewed_at`,
      [sub.id],
    )
    received = rows.map((r, i) => ({ reviewer: `Classmate ${i + 1}`, scores: r.scores, comment: r.comment, reviewedAt: ms(r.reviewed_at) }))
  }
  res.json({ submission: submissionView(sub), reviewsReceived: received })
})

router.post('/assignment/submit', async (req, res) => {
  const cls = await requireStudentClass(req)
  const { fields } = parse(z.object({ fields: fieldsSchema }), req.body)
  const state = await recompute(req.user.id, cls.id)
  if (!activityOpen(state, 'assignment')) throw forbidden('The assignment opens when you finish the labs.', 'stage_locked')
  for (const k of ['schema', 'queries', 'result', 'shardKey', 'justification'])
    if (!fields[k].trim()) throw bad(`Fill in every part of the brief before submitting (${k} is empty).`, 'incomplete')

  const existing = await one('SELECT id, status FROM submissions WHERE class_id = $1 AND user_id = $2', [cls.id, req.user.id])
  if (existing?.status === 'graded') throw conflict('Your teacher has already graded this submission.', 'graded')
  const { checks, score } = autoCheck(fields)
  const row = await one(
    `INSERT INTO submissions (class_id, user_id, fields, checks, auto_score, status, submitted_at)
     VALUES ($1, $2, $3, $4, $5, 'submitted', now())
     ON CONFLICT (class_id, user_id) DO UPDATE
       SET fields = EXCLUDED.fields, checks = EXCLUDED.checks, auto_score = EXCLUDED.auto_score,
           status = 'submitted', submitted_at = now()
     RETURNING *`,
    [cls.id, req.user.id, JSON.stringify(fields), JSON.stringify(checks), score],
  )
  res.json({ submission: submissionView(row), state: await recompute(req.user.id, cls.id) })
})

router.post('/assignment/withdraw', async (req, res) => {
  const cls = await requireStudentClass(req)
  const sub = await one('SELECT id, status FROM submissions WHERE class_id = $1 AND user_id = $2', [cls.id, req.user.id])
  if (!sub) throw notFound('You have not submitted yet.')
  if (sub.status === 'graded') throw conflict('Your teacher has already graded this submission.', 'graded')
  await query(`UPDATE submissions SET status = 'withdrawn' WHERE id = $1`, [sub.id])
  res.json({ ok: true, state: await recompute(req.user.id, cls.id) })
})

// ---------------- Workshop (peer review) ----------------

const SAMPLE_BY_ID = Object.fromEntries(PEERS.map((p) => [p.id, p]))
const publicFields = (f) => ({
  schema: f.schema,
  queries: f.queries,
  result: f.result,
  shardKey: f.shardKey,
  justification: f.justification,
})

// Give the reviewer three targets: classmates first (least-reviewed first),
// samples to fill. Unreviewed sample slots are upgraded when classmates submit.
async function ensureTargets(classId, reviewerId, ownSubmissionId) {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${classId}:${reviewerId}`])
    const { rows: mine } = await c.query('SELECT * FROM review_assignments WHERE class_id = $1 AND reviewer_id = $2 ORDER BY position', [
      classId,
      reviewerId,
    ])
    const taken = new Set(mine.filter((r) => r.submission_id).map((r) => r.submission_id))
    const { rows: candidates } = await c.query(
      `SELECT s.id, (SELECT count(*) FROM review_assignments ra WHERE ra.submission_id = s.id) AS load
         FROM submissions s
        WHERE s.class_id = $1 AND s.status <> 'withdrawn' AND s.id <> $2
        ORDER BY load ASC, random()`,
      [classId, ownSubmissionId],
    )
    const free = candidates.filter((s) => !taken.has(s.id))

    // Upgrade unreviewed sample slots to real classmates.
    for (const slot of mine.filter((r) => r.sample_id && !r.reviewed_at)) {
      const next = free.shift()
      if (!next) break
      await c.query('UPDATE review_assignments SET sample_id = NULL, submission_id = $2 WHERE id = $1', [slot.id, next.id])
    }
    // Fill empty positions.
    const used = new Set(mine.map((r) => r.position))
    const usedSamples = new Set(mine.map((r) => r.sample_id).filter(Boolean))
    for (let pos = 1; pos <= 3; pos++) {
      if (used.has(pos)) continue
      const next = free.shift()
      if (next) {
        await c.query('INSERT INTO review_assignments (class_id, reviewer_id, submission_id, position) VALUES ($1, $2, $3, $4)', [
          classId,
          reviewerId,
          next.id,
          pos,
        ])
      } else {
        const sample = PEERS.find((p) => !usedSamples.has(p.id))
        usedSamples.add(sample.id)
        await c.query('INSERT INTO review_assignments (class_id, reviewer_id, sample_id, position) VALUES ($1, $2, $3, $4)', [
          classId,
          reviewerId,
          sample.id,
          pos,
        ])
      }
    }
  })
}

async function targetsFor(classId, reviewerId) {
  const { rows } = await query(
    `SELECT ra.*, s.fields AS sub_fields, s.teacher_scores AS target_teacher_scores
       FROM review_assignments ra LEFT JOIN submissions s ON s.id = ra.submission_id
      WHERE ra.class_id = $1 AND ra.reviewer_id = $2 ORDER BY ra.position`,
    [classId, reviewerId],
  )
  return rows.map((r) => {
    const sample = r.sample_id ? SAMPLE_BY_ID[r.sample_id] : null
    const reviewed = Boolean(r.reviewed_at)
    const reference = sample ? sample.reference : r.target_teacher_scores || null
    return {
      id: r.id,
      position: r.position,
      kind: sample ? 'sample' : 'peer',
      label: sample ? sample.label : `Classmate submission ${r.position}`,
      fields: sample ? publicFields(sample) : publicFields(r.sub_fields || {}),
      review: reviewed
        ? {
            scores: r.scores,
            comment: r.comment,
            reviewedAt: ms(r.reviewed_at),
            accuracy: sample ? r.accuracy : reference ? reviewAccuracy(r.scores, reference) : null,
          }
        : null,
      // References are revealed only after the learner has committed a review.
      reference: reviewed && reference ? reference : null,
      rationale: reviewed && sample ? sample.rationale || null : null,
    }
  })
}

router.get('/workshop', async (req, res) => {
  const cls = await requireStudentClass(req)
  const state = await recompute(req.user.id, cls.id)
  const sub = await one(`SELECT id, status FROM submissions WHERE class_id = $1 AND user_id = $2 AND status <> 'withdrawn'`, [
    cls.id,
    req.user.id,
  ])
  const open = activityOpen(state, 'workshop')
  if (!open || !sub) {
    return res.json({
      phase: open ? 'submission' : 'locked',
      targets: [],
      samples: PEERS.map((p) => ({ id: p.id, label: p.label, fields: publicFields(p) })),
    })
  }
  await ensureTargets(cls.id, req.user.id, sub.id)
  const targets = await targetsFor(cls.id, req.user.id)
  const done = targets.filter((t) => t.review).length
  res.json({ phase: done >= 3 ? 'grading' : 'assessment', targets, reviewed: done })
})

router.post('/workshop/reviews', async (req, res) => {
  const cls = await requireStudentClass(req)
  const scoreShape = Object.fromEntries(RUBRIC.map((c) => [c.id, z.number().int().min(0).max(5)]))
  const body = parse(
    z.object({ targetId: z.string().uuid(), scores: z.object(scoreShape), comment: z.string().trim().min(25, 'write at least 25 characters').max(4000) }),
    req.body,
  )
  const state = await recompute(req.user.id, cls.id)
  if (!activityOpen(state, 'workshop')) throw forbidden('Peer review opens when you finish the labs.', 'stage_locked')
  const target = await one('SELECT * FROM review_assignments WHERE id = $1 AND reviewer_id = $2 AND class_id = $3', [
    body.targetId,
    req.user.id,
    cls.id,
  ])
  if (!target) throw notFound('That submission is not assigned to you.')
  if (target.reviewed_at) throw conflict('You already assessed this submission.')
  const accuracy = target.sample_id ? reviewAccuracy(body.scores, SAMPLE_BY_ID[target.sample_id].reference) : null
  await query('UPDATE review_assignments SET scores = $2, comment = $3, accuracy = $4, reviewed_at = now() WHERE id = $1', [
    target.id,
    JSON.stringify(body.scores),
    body.comment,
    accuracy,
  ])
  const targets = await targetsFor(cls.id, req.user.id)
  res.json({ target: targets.find((t) => t.id === target.id), targets, state: await recompute(req.user.id, cls.id) })
})

// ---------------- Forum ----------------

// Students use their current class; teachers pass ?classId= for their own class.
async function forumClass(req) {
  if (isTeacher(req.user)) {
    const classId = req.query.classId || req.body?.classId
    const cls = classId ? await one('SELECT id, teacher_id FROM classes WHERE id = $1 AND teacher_id = $2', [classId, req.user.id]) : null
    if (!cls) throw forbidden('Choose one of your classes.')
    return { cls, teacherId: req.user.id, isTeacherView: true }
  }
  const cls = await requireStudentClass(req)
  const t = await one('SELECT teacher_id FROM classes WHERE id = $1', [cls.id])
  return { cls, teacherId: t.teacher_id, isTeacherView: false }
}

async function listPosts(classId, teacherId, viewerId) {
  const { rows } = await query(
    `SELECT p.id, p.parent_id, p.body, p.created_at, p.author_id, u.name AS author_name,
            (SELECT count(*)::int FROM post_likes l WHERE l.post_id = p.id) AS likes,
            EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $2) AS liked
       FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.class_id = $1 ORDER BY p.created_at`,
    [classId, viewerId],
  )
  return rows.map((p) => ({
    id: p.id,
    parentId: p.parent_id,
    body: p.body,
    at: ms(p.created_at),
    author: { id: p.author_id, name: p.author_name, role: p.author_id === teacherId ? 'teacher' : 'student' },
    likes: p.likes,
    likedByMe: p.liked,
    mine: p.author_id === viewerId,
  }))
}

router.get('/forum', async (req, res) => {
  const { cls, teacherId } = await forumClass(req)
  res.json({ posts: await listPosts(cls.id, teacherId, req.user.id) })
})

router.post('/forum', async (req, res) => {
  const body = parse(
    z.object({
      body: z.string().trim().min(2, 'write a little more').max(4000),
      parentId: z.string().uuid().nullable().optional(),
      classId: z.string().uuid().optional(),
    }),
    req.body,
  )
  const { cls, teacherId, isTeacherView } = await forumClass(req)
  if (!isTeacherView) {
    const state = await recompute(req.user.id, cls.id)
    if (!activityOpen(state, 'discussion')) throw forbidden('The discussion opens when you finish the labs.', 'stage_locked')
  }
  if (body.parentId) {
    const parent = await one('SELECT parent_id FROM posts WHERE id = $1 AND class_id = $2', [body.parentId, cls.id])
    if (!parent) throw notFound('That post no longer exists.')
    if (parent.parent_id) throw bad('Reply to the original post, not to a reply.')
  }
  await query('INSERT INTO posts (class_id, author_id, parent_id, body) VALUES ($1, $2, $3, $4)', [
    cls.id,
    req.user.id,
    body.parentId || null,
    body.body,
  ])
  const state = isTeacherView ? null : await recompute(req.user.id, cls.id)
  res.status(201).json({ posts: await listPosts(cls.id, teacherId, req.user.id), state })
})

router.delete('/forum/:id', async (req, res) => {
  const post = await one(
    'SELECT p.id, p.author_id, p.class_id, c.teacher_id FROM posts p JOIN classes c ON c.id = p.class_id WHERE p.id = $1',
    [req.params.id],
  )
  if (!post) throw notFound('That post no longer exists.')
  if (post.author_id !== req.user.id && post.teacher_id !== req.user.id) throw forbidden('You can only delete your own posts.')
  await query('DELETE FROM posts WHERE id = $1', [post.id])
  const state = req.user.role === 'student' ? await recompute(req.user.id, post.class_id) : null
  res.json({ posts: await listPosts(post.class_id, post.teacher_id, req.user.id), state })
})

router.post('/forum/:id/like', async (req, res) => {
  const post = await one('SELECT p.id, p.class_id, c.teacher_id FROM posts p JOIN classes c ON c.id = p.class_id WHERE p.id = $1', [
    req.params.id,
  ])
  if (!post) throw notFound('That post no longer exists.')
  const member =
    post.teacher_id === req.user.id || (await one('SELECT 1 FROM enrollments WHERE class_id = $1 AND user_id = $2', [post.class_id, req.user.id]))
  if (!member) throw forbidden()
  const del = await query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [post.id, req.user.id])
  if (!del.rowCount) await query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [post.id, req.user.id])
  const row = await one('SELECT count(*)::int AS n FROM post_likes WHERE post_id = $1', [post.id])
  res.json({ likes: row.n, likedByMe: !del.rowCount })
})

export default router
