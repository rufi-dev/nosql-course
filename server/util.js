import crypto from 'node:crypto'

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const bad = (message, code = 'bad_request') => new HttpError(400, code, message)
export const forbidden = (message = 'You do not have access to this.', code = 'forbidden') => new HttpError(403, code, message)
export const notFound = (message = 'Not found.', code = 'not_found') => new HttpError(404, code, message)
export const conflict = (message, code = 'conflict') => new HttpError(409, code, message)

// Validate a request body with a zod schema; throws a readable 400.
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {})
  if (r.success) return r.data
  const first = r.error.issues[0]
  const field = first?.path?.join('.') || 'input'
  throw bad(`${field}: ${first?.message || 'invalid value'}`, 'validation')
}

// Join codes: unambiguous characters, e.g. "K7QM-4TXP". Never shipped to the browser bundle.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function makeJoinCode() {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}
export const normaliseCode = (c) => {
  const raw = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw
}

export const ms = (d) => (d ? new Date(d).getTime() : null)

export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v)
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}
