// Local PostgreSQL for development, no install needed (embedded-postgres).
// Data lives in .local-pg/ (git-ignored). Production uses Render PostgreSQL.
import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const PORT = Number(process.env.DEV_PG_PORT || 5433)
const dir = path.resolve('.local-pg')
const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'))

const server = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error('[pg]', String(e).trim()),
})

if (fresh) await server.initialise()
await server.start()

const admin = new pg.Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres` })
await admin.connect()
for (const db of ['nosql_course', 'nosql_course_test']) {
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db])
  if (!rowCount) await admin.query(`CREATE DATABASE ${db}`)
}
await admin.end()
console.log(`Local PostgreSQL ready on port ${PORT} (databases: nosql_course, nosql_course_test)`)

const stop = async () => {
  await server.stop().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
setInterval(() => {}, 1 << 30)
