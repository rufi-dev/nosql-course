// Vercel entry point: the whole Express API runs as this one function.
// vercel.json rewrites /api/* here, and Express still sees the original path.
// The built React app is served by Vercel's CDN, not by this function.
import { createApp } from '../server/index.js'
import { config } from '../server/config.js'
import { migrateIfNeeded } from '../server/db.js'
import { cleanupSessions } from '../server/auth.js'

const app = createApp({ frontend: false })

// Once per instance: apply any new migrations and clear expired sessions.
let ready = null
const prepare = () =>
  (ready ??= (async () => {
    await migrateIfNeeded()
    await cleanupSessions()
  })().catch((err) => {
    ready = null // try again on the next request
    throw err
  }))

const unavailable = (res, code, message) => {
  res.statusCode = 503
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({ error: { code, message } }))
}

export default async function handler(req, res) {
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set. Connect a Neon database to this Vercel project, then redeploy.')
    return unavailable(res, 'no_database', 'The course database is not connected yet. Please try again later.')
  }
  try {
    await prepare()
  } catch (err) {
    console.error('Database not ready:', err)
    return unavailable(res, 'database_unavailable', 'The course database is not reachable right now. Please try again in a moment.')
  }
  return app(req, res)
}
