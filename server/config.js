// Runtime configuration from environment variables.
const env = process.env

export const config = {
  port: Number(env.PORT || 3001),
  isProd: env.NODE_ENV === 'production',
  // Render sets DATABASE_URL from the linked PostgreSQL instance.
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/nosql_course',
  // Render's internal connection string does not need TLS; external URLs do.
  databaseSsl: env.DATABASE_SSL === 'true',
  // The account that signs up with this email becomes the admin teacher.
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  // Anyone can create a teacher account unless TEACHER_SIGNUP=closed.
  // Teachers only ever see their own classes, so this is safe to leave open.
  teacherSignup: (env.TEACHER_SIGNUP || 'open').trim().toLowerCase() !== 'closed',
  sessionDays: 30,
}

if (config.isProd && !env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Link a PostgreSQL database to this service.')
  process.exit(1)
}
