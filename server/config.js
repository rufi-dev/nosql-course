// Runtime configuration from environment variables.
const env = process.env

// Vercel sets VERCEL=1 in its builds and functions.
const onVercel = Boolean(env.VERCEL)
const isProd = env.NODE_ENV === 'production' || onVercel

// Render links DATABASE_URL; the Neon integration on Vercel sets DATABASE_URL (pooled)
// and DATABASE_URL_UNPOOLED (direct). POSTGRES_* are the older Vercel names.
const databaseUrl =
  env.DATABASE_URL || env.POSTGRES_URL || (isProd ? '' : 'postgres://postgres:postgres@127.0.0.1:5433/nosql_course')

export const config = {
  port: Number(env.PORT || 3001),
  isProd,
  onVercel,
  databaseUrl,
  // Migrations hold a session lock, so they use a direct connection when there is one
  // (a transaction pooler such as PgBouncer can move a session between connections).
  migrationUrl: env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || databaseUrl,
  // Render's internal connection string does not need TLS; external URLs do.
  // URLs with ?sslmode=require (Neon) turn TLS on by themselves.
  databaseSsl: env.DATABASE_SSL === 'true',
  // The account that signs up with this email becomes the admin teacher.
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  // Anyone can create a teacher account unless TEACHER_SIGNUP=closed.
  // Teachers only ever see their own classes, so this is safe to leave open.
  teacherSignup: (env.TEACHER_SIGNUP || 'open').trim().toLowerCase() !== 'closed',
  sessionDays: 30,
}

// A long-running server cannot do anything without a database. On Vercel the
// function answers with a clear 503 instead (see api/index.js).
if (isProd && !databaseUrl && !onVercel) {
  console.error('DATABASE_URL is not set. Link a PostgreSQL database to this service.')
  process.exit(1)
}
