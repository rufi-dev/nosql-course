import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { createShell, isIncomplete } from '../engine/shell.js'
import { Highlight } from './CodeBlock.jsx'
import Icon from './Icon.jsx'
import './Shell.css'

const EASE = [0.16, 1, 0.3, 1]
const DEFAULT_WELCOME = 'In-browser MongoDB-style shell. Type help for commands, Tab to complete.'

function commonPrefix(list) {
  if (!list.length) return ''
  let p = list[0]
  for (const s of list) while (!s.startsWith(p)) p = p.slice(0, -1)
  return p
}

// Reusable terminal bound to an engine. Imperative API (ref):
//   run(code) -> entries, setInput(code), focus(), clear(), print(text, kind)
const Shell = forwardRef(function Shell(
  {
    engine,
    onResult,
    title = 'mongosh',
    welcome = DEFAULT_WELCOME,
    placeholder = 'Type a command, e.g. db.products.find()',
    className = '',
    minHeight = 220,
    maxHeight = 460,
    autoFocus = false,
    toolbar,
  },
  ref,
) {
  const shell = useMemo(() => createShell(engine), [engine])
  const seq = useRef(0)
  const [blocks, setBlocks] = useState(() =>
    welcome ? [{ id: 0, code: null, kind: 'welcome', text: welcome, prints: [] }] : [],
  )
  const [input, setInputState] = useState('')
  const [suggest, setSuggest] = useState(null)
  const [announce, setAnnounce] = useState('')
  const history = useRef([])
  const histIdx = useRef(-1)
  const draft = useRef('')
  const logRef = useRef(null)
  const taRef = useRef(null)
  const hlRef = useRef(null)
  const reduce = useReducedMotion()
  const hintId = useId()

  const execute = useCallback(
    (src) => {
      const code = String(src ?? '').trim()
      if (!code) return []
      let db = engine.currentDb
      const entries = shell.run(code)
      const next = []
      let cleared = false
      for (const e of entries) {
        if (e.kind === 'clear') {
          cleared = true
          next.length = 0
          continue
        }
        next.push({ id: ++seq.current, code: e.code, kind: e.kind, text: e.text, prints: e.prints || [], ok: e.ok, db })
        const m = e.ok && e.code.match(/^use\s+(\S+?);?$/)
        if (m) db = m[1]
      }
      setBlocks((prev) => (cleared ? next : [...prev, ...next]))
      const h = history.current
      if (h[h.length - 1] !== code) h.push(code)
      if (h.length > 100) h.shift()
      histIdx.current = -1
      const last = entries[entries.length - 1]
      if (last) {
        const summary =
          last.kind === 'error'
            ? `Error. ${last.text}`
            : last.text
              ? `Result. ${last.text.replace(/\s+/g, ' ').slice(0, 180)}`
              : 'Command ran.'
        setAnnounce(summary)
      }
      onResult?.(entries, engine)
      return entries
    },
    [engine, shell, onResult],
  )

  const focusEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus({ preventScroll: true })
      const end = ta.value.length
      ta.setSelectionRange(end, end)
    })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      run: (code) => execute(code),
      setInput: (code) => {
        setInputState(code)
        setSuggest(null)
        focusEnd()
      },
      focus: () => taRef.current?.focus({ preventScroll: true }),
      clear: () => setBlocks([]),
      print: (text, kind = 'info') =>
        setBlocks((prev) => [...prev, { id: ++seq.current, code: null, kind, text, prints: [] }]),
      element: () => logRef.current?.parentElement,
    }),
    [execute, focusEnd],
  )

  // keep the newest output in view
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [blocks, reduce])

  // auto-grow the editor
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`
  }, [input])

  useEffect(() => {
    if (autoFocus) taRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const submit = () => {
    if (!input.trim()) return
    const code = input
    setInputState('')
    setSuggest(null)
    execute(code)
  }

  const applyCompletion = (start, text) => {
    const ta = taRef.current
    const caret = ta ? ta.selectionStart : input.length
    const nextVal = input.slice(0, start) + text + input.slice(caret)
    setInputState(nextVal)
    const pos = start + text.length
    requestAnimationFrame(() => {
      if (!taRef.current) return
      taRef.current.focus()
      taRef.current.setSelectionRange(pos, pos)
    })
  }

  const onKeyDown = (e) => {
    const ta = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      if (isIncomplete(input)) return // let the newline in, like mongosh
      e.preventDefault()
      submit()
      return
    }
    if ((e.key === 'l' || e.key === 'L') && e.ctrlKey) {
      e.preventDefault()
      setBlocks([])
      return
    }
    if (e.key === 'Escape') {
      setSuggest(null)
      return
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      const before = input.slice(0, ta.selectionStart)
      const { start, candidates, suffix = '' } = shell.complete(before)
      if (!candidates || !candidates.length) {
        setSuggest(null)
        return // default: move focus, so the editor never traps keyboard users
      }
      e.preventDefault()
      if (candidates.length === 1) {
        applyCompletion(start, candidates[0] + suffix)
        setSuggest(null)
      } else {
        const typed = before.slice(start)
        const common = commonPrefix(candidates)
        if (common.length > typed.length) applyCompletion(start, common)
        setSuggest({ start, candidates: candidates.slice(0, 14), suffix })
      }
      return
    }
    const h = history.current
    if (e.key === 'ArrowUp' && h.length) {
      const onFirstLine = !input.slice(0, ta.selectionStart).includes('\n')
      if (!onFirstLine) return
      e.preventDefault()
      if (histIdx.current === -1) {
        draft.current = input
        histIdx.current = h.length - 1
      } else histIdx.current = Math.max(0, histIdx.current - 1)
      setInputState(h[histIdx.current])
      focusEnd()
      return
    }
    if (e.key === 'ArrowDown' && histIdx.current !== -1) {
      const onLastLine = !input.slice(ta.selectionEnd).includes('\n')
      if (!onLastLine) return
      e.preventDefault()
      if (histIdx.current >= h.length - 1) {
        histIdx.current = -1
        setInputState(draft.current)
      } else {
        histIdx.current += 1
        setInputState(h[histIdx.current])
      }
      focusEnd()
    }
  }

  const syncScroll = () => {
    if (hlRef.current && taRef.current) hlRef.current.scrollTop = taRef.current.scrollTop
  }

  return (
    <section
      className={`sh ${className}`}
      style={{ '--sh-min': `${minHeight}px`, '--sh-max': `${maxHeight}px` }}
      aria-label="MongoDB shell"
    >
      <header className="sh__bar">
        <span className="sh__title">
          <Icon name="terminal" />
          <span>{title}</span>
          <span className="sh__db" title="Current database">
            {engine.currentDb}
          </span>
        </span>
        <span className="sh__tools">
          {toolbar}
          <button type="button" className="sh__tool" onClick={() => execute('help')}>
            help
          </button>
          <button type="button" className="sh__tool" onClick={() => setBlocks([])} aria-label="Clear output">
            <Icon name="reset" />
            <span>Clear</span>
          </button>
        </span>
      </header>

      <div className="sh__log" ref={logRef} role="log" aria-live="off" aria-label="Shell output" tabIndex={0}>
        {blocks.length === 0 && <div className="sh__empty">Output appears here.</div>}
        {blocks.map((b) => (
          <motion.div
            key={b.id}
            className={`sh__block sh__block--${b.kind}`}
            initial={reduce || b.id === 0 ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
          >
            {b.code != null && (
              <div className="sh__in">
                <span className="sh__prompt" aria-hidden="true">
                  {b.db}&gt;
                </span>
                <code className="sh__code">
                  <Highlight code={b.code} />
                </code>
              </div>
            )}
            {b.prints.map((p, i) => (
              <pre key={i} className="sh__out sh__out--print">
                {p}
              </pre>
            ))}
            {b.text ? (
              <pre className={`sh__out sh__out--${b.kind}`}>
                {b.kind === 'value' ? <Highlight code={b.text} /> : b.text}
              </pre>
            ) : null}
          </motion.div>
        ))}
      </div>

      {suggest && (
        <div className="sh__suggest" role="listbox" aria-label="Completions">
          {suggest.candidates.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected="false"
              className="sh__chip"
              onClick={() => {
                applyCompletion(suggest.start, c + (suggest.suffix || ''))
                setSuggest(null)
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="sh__inputrow">
        <label className="sh__prompt sh__prompt--input" htmlFor={`${hintId}-ta`}>
          {engine.currentDb}&gt;
        </label>
        <div className="sh__editor">
          <pre className="sh__hl" ref={hlRef} aria-hidden="true">
            <Highlight code={input + (input.endsWith('\n') || !input ? ' ' : '')} />
          </pre>
          <textarea
            id={`${hintId}-ta`}
            ref={taRef}
            className="sh__ta"
            value={input}
            rows={1}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            placeholder={placeholder}
            aria-describedby={hintId}
            onChange={(e) => {
              setInputState(e.target.value)
              if (suggest) setSuggest(null)
            }}
            onKeyDown={onKeyDown}
            onScroll={syncScroll}
          />
        </div>
        <button type="button" className="btn btn--primary btn--sm sh__run" onClick={submit} disabled={!input.trim()}>
          <Icon name="play" />
          Run
        </button>
      </div>
      <p id={hintId} className="sh__hint">
        <span className="kbd">Enter</span> run <span className="kbd">Shift</span>+<span className="kbd">Enter</span> new line{' '}
        <span className="kbd">↑</span> history <span className="kbd">Tab</span> complete
      </p>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </div>
    </section>
  )
})

export default Shell
