import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession, isTeacherRole } from '../../lib/session.js'
import { api } from '../../lib/api.js'
import Icon from '../../components/Icon.jsx'
import { useDocTitle } from '../../components/ui.jsx'
import AuthShell, { PasswordInput, formatCode } from './AuthShell.jsx'

const COPY = {
  student: {
    title: 'Join your class',
    lead: 'Use the class code your teacher gave you. You can join more classes later.',
    points: [
      'Module 1 opens step by step: begin, learn, practise, apply, reflect',
      'Five browser labs, nothing to install',
      'Your teacher grades your assignment and opens stages for the class',
    ],
    nameHint: 'Shown to your teacher and classmates, and printed on your certificate.',
  },
  teacher: {
    title: 'Set up your class',
    lead: 'Create a class, share its join code, and follow every student who signs up with it.',
    points: [
      'Each class gets its own private join code',
      'See every student, the stage they reached and their grades',
      'Open stages for the class, grade the assignment, export grades as CSV',
    ],
    nameHint: 'Shown to your students on their class page.',
  },
}

export default function Signup() {
  useDocTitle('Create an account')
  const signup = useSession((s) => s.signup)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [type, setType] = useState(() => (params.get('as') === 'teacher' ? 'teacher' : 'student'))
  const [teacherSignup, setTeacherSignup] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(() => formatCode(params.get('code') || ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = params.get('next')
  const short = password.length > 0 && password.length < 8
  const copy = COPY[type]

  useEffect(() => {
    let alive = true
    api
      .get('/api/auth/options')
      .then((o) => {
        if (!alive) return
        setTeacherSignup(o.teacherSignup !== false)
        if (o.teacherSignup === false) setType('student')
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const choose = (t) => {
    setType(t)
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Use a password of at least 8 characters.')
    setBusy(true)
    try {
      await signup({ name, email, password, joinCode: code, accountType: type })
      const s = useSession.getState()
      if (isTeacherRole(s.user?.role)) navigate('/teacher', { replace: true })
      else if (!s.currentClassId) navigate('/join', { replace: true })
      else navigate(next && next.startsWith('/') ? next : '/module/1/start', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      kicker="Create your account"
      title={copy.title}
      lead={copy.lead}
      points={copy.points}
      footer={
        <>
          Already have an account? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link>.
          {type === 'teacher' && (
            <>
              <br />
              Testing the student side? Sign up a second account with your class code in a private window.
            </>
          )}
        </>
      }
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        {teacherSignup && (
          <fieldset className="auth__role">
            <legend className="label">I am a</legend>
            <div className="segmented auth__seg">
              {[
                ['student', 'Student', 'user'],
                ['teacher', 'Teacher', 'users'],
              ].map(([id, label, icon]) => (
                <button key={id} type="button" aria-pressed={type === id} onClick={() => choose(id)}>
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {type === 'student' && (
          <div className="field">
            <label className="label" htmlFor="su-code">
              Class code
            </label>
            <input
              id="su-code"
              className="input auth__code"
              value={code}
              onChange={(e) => setCode(formatCode(e.target.value))}
              placeholder="ABCD-1234"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              aria-describedby="su-code-hint"
            />
            <span className="hint" id="su-code-hint">
              Eight characters from your teacher. Leave it empty if you do not have one yet.
            </span>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="su-name">
            Full name
          </label>
          <input
            id="su-name"
            className="input"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
          <span className="hint">{copy.nameHint}</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="su-email">
            Email
          </label>
          <input
            id="su-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-password">
            Password
          </label>
          <PasswordInput
            id="su-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            invalid={short}
            describedBy="su-pw-hint"
          />
          <span className="hint" id="su-pw-hint">
            At least 8 characters{short ? ` (${8 - password.length} more)` : ''}.
          </span>
        </div>
        {error && (
          <p className="auth__error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !name.trim() || !email || !password}>
          {busy ? 'Creating your account…' : type === 'teacher' ? 'Create teacher account' : 'Create account'}
          {!busy && <Icon name="arrow-right" />}
        </button>
      </form>
    </AuthShell>
  )
}
