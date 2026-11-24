// mongosh-like front end for the in-memory engine: statement splitting,
// sandboxed evaluation with persistent variables, special commands, and
// output formatting that mirrors mongosh.
import {
  ObjectId,
  isCursor,
  isOid,
  isDate,
  isRegex,
  COLLECTION_METHODS,
  CURSOR_METHODS,
  DB_METHODS,
} from './mongo.js'

/* ------------------------------------------------------------------ */
/* Statement splitting                                                 */
/* ------------------------------------------------------------------ */

// Returns [{ display, exec }] for each top-level statement. `display` keeps
// comments for the scrollback; `exec` has comments stripped.
export function splitStatements(src) {
  const out = []
  let display = ''
  let exec = ''
  let depth = 0
  let i = 0
  const n = src.length
  let lastSig = '' // last significant (non-space) char, for regex detection

  const flush = () => {
    const d = display.trim()
    const e = exec.trim()
    if (e) out.push({ display: d, exec: e })
    display = ''
    exec = ''
    lastSig = ''
  }

  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    // line comment
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? n : end
      display += src.slice(i, stop)
      i = stop
      continue
    }
    // block comment
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      display += src.slice(i, stop)
      exec += ' '
      i = stop
      continue
    }
    // strings
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j++
        j++
      }
      const s = src.slice(i, j + 1)
      display += s
      exec += s
      i = j + 1
      lastSig = c
      continue
    }
    // template literals (with ${} nesting)
    if (c === '`') {
      let j = i + 1
      let tdepth = 0
      while (j < n) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (tdepth === 0 && src[j] === '`') break
        if (src[j] === '$' && src[j + 1] === '{') {
          tdepth++
          j += 2
          continue
        }
        if (tdepth > 0 && src[j] === '}') tdepth--
        j++
      }
      const s = src.slice(i, j + 1)
      display += s
      exec += s
      i = j + 1
      lastSig = '`'
      continue
    }
    // regex literal
    if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig))) {
      let j = i + 1
      let inClass = false
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) break
        j++
      }
      if (src[j] === '/') {
        j++
        while (j < n && /[a-z]/i.test(src[j])) j++
        const s = src.slice(i, j)
        display += s
        exec += s
        i = j
        lastSig = '/'
        continue
      }
    }
    if (c === '(' || c === '[' || c === '{') depth++
    if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1)

    if (depth === 0 && c === ';') {
      flush()
      i++
      continue
    }
    if (depth === 0 && c === '\n') {
      // continue the statement when the next line starts a method chain
      let k = i + 1
      while (k < n && /\s/.test(src[k])) k++
      const tail = exec.trimEnd()
      const continues = src[k] === '.' || (lastSig !== '/' && /[,+\-*=&|?:(]$/.test(tail)) || /^(\?|:)/.test(src[k] || '')
      if (continues) {
        display += c
        exec += c
        i++
        continue
      }
      flush()
      i++
      continue
    }
    display += c
    exec += c
    if (!/\s/.test(c)) lastSig = c
    i++
  }
  flush()
  return out
}

// True when brackets/strings are still open (used for Enter-to-newline).
export function isIncomplete(src) {
  let depth = 0
  let quote = null
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i)
      if (end === -1) break
      i = end
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
  }
  return depth > 0 || (quote === '`')
}

/* ------------------------------------------------------------------ */
/* Formatting (mongosh style)                                          */
/* ------------------------------------------------------------------ */

const IDENT = /^[A-Za-z_$][\w$]*$/
const pad = (n) => '  '.repeat(n)
const quoteStr = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

function fmt(v, level, seen) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v === 'string') return quoteStr(v)
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v)
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'bigint') return `${v}n`
  if (typeof v === 'function') return `[Function: ${v.name || 'anonymous'}]`
  if (typeof v === 'symbol') return v.toString()
  if (isOid(v)) return `ObjectId('${v.$oid}')`
  if (isDate(v)) return Number.isNaN(v.getTime()) ? 'Invalid Date' : `ISODate('${v.toISOString()}')`
  if (isRegex(v)) return v.toString()
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (v._isDb) return v._name
  if (v._isCollection) return v._ns
  if (isCursor(v)) return '[Cursor]'
  if (seen.has(v)) return '[Circular]'
  if (level > 8) return Array.isArray(v) ? '[Array]' : '[Object]'
  seen.add(v)
  let open
  let close
  let parts
  let nestedObj = false
  if (Array.isArray(v)) {
    open = '['
    close = ']'
    const shown = v.slice(0, 100)
    parts = shown.map((x) => {
      return fmt(x, level + 1, seen)
    })
    if (v.length > 100) parts.push(`... ${v.length - 100} more items`)
  } else if (v instanceof Map) {
    open = `Map(${v.size}) {`
    close = '}'
    parts = [...v.entries()].map(([k, x]) => `${fmt(k, level + 1, seen)} => ${fmt(x, level + 1, seen)}`)
  } else if (v instanceof Set) {
    open = `Set(${v.size}) {`
    close = '}'
    parts = [...v].map((x) => fmt(x, level + 1, seen))
  } else {
    open = '{'
    close = '}'
    parts = Object.entries(v).map(([k, x]) => {
      if (x !== null && typeof x === 'object' && !Array.isArray(x) && !isOid(x) && !isDate(x) && !isRegex(x)) nestedObj = true
      return `${IDENT.test(k) ? k : quoteStr(k)}: ${fmt(x, level + 1, seen)}`
    })
  }
  seen.delete(v)
  if (!parts.length) return Array.isArray(v) ? '[]' : `${open}${close === '}' && open === '{' ? '' : ' '}${close}`
  const one = `${open} ${parts.join(', ')} ${close}`
  const limit = nestedObj ? 60 : 76
  if (one.length + level * 2 <= limit && !parts.some((p) => p.includes('\n'))) return one
  return `${open}\n${parts.map((p) => pad(level + 1) + p).join(',\n')}\n${pad(level)}${close}`
}

export function formatValue(v) {
  if (typeof v === 'string') return v
  return fmt(v, 0, new Set())
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

const ALLOWED_GLOBALS = new Set([
  'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean', 'Array', 'Object', 'RegExp', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'Infinity', 'NaN', 'undefined', 'Error', 'TypeError', 'Map', 'Set', 'Symbol', 'Promise',
  'encodeURIComponent', 'decodeURIComponent', 'BigInt',
])

export const HELP_TEXT = `Shell commands
  use <db>              switch database (created on first write)
  show dbs              list databases
  show collections      list collections in the current database
  it                    show more results from the last query
  cls                   clear the screen

Collection methods
  db.<coll>.insertOne(doc)        db.<coll>.insertMany([doc, ...])
  db.<coll>.find(filter, proj)    .sort({f: 1}) .limit(n) .skip(n)
  db.<coll>.findOne(filter)       db.<coll>.countDocuments(filter)
  db.<coll>.updateOne(f, update)  db.<coll>.updateMany(f, update)
  db.<coll>.deleteOne(filter)     db.<coll>.deleteMany(filter)
  db.<coll>.aggregate([stages])   db.<coll>.distinct("field")
  db.<coll>.createIndex({f: 1})   db.<coll>.getIndexes()
  db.<coll>.find(f).explain("executionStats")

Keys: Enter runs, Shift+Enter adds a line, Up/Down for history, Tab completes, Ctrl+L clears.`

const BATCH = 20

export function createShell(engine) {
  const vars = Object.create(null)
  let prints = []
  let lastCursor = null // { docs, pos }

  const print = (...args) => {
    prints.push(args.map((a) => (typeof a === 'string' ? a : formatValue(a))).join(' '))
  }
  const builtins = {
    get db() {
      return engine.db
    },
    ObjectId: (hex) => new ObjectId(hex),
    ISODate: (s) => (s === undefined ? new Date() : new Date(s)),
    NumberInt: (x) => Number(x),
    NumberLong: (x) => Number(x),
    NumberDecimal: (x) => Number(x),
    print,
    printjson: (x) => prints.push(formatValue(x)),
    console: { log: print, info: print, warn: print, error: print },
    use: (name) => engine.use(String(name)),
  }

  const scope = new Proxy(vars, {
    has: (t, k) => typeof k === 'string' && k !== '__stmt',
    get: (t, k) => {
      if (k === Symbol.unscopables) return undefined
      if (typeof k !== 'string') return undefined
      if (k in builtins) return builtins[k]
      if (Object.prototype.hasOwnProperty.call(t, k)) return t[k]
      if (ALLOWED_GLOBALS.has(k)) return globalThis[k]
      throw new ReferenceError(`${k} is not defined`)
    },
    set: (t, k, v) => {
      if (k === 'db') throw new TypeError('Assignment to constant variable db')
      t[k] = v
      return true
    },
  })

  const compile = (body) => new Function('__scope', `with (__scope) { ${body}\n}`) // eslint-disable-line no-new-func

  function evaluate(code) {
    const decl = code.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*([\s\S]+))?$/)
    if (decl) {
      const [, name, expr] = decl
      compile(`${name} = (${expr ?? 'undefined'}\n);`)(scope)
      return { value: undefined }
    }
    const fn = code.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/)
    if (fn) {
      compile(`${fn[1]} = ${code};`)(scope)
      return { value: undefined }
    }
    let f
    try {
      f = compile(`return (\n${code}\n);`)
    } catch {
      f = compile(code) // statements: for/if/while... (throws SyntaxError if invalid)
    }
    return { value: f(scope) }
  }

  function special(code) {
    const c = code.replace(/;\s*$/, '').trim()
    let m
    if ((m = c.match(/^use\s+(\S+)$/))) return { kind: 'info', text: engine.use(m[1]) }
    if (/^show\s+(dbs|databases)$/.test(c)) {
      const list = engine.listDatabases()
      if (!list.length) return { kind: 'info', text: 'No databases with data yet. Insert a document to create one.' }
      const w = Math.max(...list.map((d) => d.name.length)) + 3
      return { kind: 'value', text: list.map((d) => `${d.name.padEnd(w)}${(d.sizeOnDisk / 1024).toFixed(2)} KiB`).join('\n') }
    }
    if (/^show\s+(collections|tables)$/.test(c)) {
      const list = engine.listCollections()
      return list.length ? { kind: 'value', text: list.map((x) => x.name).join('\n') } : { kind: 'empty' }
    }
    if (c === 'help' || c === 'help()') return { kind: 'info', text: HELP_TEXT }
    if (c === 'cls' || c === 'clear' || c === 'console.clear()') return { kind: 'clear' }
    if (c === 'it') {
      if (!lastCursor || lastCursor.pos >= lastCursor.docs.length) return { kind: 'info', text: 'no cursor' }
      return cursorPage()
    }
    if (c === 'exit' || c === 'quit' || c === 'exit()' || c === 'quit()') {
      return { kind: 'info', text: 'This shell runs inside the page, so there is nothing to exit.' }
    }
    if (/^show\s+/.test(c)) return { kind: 'error', text: `MongoshInvalidInputError: '${c.slice(5)}' is not a valid argument for "show".` }
    return null
  }

  function cursorPage() {
    const { docs, pos } = lastCursor
    const page = docs.slice(pos, pos + BATCH)
    lastCursor.pos = pos + page.length
    let text = formatValue(page)
    if (lastCursor.pos < docs.length) text += '\nType "it" for more'
    return { kind: 'value', text, count: page.length }
  }

  function runOne(stmt) {
    prints = []
    const base = { code: stmt.display, exec: stmt.exec }
    try {
      const sp = special(stmt.exec)
      if (sp) return { ...base, ok: sp.kind !== 'error', ...sp, prints }
      const { value } = evaluate(stmt.exec)
      if (isCursor(value)) {
        const docs = value.toArray()
        lastCursor = { docs, pos: 0 }
        if (!docs.length) return { ...base, ok: true, kind: 'note', text: 'no documents matched', value: docs, prints }
        const page = cursorPage()
        return { ...base, ok: true, ...page, value: docs, prints }
      }
      if (value === undefined) return { ...base, ok: true, kind: prints.length ? 'empty' : 'empty', value, prints }
      return { ...base, ok: true, kind: 'value', text: formatValue(value), value, prints }
    } catch (err) {
      const name = err && err.name ? err.name : 'Error'
      const message = err && err.message ? err.message : String(err)
      let text = `${name}: ${message}`
      if (err && err.details && typeof err.details.insertedCount === 'number') {
        text += `\nResult: ${err.details.insertedCount} of ${err.details.total} documents inserted before the error${err.details.ordered ? ' (an ordered insert stops at the first error)' : ''}.`
      }
      return { ...base, ok: false, kind: 'error', text, error: err, prints }
    }
  }

  return {
    run(source) {
      const stmts = splitStatements(source)
      return stmts.map(runOne)
    },
    get currentDb() {
      return engine.currentDb
    },
    vars,
    // Tab completion: returns { start, candidates } relative to the text before the caret.
    complete(before) {
      let m
      if ((m = before.match(/db\.([\w$]+)\.find\([^]*\)\.([\w$]*)$/))) {
        const prefix = m[2]
        return { start: before.length - prefix.length, candidates: CURSOR_METHODS.filter((x) => x.startsWith(prefix)), suffix: '(' }
      }
      if ((m = before.match(/(?:^|[^\w$.])db\.([\w$]+)\.([\w$]*)$/))) {
        const prefix = m[2]
        return { start: before.length - prefix.length, candidates: COLLECTION_METHODS.filter((x) => x.startsWith(prefix)), suffix: '(' }
      }
      if ((m = before.match(/(?:^|[^\w$.])db\.([\w$]*)$/))) {
        const prefix = m[1]
        const colls = engine.listCollections().map((c) => c.name)
        const cands = [...colls, ...DB_METHODS].filter((x) => x.startsWith(prefix))
        return { start: before.length - prefix.length, candidates: cands, suffix: '' }
      }
      if ((m = before.match(/^(\w*)$/))) {
        const prefix = m[1]
        if (!prefix) return { start: 0, candidates: [] }
        return { start: 0, candidates: ['db', 'use', 'show', 'help', 'it', 'cls'].filter((x) => x.startsWith(prefix) && x !== prefix), suffix: '' }
      }
      return { start: before.length, candidates: [] }
    },
  }
}

export function runShell(engine, source) {
  return createShell(engine).run(source)
}
