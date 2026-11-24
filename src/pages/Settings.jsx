import { useRef, useState } from 'react'
import { useStore, exportState, moduleProgress } from '../store.js'
import Icon from '../components/Icon.jsx'
import { Callout, useDocTitle } from '../components/ui.jsx'
import './app-pages.css'
import './Settings.css'

export default function Settings() {
  useDocTitle('Settings')
  const name = useStore((s) => s.profile.name)
  const setName = useStore((s) => s.setName)
  const motionPref = useStore((s) => s.settings.motion)
  const setMotion = useStore((s) => s.setMotion)
  const resetAll = useStore((s) => s.resetAll)
  const importState = useStore((s) => s.importState)
  const pushToast = useStore((s) => s.pushToast)
  const activities = useStore((s) => s.activities)
  const { done } = moduleProgress(activities)
  const [confirm, setConfirm] = useState(false)
  const [importError, setImportError] = useState('')
  const fileRef = useRef(null)

  const download = () => {
    const blob = new Blob([JSON.stringify({ app: 'nosql-course', version: 1, exportedAt: new Date().toISOString(), data: exportState() }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nosql-course-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = async (e) => {
    setImportError('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const data = parsed.data || parsed
      if (typeof data !== 'object' || !data.activities) throw new Error('This file does not look like a course progress export.')
      importState(data)
      pushToast({ icon: 'check', title: 'Progress imported', body: file.name })
    } catch (err) {
      setImportError(err.message || 'Could not read that file.')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="page apppage settings">
      <header className="apphead">
        <div>
          <div className="kicker">Profile and settings</div>
          <h1 className="apphead__title">Settings</h1>
          <p className="apphead__sub">Everything here is stored in this browser. Nothing is sent to a server.</p>
        </div>
      </header>

      <section className="set-sec">
        <div className="set-sec__head">
          <h2>Profile</h2>
          <p className="faint">Used on forum posts and on your certificate.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="set-name">
            Your name
          </label>
          <input
            id="set-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last name"
            autoComplete="name"
            maxLength={80}
          />
        </div>
      </section>

      <section className="set-sec">
        <div className="set-sec__head">
          <h2>Motion</h2>
          <p className="faint">Animations show state changes in the labs and lectures. Reduce them if they distract you.</p>
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

      <section className="set-sec">
        <div className="set-sec__head">
          <h2>Your data</h2>
          <p className="faint">
            Progress, quiz attempts, lab state, submissions, reviews and forum posts. {done} activities ticked so far.
          </p>
        </div>
        <div className="cluster">
          <button type="button" className="btn" onClick={download}>
            <Icon name="download" /> Export progress
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Import progress
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={onImport} tabIndex={-1} />
        </div>
        {importError && (
          <Callout tone="warn" title="Import failed.">
            {importError}
          </Callout>
        )}
        <p className="hint">Export to move your progress to another browser or to hand it to a teacher.</p>
      </section>

      <section className="set-sec set-sec--danger">
        <div className="set-sec__head">
          <h2>Start over</h2>
          <p className="faint">Clears every activity, grade, badge, lab and post in this browser. The playground keeps its own data.</p>
        </div>
        {!confirm ? (
          <button type="button" className="btn btn--danger" onClick={() => setConfirm(true)}>
            <Icon name="trash" /> Reset all progress
          </button>
        ) : (
          <div className="set-confirm" role="alert">
            <span>This cannot be undone. Export first if you might need it.</span>
            <div className="cluster">
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  resetAll()
                  setConfirm(false)
                  pushToast({ icon: 'reset', title: 'Progress reset', body: 'Module 1 is fresh again.' })
                }}
              >
                Yes, reset everything
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
