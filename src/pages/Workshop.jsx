import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import CodeBlock from '../components/CodeBlock.jsx'
import { Callout, Meter, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import { COURSE } from '../data/course.js'
import { RUBRIC, RUBRIC_MAX } from '../data/peers.js'
import { api } from '../lib/api.js'
import { applyServerState } from '../lib/sync.js'
import { useSession } from '../lib/session.js'
import './Workshop.css'

// Peer review runs on the server: it assigns three submissions (classmates
// first, practice samples to fill), keeps reference scores hidden until a
// review is saved, and records every review. Reviews are final once saved.

const PHASES = [
  { id: 'setup', label: 'Setup', note: 'The teacher has set the rubric. Three submissions are allocated to you when you submit.' },
  { id: 'submission', label: 'Submission', note: 'Submit your own assignment. Scoring opens once it is in.' },
  { id: 'assessment', label: 'Assessment', note: 'Score each submission on the four criteria and leave a useful comment.' },
  {
    id: 'grading',
    label: 'Grading',
    note: 'All three assessments are in. Accuracy for classmates’ work is measured once your teacher grades their submissions.',
  },
  { id: 'closed', label: 'Closed', note: 'All three assessments are in and measured. Your results are below.' },
]

const sumScores = (scores) => RUBRIC.reduce((s, c) => s + (scores?.[c.id] ?? 0), 0)
const levelText = (crit, v) => (v == null ? null : v === 0 ? 'Not attempted.' : crit.levels[v <= 1 ? 1 : v <= 3 ? 3 : 5])
const shortLabel = (t) => (t.kind === 'sample' ? t.label.replace('Sample submission ', 'Sample ') : `Classmate ${t.position}`)

/* ------------------------------------------------------------------ */

function PhaseBar({ current }) {
  return (
    <ol className="wks-phases" aria-label="Workshop phases">
      {PHASES.map((p, i) => {
        const state = i < current ? 'is-done' : i === current ? 'is-current' : ''
        return (
          <li key={p.id} className={`wks-phase ${state}`} aria-current={i === current ? 'step' : undefined}>
            <span className="wks-phase__dot" aria-hidden="true">
              {i < current ? <Icon name="check" strokeWidth={2.6} /> : i + 1}
            </span>
            <span className="wks-phase__label">{p.label}</span>
            <span className="visually-hidden">{i < current ? ', complete' : i === current ? ', current phase' : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

function RubricList() {
  return (
    <details className="wks-rubric">
      <summary>
        <Icon name="grid" />
        <span>Rubric: 4 criteria, 0 to 5 points each</span>
        <Icon name="chevron-down" className="wks-rubric__chev" />
      </summary>
      <div className="wks-rubric__grid">
        {RUBRIC.map((c, i) => (
          <div key={c.id} className="wks-rubric__crit">
            <div className="wks-rubric__title">
              <span className="wks-rubric__n">{i + 1}</span>
              {c.title}
            </div>
            <dl>
              {[1, 3, 5].map((lv) => (
                <div key={lv}>
                  <dt>{lv}</dt>
                  <dd>{c.levels[lv]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  )
}

function SubmissionView({ item, index, total }) {
  const f = item.fields || {}
  return (
    <article className="wks-sub" aria-labelledby={`wks-sub-${item.id}`}>
      <header className="wks-sub__head">
        <div>
          <span className="kicker kicker--ink">
            Submission <span className="kicker__num">{`${index + 1} of ${total}`}</span>
          </span>
          <h3 id={`wks-sub-${item.id}`} className="wks-sub__title">
            {item.label}
          </h3>
        </div>
        <span className={`chip ${item.kind === 'peer' ? 'chip--info' : 'chip--outline'}`}>
          {item.kind === 'peer' ? 'Classmate, anonymous' : 'Sample written for practice'}
        </span>
      </header>
      <div className="wks-sub__part">
        <div className="wks-sub__label">1 · Schema or structure</div>
        <CodeBlock code={f.schema || ''} title="schema" copy={false} />
      </div>
      <div className="wks-sub__part">
        <div className="wks-sub__label">2 · Queries</div>
        <CodeBlock code={f.queries || ''} title="mongosh" copy={false} />
      </div>
      <div className="wks-sub__part">
        <div className="wks-sub__label">3 · Result</div>
        <CodeBlock code={f.result || ''} title="output" copy={false} />
      </div>
      <div className="wks-sub__part">
        <div className="wks-sub__label">4 · Trade-off justification</div>
        <div className="wks-sub__just">
          <div className="wks-sub__key">
            Shard key <code>{f.shardKey}</code>
          </div>
          <p>{f.justification}</p>
        </div>
      </div>
    </article>
  )
}

function ScoreForm({ item, onSave, isLast }) {
  const [scores, setScores] = useState({})
  const [comment, setComment] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const allScored = RUBRIC.every((c) => scores[c.id] != null)
  const commentOk = comment.trim().length >= 25
  const ready = allScored && commentOk

  const save = async () => {
    setTried(true)
    if (!ready || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(scores, comment.trim())
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form
      className="wks-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      aria-label={`Your assessment of ${item.label}`}
    >
      <div className="wks-form__head">
        <h3 className="wks-form__title">Your assessment</h3>
        <span className="wks-form__total tabular" aria-live="polite">
          {sumScores(scores)}
          <span className="faint"> / {RUBRIC_MAX}</span>
        </span>
      </div>
      {RUBRIC.map((c, i) => {
        const v = scores[c.id]
        const missing = tried && v == null
        return (
          <fieldset key={c.id} className={`wks-crit ${missing ? 'is-missing' : ''}`} disabled={saving}>
            <legend className="wks-crit__legend">
              <span className="wks-crit__n">{i + 1}</span>
              {c.title}
            </legend>
            <div className="wks-scale" role="radiogroup" aria-label={`${c.title}, 0 to 5 points`}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={v === n}
                  className="wks-scale__btn"
                  onClick={() => setScores((s) => ({ ...s, [c.id]: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="wks-crit__desc" aria-live="polite">
              {v == null ? <span className="faint">Choose 0 to 5. Level 5: {c.levels[5]}</span> : levelText(c, v)}
            </p>
          </fieldset>
        )
      })}
      <div className="field">
        <div className="spread">
          <label className="label" htmlFor={`wks-comment-${item.id}`}>
            Comment for the author
          </label>
          <span className={`hint tabular ${commentOk ? 'wks-ok' : ''}`}>{comment.trim().length}/25 min</span>
        </div>
        <textarea
          id={`wks-comment-${item.id}`}
          className="textarea"
          rows={4}
          value={comment}
          disabled={saving}
          onChange={(e) => setComment(e.target.value)}
          placeholder="One thing that works, and one specific change that would raise the lowest score."
          aria-invalid={tried && !commentOk ? 'true' : undefined}
        />
        {item.kind === 'peer' ? (
          <span className="hint">Your classmate sees these scores and this comment, without your name.</span>
        ) : null}
      </div>
      {tried && !ready && (
        <p className="wks-form__err" role="alert">
          {!allScored ? 'Score all four criteria. ' : ''}
          {!commentOk ? 'Write at least 25 characters of feedback.' : ''}
        </p>
      )}
      {error ? (
        <p className="wks-form__err" role="alert">
          {error}
        </p>
      ) : null}
      <p className="wks-final">
        <Icon name="lock" />
        Reviews are final once saved. Check your scores before you save.
      </p>
      <button type="submit" className="btn btn--dark btn--lg btn--block" disabled={saving}>
        <Icon name={saving ? 'clock' : 'check'} />
        {saving ? 'Saving…' : isLast ? 'Save assessment' : item.kind === 'sample' ? 'Save and see the comparison' : 'Save assessment'}
      </button>
    </form>
  )
}

function Comparison({ item, onNext, nextLabel }) {
  const reduce = useReducedMotion()
  const { review, reference, rationale } = item
  const yours = sumScores(review.scores)
  const hasRef = Boolean(reference)
  return (
    <motion.div
      className="wks-compare"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_EXPO }}
      aria-live="polite"
    >
      <div className="wks-compare__head">
        <div>
          <div className="kicker">{hasRef ? 'Saved · compared with the teacher' : 'Saved · waiting for the teacher’s grade'}</div>
          <h3 className="wks-compare__title">
            {hasRef && typeof review.accuracy === 'number' ? (
              <>
                Your accuracy: <span className="tabular">{review.accuracy}%</span>
              </>
            ) : (
              'Accuracy not measured yet'
            )}
          </h3>
        </div>
        <div className="wks-compare__totals tabular">
          <span>
            You <strong>{yours}</strong>
          </span>
          {hasRef ? (
            <span>
              Teacher <strong>{sumScores(reference)}</strong>
            </span>
          ) : null}
        </div>
      </div>
      {hasRef && typeof review.accuracy === 'number' ? (
        <Meter value={review.accuracy} label={`Assessment accuracy ${review.accuracy}%`} />
      ) : (
        <p className="wks-pending">
          <Icon name="clock" />
          Your accuracy on a classmate’s work is measured once your teacher grades that submission. Until then this review
          counts as complete.
        </p>
      )}
      <ul className="wks-compare__rows">
        {RUBRIC.map((c) => {
          const a = review.scores?.[c.id]
          const b = hasRef ? reference[c.id] : null
          const d = hasRef ? Math.abs(a - b) : null
          return (
            <li key={c.id} className="wks-compare__row">
              <div className="wks-compare__crit">
                <span className="wks-compare__name">{c.short}</span>
                {hasRef ? (
                  <span className={`wks-diff ${d === 0 ? 'is-0' : d === 1 ? 'is-1' : 'is-2'}`}>{d === 0 ? 'Match' : `Off by ${d}`}</span>
                ) : null}
              </div>
              <div className="wks-compare__pair tabular" aria-label={hasRef ? `You ${a}, teacher ${b}` : `You ${a}`}>
                <span className="wks-pip wks-pip--you">{a}</span>
                {hasRef ? <span className="wks-pip wks-pip--ref">{b}</span> : null}
              </div>
              {rationale?.[c.id] ? <p className="wks-compare__why">{rationale[c.id]}</p> : null}
            </li>
          )
        })}
      </ul>
      <div className="wks-compare__comment">
        <div className="wks-sub__label">Your comment</div>
        <p>{review.comment}</p>
      </div>
      {onNext && (
        <button type="button" className="btn btn--primary" onClick={onNext}>
          {nextLabel}
          <Icon name="arrow-right" />
        </button>
      )}
    </motion.div>
  )
}

function Results({ targets }) {
  const rows = targets.filter((t) => t.review)
  const measured = rows.filter((t) => typeof t.review.accuracy === 'number')
  const avg = measured.length ? Math.round(measured.reduce((s, t) => s + t.review.accuracy, 0) / measured.length) : null
  // Same rule as the grade report: unmeasured reviews count as complete.
  const credit = rows.length ? rows.reduce((s, t) => s + (typeof t.review.accuracy === 'number' ? t.review.accuracy : 100), 0) / rows.length : 0
  const pct = Math.round(credit * Math.min(1, rows.length / 3))
  const points = ((pct / 100) * COURSE.weights.peer).toFixed(1)
  const pending = rows.length - measured.length
  return (
    <section className="wks-results" aria-labelledby="wks-results-title">
      <div className="wks-results__hero">
        <div>
          <span className="kicker kicker--on-dark">{pending ? 'Workshop grading' : 'Workshop closed'}</span>
          <h2 id="wks-results-title" className="wks-results__title">
            {avg === null
              ? 'You assessed three submissions.'
              : pending
                ? `You assessed three submissions. Accuracy so far: ${avg}%.`
                : `You assessed three submissions with ${avg}% accuracy.`}
          </h2>
          <p>
            That currently earns {pct}% for peer review, worth {points} of the {COURSE.weights.peer} points in the module
            grade. Accuracy is 100 minus 20 for every point you are off per criterion, on average.
            {pending ? ` ${pending} review${pending === 1 ? '' : 's'} of classmates’ work will be measured once your teacher grades them.` : ''}
          </p>
        </div>
        <Link to="/grades" className="btn btn--on-dark">
          See the grade report
          <Icon name="arrow-right" />
        </Link>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Submission</th>
              {RUBRIC.map((c) => (
                <th key={c.id} scope="col" className="num">
                  {c.short}
                </th>
              ))}
              <th scope="col" className="num">
                You / teacher
              </th>
              <th scope="col" className="num">
                Accuracy
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const r = t.review
              return (
                <tr key={t.id}>
                  <th scope="row">{t.label}</th>
                  {RUBRIC.map((c) => (
                    <td key={c.id} className="num">
                      {r.scores[c.id]}
                      {t.reference ? <span className="faint"> / {t.reference[c.id]}</span> : null}
                    </td>
                  ))}
                  <td className="num">
                    {sumScores(r.scores)} / {t.reference ? sumScores(t.reference) : '–'}
                  </td>
                  <td className="num">
                    {typeof r.accuracy === 'number' ? (
                      <span className={`chip ${r.accuracy >= 80 ? 'chip--done' : r.accuracy >= 60 ? 'chip--accent' : 'chip--warn'}`}>
                        {r.accuracy}%
                      </span>
                    ) : (
                      <span className="chip chip--outline">Awaiting grade</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Skeleton() {
  return (
    <div className="wks-loading" aria-busy="true" aria-label="Loading the workshop">
      <div className="skeleton" style={{ height: 44 }} />
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */

export default function Workshop() {
  const learner = useSession((s) => s.learner)
  const preview = learner === 'preview'
  const reduce = useReducedMotion()
  const [data, setData] = useState(null) // { phase, targets, samples }
  const [loading, setLoading] = useState(!preview)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/workshop')
      setData(res)
      const firstOpen = (res.targets || []).findIndex((t) => !t.review)
      setSel(firstOpen === -1 ? 0 : firstOpen)
    } catch (err) {
      setError(err.code === 'preview' ? '' : err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!preview) load()
  }, [preview, load])

  const targets = useMemo(() => data?.targets || [], [data])
  const assessing = targets.length > 0
  const items = assessing ? targets : (data?.samples || []).map((s, i) => ({ ...s, kind: 'sample', position: i + 1 }))
  const reviewedCount = targets.filter((t) => t.review).length
  const allMeasured = assessing && reviewedCount === targets.length && targets.every((t) => typeof t.review?.accuracy === 'number')
  const phaseIdx = !assessing ? 1 : reviewedCount < targets.length ? 2 : allMeasured ? 4 : 3
  const item = items[Math.min(sel, Math.max(0, items.length - 1))]
  const nextOpen = useMemo(() => {
    for (let k = 1; k <= targets.length; k++) {
      const j = (sel + k) % targets.length
      if (!targets[j].review) return j
    }
    return -1
  }, [sel, targets])

  const onSave = async (scores, comment) => {
    const res = await api.post('/api/workshop/reviews', { targetId: item.id, scores, comment })
    setData((d) => ({ ...d, targets: res.targets, phase: res.targets.every((t) => t.review) ? 'grading' : 'assessment' }))
    applyServerState(res.state)
  }

  const go = (i) => {
    setSel(i)
    document.getElementById('wks-work')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <ActivityFrame id="workshop">
      <div className="wks">
        <section className="wks-top">
          <PhaseBar current={preview ? 1 : phaseIdx} />
          <p className="wks-phasenote">
            <strong>{PHASES[preview ? 1 : phaseIdx].label}.</strong> {PHASES[preview ? 1 : phaseIdx].note}
          </p>
          <RubricList />
        </section>

        {preview ? (
          <Callout tone="info" icon="eye" title="Teacher preview:">
            students review three submissions here: classmates first, practice samples when not enough classmates have
            submitted. Their reviews and accuracy appear on your <Link to="/teacher">dashboard</Link>, and grading a
            submission there measures the accuracy of everyone who reviewed it.
          </Callout>
        ) : loading && !data ? (
          <Skeleton />
        ) : error ? (
          <Callout tone="warn" title="The workshop could not load.">
            {error}{' '}
            <button type="button" className="btn btn--sm" onClick={load}>
              <Icon name="reset" />
              Try again
            </button>
          </Callout>
        ) : (
          <>
            {phaseIdx >= 3 && <Results targets={targets} />}

            {!assessing && (
              <div className="wks-locked">
                <span className="wks-locked__icon">
                  <Icon name="lock" />
                </span>
                <div>
                  <div className="wks-locked__title">Scoring opens after you submit your own assignment</div>
                  <p className="muted">
                    You can read the practice submissions now. Once yours is in, you get three to assess: classmates first,
                    samples to fill.
                  </p>
                </div>
                <Link to="/module/1/assignment" className="btn btn--primary">
                  Go to the assignment
                  <Icon name="arrow-right" />
                </Link>
              </div>
            )}

            {item && (
              <div id="wks-work" className="wks-work">
                <div className="wks-tabs" role="tablist" aria-label="Submissions to assess">
                  {items.map((t, i) => {
                    const done = Boolean(t.review)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={sel === i}
                        aria-controls="wks-panel"
                        className={`wks-tab ${done ? 'is-done' : ''}`}
                        onClick={() => setSel(i)}
                      >
                        <span className="wks-tab__dot" aria-hidden="true">
                          {done ? <Icon name="check" strokeWidth={2.6} /> : i + 1}
                        </span>
                        <span className="wks-tab__label">{shortLabel(t)}</span>
                        {done && typeof t.review.accuracy === 'number' && (
                          <span className="wks-tab__acc tabular">{t.review.accuracy}%</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={item.id}
                    id="wks-panel"
                    role="tabpanel"
                    className="wks-panel"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.14, ease: EASE_OUT } }}
                    transition={{ duration: 0.4, ease: EASE_EXPO }}
                  >
                    <SubmissionView item={item} index={sel} total={items.length} />
                    <aside className="wks-aside">
                      {!assessing ? (
                        <div className="wks-preview">
                          <Icon name="eye" />
                          <div>
                            <div className="wks-preview__title">Read-only preview</div>
                            <p className="muted">
                              Note where this submission meets or misses each rubric level. You will score submissions once
                              your own assignment is in.
                            </p>
                          </div>
                        </div>
                      ) : item.review ? (
                        <Comparison
                          item={item}
                          onNext={nextOpen !== -1 ? () => go(nextOpen) : undefined}
                          nextLabel={nextOpen !== -1 ? `Assess ${shortLabel(targets[nextOpen])}` : ''}
                        />
                      ) : (
                        <ScoreForm key={item.id} item={item} onSave={onSave} isLast={reviewedCount === targets.length - 1} />
                      )}
                    </aside>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            <Callout tone="neutral" icon="info">
              {assessing && targets.some((t) => t.kind === 'peer')
                ? 'Classmates’ submissions are anonymous both ways. Practice samples fill any slots when fewer classmates have submitted; for those, your scores are compared with the teacher’s reference scores right after you save.'
                : 'When classmates submit, their work replaces practice samples you have not assessed yet. For samples, your scores are compared with the teacher’s reference scores right after you save.'}
            </Callout>
          </>
        )}
      </div>
    </ActivityFrame>
  )
}
