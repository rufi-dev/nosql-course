// Tiny syntax highlighter for mongosh-style JavaScript, JSON and SQL.
// Returns an array of { t: tokenClass | null, v: text } so React can render
// without dangerouslySetInnerHTML.

const JS_KW = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'new', 'true', 'false',
  'null', 'undefined', 'use', 'show', 'db', 'this', 'of', 'in', 'await', 'async',
])
const SQL_KW = new Set([
  'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set', 'delete', 'begin', 'commit',
  'rollback', 'transaction', 'create', 'table', 'primary', 'key', 'not', 'null', 'and', 'or', 'order',
  'by', 'asc', 'desc', 'limit', 'int', 'integer', 'text', 'varchar', 'check', 'references', 'start',
  'for', 'as', 'join', 'on', 'group', 'having', 'count', 'sum', 'isolation', 'level', 'serializable',
  'read', 'committed', 'default', 'returning', 'index', 'unique', 'drop', 'if', 'exists', 'case', 'when',
  'then', 'else', 'end',
])

export function tokenize(src, lang = 'js') {
  const out = []
  const push = (t, v) => {
    if (!v) return
    const last = out[out.length - 1]
    if (last && last.t === t && t === null) last.v += v
    else out.push({ t, v })
  }
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    // comments
    if (lang !== 'json' && c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? n : end
      push('com', src.slice(i, stop))
      i = stop
      continue
    }
    if (lang === 'sql' && c === '-' && src[i + 1] === '-') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? n : end
      push('com', src.slice(i, stop))
      i = stop
      continue
    }
    // strings
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++
        j++
      }
      const str = src.slice(i, j + 1)
      // a string followed by ':' is a key in JSON
      let k = j + 1
      while (k < n && src[k] === ' ') k++
      push(src[k] === ':' && lang !== 'sql' ? 'key' : 'str', str)
      i = j + 1
      continue
    }
    // numbers
    if (/[0-9]/.test(c) && !/[A-Za-z_$]/.test(src[i - 1] || '')) {
      let j = i
      while (j < n && /[0-9._eE]/.test(src[j])) j++
      push('num', src.slice(i, j))
      i = j
      continue
    }
    // words / operators
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++
      const word = src.slice(i, j)
      let k = j
      while (k < n && src[k] === ' ') k++
      if (lang === 'sql') {
        push(SQL_KW.has(word.toLowerCase()) ? 'kw' : null, word)
      } else if (word.startsWith('$')) {
        push('op', word)
      } else if (src[k] === ':' && src[k + 1] !== ':') {
        push('key', word)
      } else if (src[k] === '(') {
        push('fn', word)
      } else if (JS_KW.has(word)) {
        push('kw', word)
      } else {
        push(null, word)
      }
      i = j
      continue
    }
    if ('{}[](),;:.'.includes(c)) {
      push('punc', c)
      i++
      continue
    }
    push(null, c)
    i++
  }
  return out
}
