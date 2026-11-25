// PostgreSQL access: a shared pool, a transaction helper and a tiny
// migration runner (plain .sql files applied once, in name order).
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from './config.js'

const here = path.dirname(fileURLToPath(import.meta.url))

// pg already treats sslmode=require (Neon's default) as verify-full; saying so
// explicitly keeps the same behaviour without pg's deprecation warning.
const withSslMode = (url) => url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/i, '$1verify-full')

const connection = (url) => ({
  connectionString: withSslMode(url),
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
})

// Serverless instances are many and short-lived: keep each one's pool small.
export const pool = new pg.Pool({
  ...connection(config.databaseUrl),
  max: config.onVercel ? 4 : 10,
  idleTimeoutMillis: config.onVercel ? 10_000 : 30_000,
})

pool.on('error', (err) => console.error('PostgreSQL pool error', err.message))

export const query = (text, params) => pool.query(text, params)

export async function one(text, params) {
  const { rows } = await pool.query(text, params)
  return rows[0] || null
}

export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

const migrationsDir = path.join(here, 'migrations')
const migrationFiles = async () => (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

export async function migrate() {
  // Its own direct connection: the advisory lock below is tied to one session.
  const client = new pg.Client(connection(config.migrationUrl))
  await client.connect()
  try {
    // One migrator at a time, even with several instances starting together.
    await client.query('SELECT pg_advisory_lock(727001)')
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    )
    const files = await migrationFiles()
    const { rows } = await client.query('SELECT id FROM schema_migrations')
    const applied = new Set(rows.map((r) => r.id))
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`migration applied: ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${err.message}`)
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {})
    await client.end().catch(() => {})
  }
}

// For serverless cold starts: one cheap read when everything is applied already,
// the full locked migration only when something is missing.
export async function migrateIfNeeded() {
  const files = await migrationFiles()
  try {
    const { rows } = await pool.query('SELECT id FROM schema_migrations')
    const applied = new Set(rows.map((r) => r.id))
    if (files.every((f) => applied.has(f))) return
  } catch (err) {
    if (err.code !== '42P01') throw err // 42P01: schema_migrations does not exist yet
  }
  await migrate()
}
