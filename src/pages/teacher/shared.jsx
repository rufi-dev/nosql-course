// Helpers shared by the teacher dashboard pages.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import Icon from '../../components/Icon.jsx'
import { Callout } from '../../components/ui.jsx'

// GET a path; { loading, data, error, reload, setData }. reload(true) keeps
// the current data on screen (no skeleton flash).
export function useApi(path) {
  const [state, setState] = useState({ loading: Boolean(path), data: null, error: null })
  const seq = useRef(0)
  const load = useCallback(
    async (silent = false) => {
      if (!path) return
      const mine = ++seq.current
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const data = await api.get(path)
        if (mine === seq.current) setState({ loading: false, data, error: null })
      } catch (error) {
        if (mine === seq.current) setState((s) => ({ loading: false, data: silent ? s.data : null, error }))
      }
    },
    [path],
  )
  useEffect(() => {
    load()
  }, [load])
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), [])
  return { ...state, reload: load, setData }
}

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null

export function relTime(ms) {
  if (!ms) return 'Never'
  const diff = (ms - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'Just now'
  if (!rtf) return fmtDate(ms)
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86_400 * 14) return rtf.format(Math.round(diff / 86_400), 'day')
  return fmtDate(ms)
}

export const fmtDate = (ms) =>
  ms ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms) : ''

export const fmtDateTime = (ms) =>
  ms
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms)
    : ''

export function ErrorBox({ error, onRetry, title = 'Could not load this.' }) {
  return (
    <div className="td-error" role="alert">
      <Callout tone="warn" title={title}>
        {error?.message || 'Something went wrong.'}
      </Callout>
      {onRetry ? (
        <button type="button" className="btn btn--sm" onClick={() => onRetry()}>
          <Icon name="reset" /> Retry
        </button>
      ) : null}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', className = 'btn btn--sm', copiedLabel = 'Copied' }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button type="button" className={className} onClick={onCopy} aria-live="polite">
      <Icon name={copied ? 'check' : 'copy'} />
      {copied ? copiedLabel : label}
    </button>
  )
}

export function TeacherCrumbs({ items }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="td-crumb">
          {i > 0 && <Icon name="chevron-right" />}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function SkeletonRows({ rows = 4, height = 52 }) {
  return (
    <div className="td-skel" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  )
}

// Render `inline code` inside plain text safely.
export function RichText({ text }) {
  const parts = String(text || '').split(/(`[^`\n]+`)/g)
  return parts.map((p, i) => (p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i}>{p.slice(1, -1)}</code> : p))
}

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

export function GradeChip({ grades, passMark }) {
  if (!grades || grades.onTrack === null || grades.onTrack === undefined) return <span className="chip chip--outline">Not graded yet</span>
  return grades.onTrack ? (
    <span className="chip chip--done" title={`Graded work averages ${grades.soFar}%, pass mark ${passMark}%`}>
      On track
    </span>
  ) : (
    <span className="chip chip--warn" title={`Graded work averages ${grades.soFar}%, pass mark ${passMark}%`}>
      At risk
    </span>
  )
}

// A strong, readable temporary password: three short words and digits.
const WORDS = ['tea', 'rice', 'shard', 'quorum', 'node', 'oplog', 'index', 'leaf', 'river', 'amber', 'cedar', 'harbor', 'maple', 'orbit', 'pixel', 'delta']
export function generatePassword() {
  const pick = () => WORDS[crypto.getRandomValues(new Uint32Array(1))[0] % WORDS.length]
  const n = (crypto.getRandomValues(new Uint32Array(1))[0] % 90) + 10
  return `${pick()}-${pick()}-${pick()}-${n}`
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}
