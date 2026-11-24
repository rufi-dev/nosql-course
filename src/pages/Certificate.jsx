import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useStore } from '../store.js'
import { useSession } from '../lib/session.js'
import { COURSE, MODULES, OUTCOMES } from '../data/course.js'
import { computeGrades } from '../lib/grades.js'
import { certificateRequirements } from './Badges.jsx'
import Icon from '../components/Icon.jsx'
import { LogoMark } from '../components/Layout.jsx'
import { useDocTitle, EASE_EXPO } from '../components/ui.jsx'
import './app-pages.css'
import './Certificate.css'

function code(name, ts) {
  // Short, stable verification code derived from name + completion time.
  let h = 2166136261
  const s = `${name}|${ts}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0')
  return `NSQL-M1-${hex.slice(0, 4)}-${hex.slice(4)}`
}

export default function Certificate() {
  useDocTitle('Certificate')
  const state = useStore()
  const setName = useSession((s) => s.updateName)
  const [draft, setDraft] = useState(state.profile.name || '')
  const reqs = certificateRequirements(state)
  const ready = reqs.every((r) => r.ok)
  const grades = computeGrades(state)
  const completedAt = state.badges['module-complete'] || Math.max(0, ...Object.values(state.activities).map((a) => a.at || 0))

  if (!ready) {
    return (
      <div className="page apppage">
        <header className="apphead">
          <div>
            <div className="kicker">Certificate</div>
            <h1 className="apphead__title">Not issued yet</h1>
            <p className="apphead__sub">The Module 1 certificate is issued automatically once every requirement is met.</p>
          </div>
        </header>
        <ul className="certreq__list cert-missing">
          {reqs.map((r) => (
            <li key={r.id} className={r.ok ? 'is-ok' : ''}>
              <Icon name={r.ok ? 'check-circle' : 'lock'} />
              <span>{r.label}</span>
              <span className="faint tabular">{r.progress}</span>
              {!r.ok ? (
                <Link to={r.to} className="btn btn--ghost btn--sm">
                  Go <Icon name="arrow-right" />
                </Link>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const name = state.profile.name.trim()

  return (
    <div className="page apppage cert-page">
      <div className="cert-tools no-print">
        <div>
          <div className="kicker">Certificate</div>
          <h1 className="home-h2" style={{ marginTop: 6 }}>
            Module 1 complete
          </h1>
        </div>
        {name ? (
          <div className="cluster">
            <button type="button" className="btn btn--primary" onClick={() => window.print()}>
              <Icon name="print" /> Print or save as PDF
            </button>
            <Link to="/settings" className="btn btn--ghost">
              Change name
            </Link>
          </div>
        ) : null}
      </div>

      {!name && (
        <form
          className="cert-name no-print"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) setName(draft.trim())
          }}
        >
          <label className="field" htmlFor="cert-name">
            <span className="label">Name to print on the certificate</span>
            <input id="cert-name" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your full name" autoComplete="name" />
          </label>
          <button type="submit" className="btn btn--dark" disabled={!draft.trim()}>
            Save name
          </button>
        </form>
      )}

      <motion.article
        className="cert"
        initial={{ opacity: 0, y: 20, rotateX: 6 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 1, ease: EASE_EXPO }}
        aria-label="Certificate of completion"
      >
        <div className="cert__frame">
          <header className="cert__head">
            <LogoMark size={40} />
            <span className="cert__course">{COURSE.title}</span>
          </header>
          <div className="cert__body">
            <span className="cert__kicker">Certificate of completion</span>
            <p className="cert__certifies">This certifies that</p>
            <p className="cert__name">{name || 'Your name'}</p>
            <p className="cert__text">
              has completed Module 1, <strong>{MODULES[0].title}</strong>, including five browser labs, an auto-graded
              quiz, a rubric-assessed assignment and three peer reviews.
            </p>
            <ul className="cert__outcomes">
              {OUTCOMES.map((o) => (
                <li key={o.id}>{o.verb}</li>
              ))}
            </ul>
          </div>
          <footer className="cert__foot">
            <div>
              <span className="cert__label">Date</span>
              <span>{new Date(completedAt || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <div>
              <span className="cert__label">Module grade</span>
              <span>{grades.total} / 100</span>
            </div>
            <div>
              <span className="cert__label">Verification code</span>
              <span className="mono">{code(name, completedAt)}</span>
            </div>
          </footer>
        </div>
      </motion.article>
      <p className="faint cert-note no-print">
        Issued by this course site from your progress on the course server. It records completion of the module; it is not a
        university transcript.
      </p>
    </div>
  )
}
