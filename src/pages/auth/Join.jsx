import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession, isTeacherRole } from '../../lib/session.js'
import Icon from '../../components/Icon.jsx'
import { useDocTitle } from '../../components/ui.jsx'
import AuthShell, { formatCode } from './AuthShell.jsx'

export default function Join() {
  useDocTitle('Join a class')
  const { user, classes, currentClassId, join, switchClass } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState(() => formatCode(params.get('code') || ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = params.get('next')
  const go = () => navigate(next && next.startsWith('/') && next !== '/join' ? next : '/course', { replace: true })

  if (isTeacherRole(user?.role)) {
    return (
      <AuthShell kicker="Teacher account" title="Teachers create classes, they do not join them">
        <p className="muted">Create a class on your dashboard and share its code with your students.</p>
        <Link to="/teacher" className="btn btn--primary btn--lg">
          Open the dashboard <Icon name="arrow-right" />
        </Link>
      </AuthShell>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await join(code)
      go()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      kicker={classes.length ? 'Join another class' : 'One more step'}
      title={classes.length ? 'Enter a class code' : 'Join your class'}
      lead="Your teacher has an eight-character code for your class. Your progress is kept separately for each class."
      points={['Your teacher sees your progress and opens stages for the class', 'Switch between classes from the account menu']}
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor="join-code">
            Class code
          </label>
          <input
            id="join-code"
            className="input auth__code auth__code--big"
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            placeholder="ABCD-1234"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </div>
        {error && (
          <p className="auth__error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--lg" disabled={busy || code.replace('-', '').length < 8}>
          {busy ? 'Joining…' : 'Join class'}
          {!busy && <Icon name="arrow-right" />}
        </button>
      </form>
      {classes.length > 0 && (
        <>
          <div className="auth__divider">or continue in</div>
          <div className="auth__classes">
            {classes.map((c) => (
              <div className="auth__class" key={c.id}>
                <span>
                  <strong>{c.name}</strong>
                  <span className="faint"> · {c.teacherName}</span>
                </span>
                {c.id === currentClassId ? (
                  <button type="button" className="btn btn--sm" onClick={go}>
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={async () => {
                      await switchClass(c.id)
                      go()
                    }}
                  >
                    Switch
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AuthShell>
  )
}
