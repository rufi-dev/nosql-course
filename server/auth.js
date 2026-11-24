// Passwords (scrypt), sessions (random token in an httpOnly cookie, only its
// hash stored) and access-control middleware.
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { one, query } from './db.js'
import { config } from './config.js'
import { HttpError, forbidden } from './util.js'

const scrypt = promisify(crypto.scrypt)
const KEYLEN = 64
const COOKIE = 'nsql_session'

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  try {
    const [algo, n, r, p, saltB64, keyB64] = stored.split('$')
    if (algo !== 'scrypt') return false
    const expected = Buffer.from(keyB64, 'base64')
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +n, r: +r, p: +p })
    return crypto.timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

export async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000)
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), userId, expires])
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    expires,
    path: '/',
  })
}

export async function destroySession(req, res) {
  const token = req.cookies?.[COOKIE]
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)])
  res.clearCookie(COOKIE, { path: '/' })
}

export async function destroyAllSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

// Attaches req.user (or null). Never throws for anonymous requests.
export async function loadUser(req, _res, next) {
  req.user = null
  const token = req.cookies?.[COOKIE]
  if (!token) return next()
  const row = await one(
    `SELECT u.id, u.email, u.name, u.role, u.current_class_id, u.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  )
  if (row) {
    req.user = row
    // Cheap activity tracking for the teacher dashboard (at most every 5 minutes).
    if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 300_000) {
      query('UPDATE users SET last_seen_at = now() WHERE id = $1', [row.id]).catch(() => {})
    }
  }
  next()
}

export function requireUser(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  next()
}

export const isTeacher = (user) => user && (user.role === 'teacher' || user.role === 'admin')

export function requireTeacher(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  if (!isTeacher(req.user)) throw forbidden('Teacher access only.')
  next()
}

export function requireAdmin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  if (req.user.role !== 'admin') throw forbidden('Admin access only.')
  next()
}

// Mutating API calls must be same-origin JSON (blocks cross-site form posts).
export function requireJson(req, _res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const type = req.headers['content-type'] || ''
    const xrw = req.headers['x-requested-with']
    if (!type.includes('application/json') && xrw !== 'fetch') {
      throw new HttpError(415, 'unsupported', 'Send JSON.')
    }
  }
  next()
}

export async function cleanupSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {})
}
