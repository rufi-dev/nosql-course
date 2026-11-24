import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, exportState, moduleProgress } from '../store.js'
import { useSession, isTeacherRole } from '../lib/session.js'
import { applyServerState, flush } from '../lib/sync.js'
import { api } from '../lib/api.js'
import Icon from '../components/Icon.jsx'
import { Callout, useDocTitle } from '../components/ui.jsx'
import { PasswordInput } from './auth/AuthShell.jsx'
import './app-pages.css'
import './Settings.css'

function NameForm() {
  const user = useSession((s) => s.user)
  const updateName = useSession((s) => s.updateName)
  const [name, setName] = useState(user.name)
  const [state, setState] = useState({ busy: false, msg: '', error: '' })
  const submit = async (e) => {
    e.preventDefault()
    setState({ busy: true, msg: '', error: '' })
    try {
      await updateName(name)
      setState({ busy: false, msg: 'Saved.', error: '' })
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message })
    }
  }
  return (
    <form className="set-form" onSubmit={submit}>
      <div className="field">
        <label className="label" htmlFor="set-name">
          Full name
        </label>
        <input id="set-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
        <span className="hint">Shown to your teacher and classmates, and printed on your certificate.</span>
      </div>
      <div className="field">
        <span className="label">Email</span>
        <span className="set-static">{user.email}</span>
      </div>
      <div className="set-actions">
        <button type="submit" className="btn btn--dark" disabled={state.busy || !name.trim() || name === user.name}>
          Save name
        </button>
        {state.msg && <span className="set-ok">{state.msg}</span>}
        {state.error && <span className="set-err">{state.error}</span>}
      </div>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [state, setState] = useState({ busy: false, msg: '', error: '' })
  const submit = async (e) => {
    e.preventDefault()
    setState({ busy: true, msg: '', error: '' })
    try {
      await api.post('/api/auth/password', { currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setState({ busy: false, msg: 'Password changed. Other devices were signed out.', error: '' })
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message })
    }
  }
  return (
    <form className="set-form" onSubmit={submit}>
      <div className="field">
        <label className="label" htmlFor="pw-current">
          Current password
        </label>
        <PasswordInput id="pw-current" value={current} onChange={setCurrent} autoComplete="current-password" />
      </div>
      <div className="field">
        <label className="label" htmlFor="pw-new">
          New password
        </label>
        <PasswordInput id="pw-new" value={next} onChange={setNext} autoComplete="new-password" />
        <span className="hint">At least 8 characters.</span>
      </div>
      <div className="set-actions">
        <button type="submit" className="btn btn--dark" disabled={state.busy || !current || next.length < 8}>
          Change password
        </button>
        {state.msg && <span className="set-ok">{state.msg}</span>}
        {state.error && <span className="set-err">{state.error}</span>}
      </div>
    </form>
  )
}

export default function Settings() {
  useDocTitle('Settings')
  const user = useSession((s) => s.user)
  const learner = useSession((s) => s.learner)
  const currentClass = useSession((s) => s.classes.find((c) => c.id === s.currentClassId))
  const motionPref = useStore((s) => s.settings.motion)
  const setMotion = useStore((s) => s.setMotion)
  const pushToast = useStore((s) => s.pushToast)
  const activities = useStore((s) => s.activities)
  const { done } = moduleProgress(activities)
  const [confirm, setConfirm] = useState(false)
  const [resetError, setResetError] = useState('')
  const teacher = isTeacherRole(user.role)

  const download = async () => {
    await flush().catch(() => {})
    const blob = new Blob(
      [
        JSON.stringify(
          { app: 'nosql-course', exportedAt: new Date().toISOString(), user: user.email, class: currentClass?.name, data: exportState() },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nosql-course-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = async () => {
    setResetError('')
    try {
      await flush().catch(() => {})
      const { state } = await api.post('/api/progress/reset')
      applyServerState(state)
      setConfirm(false)
      pushToast({ icon: 'reset', title: 'Progress reset', body: 'Module 1 starts again from the beginning.' })
    } catch (err) {
      setResetError(err.message)
    }
  }

  return (
    <div className="page apppage settings">
      <header className="apphead">
        <div>
          <div className="kicker">Account</div>
          <h1 className="apphead__title">Settings</h1>
          <p className="apphead__sub">
            {teacher ? 'Your teacher account.' : `Your account${currentClass ? ` in ${currentClass.name}` : ''}.`} Progress and
            submissions are stored on the course server.
          </p>
        </div>
      </header>

      <section className="set-sec">
        <div className="set-sec__head">
          <h2>Profile</h2>
        </div>
        <NameForm />
      </section>

      <section className="set-sec">
        <div className="set-sec__head">
          <h2>Password</h2>
          <p className="faint">Forgot your password? Your teacher can set a new one from the class dashboard.</p>
        </div>
        <PasswordForm />
      </section>

      {!teacher && (
        <section className="set-sec">
          <div className="set-sec__head">
            <h2>Class</h2>
          </div>
          <p className="muted">
            {currentClass ? (
              <>
                You are working in <strong>{currentClass.name}</strong>
                {currentClass.teacherName ? ` with ${currentClass.teacherName}` : ''}. Progress is kept separately for each
                class.
              </>
            ) : (
              'You are not in a class yet.'
            )}
          </p>
          <Link to="/join" className="btn">
            <Icon name="plus" /> {currentClass ? 'Join or switch class' : 'Join a class'}
          </Link>
        </section>
      )}

      <section className="set-sec">
        <div className="set-sec__head">
          <h2>Motion</h2>
          <p className="faint">Animations show state changes in the labs and lectures. Reduce them if they distract you. Saved on this device.</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Motion preference">
          {[
            ['system', 'Follow my device'],
            ['reduce', 'Reduce motion'],
            ['full', 'Full motion'],
          ].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={motionPref === v} aria-pressed={motionPref === v} onClick={() => setMotion(v)}>
              {l}
            </button>
          ))}
        </div>
      </section>

      {learner === 'synced' && (
        <>
          <section className="set-sec">
            <div className="set-sec__head">
              <h2>Your data</h2>
              <p className="faint">
                A copy of your Module 1 progress in this class: {done} activities ticked, lab state, quiz results and your
                reflection.
              </p>
            </div>
            <div className="cluster">
              <button type="button" className="btn" onClick={download}>
                <Icon name="download" /> Download my progress
              </button>
            </div>
          </section>

          <section className="set-sec set-sec--danger">
            <div className="set-sec__head">
              <h2>Start over</h2>
              <p className="faint">
                Clears your activity progress, lab state and reflection in this class. Your quiz history, submission, peer
                reviews and forum posts stay, because your teacher and classmates rely on them.
              </p>
            </div>
            {!confirm ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirm(true)}>
                <Icon name="trash" /> Reset my progress
              </button>
            ) : (
              <div className="set-confirm" role="alert">
                <span>This cannot be undone. Download your progress first if you might need it.</span>
                <div className="cluster">
                  <button type="button" className="btn btn--danger" onClick={reset}>
                    Yes, reset my progress
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {resetError && (
              <Callout tone="warn" title="Reset failed.">
                {resetError}
              </Callout>
            )}
          </section>
        </>
      )}
    </div>
  )
}
