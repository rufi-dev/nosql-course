import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '../../lib/api.js'
import { useSession } from '../../lib/session.js'
import { RUBRIC, RUBRIC_MAX } from '../../data/peers.js'
import Icon from '../../components/Icon.jsx'
import CodeBlock from '../../components/CodeBlock.jsx'
import { Callout, useDocTitle, EASE_OUT } from '../../components/ui.jsx'
import { useApi, ErrorBox, SkeletonRows, TeacherCrumbs, fmtDateTime } from './shared.jsx'
import './teacher.css'

const wordCount = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length

// Descriptor for a score: the rubric defines levels 1, 3 and 5.
function levelText(c, score) {
  if (score === 0) return 'Missing entirely.'
  if (c.levels[score]) return c.levels[score]
  if (score === 2) return `Between: ${c.levels[1]} / ${c.levels[3]}`
  if (score === 4) return `Between: ${c.levels[3]} / ${c.levels[5]}`
  return ''
}

function initialScores(sub) {
  if (sub.teacherScores) return { ...sub.teacherScores }
  return Object.fromEntries(RUBRIC.map((c) => [c.id, sub.checks?.find((k) => k.id === c.id)?.points ?? 0]))
}

function GradingPanel({ sub, onSaved }) {
  const [scores, setScores] = useState(() => initialScores(sub))
  const [feedback, setFeedback] = useState(sub.teacherFeedback || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [nextId, setNextId] = useState(undefined)

  const total = RUBRIC.reduce((s, c) => s + (scores[c.id] ?? 0), 0)
  const pct = Math.round((total / RUBRIC_MAX) * 100)
  const withdrawn = sub.status === 'withdrawn'

  // Find the next ungraded submission in this class once a grade is saved.
  useEffect(() => {
    if (!saved) return
    let live = true
    api
      .get(`/api/teacher/classes/${sub.classId}/submissions`)
      .then(({ submissions }) => {
        if (!live) return
        const next = submissions.find((s) => s.status === 'submitted' && s.id !== sub.id)
        setNextId(next ? next.id : null)
      })
      .catch(() => live && setNextId(null))
    return () => {
      live = false
    }
  }, [saved, sub.classId, sub.id])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { submission } = await api.put(`/api/teacher/submissions/${sub.id}/grade`, { scores, feedback: feedback.trim() })
      onSaved(submission)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    setError('')
    try {
      const { submission } = await api.del(`/api/teacher/submissions/${sub.id}/grade`)
      onSaved({ ...sub, ...submission })
      setSaved(false)
      setFeedback('')
      setScores(initialScores({ ...sub, teacherScores: null }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="td-card" onSubmit={save} aria-labelledby="grade-h">
      <div className="td-sechead">
        <h2 id="grade-h" className="td-h3">
          Your grade
        </h2>
        {sub.status === 'graded' ? <span className="chip chip--done">Graded</span> : <span className="chip chip--accent">Needs grading</span>}
      </div>
      {withdrawn && (
        <Callout tone="warn" title="Withdrawn.">
          The student withdrew this submission to edit it. Grade it after they submit again.
        </Callout>
      )}
      {!sub.teacherScores && !withdrawn && (
        <p className="td-xs td-faint">Prefilled from the automatic check. Adjust each criterion after reading the work.</p>
      )}
      <div className="td-rubric">
        {RUBRIC.map((c) => {
          const v = scores[c.id] ?? 0
          return (
            <div key={c.id} className="td-crit">
              <div className="td-crit__head" id={`crit-${c.id}`}>
                <span>{c.title}</span>
                <span className="tabular td-faint">{v}/5</span>
              </div>
              <div className="segmented" role="radiogroup" aria-labelledby={`crit-${c.id}`}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={v === n}
                    disabled={withdrawn}
                    onClick={() => {
                      setScores((s) => ({ ...s, [c.id]: n }))
                      setSaved(false)
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="td-crit__level">{levelText(c, v)}</span>
            </div>
          )
        })}
      </div>
      <div className="td-total">
        <span className="td-small td-muted">Total</span>
        <span className="td-total__value">
          {total}
          <small>/{RUBRIC_MAX}</small> <small>· {pct}%</small>
        </span>
      </div>
      <label className="field" htmlFor="td-feedback">
        <span className="label">Feedback to the student</span>
        <textarea
          id="td-feedback"
          className="textarea"
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value)
            setSaved(false)
          }}
          maxLength={5000}
          placeholder="What is strong, and the one change that would raise the grade."
          disabled={withdrawn}
        />
      </label>
      {error && (
        <span className="td-rowerror" role="alert">
          {error}
        </span>
      )}
      <span className="cluster" style={{ '--gap': '8px' }}>
        <button type="submit" className="btn btn--primary" disabled={busy || withdrawn}>
          <Icon name="check" /> {busy ? 'Saving…' : sub.status === 'graded' ? 'Update grade' : 'Save grade'}
        </button>
        {sub.status === 'graded' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={clear} disabled={busy}>
            Clear grade
          </button>
        )}
      </span>
      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
            <Callout tone="success" title={`Saved: ${pct}%.`}>
              The student sees the grade and your feedback now, and the accuracy of everyone who reviewed this work updates.
              {nextId === undefined ? null : nextId ? (
                <>
                  {' '}
                  <Link to={`/teacher/submissions/${nextId}`}>Next ungraded submission</Link>
                </>
              ) : (
                ' No more ungraded submissions in this class.'
              )}
            </Callout>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}

export default function TeacherSubmission() {
  const { submissionId } = useParams()
  const { loading, data, error, reload, setData } = useApi(`/api/teacher/submissions/${submissionId}`)
  const sub = data?.submission
  const className = useSession((s) => s.classes.find((c) => c.id === sub?.classId)?.name) || 'Class'
  useDocTitle(sub ? `Grade: ${sub.student.name}` : 'Grade submission')

  const crumbs = useMemo(
    () => [
      { to: '/teacher', label: 'Teacher dashboard' },
      ...(sub ? [{ to: `/teacher/classes/${sub.classId}?tab=submissions`, label: className }] : []),
      { label: sub ? `${sub.student.name}'s submission` : 'Submission' },
    ],
    [sub, className],
  )

  if (loading) {
    return (
      <div className="page page--wide td-page">
        <SkeletonRows rows={1} height={20} />
        <div style={{ height: 16 }} />
        <SkeletonRows rows={4} height={120} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="page page--wide td-page">
        <TeacherCrumbs items={crumbs} />
        <div style={{ height: 16 }} />
        <ErrorBox error={error} onRetry={error.status >= 500 || error.status === 0 ? reload : null} title="Could not open this submission." />
        <Link to="/teacher" className="btn btn--sm" style={{ marginTop: 12 }}>
          <Icon name="arrow-left" /> Back to your classes
        </Link>
      </div>
    )
  }

  const f = sub.fields || {}
  const words = wordCount(f.justification)

  return (
    <div className="page page--wide td-page">
      <header className="td-head" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <TeacherCrumbs items={crumbs} />
        <div className="td-head__titles">
          <div className="kicker">Assignment · Run the finished database</div>
          <h1 className="td-title">{sub.student.name}</h1>
          <p className="td-sub td-small">
            Submitted {fmtDateTime(sub.submittedAt)} · auto-check {sub.autoScore}%
            {sub.status === 'graded' ? ` · graded ${fmtDateTime(sub.gradedAt)}` : ''} ·{' '}
            <Link to={`/teacher/classes/${sub.classId}/students/${sub.student.id}`}>Student details</Link>
          </p>
        </div>
      </header>

      <div className="td-split">
        <div>
          <section className="td-section" aria-label="Submitted work">
            <div className="td-field">
              <div className="td-field__head">
                <h2 className="td-h3">1. Schema or structure</h2>
              </div>
              <CodeBlock code={f.schema || ''} title="Schema" />
            </div>
            <div className="td-field">
              <h2 className="td-h3">2. Queries</h2>
              <CodeBlock code={f.queries || ''} title="Queries" />
            </div>
            <div className="td-field">
              <h2 className="td-h3">3. Result</h2>
              <CodeBlock code={f.result || ''} title="Shell output" />
            </div>
            <div className="td-field">
              <div className="td-field__head">
                <h2 className="td-h3">4. Trade-off justification</h2>
                <span className={`chip ${words >= 120 && words <= 200 ? 'chip--done' : 'chip--outline'}`}>{words} words · target 120 to 200</span>
              </div>
              <div>
                <span className="label">Shard key</span> <code>{f.shardKey || 'not given'}</code>
              </div>
              <div className="td-prose">{f.justification || 'No justification written.'}</div>
            </div>
          </section>

          <section className="td-section" aria-labelledby="auto-h">
            <div className="td-sechead">
              <h2 id="auto-h" className="td-h2">
                Automatic check
              </h2>
              <span className="td-small td-muted">
                {(sub.checks || []).reduce((s, c) => s + c.points, 0)}/{RUBRIC_MAX} · keyword based, so read before trusting it
              </span>
            </div>
            <div className="td-autocheck">
              {(sub.checks || []).map((c) => (
                <div key={c.id} className="td-autocheck__crit">
                  <div className="td-autocheck__head">
                    <span>{c.title}</span>
                    <span className="tabular td-faint">{c.points}/5</span>
                  </div>
                  <ul>
                    {c.items.map((it, i) => (
                      <li key={i} className={it.pass ? 'is-pass' : ''}>
                        <Icon name={it.pass ? 'check' : 'x'} />
                        <span>{it.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="td-section" aria-labelledby="peer-h">
            <h2 id="peer-h" className="td-h2">
              Peer reviews received ({data.reviewsReceived.length})
            </h2>
            {data.reviewsReceived.length ? (
              <ul className="td-reviews">
                {data.reviewsReceived.map((r, i) => (
                  <li key={i} className="td-review">
                    <div className="td-sechead">
                      <strong className="td-small">{r.reviewer}</strong>
                      <span className="td-xs td-faint">{fmtDateTime(r.reviewedAt)}</span>
                    </div>
                    <span className="td-review__scores">
                      {RUBRIC.map((c) => (
                        <span key={c.id} className="chip chip--outline chip--mono" title={c.title}>
                          {c.short} {r.scores?.[c.id] ?? '–'}/5
                        </span>
                      ))}
                    </span>
                    <p className="td-review__comment">{r.comment}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="td-muted td-small">No classmate has reviewed this submission yet. Reviews are assigned as classmates submit their own work.</p>
            )}
          </section>
        </div>

        <aside className="td-side">
          <GradingPanel
            key={sub.id}
            sub={sub}
            onSaved={(s) => setData((d) => ({ ...d, submission: { ...d.submission, ...s, classId: d.submission.classId, student: d.submission.student } }))}
          />
        </aside>
      </div>
    </div>
  )
}
