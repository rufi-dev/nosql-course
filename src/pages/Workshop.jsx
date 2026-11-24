import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import CodeBlock from '../components/CodeBlock.jsx'
import { Callout, Meter, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import { useStore } from '../store.js'
import { COURSE } from '../data/course.js'
import { PEERS, RUBRIC, RUBRIC_MAX, reviewAccuracy } from '../data/peers.js'
import './Workshop.css'

const PHASES = [
  { id: 'setup', label: 'Setup', note: 'The teacher has set the rubric and allocated three submissions to you.' },
  { id: 'submission', label: 'Submission', note: 'Submit your own assignment. Scoring opens once it is in.' },
  { id: 'assessment', label: 'Assessment', note: 'Score each submission on the four criteria and leave a useful comment.' },
  { id: 'grading', label: 'Grading', note: 'Your assessments are compared with the teacher’s to grade how well you assess.' },
  { id: 'closed', label: 'Closed', note: 'All three assessments are in. Your results are below.' },
]

const sumScores = (scores) => RUBRIC.reduce((s, c) => s + (scores[c.id] ?? 0), 0)
const levelText = (crit, v) => (v == null ? null : v === 0 ? 'Not attempted.' : crit.levels[v <= 1 ? 1 : v <= 3 ? 3 : 5])

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

function SubmissionView({ peer, index }) {
  return (
    <article className="wks-sub" aria-labelledby={`wks-sub-${peer.id}`}>
      <header className="wks-sub__head">
        <div>
          <span className="kicker kicker--ink">
            Submission <span className="kicker__num">{index + 1} of 3</span>
          </span>
          <h3 id={`wks-sub-${peer.id}`} className="wks-sub__title">
            {peer.label}
          </h3>
        </div>
        <span className="chip chip--outline">Sample written for practice</span>
      </header>
      <div className="wks-sub__part">
        <div className="wks-sub__label">1 · Schema or structure</div>
        <CodeBlock code={peer.schema} title="schema" copy={false} />
      </div>
      <div className="wks-sub__part">
        <div className="wks-sub__label">2 · Queries</div>
        <CodeBlock code={peer.queries} title="mongosh" copy={false} />
      </div>
      <div className="wks-sub__part">
        <div className="wks-sub__label">3 · Result</div>
        <CodeBlock code={peer.result} title="output" copy={false} />
      </div>
      <div className="wks-sub__part">
        <div className="wks-sub__label">4 · Trade-off justification</div>
        <div className="wks-sub__just">
          <div className="wks-sub__key">
            Shard key <code>{peer.shardKey}</code>
          </div>
          <p>{peer.justification}</p>
        </div>
      </div>
    </article>
  )
}

function ScoreForm({ peer, onSave, isLast }) {
  const [scores, setScores] = useState({})
  const [comment, setComment] = useState('')
  const [tried, setTried] = useState(false)
  const allScored = RUBRIC.every((c) => scores[c.id] != null)
  const commentOk = comment.trim().length >= 25
  const ready = allScored && commentOk

  const save = () => {
    setTried(true)
    if (!ready) return
    onSave(scores, comment.trim())
  }

  return (
    <form
      className="wks-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      aria-label={`Your assessment of ${peer.label}`}
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
          <fieldset key={c.id} className={`wks-crit ${missing ? 'is-missing' : ''}`}>
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
          <label className="label" htmlFor={`wks-comment-${peer.id}`}>
            Comment for the author
          </label>
          <span className={`hint tabular ${commentOk ? 'wks-ok' : ''}`}>{comment.trim().length}/25 min</span>
        </div>
        <textarea
          id={`wks-comment-${peer.id}`}
          className="textarea"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="One thing that works, and one specific change that would raise the lowest score."
          aria-invalid={tried && !commentOk ? 'true' : undefined}
        />
      </div>
      {tried && !ready && (
        <p className="wks-form__err" role="alert">
          {!allScored ? 'Score all four criteria. ' : ''}
          {!commentOk ? 'Write at least 25 characters of feedback.' : ''}
        </p>
      )}
      <button type="submit" className="btn btn--dark btn--lg btn--block">
        <Icon name="check" />
        {isLast ? 'Save assessment' : 'Save and see the comparison'}
      </button>
    </form>
  )
}

function Comparison({ peer, review, onNext, nextLabel }) {
  const reduce = useReducedMotion()
  const yours = sumScores(review.scores)
  const ref = sumScores(peer.reference)
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
          <div className="kicker">Saved · compared with the teacher</div>
          <h3 className="wks-compare__title">
            Your accuracy: <span className="tabular">{review.accuracy}%</span>
          </h3>
        </div>
        <div className="wks-compare__totals tabular">
          <span>
            You <strong>{yours}</strong>
          </span>
          <span>
            Teacher <strong>{ref}</strong>
          </span>
        </div>
      </div>
      <Meter value={review.accuracy} label={`Assessment accuracy ${review.accuracy}%`} />
      <ul className="wks-compare__rows">
        {RUBRIC.map((c) => {
          const a = review.scores[c.id]
          const b = peer.reference[c.id]
          const d = Math.abs(a - b)
          return (
            <li key={c.id} className="wks-compare__row">
              <div className="wks-compare__crit">
                <span className="wks-compare__name">{c.short}</span>
                <span className={`wks-diff ${d === 0 ? 'is-0' : d === 1 ? 'is-1' : 'is-2'}`}>
                  {d === 0 ? 'Match' : `Off by ${d}`}
                </span>
              </div>
              <div className="wks-compare__pair tabular" aria-label={`You ${a}, teacher ${b}`}>
                <span className="wks-pip wks-pip--you">{a}</span>
                <span className="wks-pip wks-pip--ref">{b}</span>
              </div>
              <p className="wks-compare__why">{peer.rationale[c.id]}</p>
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

function Results({ reviews }) {
  const rows = PEERS.filter((p) => reviews[p.id])
  const avg = rows.length ? Math.round(rows.reduce((s, p) => s + reviews[p.id].accuracy, 0) / rows.length) : 0
  const pct = Math.round(avg * Math.min(1, rows.length / 3))
  const points = ((pct / 100) * COURSE.weights.peer).toFixed(1)
  return (
    <section className="wks-results" aria-labelledby="wks-results-title">
      <div className="wks-results__hero">
        <div>
          <span className="kicker kicker--on-dark">Workshop closed</span>
          <h2 id="wks-results-title" className="wks-results__title">
            You assessed three submissions with {avg}% accuracy.
          </h2>
          <p>
            That earns {pct}% for peer review, worth {points} of the {COURSE.weights.peer} points in the module grade.
            Accuracy is 100 minus 20 for every point you are off per criterion, on average.
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
            {rows.map((p) => {
              const r = reviews[p.id]
              return (
                <tr key={p.id}>
                  <th scope="row">{p.label}</th>
                  {RUBRIC.map((c) => (
                    <td key={c.id} className="num">
                      {r.scores[c.id]}
                      <span className="faint"> / {p.reference[c.id]}</span>
                    </td>
                  ))}
                  <td className="num">
                    {sumScores(r.scores)} / {sumScores(p.reference)}
                  </td>
                  <td className="num">
                    <span className={`chip ${r.accuracy >= 80 ? 'chip--done' : r.accuracy >= 60 ? 'chip--accent' : 'chip--warn'}`}>
                      {r.accuracy}%
                    </span>
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

/* ------------------------------------------------------------------ */

export default function Workshop() {
  const submitted = Boolean(useStore((s) => s.assignment.submittedAt))
  const reviews = useStore((s) => s.workshop.reviews)
  const saveReview = useStore((s) => s.saveReview)
  const reduce = useReducedMotion()

  const reviewedCount = PEERS.filter((p) => reviews[p.id]).length
  const phase = !submitted ? 1 : reviewedCount < 3 ? 2 : 4
  const firstOpen = PEERS.findIndex((p) => !reviews[p.id])
  const [sel, setSel] = useState(firstOpen === -1 ? 0 : firstOpen)
  const peer = PEERS[sel]
  const review = reviews[peer.id]
  const nextOpen = useMemo(() => {
    for (let k = 1; k <= PEERS.length; k++) {
      const j = (sel + k) % PEERS.length
      if (!reviews[PEERS[j].id]) return j
    }
    return -1
  }, [sel, reviews])

  const onSave = (scores, comment) => {
    const accuracy = reviewAccuracy(scores, peer.reference)
    saveReview(peer.id, { scores, comment, accuracy })
  }

  const go = (i) => {
    setSel(i)
    document.getElementById('wks-work')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <ActivityFrame id="workshop">
      <div className="wks">
        <section className="wks-top">
          <PhaseBar current={phase} />
          <p className="wks-phasenote">
            <strong>{PHASES[phase].label}.</strong> {PHASES[phase].note}
          </p>
          <RubricList />
        </section>

        {phase === 4 && <Results reviews={reviews} />}

        {!submitted && (
          <div className="wks-locked">
            <span className="wks-locked__icon">
              <Icon name="lock" />
            </span>
            <div>
              <div className="wks-locked__title">Scoring opens after you submit your own assignment</div>
              <p className="muted">
                You can read the three submissions now. Assessing them after you have written your own makes the
                comparison sharper.
              </p>
            </div>
            <Link to="/module/1/assignment" className="btn btn--primary">
              Go to the assignment
              <Icon name="arrow-right" />
            </Link>
          </div>
        )}

        <div id="wks-work" className="wks-work">
          <div className="wks-tabs" role="tablist" aria-label="Submissions to assess">
            {PEERS.map((p, i) => {
              const done = Boolean(reviews[p.id])
              return (
                <button
                  key={p.id}
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
                  <span className="wks-tab__label">{p.label.replace('Sample submission ', 'Submission ')}</span>
                  {done && <span className="wks-tab__acc tabular">{reviews[p.id].accuracy}%</span>}
                </button>
              )
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={peer.id}
              id="wks-panel"
              role="tabpanel"
              className="wks-panel"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.14, ease: EASE_OUT } }}
              transition={{ duration: 0.4, ease: EASE_EXPO }}
            >
              <SubmissionView peer={peer} index={sel} />
              <aside className="wks-aside">
                {!submitted ? (
                  <div className="wks-preview">
                    <Icon name="eye" />
                    <div>
                      <div className="wks-preview__title">Read-only preview</div>
                      <p className="muted">
                        Note where this submission meets or misses each rubric level. You will score it once your own
                        assignment is in.
                      </p>
                    </div>
                  </div>
                ) : review ? (
                  <Comparison
                    peer={peer}
                    review={review}
                    onNext={nextOpen !== -1 ? () => go(nextOpen) : undefined}
                    nextLabel={nextOpen !== -1 ? `Assess ${PEERS[nextOpen].label.replace('Sample submission', 'submission')}` : ''}
                  />
                ) : (
                  <ScoreForm key={peer.id} peer={peer} onSave={onSave} isLast={reviewedCount === 2} />
                )}
              </aside>
            </motion.div>
          </AnimatePresence>
        </div>

        <Callout tone="neutral" icon="info">
          These three submissions were written for practice, not by real classmates. Your accuracy compares your scores
          with the teacher’s reference scores on the same rubric your own assignment is marked against.
        </Callout>
      </div>
    </ActivityFrame>
  )
}
