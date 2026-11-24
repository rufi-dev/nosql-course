// HTTP server: JSON API under /api, the built React app for everything else.
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import { migrate, pool } from './db.js'
import { loadUser, requireJson, cleanupSessions } from './auth.js'
import { HttpError } from './util.js'
import authRoutes from './routes/auth.js'
import classRoutes from './routes/classes.js'
import progressRoutes from './routes/progress.js'
import workRoutes from './routes/work.js'
import teacherRoutes, { adminRouter } from './routes/teacher.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // Render terminates TLS in front of the app

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // The in-browser MongoDB shell evaluates learner code with new Function().
          'script-src': ["'self'", "'unsafe-eval'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.use(compression())
  app.use(cookieParser())

  // ---------- API ----------
  const api = express.Router()
  api.use(express.json({ limit: '2mb' }))
  api.use(rateLimit({ windowMs: 5 * 60_000, limit: 900, standardHeaders: 'draft-8', legacyHeaders: false }))
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Wait a few minutes and try again.' } },
  })
  api.use(loadUser)
  api.use(requireJson)

  api.get('/health', async (_req, res) => {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  })
  api.use('/auth/login', authLimiter)
  api.use('/auth/signup', authLimiter)
  api.use('/auth/password', authLimiter)
  api.use('/auth', authRoutes)
  api.use('/classes', classRoutes)
  api.use('/teacher', teacherRoutes)
  api.use('/admin', adminRouter)
  api.use('/', progressRoutes)
  api.use('/', workRoutes)
  api.use((_req, _res) => {
    throw new HttpError(404, 'not_found', 'Unknown API route.')
  })
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message } })
    if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'too_large', message: 'That is too much data to save at once.' } })
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON.' } })
    console.error(`[api] ${req.method} ${req.originalUrl}`, err)
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } })
  })
  app.use('/api', api)

  // ---------- Built frontend ----------
  if (fs.existsSync(dist)) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }))
    app.use(
      express.static(dist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, file) => {
          if (file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache')
        },
      }),
    )
    // Client-side routes all serve the app shell.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(dist, 'index.html'))
    })
  } else {
    app.get('/', (_req, res) => res.type('text').send('API is running. Build the frontend with "npm run build", or use "npm run dev".'))
  }
  return app
}

async function waitForDatabase(timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs
  for (;;) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (err) {
      if (Date.now() > until) throw err
      console.log('Waiting for the database…')
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

export async function start() {
  await waitForDatabase()
  await migrate()
  const app = createApp()
  const server = app.listen(config.port, () => console.log(`Course server listening on http://localhost:${config.port}`))
  cleanupSessions()
  setInterval(cleanupSessions, 6 * 3600_000).unref()
  const stop = () => {
    server.close(() => pool.end().then(() => process.exit(0)))
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((err) => {
    console.error('Failed to start:', err)
    process.exit(1)
  })
}
