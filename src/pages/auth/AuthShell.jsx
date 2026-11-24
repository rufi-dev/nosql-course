import { useState } from 'react'
import { motion } from 'motion/react'
import { LogoMark } from '../../components/Layout.jsx'
import Icon from '../../components/Icon.jsx'
import { EASE_EXPO } from '../../components/ui.jsx'
import { COURSE } from '../../data/course.js'
import './auth.css'

// Two-panel layout for login, sign-up and join pages.
export default function AuthShell({ kicker, title, lead, points, children, footer }) {
  return (
    <div className="auth page page--wide">
      <motion.aside
        className="auth__panel"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: EASE_EXPO }}
      >
        <LogoMark size={44} onDark />
        <div className="auth__course">{COURSE.title}</div>
        <ul className="auth__points">
          {(points || []).map((p) => (
            <li key={p}>
              <Icon name="check" strokeWidth={2.4} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div className="auth__nodes" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </motion.aside>
      <motion.section
        className="auth__main"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE_EXPO, delay: 0.05 }}
      >
        <div className="auth__head">
          {kicker ? <div className="kicker">{kicker}</div> : null}
          <h1 className="auth__title">{title}</h1>
          {lead ? <p className="auth__lead">{lead}</p> : null}
        </div>
        {children}
        {footer ? <div className="auth__footer">{footer}</div> : null}
      </motion.section>
    </div>
  )
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy }) {
  const [show, setShow] = useState(false)
  return (
    <div className="auth__pw">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        minLength={8}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
      />
      <button type="button" className="auth__pwtoggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eye' : 'eye'} />
        <span>{show ? 'Hide' : 'Show'}</span>
      </button>
    </div>
  )
}

export const formatCode = (raw) => {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s
}
