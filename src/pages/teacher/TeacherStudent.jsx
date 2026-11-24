import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useSession } from '../../lib/session.js'
import { STAGES, OUTCOMES, COURSE, activityById } from '../../data/course.js'
import { RUBRIC } from '../../data/peers.js'
import Icon from '../../components/Icon.jsx'
import CodeBlock from '../../components/CodeBlock.jsx'
import { Callout, Meter, Ring, useDocTitle } from '../../components/ui.jsx'
import { useApi, ErrorBox, SkeletonRows, TeacherCrumbs, GradeChip, CopyButton, RichText, relTime, fmtDate, fmtDateTime, generatePassword } from './shared.jsx'
import './teacher.css'

function ScoreChips({ scores }) {
  if (!scores) return null
  return (
    <span className="td-review__scores">
      {RUBRIC.map((c) => (
        <span key={c.id} className="chip chip--outline chip--mono" title={c.title}>
          {c.short} {scores[c.id] ?? '–'}/5
        </span>
      ))}
    </span>
  )
}

function ResetPassword({ classId, student }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 8) return setError('Use at least 8 characters.')
    setBusy(true)
    setError('')
    try {
      await api.post(`/api/teacher/classes/${classId}/students/${student.id}/password`, { password: pw })
      setDone(pw)
      setOpen(false)
      setPw('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="td-card">
      <h2 className="td-h3">Reset password</h2>
      {done ? (
        <Callout tone="success" title="Password reset.">
          Share it with {student.name} in person or by a private message. They have been signed out on every device and can change it in
          Settings after logging in.
          <span className="cluster" style={{ '--gap': '8px', marginTop: 8 }}>
            <span className="td-code__value">{done}</span>
            <CopyButton text={done} />
          </span>
        </Callout>
      ) : (
        <p className="td-small td-muted">For a student who forgot their password. There is no email reset, so you set a temporary one here.</p>
      )}
      {!open ? (
        <button
          type="button"
          className="btn btn--sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            setOpen(true)
            setDone('')
            setPw(generatePassword())
          }}
        >
          <Icon name="key" /> Set a temporary password
        </button>
      ) : (
        <form onSubmit={submit} className="td-section" style={{ gap: 8 }}>
          <label className="field" htmlFor="td-pw">
            <span className="label">Temporary password</span>
            <input
              id="td-pw"
              className="input mono"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={8}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby="td-pw-hint"
            />
            <span className="hint" id="td-pw-hint">
              At least 8 characters. A random one is filled in for you.
            </span>
          </label>
          {error && (
            <span className="td-rowerror" role="alert">
              {error}
            </span>
          )}
          <span className="cluster" style={{ '--gap': '6px' }}>
            <button type="submit" className="btn btn--dark btn--sm" disabled={busy}>
              {busy ? 'Saving…' : 'Reset password'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPw(generatePassword())}>
              <Icon name="reset" /> Another
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </span>
        </form>
      )}
    </div>
  )
}

function RemoveStudent({ classId, student }) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await api.del(`/api/teacher/classes/${classId}/students/${student.id}`)
      navigate(`/teacher/classes/${classId}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="td-card td-card--danger">
      <h2 className="td-h3">Remove from class</h2>
      <p className="td-small td-muted">
        {student.name} leaves the class list and can no longer open its activities. Their account stays; they can rejoin with the code.
      </p>
      {!confirm ? (
        <button type="button" className="btn btn--danger btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>
          <Icon name="trash" /> Remove {student.name.split(' ')[0]}
        </button>
      ) : (
        <div className="td-confirm td-confirm--light" role="alert">
          <span>Remove {student.name} from this class?</span>
          <button type="button" className="btn btn--danger btn--sm" onClick={remove} disabled={busy}>
            {busy ? 'Removing…' : 'Yes, remove'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <span className="td-rowerror">{error}</span>}
    </div>
  )
}

export default function TeacherStudent() {
  const { classId, userId } = useParams()
  const className = useSession((s) => s.classes.find((c) => c.id === classId)?.name) || 'Class'
  const { loading, data, error, reload } = useApi(`/api/teacher/classes/${classId}/students/${userId}`)
  useDocTitle(data ? data.student.name : 'Student')

  const crumbs = [
    { to: '/teacher', label: 'Teacher dashboard' },
    { to: `/teacher/classes/${classId}`, label: className },
    { label: data?.student.name || 'Student' },
  ]

  if (loading) {
    return (
      <div className="page page--wide td-page">
        <TeacherCrumbs items={crumbs} />
        <div style={{ height: 16 }} />
        <SkeletonRows rows={1} height={48} />
        <div style={{ height: 24 }} />
        <SkeletonRows rows={4} height={90} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="page page--wide td-page">
        <TeacherCrumbs items={crumbs} />
        <div style={{ height: 16 }} />
        <ErrorBox error={error} onRetry={error.status >= 500 || error.status === 0 ? reload : null} title="Could not open this student." />
        <Link to={`/teacher/classes/${classId}`} className="btn btn--sm" style={{ marginTop: 12 }}>
          <Icon name="arrow-left" /> Back to the class
        </Link>
      </div>
    )
  }

  const { student, summary, state, grades, labs, quizAttempts, submission, reviewsGiven, reviewsReceived, posts } = data
  const reflection = state.reflection || {}

  return (
    <div className="page page--wide td-page">
      <header className="td-head" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <TeacherCrumbs items={crumbs} />
        <div className="td-sechead" style={{ alignItems: 'flex-end' }}>
          <div className="td-head__titles">
            <div className="kicker">Student</div>
            <h1 className="td-title">{student.name}</h1>
            <p className="td-sub td-small">
              <a href={`mailto:${student.email}`}>{student.email}</a> · joined {fmtDate(student.joinedAt)} · last active {relTime(student.lastSeenAt).toLowerCase()}
            </p>
          </div>
          <span className="cluster" style={{ '--gap': '12px' }}>
            <Ring value={summary.pct} size={56} stroke={5} label={`Progress ${summary.pct}%`}>
              <span style={{ fontSize: '0.72rem' }}>{summary.pct}%</span>
            </Ring>
            <span className="td-small">
              <strong className="tabular">
                {summary.done}/{summary.total}
              </strong>{' '}
              activities
              <br />
              <span className="td-faint">{summary.current ? `Now on ${summary.current.short}` : 'Module finished'}</span>
            </span>
          </span>
        </div>
      </header>

      <div className="td-split">
        <div>
          {/* Activities by stage */}
          <section className="td-section" aria-labelledby="acts-h">
            <h2 id="acts-h" className="td-h2">
              Activities
            </h2>
            <div className="td-checks">
              {STAGES.map((s, i) => {
                const st = summary.stages[s.id]
                return (
                  <div key={s.id} className={`td-checkgroup ${st.open ? '' : 'is-locked'}`}>
                    <div className="td-checkgroup__head">
                      <span className="td-h3">
                        {i + 1}. {s.title}
                      </span>
                      {st.complete ? (
                        <span className="chip chip--done">Complete</span>
                      ) : st.open ? (
                        <span className="chip chip--outline tabular">
                          {st.done}/{st.total}
                        </span>
                      ) : (
                        <span className="chip chip--outline">
                          <Icon name="lock" /> Locked
                        </span>
                      )}
                    </div>
                    {s.activities.map((id) => {
                      const a = activityById(id)
                      const at = state.activities?.[id]?.at
                      return (
                        <div key={id} className={`td-check ${at ? 'is-done' : ''}`}>
                          <Icon name={at ? 'check-circle' : 'target'} />
                          <span>{a.short}</span>
                          <span className="td-check__when">{at ? fmtDateTime(at) : ''}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Labs */}
          <section className="td-section" aria-labelledby="labs-h">
            <h2 id="labs-h" className="td-h2">
              Lab checkpoints
            </h2>
            <div className="td-checks">
              {labs.map((l, i) => {
                const done = l.checkpoints.filter((c) => c.at).length
                return (
                  <div key={l.key} className="td-checkgroup">
                    <div className="td-checkgroup__head">
                      <span className="td-h3">
                        Lab {i + 1} · {l.title}
                      </span>
                      <span className={`chip tabular ${done === l.checkpoints.length ? 'chip--done' : 'chip--outline'}`}>
                        {done}/{l.checkpoints.length}
                      </span>
                    </div>
                    {l.checkpoints.map((c) => (
                      <div key={c.id} className={`td-check ${c.at ? 'is-done' : ''}`}>
                        <Icon name={c.at ? 'check-circle' : 'target'} />
                        <span>{c.label}</span>
                        <span className="td-check__when">{c.at && c.at > 1 ? fmtDate(c.at) : ''}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Quiz */}
          <section className="td-section" aria-labelledby="quiz-h">
            <h2 id="quiz-h" className="td-h2">
              Quiz attempts
            </h2>
            {quizAttempts.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Finished</th>
                      <th scope="col" className="num">
                        Score
                      </th>
                      <th scope="col" className="num">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizAttempts.map((a, i) => (
                      <tr key={i}>
                        <td>{fmtDateTime(a.at)}</td>
                        <td className="num tabular">
                          {a.score}/{a.total}
                        </td>
                        <td className="num">
                          <span className={`chip tabular ${a.pct >= COURSE.quizPass ? 'chip--done' : 'chip--warn'}`}>{a.pct}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="td-muted td-small">No finished attempts yet. The best attempt counts; the pass mark is {COURSE.quizPass}%.</p>
            )}
          </section>

          {/* Submission */}
          <section className="td-section" aria-labelledby="sub-h">
            <div className="td-sechead">
              <h2 id="sub-h" className="td-h2">
                Assignment
              </h2>
              {submission && submission.status !== 'withdrawn' && (
                <Link to={`/teacher/submissions/${submission.id}`} className="btn btn--dark btn--sm">
                  {submission.status === 'graded' ? 'Review the grade' : 'Grade this submission'} <Icon name="arrow-right" />
                </Link>
              )}
            </div>
            {!submission || submission.status === 'withdrawn' ? (
              <p className="td-muted td-small">
                {submission?.status === 'withdrawn' ? 'The student withdrew the submission to edit it.' : 'Not submitted yet.'}
              </p>
            ) : (
              <>
                <dl className="td-stats">
                  <div>
                    <dt>Submitted</dt>
                    <dd className="td-small">{fmtDateTime(submission.submittedAt)}</dd>
                  </div>
                  <div>
                    <dt>Auto-check</dt>
                    <dd>{submission.autoScore}%</dd>
                  </div>
                  <div>
                    <dt>Teacher grade</dt>
                    <dd>{submission.status === 'graded' ? `${submission.teacherScore}%` : 'Not yet'}</dd>
                  </div>
                </dl>
                {submission.teacherFeedback && (
                  <Callout tone="success" title="Your feedback:">
                    {submission.teacherFeedback}
                  </Callout>
                )}
                <details className="td-card">
                  <summary className="td-h3" style={{ cursor: 'pointer' }}>
                    Show what they submitted
                  </summary>
                  <div className="td-section" style={{ gap: 12, marginTop: 12 }}>
                    <CodeBlock code={submission.fields.schema || ''} title="Schema" />
                    <CodeBlock code={submission.fields.queries || ''} title="Queries" />
                    <CodeBlock code={submission.fields.result || ''} title="Result" />
                    <div>
                      <span className="label">Shard key</span> <code>{submission.fields.shardKey}</code>
                    </div>
                    <div className="td-prose">{submission.fields.justification}</div>
                  </div>
                </details>
              </>
            )}
          </section>

          {/* Reviews */}
          <section className="td-section" aria-labelledby="rev-h">
            <h2 id="rev-h" className="td-h2">
              Peer review
            </h2>
            <h3 className="td-h3">Given ({reviewsGiven.filter((r) => r.reviewedAt).length} of 3)</h3>
            {reviewsGiven.length ? (
              <ul className="td-reviews">
                {reviewsGiven.map((r, i) => (
                  <li key={i} className="td-review">
                    <div className="td-sechead">
                      <span className="td-small">
                        <strong>{r.target || 'Classmate'}</strong>{' '}
                        <span className="chip chip--outline">{r.kind === 'sample' ? 'Sample' : 'Classmate'}</span>
                      </span>
                      {r.reviewedAt ? (
                        <span className="td-xs td-faint">
                          {typeof r.accuracy === 'number' ? `Accuracy ${r.accuracy}%` : 'Accuracy after you grade the target'} ·{' '}
                          {fmtDate(r.reviewedAt)}
                        </span>
                      ) : (
                        <span className="chip chip--outline">Not reviewed yet</span>
                      )}
                    </div>
                    {r.reviewedAt && (
                      <>
                        <ScoreChips scores={r.scores} />
                        <p className="td-review__comment">{r.comment}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="td-muted td-small">Peer review opens after they submit the assignment.</p>
            )}
            <h3 className="td-h3">Received ({reviewsReceived.length})</h3>
            {reviewsReceived.length ? (
              <ul className="td-reviews">
                {reviewsReceived.map((r, i) => (
                  <li key={i} className="td-review">
                    <div className="td-sechead">
                      <strong className="td-small">{r.reviewer}</strong>
                      <span className="td-xs td-faint">{fmtDate(r.reviewedAt)}</span>
                    </div>
                    <ScoreChips scores={r.scores} />
                    <p className="td-review__comment">{r.comment}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="td-muted td-small">No classmate has reviewed their work yet.</p>
            )}
          </section>

          {/* Posts */}
          <section className="td-section" aria-labelledby="posts-h">
            <div className="td-sechead">
              <h2 id="posts-h" className="td-h2">
                Discussion posts
              </h2>
              <Link to={`/teacher/classes/${classId}?tab=discussion`} className="btn btn--ghost btn--sm">
                Open the discussion <Icon name="arrow-right" />
              </Link>
            </div>
            {posts.length ? (
              <ul className="td-reviews">
                {posts.map((p) => (
                  <li key={p.id} className="td-review">
                    <span className="td-xs td-faint">
                      {p.isReply ? 'Reply' : 'Post'} · {fmtDateTime(p.at)}
                    </span>
                    <p className="td-review__comment">
                      <RichText text={p.body} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="td-muted td-small">No posts yet.</p>
            )}
          </section>

          {/* Reflection */}
          <section className="td-section" aria-labelledby="refl-h">
            <h2 id="refl-h" className="td-h2">
              Reflection
            </h2>
            {reflection.submittedAt ? (
              <div className="td-card">
                <dl className="td-kv">
                  <dt>Submitted</dt>
                  <dd>{fmtDateTime(reflection.submittedAt)}</dd>
                  <dt>Rating</dt>
                  <dd>{reflection.rating ? `${reflection.rating} / 5` : '–'}</dd>
                  <dt>Time taken</dt>
                  <dd>{reflection.minutes ? `${reflection.minutes} min` : '–'}</dd>
                </dl>
                <div className="td-confbars">
                  {OUTCOMES.map((o) => {
                    const v = reflection.confidence?.[o.id]
                    return (
                      <div key={o.id} className="td-conf">
                        <span className="td-conf__verb">{o.verb}</span>
                        <Meter value={v ? (v / 5) * 100 : 0} label={`${o.verb} ${v ?? 'not rated'} of 5`} />
                        <span className="tabular td-small">{v ?? '–'}</span>
                      </div>
                    )
                  })}
                </div>
                {reflection.unclear && (
                  <div className="td-reflection__quote">
                    <span className="td-xs td-faint" style={{ display: 'block', marginBottom: 4 }}>
                      What was unclear
                    </span>
                    {reflection.unclear}
                  </div>
                )}
              </div>
            ) : (
              <p className="td-muted td-small">Not submitted yet. Students reflect in the Wrap-up at the end of the module.</p>
            )}
          </section>
        </div>

        <aside className="td-side">
          <div className="td-card">
            <div className="td-sechead">
              <h2 className="td-h3">Grade</h2>
              <GradeChip grades={grades} passMark={COURSE.passMark} />
            </div>
            <ul className="td-gradelist">
              {grades.items.map((it) => (
                <li key={it.key}>
                  <span>
                    {it.label}
                    <span className="td-xs td-faint" style={{ display: 'block' }}>
                      {it.status}
                    </span>
                  </span>
                  <span className="num td-faint">{it.weight}%</span>
                  <span className="num">{it.pct === null ? '–' : `${it.pct}%`}</span>
                </li>
              ))}
              <li>
                <span>Module total</span>
                <span className="num td-faint">/100</span>
                <span className="num">{grades.total}</span>
              </li>
            </ul>
            <p className="td-xs td-faint">Pass mark {COURSE.passMark}. Items not attempted count as zero.</p>
          </div>
          <ResetPassword classId={classId} student={student} />
          <RemoveStudent classId={classId} student={student} />
        </aside>
      </div>
    </div>
  )
}
