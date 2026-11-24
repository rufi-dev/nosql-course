import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession, isTeacherRole } from '../../lib/session.js'
import Icon from '../../components/Icon.jsx'
import { useDocTitle } from '../../components/ui.jsx'
import AuthShell, { PasswordInput } from './AuthShell.jsx'

export default function Login() {
  useDocTitle('Log in')
  const login = useSession((s) => s.login)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = params.get('next')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      const role = useSession.getState().user?.role
      navigate(next && next.startsWith('/') ? next : isTeacherRole(role) ? '/teacher' : '/course', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      kicker="Welcome back"
      title="Log in to your course"
      lead="Your progress, labs and submissions are saved to your account, so you can continue on any device."
      points={[
        'Pick up exactly where you stopped',
        'Your teacher sees your progress and grades your work',
        'Labs, quiz and assignment all in the browser',
      ]}
      footer={
        <>
          New here? <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link> with the
          class code from your teacher.
        </>
      }
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="login-password">
            Password
          </label>
          <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
          <span className="hint">Forgot it? Your teacher can set a new one for you from the class dashboard.</span>
        </div>
        {error && (
          <p className="auth__error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !email || !password}>
          {busy ? 'Logging in…' : 'Log in'}
          {!busy && <Icon name="arrow-right" />}
        </button>
      </form>
    </AuthShell>
  )
}
