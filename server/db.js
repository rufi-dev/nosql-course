// PostgreSQL access: a shared pool, a transaction helper and a tiny
// migration runner (plain .sql files applied once, in name order).
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from './config.js'

const here = path.dirname(fileURLToPath(import.meta.url))

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
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

export async function migrate() {
  const client = await pool.connect()
  try {
    // One migrator at a time, even with several instances starting together.
    await client.query('SELECT pg_advisory_lock(727001)')
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    )
    const dir = path.join(here, 'migrations')
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
    const { rows } = await client.query('SELECT id FROM schema_migrations')
    const applied = new Set(rows.map((r) => r.id))
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await fs.readFile(path.join(dir, file), 'utf8')
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
    client.release()
  }
}
