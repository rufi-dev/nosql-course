import { Router } from 'express'
import { z } from 'zod'
import { one, query, tx } from '../db.js'
import { config } from '../config.js'
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  destroyAllSessions,
  requireUser,
  isTeacher,
} from '../auth.js'
import { parse, bad, conflict, HttpError, normaliseCode, ms } from '../util.js'

const router = Router()

const email = z.string().trim().toLowerCase().max(200).email('enter a valid email address')
const password = z.string().min(8, 'use at least 8 characters').max(200)
const name = z.string().trim().min(1, 'enter your name').max(80)

// What the browser needs to know about the signed-in user.
export async function sessionPayload(userId) {
  const user = await one('SELECT id, name, email, role, current_class_id FROM users WHERE id = $1', [userId])
  if (!user) return { user: null, classes: [], currentClassId: null }
  let classes
  if (isTeacher(user)) {
    const { rows } = await query(
      `SELECT c.id, c.name, c.join_code, c.archived, c.stage_overrides, c.created_at,
              (SELECT count(*)::int FROM enrollments e WHERE e.class_id = c.id) AS students
         FROM classes c WHERE c.teacher_id = $1 ORDER BY c.archived, c.created_at DESC`,
      [user.id],
    )
    classes = rows.map((c) => ({
      id: c.id,
      name: c.name,
      role: 'teacher',
      joinCode: c.join_code,
      archived: c.archived,
      stageOverrides: c.stage_overrides,
      students: c.students,
      createdAt: ms(c.created_at),
    }))
  } else {
    const { rows } = await query(
      `SELECT c.id, c.name, c.archived, u.name AS teacher_name, e.joined_at
         FROM enrollments e JOIN classes c ON c.id = e.class_id JOIN users u ON u.id = c.teacher_id
        WHERE e.user_id = $1 ORDER BY e.joined_at`,
      [user.id],
    )
    classes = rows.map((c) => ({
      id: c.id,
      name: c.name,
      role: 'student',
      archived: c.archived,
      teacherName: c.teacher_name,
      joinedAt: ms(c.joined_at),
    }))
  }
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    classes,
    currentClassId: user.role === 'student' ? user.current_class_id : null,
  }
}

async function findClassByCode(code) {
  const c = normaliseCode(code)
  if (!c) return null
  return one('SELECT id, name, archived FROM classes WHERE join_code = $1', [c])
}

router.post('/signup', async (req, res) => {
  const body = parse(
    z.object({ name, email, password, joinCode: z.string().trim().max(20).optional().or(z.literal('')) }),
    req.body,
  )
  const role = config.adminEmail && body.email === config.adminEmail ? 'admin' : 'student'

  let cls = null
  if (role === 'student' && body.joinCode) {
    cls = await findClassByCode(body.joinCode)
    if (!cls || cls.archived) throw bad('No open class has that code. Check it with your teacher.', 'bad_code')
  }

  const exists = await one('SELECT 1 FROM users WHERE lower(email) = $1', [body.email])
  if (exists) throw conflict('An account with that email already exists. Log in instead.', 'email_taken')

  const hash = await hashPassword(body.password)
  const user = await tx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO users (email, name, password_hash, role, current_class_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [body.email, body.name, hash, role, cls?.id || null],
    )
    if (cls) await c.query('INSERT INTO enrollments (class_id, user_id) VALUES ($1, $2)', [cls.id, rows[0].id])
    return rows[0]
  })
  await createSession(res, user.id)
  res.status(201).json(await sessionPayload(user.id))
})

// A real hash to compare against when the email does not exist (equal timing).
let DUMMY_HASH = null
router.post('/login', async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body)
  const user = await one('SELECT id, password_hash FROM users WHERE lower(email) = $1', [body.email])
  if (!DUMMY_HASH) DUMMY_HASH = await hashPassword('not-a-real-password')
  const ok = await verifyPassword(body.password, user?.password_hash || DUMMY_HASH)
  if (!user || !ok) throw new HttpError(401, 'bad_credentials', 'That email and password do not match.')
  await createSession(res, user.id)
  res.json(await sessionPayload(user.id))
})

router.post('/logout', async (req, res) => {
  await destroySession(req, res)
  res.json({ ok: true })
})

router.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null, classes: [], currentClassId: null })
  res.json(await sessionPayload(req.user.id))
})

router.patch('/me', requireUser, async (req, res) => {
  const body = parse(z.object({ name }), req.body)
  await query('UPDATE users SET name = $1 WHERE id = $2', [body.name, req.user.id])
  res.json(await sessionPayload(req.user.id))
})

router.post('/password', requireUser, async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }), req.body)
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
  if (!(await verifyPassword(body.currentPassword, row.password_hash)))
    throw new HttpError(400, 'bad_credentials', 'Your current password is not correct.')
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(body.newPassword), req.user.id])
  // Sign out every other device, keep this one signed in.
  await destroyAllSessions(req.user.id)
  await createSession(res, req.user.id)
  res.json({ ok: true })
})

export default router
