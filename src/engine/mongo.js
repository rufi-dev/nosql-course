// In-memory, MongoDB-style engine. Pure JS, synchronous, no dependencies.
// It implements the subset of the MongoDB query language a course needs:
// CRUD, query/update operators, projections, sorting, indexes with explain(),
// and an aggregation pipeline. Result objects mirror mongosh.

/* ------------------------------------------------------------------ */
/* BSON-ish value types                                                */
/* ------------------------------------------------------------------ */

const randomHex = (n) => {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}
const PROCESS_ID = randomHex(10)
let oidCounter = Math.floor(Math.random() * 0xffffff)

export class BSONError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BSONError'
  }
}

export class ObjectId {
  constructor(hex) {
    if (hex instanceof ObjectId) hex = hex.$oid
    if (hex !== undefined && hex !== null) {
      if (typeof hex !== 'string' || !/^[0-9a-fA-F]{24}$/.test(hex)) {
        throw new BSONError('input must be a 24 character hex string, 12 byte Uint8Array, or an integer')
      }
      this.$oid = hex.toLowerCase()
    } else {
      const ts = Math.floor(Date.now() / 1000)
        .toString(16)
        .padStart(8, '0')
      oidCounter = (oidCounter + 1) % 0xffffff
      this.$oid = ts + PROCESS_ID + oidCounter.toString(16).padStart(6, '0')
    }
  }
  toString() {
    return this.$oid
  }
  toHexString() {
    return this.$oid
  }
  toJSON() {
    return { $oid: this.$oid }
  }
  equals(other) {
    return other instanceof ObjectId && other.$oid === this.$oid
  }
  getTimestamp() {
    return new Date(parseInt(this.$oid.slice(0, 8), 16) * 1000)
  }
}

export class MongoServerError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'MongoServerError'
    if (code !== undefined) this.code = code
  }
}
export class MongoBulkWriteError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'MongoBulkWriteError'
    this.code = 11000
    this.details = details
  }
}
export class MongoInvalidArgumentError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MongoInvalidArgumentError'
  }
}

export const isOid = (v) => v instanceof ObjectId
export const isDate = (v) => v instanceof Date
export const isRegex = (v) => v instanceof RegExp
export const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !isOid(v) && !isDate(v) && !isRegex(v)
const isOperatorObject = (v) => {
  if (!isPlainObject(v)) return false
  const keys = Object.keys(v)
  return keys.length > 0 && keys[0].startsWith('$')
}

function typeRank(v) {
  if (v === undefined || v === null) return 1
  if (typeof v === 'number' || typeof v === 'bigint') return 2
  if (typeof v === 'string') return 3
  if (Array.isArray(v)) return 5
  if (isOid(v)) return 7
  if (typeof v === 'boolean') return 8
  if (isDate(v)) return 9
  if (isRegex(v)) return 11
  if (typeof v === 'object') return 4
  return 12
}

export function typeName(v) {
  if (v === undefined) return 'missing'
  if (v === null) return 'null'
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'boolean') return 'bool'
  if (Array.isArray(v)) return 'array'
  if (isOid(v)) return 'objectId'
  if (isDate(v)) return 'date'
  if (isRegex(v)) return 'regex'
  return 'object'
}

export function compareValues(a, b) {
  const ra = typeRank(a)
  const rb = typeRank(b)
  if (ra !== rb) return ra - rb
  switch (ra) {
    case 1:
      return 0
    case 2: {
      const x = Number(a)
      const y = Number(b)
      if (Number.isNaN(x)) return Number.isNaN(y) ? 0 : -1
      if (Number.isNaN(y)) return 1
      return x < y ? -1 : x > y ? 1 : 0
    }
    case 3:
      return a < b ? -1 : a > b ? 1 : 0
    case 7:
      return a.$oid < b.$oid ? -1 : a.$oid > b.$oid ? 1 : 0
    case 8:
      return (a ? 1 : 0) - (b ? 1 : 0)
    case 9:
      return a.getTime() - b.getTime()
    case 11:
      return a.toString() < b.toString() ? -1 : a.toString() > b.toString() ? 1 : 0
    case 5: {
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i++) {
        const c = compareValues(a[i], b[i])
        if (c) return c
      }
      return a.length - b.length
    }
    case 4: {
      const ea = Object.entries(a)
      const eb = Object.entries(b)
      const n = Math.min(ea.length, eb.length)
      for (let i = 0; i < n; i++) {
        const ct = compareValues(ea[i][1], eb[i][1]) // value types first is close enough
        if (ea[i][0] !== eb[i][0]) return ea[i][0] < eb[i][0] ? -1 : 1
        if (ct) return ct
      }
      return ea.length - eb.length
    }
    default:
      return 0
  }
}

export const valuesEqual = (a, b) => typeRank(a) === typeRank(b) && compareValues(a, b) === 0

export function cloneValue(v) {
  if (Array.isArray(v)) return v.map(cloneValue)
  if (isDate(v)) return new Date(v.getTime())
  if (isOid(v) || isRegex(v)) return v
  if (v !== null && typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) out[k] = cloneValue(x)
    return out
  }
  if (v === undefined) return null
  return v
}

// Extended JSON for persistence
export function toEJSON(v) {
  if (Array.isArray(v)) return v.map(toEJSON)
  if (isDate(v)) return { $date: Number.isNaN(v.getTime()) ? null : v.toISOString() }
  if (isOid(v)) return { $oid: v.$oid }
  if (isRegex(v)) return { $regex: v.source, $options: v.flags }
  if (v !== null && typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = toEJSON(x)
    return out
  }
  return v
}
export function fromEJSON(v) {
  if (Array.isArray(v)) return v.map(fromEJSON)
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 1 && keys[0] === '$oid' && typeof v.$oid === 'string') return new ObjectId(v.$oid)
    if (keys.length === 1 && keys[0] === '$date') return new Date(v.$date)
    if (keys.length === 2 && '$regex' in v && '$options' in v) return new RegExp(v.$regex, v.$options)
    const out = {}
    for (const [k, x] of Object.entries(v)) out[k] = fromEJSON(x)
    return out
  }
  return v
}

// Compact one-line rendering used inside error messages ("dup key: { _id: "p1" }")
function inlineValue(v) {
  if (typeof v === 'string') return JSON.stringify(v)
  if (isOid(v)) return `ObjectId('${v.$oid}')`
  if (isDate(v)) return `new Date(${v.getTime()})`
  if (Array.isArray(v)) return `[ ${v.map(inlineValue).join(', ')} ]`
  if (isPlainObject(v)) return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${inlineValue(x)}`).join(', ')} }`
  return String(v)
}

const idKey = (v) => (isOid(v) ? `oid:${v.$oid}` : `${typeof v}:${isPlainObject(v) || Array.isArray(v) ? JSON.stringify(toEJSON(v)) : String(v)}`)
export { idKey }

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

// All candidate values for a dotted path (traverses arrays like MongoDB).
function pathValues(doc, path) {
  const parts = path.split('.')
  const out = []
  const walk = (v, i) => {
    if (i === parts.length) {
      out.push(v)
      return
    }
    const key = parts[i]
    if (Array.isArray(v)) {
      if (/^\d+$/.test(key)) walk(v[Number(key)], i + 1)
      for (const el of v) if (isPlainObject(el)) walk(el, i)
      return
    }
    if (isPlainObject(v)) {
      walk(v[key], i + 1)
      return
    }
    out.push(undefined)
  }
  walk(doc, 0)
  if (!out.length) out.push(undefined)
  return out
}

function getPath(obj, path) {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      if (/^\d+$/.test(p)) cur = cur[Number(p)]
      else return undefined
    } else if (typeof cur === 'object' && !isOid(cur) && !isDate(cur)) cur = cur[p]
    else return undefined
  }
  return cur
}

function setPath(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    const key = Array.isArray(cur) && /^\d+$/.test(k) ? Number(k) : k
    if (cur[key] === undefined || cur[key] === null) cur[key] = {}
    else if (typeof cur[key] !== 'object' || isOid(cur[key]) || isDate(cur[key]) || isRegex(cur[key])) {
      throw new MongoServerError(
        `Cannot create field '${parts[i + 1]}' in element {${k}: ${inlineValue(cur[key])}}`,
        28,
      )
    }
    cur = cur[key]
  }
  const last = parts[parts.length - 1]
  if (Array.isArray(cur) && /^\d+$/.test(last)) {
    const idx = Number(last)
    while (cur.length < idx) cur.push(null)
    cur[idx] = value
  } else cur[last] = value
}

function unsetPath(obj, path) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return false
    cur = cur[parts[i]]
  }
  if (cur === null || typeof cur !== 'object') return false
  const last = parts[parts.length - 1]
  if (!(last in cur)) return false
  if (Array.isArray(cur)) cur[Number(last)] = null
  else delete cur[last]
  return true
}

/* ------------------------------------------------------------------ */
/* Query matching                                                      */
/* ------------------------------------------------------------------ */

const anyCandidate = (cands, test) => cands.some((v) => test(v) || (Array.isArray(v) && v.some(test)))
const comparable = (a, b) => typeRank(a) === typeRank(b) && a !== undefined

function regexTest(re, v) {
  if (typeof v === 'string') {
    re.lastIndex = 0
    return re.test(v)
  }
  return isRegex(v) && v.toString() === re.toString()
}

function matchOperator(cands, op, arg, whole) {
  switch (op) {
    case '$eq':
      return anyCandidate(cands, (v) => valuesEqual(v, arg))
    case '$ne':
      return !anyCandidate(cands, (v) => valuesEqual(v, arg))
    case '$gt':
      return anyCandidate(cands, (v) => comparable(v, arg) && compareValues(v, arg) > 0)
    case '$gte':
      return anyCandidate(cands, (v) => (arg === null ? v == null : comparable(v, arg) && compareValues(v, arg) >= 0))
    case '$lt':
      return anyCandidate(cands, (v) => comparable(v, arg) && compareValues(v, arg) < 0)
    case '$lte':
      return anyCandidate(cands, (v) => (arg === null ? v == null : comparable(v, arg) && compareValues(v, arg) <= 0))
    case '$in':
      if (!Array.isArray(arg)) throw new MongoServerError('$in needs an array', 2)
      return anyCandidate(cands, (v) => arg.some((a) => (isRegex(a) ? regexTest(a, v) : valuesEqual(v, a))))
    case '$nin':
      if (!Array.isArray(arg)) throw new MongoServerError('$nin needs an array', 2)
      return !anyCandidate(cands, (v) => arg.some((a) => (isRegex(a) ? regexTest(a, v) : valuesEqual(v, a))))
    case '$exists':
      return arg ? cands.some((v) => v !== undefined) : cands.every((v) => v === undefined)
    case '$regex': {
      let re
      try {
        re = isRegex(arg) ? arg : new RegExp(arg, (whole && whole.$options) || '')
      } catch (e) {
        throw new MongoServerError(`Regular expression is invalid: ${e.message}`, 51091)
      }
      return anyCandidate(cands, (v) => regexTest(re, v))
    }
    case '$options':
      return true
    case '$not':
      if (isRegex(arg)) return !anyCandidate(cands, (v) => regexTest(arg, v))
      if (isOperatorObject(arg)) return !Object.entries(arg).every(([o, a]) => matchOperator(cands, o, a, arg))
      throw new MongoServerError('$not needs a regex or a document', 2)
    case '$all':
      if (!Array.isArray(arg)) throw new MongoServerError('$all needs an array', 2)
      return cands.some((v) => Array.isArray(v) && arg.length > 0 && arg.every((a) => v.some((el) => valuesEqual(el, a))))
    case '$size':
      if (typeof arg !== 'number') throw new MongoServerError('$size needs a number', 2)
      return cands.some((v) => Array.isArray(v) && v.length === arg)
    case '$elemMatch':
      if (!isPlainObject(arg)) throw new MongoServerError('$elemMatch needs an Object', 2)
      return cands.some(
        (v) =>
          Array.isArray(v) &&
          v.some((el) =>
            isOperatorObject(arg)
              ? Object.entries(arg).every(([o, a]) => matchOperator([el], o, a, arg))
              : isPlainObject(el) && matchDocument(el, arg),
          ),
      )
    case '$type': {
      const wanted = Array.isArray(arg) ? arg : [arg]
      const NUM = { 1: 'double', 2: 'string', 3: 'object', 4: 'array', 7: 'objectId', 8: 'bool', 9: 'date', 10: 'null', 11: 'regex', 16: 'int' }
      return anyCandidate(cands, (v) =>
        wanted.some((w) => {
          const name = typeof w === 'number' ? NUM[w] : w
          const t = typeName(v)
          if (name === 'number') return typeof v === 'number'
          if (name === 'double' && t === 'int') return false
          return t === name
        }),
      )
    }
    case '$mod': {
      if (!Array.isArray(arg) || arg.length !== 2) throw new MongoServerError('malformed mod, needs to be an array', 2)
      return anyCandidate(cands, (v) => typeof v === 'number' && v % arg[0] === arg[1])
    }
    default:
      throw new MongoServerError(`unknown operator: ${op}`, 2)
  }
}

function matchField(doc, path, cond) {
  const cands = pathValues(doc, path)
  if (isOperatorObject(cond)) return Object.entries(cond).every(([op, arg]) => matchOperator(cands, op, arg, cond))
  if (isRegex(cond)) return anyCandidate(cands, (v) => regexTest(cond, v))
  return anyCandidate(cands, (v) => valuesEqual(v, cond))
}

export function matchDocument(doc, filter) {
  if (filter === undefined || filter === null) return true
  if (!isPlainObject(filter)) throw new MongoInvalidArgumentError('Query filter must be a plain object or ObjectId')
  for (const [k, v] of Object.entries(filter)) {
    if (k === '$and' || k === '$or' || k === '$nor') {
      if (!Array.isArray(v) || !v.length) throw new MongoServerError(`${k} argument must be a non-empty array`, 2)
      if (k === '$and' && !v.every((f) => matchDocument(doc, f))) return false
      if (k === '$or' && !v.some((f) => matchDocument(doc, f))) return false
      if (k === '$nor' && v.some((f) => matchDocument(doc, f))) return false
    } else if (k === '$expr') {
      if (!truthy(evalExpr(v, doc))) return false
    } else if (k === '$comment') {
      continue
    } else if (k.startsWith('$')) {
      throw new MongoServerError(`unknown top level operator: ${k}`, 2)
    } else if (!matchField(doc, k, v)) return false
  }
  return true
}

const truthy = (v) => !(v === false || v === null || v === undefined || v === 0)

/* ------------------------------------------------------------------ */
/* Aggregation expressions                                             */
/* ------------------------------------------------------------------ */

function exprPath(doc, path) {
  const parts = path.split('.')
  let cur = doc
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) cur = cur.map((el) => (isPlainObject(el) ? el[p] : undefined)).filter((x) => x !== undefined)
    else if (isPlainObject(cur)) cur = cur[p]
    else return undefined
  }
  return cur
}

const num = (v) => (typeof v === 'number' ? v : null)

export function evalExpr(expr, doc, vars = {}) {
  if (typeof expr === 'string' && expr.startsWith('$$')) {
    const [name, ...rest] = expr.slice(2).split('.')
    const base = name === 'ROOT' || name === 'CURRENT' ? doc : vars[name]
    return rest.length ? exprPath(base, rest.join('.')) : base
  }
  if (typeof expr === 'string' && expr.startsWith('$')) return exprPath(doc, expr.slice(1))
  if (Array.isArray(expr)) return expr.map((e) => evalExpr(e, doc, vars))
  if (!isPlainObject(expr)) return expr
  const keys = Object.keys(expr)
  if (keys.length === 1 && keys[0].startsWith('$')) {
    const op = keys[0]
    const raw = expr[op]
    const args = () => (Array.isArray(raw) ? raw.map((e) => evalExpr(e, doc, vars)) : [evalExpr(raw, doc, vars)])
    switch (op) {
      case '$literal':
        return raw
      case '$add': {
        const a = args()
        if (a.some((x) => x === null || x === undefined)) return null
        const date = a.find(isDate)
        const total = a.reduce((s, x) => s + (isDate(x) ? x.getTime() : x), 0)
        return date ? new Date(total) : total
      }
      case '$subtract': {
        const [x, y] = args()
        if (x == null || y == null) return null
        if (isDate(x) && isDate(y)) return x.getTime() - y.getTime()
        if (isDate(x)) return new Date(x.getTime() - y)
        return x - y
      }
      case '$multiply': {
        const a = args()
        return a.some((x) => x == null) ? null : a.reduce((s, x) => s * x, 1)
      }
      case '$divide': {
        const [x, y] = args()
        if (x == null || y == null) return null
        if (y === 0) throw new MongoServerError("can't $divide by zero", 16608)
        return x / y
      }
      case '$mod': {
        const [x, y] = args()
        return x == null || y == null ? null : x % y
      }
      case '$abs': {
        const [x] = args()
        return x == null ? null : Math.abs(x)
      }
      case '$round': {
        const [x, place = 0] = args()
        if (x == null) return null
        const f = 10 ** place
        return Math.round(x * f) / f
      }
      case '$concat': {
        const a = args()
        return a.some((x) => x == null) ? null : a.join('')
      }
      case '$toUpper':
        return String(args()[0] ?? '').toUpperCase()
      case '$toLower':
        return String(args()[0] ?? '').toLowerCase()
      case '$toString': {
        const [x] = args()
        return x == null ? null : isDate(x) ? x.toISOString() : String(x)
      }
      case '$size': {
        const [x] = args()
        if (!Array.isArray(x)) throw new MongoServerError(`The argument to $size must be an array. Type of argument: ${typeName(x)}`, 17124)
        return x.length
      }
      case '$ifNull': {
        const a = args()
        return a.find((x) => x !== null && x !== undefined) ?? null
      }
      case '$cond': {
        let c, t, f
        if (Array.isArray(raw)) [c, t, f] = raw
        else ({ if: c, then: t, else: f } = raw)
        return truthy(evalExpr(c, doc, vars)) ? evalExpr(t, doc, vars) : evalExpr(f, doc, vars)
      }
      case '$eq':
      case '$ne':
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
      case '$cmp': {
        const [x, y] = args()
        const c = compareValues(x, y)
        return { $eq: c === 0, $ne: c !== 0, $gt: c > 0, $gte: c >= 0, $lt: c < 0, $lte: c <= 0, $cmp: Math.sign(c) }[op]
      }
      case '$and':
        return args().every(truthy)
      case '$or':
        return args().some(truthy)
      case '$not':
        return !truthy(args()[0])
      case '$in': {
        const [x, arr] = args()
        if (!Array.isArray(arr)) throw new MongoServerError('$in requires an array as a second argument', 40081)
        return arr.some((a) => valuesEqual(a, x))
      }
      case '$arrayElemAt': {
        const [arr, i] = args()
        if (!Array.isArray(arr)) return null
        return i < 0 ? arr[arr.length + i] : arr[i]
      }
      case '$sum':
      case '$avg':
      case '$min':
      case '$max': {
        let a = args()
        if (a.length === 1 && Array.isArray(a[0])) a = a[0]
        const nums = a.map(num).filter((x) => x !== null)
        if (op === '$sum') return nums.reduce((s, x) => s + x, 0)
        if (op === '$avg') return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : null
        const vals = a.filter((x) => x !== null && x !== undefined)
        if (!vals.length) return null
        return vals.reduce((m, x) => ((op === '$min' ? compareValues(x, m) < 0 : compareValues(x, m) > 0) ? x : m))
      }
      case '$year':
      case '$month':
      case '$dayOfMonth':
      case '$hour': {
        const [d] = args()
        if (!isDate(d)) return null
        return { $year: d.getUTCFullYear(), $month: d.getUTCMonth() + 1, $dayOfMonth: d.getUTCDate(), $hour: d.getUTCHours() }[op]
      }
      case '$dateToString': {
        const d = evalExpr(raw.date, doc, vars)
        if (!isDate(d)) return null
        const p = (n, w = 2) => String(n).padStart(w, '0')
        return (raw.format || '%Y-%m-%dT%H:%M:%S.%LZ')
          .replace('%Y', d.getUTCFullYear())
          .replace('%m', p(d.getUTCMonth() + 1))
          .replace('%d', p(d.getUTCDate()))
          .replace('%H', p(d.getUTCHours()))
          .replace('%M', p(d.getUTCMinutes()))
          .replace('%S', p(d.getUTCSeconds()))
          .replace('%L', p(d.getUTCMilliseconds(), 3))
      }
      default:
        throw new MongoServerError(`Unrecognized expression '${op}'`, 168)
    }
  }
  const out = {}
  for (const [k, v] of Object.entries(expr)) out[k] = evalExpr(v, doc, vars)
  return out
}

/* ------------------------------------------------------------------ */
/* Sorting and projection                                              */
/* ------------------------------------------------------------------ */

function sortValue(doc, path, dir) {
  const vals = pathValues(doc, path).flatMap((v) => (Array.isArray(v) && v.length ? v : [v]))
  return vals.reduce((m, v) => ((dir > 0 ? compareValues(v, m) < 0 : compareValues(v, m) > 0) ? v : m))
}

function sortDocs(docs, spec) {
  if (!spec || !isPlainObject(spec)) return docs
  const keys = Object.entries(spec)
  for (const [, d] of keys) {
    if (d !== 1 && d !== -1) throw new MongoServerError('$sort key ordering must be 1 (for ascending) or -1 (for descending)', 15975)
  }
  return docs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      for (const [k, dir] of keys) {
        const c = compareValues(sortValue(a.d, k, dir), sortValue(b.d, k, dir))
        if (c) return dir * c
      }
      return a.i - b.i
    })
    .map((x) => x.d)
}

function applyProjection(doc, proj, isAgg = false) {
  if (!proj || !isPlainObject(proj) || !Object.keys(proj).length) return cloneValue(doc)
  const entries = Object.entries(proj)
  const isIncl = (v) => v === 1 || v === true || (isAgg && (typeof v === 'string' || isPlainObject(v))) || (!isAgg && (typeof v === 'string' || isPlainObject(v)))
  const isExcl = (v) => v === 0 || v === false
  const nonId = entries.filter(([k]) => k !== '_id')
  const inclusion = nonId.some(([, v]) => isIncl(v))
  const exclusion = nonId.some(([, v]) => isExcl(v))
  if (inclusion && exclusion) {
    const [k] = nonId.find(([, v]) => isExcl(v))
    throw new MongoServerError(`Cannot do exclusion on field ${k} in inclusion projection`, 31254)
  }
  if (inclusion || (!exclusion && proj._id !== undefined && isIncl(proj._id))) {
    const out = {}
    if (!(proj._id === 0 || proj._id === false)) {
      if (proj._id !== undefined && typeof proj._id !== 'number' && typeof proj._id !== 'boolean') out._id = evalExpr(proj._id, doc)
      else if (doc._id !== undefined) out._id = cloneValue(doc._id)
    }
    for (const [k, v] of nonId) {
      if (v === 1 || v === true) {
        const val = getPath(doc, k)
        if (val !== undefined) setPath(out, k, cloneValue(val))
      } else {
        setPath(out, k, cloneValue(evalExpr(v, doc)))
      }
    }
    return out
  }
  const out = cloneValue(doc)
  for (const [k, v] of entries) if (isExcl(v)) unsetPath(out, k)
  return out
}

/* ------------------------------------------------------------------ */
/* Updates                                                             */
/* ------------------------------------------------------------------ */

const UPDATE_OPS = new Set(['$set', '$unset', '$inc', '$mul', '$min', '$max', '$rename', '$push', '$addToSet', '$pull', '$pop', '$currentDate', '$setOnInsert'])

function pullMatches(el, cond) {
  if (isOperatorObject(cond)) return Object.entries(cond).every(([o, a]) => matchOperator([el], o, a, cond))
  if (isPlainObject(cond) && isPlainObject(el)) return matchDocument(el, cond)
  return valuesEqual(el, cond)
}

function applyUpdate(original, update, { inserting = false } = {}) {
  const doc = cloneValue(original)
  const changed = new Set()
  if (Array.isArray(update)) {
    // pipeline-style update
    const [res] = runPipeline([doc], update, null)
    const out = res || doc
    for (const k of new Set([...Object.keys(original), ...Object.keys(out)])) if (!valuesEqual(original[k], out[k])) changed.add(k)
    return { doc: out, changed }
  }
  for (const [op, spec] of Object.entries(update)) {
    if (!UPDATE_OPS.has(op)) {
      throw new MongoServerError(`Unknown modifier: ${op}. Expected a valid update modifier or pipeline-style update specified as an array`, 9)
    }
    if (!isPlainObject(spec)) throw new MongoServerError(`Modifiers operate on fields but we found type ${typeName(spec)} instead. For example: {$mod: {<field>: ...}} not {$set: ${inlineValue(spec)}}`, 9)
    for (const [path, arg] of Object.entries(spec)) {
      const old = getPath(doc, path)
      const mark = () => changed.add(path.split('.')[0] === path ? path : path)
      switch (op) {
        case '$set':
          if (!valuesEqual(old, arg) || old === undefined) {
            setPath(doc, path, cloneValue(arg))
            mark()
          }
          break
        case '$setOnInsert':
          if (inserting) {
            setPath(doc, path, cloneValue(arg))
            mark()
          }
          break
        case '$unset':
          if (unsetPath(doc, path)) mark()
          break
        case '$inc':
        case '$mul': {
          if (typeof arg !== 'number') {
            throw new MongoServerError(`Cannot ${op === '$inc' ? 'increment' : 'multiply'} with non-numeric argument: {${path}: ${inlineValue(arg)}}`, 14)
          }
          if (old !== undefined && typeof old !== 'number') {
            throw new MongoServerError(
              `Cannot apply ${op} to a value of non-numeric type. {_id: ${inlineValue(doc._id)}} has the field '${path}' of non-numeric type ${typeName(old)}`,
              14,
            )
          }
          const next = op === '$inc' ? (old ?? 0) + arg : (old ?? 0) * arg
          if (next !== old) {
            setPath(doc, path, next)
            mark()
          }
          break
        }
        case '$min':
        case '$max':
          if (old === undefined || (op === '$min' ? compareValues(arg, old) < 0 : compareValues(arg, old) > 0)) {
            setPath(doc, path, cloneValue(arg))
            mark()
          }
          break
        case '$rename':
          if (typeof arg !== 'string') throw new MongoServerError(`The 'to' field for $rename must be a string: ${path}: ${inlineValue(arg)}`, 2)
          if (old !== undefined) {
            unsetPath(doc, path)
            setPath(doc, arg, old)
            changed.add(path)
            changed.add(arg)
          }
          break
        case '$push':
        case '$addToSet': {
          if (old !== undefined && !Array.isArray(old)) {
            throw new MongoServerError(
              `The field '${path}' must be an array but is of type ${typeName(old)} in document {_id: ${inlineValue(doc._id)}}`,
              2,
            )
          }
          const each = isPlainObject(arg) && '$each' in arg ? arg.$each : [arg]
          if (!Array.isArray(each)) throw new MongoServerError('The argument to $each must be an array', 2)
          const arr = old ? [...old] : []
          let didChange = old === undefined
          for (const item of each) {
            if (op === '$addToSet' && arr.some((x) => valuesEqual(x, item))) continue
            if (op === '$push' && isPlainObject(arg) && typeof arg.$position === 'number') arr.splice(arg.$position, 0, cloneValue(item))
            else arr.push(cloneValue(item))
            didChange = true
          }
          let finalArr = arr
          if (op === '$push' && isPlainObject(arg)) {
            if (arg.$sort !== undefined) {
              finalArr = isPlainObject(arg.$sort) ? sortDocs(finalArr, arg.$sort) : [...finalArr].sort((a, b) => arg.$sort * compareValues(a, b))
            }
            if (typeof arg.$slice === 'number') finalArr = arg.$slice >= 0 ? finalArr.slice(0, arg.$slice) : finalArr.slice(arg.$slice)
          }
          if (didChange) {
            setPath(doc, path, finalArr)
            mark()
          }
          break
        }
        case '$pull': {
          if (old === undefined) break
          if (!Array.isArray(old)) throw new MongoServerError('Cannot apply $pull to a non-array value', 2)
          const next = old.filter((el) => !pullMatches(el, arg))
          if (next.length !== old.length) {
            setPath(doc, path, next)
            mark()
          }
          break
        }
        case '$pop': {
          if (old === undefined) break
          if (!Array.isArray(old)) throw new MongoServerError(`Path '${path}' contains an element of non-array type '${typeName(old)}'`, 14)
          if (old.length) {
            setPath(doc, path, arg === -1 ? old.slice(1) : old.slice(0, -1))
            mark()
          }
          break
        }
        case '$currentDate':
          setPath(doc, path, new Date())
          mark()
          break
        default:
          break
      }
    }
  }
  return { doc, changed }
}

/* ------------------------------------------------------------------ */
/* Aggregation pipeline                                                */
/* ------------------------------------------------------------------ */

function groupKey(v) {
  return JSON.stringify(toEJSON(v === undefined ? null : v))
}

function runGroup(docs, spec) {
  if (!('_id' in spec)) throw new MongoServerError("a group specification must include an _id", 15955)
  const groups = new Map()
  for (const d of docs) {
    const id = evalExpr(spec._id, d)
    const key = groupKey(id)
    if (!groups.has(key)) groups.set(key, { _id: id === undefined ? null : id, rows: [] })
    groups.get(key).rows.push(d)
  }
  const out = []
  for (const g of groups.values()) {
    const res = { _id: g._id }
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue
      if (!isPlainObject(acc) || Object.keys(acc).length !== 1) {
        throw new MongoServerError(`The field '${field}' must be an accumulator object`, 40234)
      }
      const [op, expr] = Object.entries(acc)[0]
      const vals = g.rows.map((r) => evalExpr(expr, r))
      switch (op) {
        case '$sum':
          res[field] = vals.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
          break
        case '$avg': {
          const n = vals.filter((v) => typeof v === 'number')
          res[field] = n.length ? n.reduce((s, v) => s + v, 0) / n.length : null
          break
        }
        case '$min':
        case '$max': {
          const v = vals.filter((x) => x !== null && x !== undefined)
          res[field] = v.length ? v.reduce((m, x) => ((op === '$min' ? compareValues(x, m) < 0 : compareValues(x, m) > 0) ? x : m)) : null
          break
        }
        case '$push':
          res[field] = vals.map((v) => (v === undefined ? null : cloneValue(v)))
          break
        case '$addToSet': {
          const arr = []
          for (const v of vals) if (v !== undefined && !arr.some((x) => valuesEqual(x, v))) arr.push(cloneValue(v))
          res[field] = arr
          break
        }
        case '$first':
          res[field] = cloneValue(vals[0] ?? null)
          break
        case '$last':
          res[field] = cloneValue(vals[vals.length - 1] ?? null)
          break
        case '$count':
          res[field] = g.rows.length
          break
        default:
          throw new MongoServerError(`Unrecognized accumulator operator: ${op}`, 15952)
      }
    }
    out.push(res)
  }
  return out
}

function runPipeline(input, pipeline, lookupResolver) {
  if (!Array.isArray(pipeline)) throw new MongoInvalidArgumentError('Pipeline must be an array of stages')
  let docs = input.map(cloneValue)
  for (const stage of pipeline) {
    if (!isPlainObject(stage) || Object.keys(stage).length !== 1) {
      throw new MongoServerError('A pipeline stage specification object must contain exactly one field.', 40323)
    }
    const [name, spec] = Object.entries(stage)[0]
    switch (name) {
      case '$match':
        docs = docs.filter((d) => matchDocument(d, spec))
        break
      case '$group':
        docs = runGroup(docs, spec)
        break
      case '$sort':
        docs = sortDocs(docs, spec)
        break
      case '$limit':
        if (typeof spec !== 'number' || spec <= 0) throw new MongoServerError('the limit must be positive', 15958)
        docs = docs.slice(0, spec)
        break
      case '$skip':
        docs = docs.slice(spec)
        break
      case '$project':
        docs = docs.map((d) => applyProjection(d, spec, true))
        break
      case '$addFields':
      case '$set':
        docs = docs.map((d) => {
          const out = cloneValue(d)
          for (const [k, v] of Object.entries(spec)) setPath(out, k, cloneValue(evalExpr(v, d)))
          return out
        })
        break
      case '$unset': {
        const fields = Array.isArray(spec) ? spec : [spec]
        docs = docs.map((d) => {
          const out = cloneValue(d)
          for (const f of fields) unsetPath(out, f)
          return out
        })
        break
      }
      case '$unwind': {
        const opts = typeof spec === 'string' ? { path: spec } : spec
        if (typeof opts.path !== 'string' || !opts.path.startsWith('$')) {
          throw new MongoServerError("path option to $unwind stage should be prefixed with a '$'", 28818)
        }
        const path = opts.path.slice(1)
        const next = []
        for (const d of docs) {
          const v = getPath(d, path)
          if (Array.isArray(v) && v.length) {
            v.forEach((el, i) => {
              const c = cloneValue(d)
              setPath(c, path, cloneValue(el))
              if (opts.includeArrayIndex) c[opts.includeArrayIndex] = i
              next.push(c)
            })
          } else if (v !== undefined && v !== null && !Array.isArray(v)) {
            next.push(cloneValue(d))
          } else if (opts.preserveNullAndEmptyArrays) {
            next.push(cloneValue(d))
          }
        }
        docs = next
        break
      }
      case '$count':
        if (typeof spec !== 'string' || !spec) throw new MongoServerError('the count field must be a non-empty string', 40156)
        docs = docs.length ? [{ [spec]: docs.length }] : []
        break
      case '$lookup': {
        const { from, localField, foreignField, as } = spec || {}
        if (!from || !as) throw new MongoServerError("must specify 'from' and 'as' fields in a $lookup", 40322)
        const foreign = lookupResolver ? lookupResolver(from) : []
        docs = docs.map((d) => {
          const local = getPath(d, localField)
          const keys = Array.isArray(local) ? local : [local]
          const matches = foreign.filter((f) => keys.some((k) => anyCandidate(pathValues(f, foreignField), (v) => valuesEqual(v, k))))
          const c = cloneValue(d)
          setPath(c, as, matches.map(cloneValue))
          return c
        })
        break
      }
      case '$replaceRoot':
      case '$replaceWith': {
        const expr = name === '$replaceRoot' ? spec.newRoot : spec
        docs = docs.map((d) => {
          const v = evalExpr(expr, d)
          if (!isPlainObject(v)) throw new MongoServerError(`'newRoot' expression must evaluate to an object, but resulting value was: ${inlineValue(v)}`, 40228)
          return v
        })
        break
      }
      case '$sample': {
        const size = spec?.size ?? 1
        docs = [...docs].sort(() => Math.random() - 0.5).slice(0, size)
        break
      }
      case '$sortByCount': {
        docs = sortDocs(runGroup(docs, { _id: spec, count: { $sum: 1 } }), { count: -1 })
        break
      }
      default:
        throw new MongoServerError(`Unrecognized pipeline stage name: '${name}'`, 40324)
    }
  }
  return docs
}

/* ------------------------------------------------------------------ */
/* Indexes and explain                                                 */
/* ------------------------------------------------------------------ */

const SARGABLE = new Set(['$eq', '$gt', '$gte', '$lt', '$lte', '$in', '$all', '$regex'])
function isSargable(cond, hashed) {
  if (!isOperatorObject(cond)) return true
  const ops = Object.keys(cond)
  if (hashed) return ops.every((o) => o === '$eq' || o === '$in')
  return ops.some((o) => SARGABLE.has(o)) && !ops.some((o) => o === '$ne' || o === '$nin' || o === '$not' || o === '$exists')
}

function chooseIndex(indexes, filter) {
  if (!isPlainObject(filter)) return null
  let best = null
  let bestScore = 0
  for (const ix of indexes) {
    const keys = Object.entries(ix.key)
    let score = 0
    for (const [field, kind] of keys) {
      if (!(field in filter) || !isSargable(filter[field], kind === 'hashed')) break
      score++
    }
    if (score > bestScore || (score === bestScore && score > 0 && ix.name === '_id_')) {
      best = ix
      bestScore = score
    }
  }
  return best
}

function boundsFor(cond) {
  const fmtB = (v) => (typeof v === 'string' ? `"${v}"` : isOid(v) ? `ObjectId('${v.$oid}')` : String(v))
  if (!isOperatorObject(cond)) return [`[${fmtB(cond)}, ${fmtB(cond)}]`]
  if ('$in' in cond && Array.isArray(cond.$in)) return cond.$in.map((v) => `[${fmtB(v)}, ${fmtB(v)}]`)
  if ('$eq' in cond) return [`[${fmtB(cond.$eq)}, ${fmtB(cond.$eq)}]`]
  const isStr = [cond.$gt, cond.$gte, cond.$lt, cond.$lte].some((v) => typeof v === 'string')
  const lowInf = isStr ? '""' : '-inf.0'
  const highInf = isStr ? '{}' : 'inf.0'
  const lo = '$gt' in cond ? `(${fmtB(cond.$gt)}` : '$gte' in cond ? `[${fmtB(cond.$gte)}` : `[${lowInf}`
  const hi = '$lt' in cond ? `${fmtB(cond.$lt)})` : '$lte' in cond ? `${fmtB(cond.$lte)}]` : `${highInf}]`
  return [`${lo}, ${hi}`]
}

function indexName(keys) {
  return Object.entries(keys)
    .map(([k, v]) => `${k}_${v}`)
    .join('_')
}

/* ------------------------------------------------------------------ */
/* Cursors                                                             */
/* ------------------------------------------------------------------ */

export class Cursor {
  constructor(coll, filter, projection) {
    this._isCursor = true
    this._coll = coll
    this._filter = filter ?? {}
    this._projection = projection
    this._sort = null
    this._skip = 0
    this._limit = 0
    this._pos = 0
    this._buffer = null
  }
  sort(spec) {
    this._sort = spec
    return this
  }
  skip(n) {
    this._skip = n
    return this
  }
  limit(n) {
    this._limit = n
    return this
  }
  project(p) {
    this._projection = p
    return this
  }
  pretty() {
    return this
  }
  batchSize() {
    return this
  }
  hint() {
    return this
  }
  _run(log = true) {
    const { docs: raw } = this._coll._read()
    let docs = raw.filter((d) => matchDocument(d, this._filter))
    docs = sortDocs(docs, this._sort)
    if (this._skip) docs = docs.slice(this._skip)
    if (this._limit) docs = docs.slice(0, Math.abs(this._limit))
    const out = docs.map((d) => applyProjection(d, this._projection))
    if (log) {
      this._coll._log({
        type: 'find',
        filter: cloneValue(this._filter),
        filterFields: Object.keys(this._filter || {}),
        ids: docs.map((d) => d._id),
        docs: docs.length <= 60 ? docs.map(cloneValue) : null,
        count: docs.length,
      })
    }
    return out
  }
  toArray() {
    return this._run()
  }
  forEach(fn) {
    this._run().forEach(fn)
  }
  map(fn) {
    return this._run().map(fn)
  }
  count() {
    return this._coll._read().docs.filter((d) => matchDocument(d, this._filter)).length
  }
  size() {
    return this._run(false).length
  }
  itcount() {
    return this._run(false).length
  }
  hasNext() {
    if (!this._buffer) this._buffer = this._run()
    return this._pos < this._buffer.length
  }
  next() {
    if (!this._buffer) this._buffer = this._run()
    return this._buffer[this._pos++] ?? null
  }
  explain(verbosity = 'queryPlanner') {
    const coll = this._coll
    const { docs: raw, indexes } = coll._read()
    const filter = this._filter || {}
    const ix = chooseIndex(indexes, filter)
    const results = this._run(false)
    let input
    let keysExamined = 0
    let docsExamined = raw.length
    if (ix) {
      const firstField = Object.keys(ix.key)[0]
      const keyMatches = raw.filter((d) => matchField(d, firstField, filter[firstField]))
      keysExamined = keyMatches.length
      docsExamined = keyMatches.length
      const bounds = {}
      for (const f of Object.keys(ix.key)) bounds[f] = f in filter ? boundsFor(filter[f]) : ['[MinKey, MaxKey]']
      input = {
        stage: 'FETCH',
        ...(Object.keys(filter).length > Object.keys(ix.key).filter((f) => f in filter).length ? { filter: cloneValue(filter) } : {}),
        inputStage: {
          stage: 'IXSCAN',
          keyPattern: cloneValue(ix.key),
          indexName: ix.name,
          isMultiKey: raw.some((d) => Object.keys(ix.key).some((f) => Array.isArray(getPath(d, f)))),
          direction: 'forward',
          indexBounds: bounds,
        },
      }
    } else {
      input = { stage: 'COLLSCAN', filter: cloneValue(filter), direction: 'forward' }
    }
    let plan = input
    if (this._sort) plan = { stage: 'SORT', sortPattern: cloneValue(this._sort), inputStage: plan }
    if (this._limit) plan = { stage: 'LIMIT', limitAmount: this._limit, inputStage: plan }
    if (this._projection) plan = { stage: 'PROJECTION_SIMPLE', transformBy: cloneValue(this._projection), inputStage: plan }
    const out = {
      explainVersion: '1',
      queryPlanner: {
        namespace: coll._ns,
        parsedQuery: cloneValue(filter),
        winningPlan: plan,
        rejectedPlans: [],
      },
    }
    if (verbosity === 'executionStats' || verbosity === 'allPlansExecution' || verbosity === true) {
      out.executionStats = {
        executionSuccess: true,
        nReturned: results.length,
        executionTimeMillis: 0,
        totalKeysExamined: keysExamined,
        totalDocsExamined: docsExamined,
      }
    }
    coll._log({
      type: 'explain',
      filter: cloneValue(filter),
      filterFields: Object.keys(filter),
      stage: ix ? 'IXSCAN' : 'COLLSCAN',
      indexName: ix ? ix.name : null,
      indexKey: ix ? cloneValue(ix.key) : null,
      nReturned: results.length,
      totalDocsExamined: docsExamined,
      totalKeysExamined: keysExamined,
      collectionSize: raw.length,
    })
    return out
  }
}

export class AggregationCursor {
  constructor(compute) {
    this._isCursor = true
    this._compute = compute
    this._buffer = null
    this._pos = 0
  }
  _run() {
    return this._compute()
  }
  toArray() {
    return this._run()
  }
  forEach(fn) {
    this._run().forEach(fn)
  }
  map(fn) {
    return this._run().map(fn)
  }
  pretty() {
    return this
  }
  itcount() {
    return this._run().length
  }
  hasNext() {
    if (!this._buffer) this._buffer = this._run()
    return this._pos < this._buffer.length
  }
  next() {
    if (!this._buffer) this._buffer = this._run()
    return this._buffer[this._pos++] ?? null
  }
}

export const isCursor = (v) => Boolean(v && typeof v === 'object' && v._isCursor === true)

/* ------------------------------------------------------------------ */
/* Collection                                                          */
/* ------------------------------------------------------------------ */

export const COLLECTION_METHODS = [
  'insertOne',
  'insertMany',
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'countDocuments',
  'estimatedDocumentCount',
  'distinct',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'aggregate',
  'createIndex',
  'getIndexes',
  'dropIndex',
  'dropIndexes',
  'drop',
]
export const CURSOR_METHODS = ['sort', 'limit', 'skip', 'count', 'toArray', 'forEach', 'map', 'pretty', 'explain', 'project', 'hasNext', 'next', 'itcount']
export const DB_METHODS = ['getName', 'getCollectionNames', 'getCollection', 'createCollection', 'dropDatabase', 'getSiblingDB', 'stats']

class Collection {
  constructor(core, dbName, name) {
    this._isCollection = true
    this._core = core
    this._db = dbName
    this._name = name
  }
  get _ns() {
    return `${this._db}.${this._name}`
  }
  _store(create = false) {
    return this._core.store(this._db, this._name, create)
  }
  _read() {
    return this._store(false) || { docs: [], indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }] }
  }
  _log(op) {
    this._core.log({ ...op, db: this._db, coll: this._name, ns: this._ns })
  }
  toString() {
    return this._ns
  }
  getName() {
    return this._name
  }
  getFullName() {
    return this._ns
  }

  _checkUnique(store, doc, ignore) {
    for (const ix of store.indexes) {
      if (!(ix.name === '_id_' || ix.unique)) continue
      const fields = Object.keys(ix.key)
      const keyOf = (d) => fields.map((f) => getPath(d, f))
      const k = keyOf(doc)
      const clash = store.docs.find((d) => d !== ignore && keyOf(d).every((v, i) => valuesEqual(v, k[i])))
      if (clash) {
        const dup = fields.map((f, i) => `${f}: ${inlineValue(k[i] === undefined ? null : k[i])}`).join(', ')
        return `E11000 duplicate key error collection: ${this._ns} index: ${ix.name} dup key: { ${dup} }`
      }
    }
    return null
  }

  _prepare(doc) {
    if (!isPlainObject(doc)) throw new MongoInvalidArgumentError('Document must be a plain object')
    const c = cloneValue(doc)
    const { _id, ...rest } = c
    return { _id: _id === undefined || _id === null ? (_id === null ? null : new ObjectId()) : _id, ...rest }
  }

  insertOne(doc) {
    const store = this._store(true)
    const d = this._prepare(doc)
    const err = this._checkUnique(store, d)
    if (err) throw new MongoServerError(err, 11000)
    store.docs.push(d)
    this._log({ type: 'insert', ids: [d._id], count: 1 })
    return { acknowledged: true, insertedId: d._id }
  }

  insertMany(docs, options = {}) {
    if (!Array.isArray(docs)) throw new MongoInvalidArgumentError('Argument "docs" must be an array of documents')
    const store = this._store(true)
    const ordered = options.ordered !== false
    const ids = {}
    const inserted = []
    const errors = []
    docs.forEach((doc, i) => {
      if (errors.length && ordered) return
      const d = this._prepare(doc)
      const err = this._checkUnique(store, d)
      if (err) {
        errors.push({ index: i, msg: err })
        return
      }
      store.docs.push(d)
      ids[String(i)] = d._id
      inserted.push(d._id)
    })
    if (inserted.length) this._log({ type: 'insert', ids: inserted, count: inserted.length })
    if (errors.length) {
      const e = new MongoBulkWriteError(errors[0].msg, {
        insertedCount: inserted.length,
        total: docs.length,
        ordered,
        insertedIds: ids,
      })
      throw e
    }
    return { acknowledged: true, insertedIds: ids }
  }

  find(filter, projection) {
    if (filter !== undefined && filter !== null && !isPlainObject(filter)) {
      throw new MongoInvalidArgumentError('Query filter must be a plain object or ObjectId')
    }
    return new Cursor(this, filter, projection)
  }

  findOne(filter, projection) {
    const res = new Cursor(this, filter, projection).limit(1)._run()
    return res[0] ?? null
  }

  countDocuments(filter = {}) {
    const n = this._read().docs.filter((d) => matchDocument(d, filter)).length
    this._log({ type: 'count', filter: cloneValue(filter), count: n })
    return n
  }

  count(filter = {}) {
    return this.countDocuments(filter)
  }

  estimatedDocumentCount() {
    return this._read().docs.length
  }

  distinct(field, filter = {}) {
    const out = []
    for (const d of this._read().docs) {
      if (!matchDocument(d, filter)) continue
      for (const v of pathValues(d, field)) {
        const vals = Array.isArray(v) ? v : [v]
        for (const x of vals) if (x !== undefined && !out.some((o) => valuesEqual(o, x))) out.push(cloneValue(x))
      }
    }
    return out.sort(compareValues)
  }

  _checkUpdate(update) {
    if (Array.isArray(update)) return
    if (!isPlainObject(update) || !Object.keys(update).length || !Object.keys(update).every((k) => k.startsWith('$'))) {
      throw new MongoInvalidArgumentError('Update document requires atomic operators')
    }
  }

  _update(filter, update, options, many) {
    this._checkUpdate(update)
    const store = this._store(Boolean(options?.upsert))
    const docs = store ? store.docs : []
    const matched = docs.filter((d) => matchDocument(d, filter))
    const targets = many ? matched : matched.slice(0, 1)
    const changedMap = {}
    const before = {}
    const after = {}
    let modified = 0
    for (const d of targets) {
      const { doc: next, changed } = applyUpdate(d, update)
      if (!valuesEqual(next._id, d._id)) {
        throw new MongoServerError("Performing an update on the path '_id' would modify the immutable field '_id'", 66)
      }
      if (changed.size) {
        const err = this._checkUnique(store, next, d)
        if (err) throw new MongoServerError(err, 11000)
        const idx = store.docs.indexOf(d)
        before[idKey(d._id)] = cloneValue(d)
        store.docs[idx] = next
        after[idKey(d._id)] = cloneValue(next)
        changedMap[idKey(d._id)] = [...changed]
        modified++
      }
    }
    if (!targets.length && options?.upsert) {
      const seed = {}
      for (const [k, v] of Object.entries(filter || {})) {
        if (k.startsWith('$')) continue
        if (!isOperatorObject(v)) setPath(seed, k, cloneValue(v))
        else if ('$eq' in v) setPath(seed, k, cloneValue(v.$eq))
      }
      const { doc: next } = applyUpdate(seed, update, { inserting: true })
      const d = this._prepare(next)
      const err = this._checkUnique(store, d)
      if (err) throw new MongoServerError(err, 11000)
      store.docs.push(d)
      this._log({ type: 'insert', ids: [d._id], count: 1, upsert: true })
      return { acknowledged: true, insertedId: d._id, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: d._id }
    }
    if (modified) {
      this._log({
        type: 'update',
        filter: cloneValue(filter),
        ids: targets.filter((d) => changedMap[idKey(d._id)]).map((d) => d._id),
        changed: changedMap,
        before,
        after,
        count: modified,
      })
    }
    return { acknowledged: true, insertedId: null, matchedCount: targets.length, modifiedCount: modified, upsertedCount: 0 }
  }

  updateOne(filter, update, options) {
    return this._update(filter ?? {}, update, options, false)
  }
  updateMany(filter, update, options) {
    return this._update(filter ?? {}, update, options, true)
  }

  replaceOne(filter, replacement, options = {}) {
    if (!isPlainObject(replacement)) throw new MongoInvalidArgumentError('Replacement document must be a plain object')
    if (Object.keys(replacement).some((k) => k.startsWith('$'))) {
      throw new MongoInvalidArgumentError('Replacement document must not contain atomic operators')
    }
    const store = this._store(Boolean(options.upsert))
    const target = store?.docs.find((d) => matchDocument(d, filter))
    if (!target) {
      if (options.upsert) {
        const res = this.insertOne({ ...replacement, ...(replacement._id === undefined && filter?._id !== undefined ? { _id: filter._id } : {}) })
        return { acknowledged: true, insertedId: res.insertedId, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: res.insertedId }
      }
      return { acknowledged: true, insertedId: null, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
    }
    if (replacement._id !== undefined && !valuesEqual(replacement._id, target._id)) {
      throw new MongoServerError("After applying the update, the (immutable) field '_id' was found to have been altered", 66)
    }
    const next = { _id: target._id, ...cloneValue(replacement) }
    next._id = target._id
    const err = this._checkUnique(store, next, target)
    if (err) throw new MongoServerError(err, 11000)
    const modified = !valuesEqual(next, target)
    if (modified) {
      const idx = store.docs.indexOf(target)
      const k = idKey(target._id)
      store.docs[idx] = next
      const fields = [...new Set([...Object.keys(target), ...Object.keys(next)])].filter((f) => !valuesEqual(target[f], next[f]))
      this._log({ type: 'update', filter: cloneValue(filter), ids: [target._id], changed: { [k]: fields }, before: { [k]: cloneValue(target) }, after: { [k]: cloneValue(next) }, count: 1 })
    }
    return { acknowledged: true, insertedId: null, matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0 }
  }

  _delete(filter, many) {
    const store = this._store(false)
    if (!store) return { acknowledged: true, deletedCount: 0 }
    const matched = store.docs.filter((d) => matchDocument(d, filter))
    const targets = many ? matched : matched.slice(0, 1)
    store.docs = store.docs.filter((d) => !targets.includes(d))
    if (targets.length) this._log({ type: 'delete', ids: targets.map((d) => d._id), count: targets.length })
    return { acknowledged: true, deletedCount: targets.length }
  }
  deleteOne(filter = {}) {
    return this._delete(filter, false)
  }
  deleteMany(filter = {}) {
    return this._delete(filter, true)
  }

  findOneAndUpdate(filter, update, options = {}) {
    const store = this._store(false)
    const target = store?.docs.find((d) => matchDocument(d, filter))
    const before = target ? cloneValue(target) : null
    this._update(filter, update, options, false)
    if (options.returnDocument === 'after' || options.returnNewDocument) {
      const id = before?._id
      const now = id !== undefined ? this._read().docs.find((d) => valuesEqual(d._id, id)) : this._read().docs.find((d) => matchDocument(d, filter))
      return now ? applyProjection(now, options.projection) : null
    }
    return before ? applyProjection(before, options.projection) : null
  }

  findOneAndDelete(filter = {}) {
    const store = this._store(false)
    const target = store?.docs.find((d) => matchDocument(d, filter))
    if (!target) return null
    this._delete({ _id: target._id }, false)
    return cloneValue(target)
  }

  aggregate(pipeline = []) {
    const compute = () => {
      const res = runPipeline(this._read().docs, pipeline, (from) => this._core.store(this._db, from, false)?.docs || [])
      this._log({ type: 'aggregate', count: res.length })
      return res
    }
    return new AggregationCursor(compute)
  }

  createIndex(keys, options = {}) {
    if (!isPlainObject(keys) || !Object.keys(keys).length) throw new MongoServerError('Index keys cannot be empty.', 67)
    for (const [k, v] of Object.entries(keys)) {
      if (!(v === 1 || v === -1 || v === 'hashed' || v === 'text')) {
        throw new MongoServerError(`Values in the index key pattern can only be 1, -1, 'hashed' or 'text'; found ${inlineValue(v)} for field ${k}`, 67)
      }
    }
    const store = this._store(true)
    const name = options.name || indexName(keys)
    const existing = store.indexes.find((ix) => ix.name === name)
    if (existing) {
      if (valuesEqual(existing.key, keys)) return name
      throw new MongoServerError(`Index already exists with a different name: ${existing.name}`, 85)
    }
    const sameKey = store.indexes.find((ix) => valuesEqual(ix.key, keys))
    if (sameKey) return sameKey.name
    const ix = { v: 2, key: cloneValue(keys), name, ...(options.unique ? { unique: true } : {}) }
    if (ix.unique) {
      const tmp = { ...store, indexes: [ix], docs: [] }
      for (const d of store.docs) {
        const err = this._checkUnique(tmp, d)
        if (err) throw new MongoServerError(`Index build failed: ${err}`, 11000)
        tmp.docs.push(d)
      }
    }
    store.indexes.push(ix)
    this._log({ type: 'createIndex', name, key: cloneValue(keys) })
    return name
  }

  createIndexes(list) {
    return list.map((k) => this.createIndex(k))
  }

  getIndexes() {
    return cloneValue(this._read().indexes)
  }

  dropIndex(nameOrSpec) {
    const store = this._store(false)
    const name = typeof nameOrSpec === 'string' ? nameOrSpec : store?.indexes.find((ix) => valuesEqual(ix.key, nameOrSpec))?.name
    if (name === '_id_') throw new MongoServerError('cannot drop _id index', 72)
    const before = store ? store.indexes.length : 0
    if (!store || !store.indexes.some((ix) => ix.name === name)) {
      throw new MongoServerError(`index not found with name [${typeof nameOrSpec === 'string' ? nameOrSpec : indexName(nameOrSpec || {})}]`, 27)
    }
    store.indexes = store.indexes.filter((ix) => ix.name !== name)
    this._log({ type: 'dropIndex', name })
    return { nIndexesWas: before, ok: 1 }
  }

  dropIndexes() {
    const store = this._store(false)
    const before = store ? store.indexes.length : 0
    if (store) store.indexes = store.indexes.filter((ix) => ix.name === '_id_')
    return { nIndexesWas: before, msg: 'non-_id indexes dropped for collection', ok: 1 }
  }

  drop() {
    const existed = this._core.dropCollection(this._db, this._name)
    if (existed) this._log({ type: 'drop' })
    return existed
  }
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

const DB_NAME_RE = /^[A-Za-z0-9_-]{1,63}$/

export function createEngine(options = {}) {
  const state = { dbs: new Map(), current: options.db || 'test' }
  const listeners = new Set()
  let ops = []
  let seq = 0
  const collCache = new Map()
  const dbCache = new Map()

  const core = {
    store(dbName, name, create) {
      let db = state.dbs.get(dbName)
      if (!db) {
        if (!create) return null
        db = new Map()
        state.dbs.set(dbName, db)
      }
      let s = db.get(name)
      if (!s && create) {
        s = { docs: [], indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }] }
        db.set(name, s)
      }
      return s || null
    },
    dropCollection(dbName, name) {
      const db = state.dbs.get(dbName)
      if (!db || !db.has(name)) return false
      db.delete(name)
      if (!db.size) state.dbs.delete(dbName)
      return true
    },
    log(op) {
      const entry = { ...op, seq: ++seq, at: Date.now() }
      ops.push(entry)
      if (ops.length > 300) ops = ops.slice(-200)
      listeners.forEach((fn) => fn(entry))
    },
  }

  function collection(dbName, name) {
    const key = `${dbName}\u0000${name}`
    if (!collCache.has(key)) collCache.set(key, new Collection(core, dbName, name))
    return collCache.get(key)
  }

  function makeDb(dbName) {
    if (dbCache.has(dbName)) return dbCache.get(dbName)
    const methods = {
      getName: () => dbName,
      getCollectionNames: () => [...(state.dbs.get(dbName)?.keys() || [])].sort(),
      getCollection: (name) => {
        if (typeof name !== 'string' || !name) throw new MongoInvalidArgumentError('Collection name must be a non-empty string')
        return collection(dbName, name)
      },
      createCollection: (name) => {
        if (core.store(dbName, name, false)) throw new MongoServerError(`Collection ${dbName}.${name} already exists`, 48)
        core.store(dbName, name, true)
        return { ok: 1 }
      },
      dropDatabase: () => {
        const existed = state.dbs.delete(dbName)
        core.log({ type: 'dropDatabase', db: dbName })
        return { ok: 1, ...(existed ? { dropped: dbName } : {}) }
      },
      getSiblingDB: (name) => makeDb(name),
      stats: () => {
        const db = state.dbs.get(dbName)
        const colls = db ? [...db.values()] : []
        return {
          db: dbName,
          collections: colls.length,
          objects: colls.reduce((s, c) => s + c.docs.length, 0),
          indexes: colls.reduce((s, c) => s + c.indexes.length, 0),
          ok: 1,
        }
      },
      toString: () => dbName,
      valueOf: () => dbName,
    }
    const proxy = new Proxy(methods, {
      get(target, prop) {
        if (typeof prop === 'symbol') return undefined
        if (prop === '_isDb') return true
        if (prop === '_name') return dbName
        if (prop === 'then' || prop === 'toJSON' || prop === 'constructor' || prop === '$$typeof') return undefined
        if (prop.startsWith('_')) return undefined
        if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop]
        return collection(dbName, prop)
      },
      has(target, prop) {
        return typeof prop === 'string'
      },
      set() {
        return false
      },
    })
    dbCache.set(dbName, proxy)
    return proxy
  }

  const engine = {
    get currentDb() {
      return state.current
    },
    get db() {
      return makeDb(state.current)
    },
    get seq() {
      return seq
    },
    getDb: makeDb,
    use(name) {
      if (typeof name !== 'string' || !DB_NAME_RE.test(name)) throw new MongoServerError(`Invalid database name: '${name}'`, 73)
      state.current = name
      core.log({ type: 'use', db: name })
      return `switched to db ${name}`
    },
    collection,
    // Raw (read-only) access for UIs.
    peek(dbName, name) {
      const s = core.store(dbName, name, false)
      return s ? { docs: s.docs, indexes: s.indexes } : { docs: [], indexes: [] }
    },
    listDatabases() {
      return [...state.dbs.entries()]
        .map(([name, colls]) => {
          let bytes = 0
          for (const c of colls.values()) bytes += JSON.stringify(toEJSON(c.docs)).length + 4096 * c.indexes.length
          return { name, sizeOnDisk: bytes, collections: colls.size }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    listCollections(dbName = state.current) {
      const db = state.dbs.get(dbName)
      if (!db) return []
      return [...db.entries()].map(([name, s]) => ({ name, count: s.docs.length, indexes: s.indexes.length })).sort((a, b) => a.name.localeCompare(b.name))
    },
    opsSince(n) {
      return ops.filter((o) => o.seq > n)
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    snapshot() {
      const dbs = {}
      for (const [dbName, colls] of state.dbs) {
        dbs[dbName] = {}
        for (const [name, s] of colls) dbs[dbName][name] = { docs: toEJSON(s.docs), indexes: toEJSON(s.indexes) }
      }
      return { version: 1, current: state.current, dbs }
    },
    restore(snap) {
      state.dbs.clear()
      if (!snap || typeof snap !== 'object') return
      if (snap.current && DB_NAME_RE.test(snap.current)) state.current = snap.current
      for (const [dbName, colls] of Object.entries(snap.dbs || {})) {
        const db = new Map()
        for (const [name, s] of Object.entries(colls || {})) {
          db.set(name, {
            docs: fromEJSON(s.docs || []),
            indexes: fromEJSON(s.indexes && s.indexes.length ? s.indexes : [{ v: 2, key: { _id: 1 }, name: '_id_' }]),
          })
        }
        if (db.size) state.dbs.set(dbName, db)
      }
      core.log({ type: 'restore' })
    },
    reset(dbName) {
      if (dbName) state.dbs.delete(dbName)
      else state.dbs.clear()
      core.log({ type: 'reset', db: dbName || null })
    },
    // Load documents directly (used by dataset loaders).
    load(dbName, name, docs, indexes = []) {
      core.dropCollection(dbName, name)
      const s = core.store(dbName, name, true)
      s.docs = docs.map((d) => collection(dbName, name)._prepare(d))
      for (const keys of indexes) collection(dbName, name).createIndex(keys)
      core.log({ type: 'load', db: dbName, coll: name, count: s.docs.length })
      return s.docs.length
    },
  }
  return engine
}

export { matchDocument as matches, runPipeline }
