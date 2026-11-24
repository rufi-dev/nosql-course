// Student side of classes: join with a code, switch between classes.
import { Router } from 'express'
import { z } from 'zod'
import { one, query } from '../db.js'
import { requireUser } from '../auth.js'
import { parse, bad, forbidden, normaliseCode } from '../util.js'
import { sessionPayload } from './auth.js'

const router = Router()
router.use(requireUser)

router.post('/join', async (req, res) => {
  if (req.user.role !== 'student') throw forbidden('Teachers create classes on the dashboard; they do not join them.', 'teacher')
  const { code } = parse(z.object({ code: z.string().trim().min(4).max(20) }), req.body)
  const cls = await one('SELECT id, archived FROM classes WHERE join_code = $1', [normaliseCode(code)])
  if (!cls || cls.archived) throw bad('No open class has that code. Check it with your teacher.', 'bad_code')
  await query('INSERT INTO enrollments (class_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cls.id, req.user.id])
  await query('UPDATE users SET current_class_id = $1 WHERE id = $2', [cls.id, req.user.id])
  res.json(await sessionPayload(req.user.id))
})

router.post('/current', async (req, res) => {
  const { classId } = parse(z.object({ classId: z.string().uuid() }), req.body)
  const row = await one('SELECT 1 FROM enrollments WHERE class_id = $1 AND user_id = $2', [classId, req.user.id])
  if (!row) throw forbidden('You are not in that class.')
  await query('UPDATE users SET current_class_id = $1 WHERE id = $2', [classId, req.user.id])
  res.json(await sessionPayload(req.user.id))
})

export default router
