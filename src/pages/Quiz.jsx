import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import CodeBlock from '../components/CodeBlock.jsx'
import { Meter, Ring, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import { useStore } from '../store.js'
import { COURSE, OUTCOMES } from '../data/course.js'
import { QUESTIONS, QUIZ_SECONDS, QUIZ_SIZE, drawQuiz, isCorrect, questionById } from '../data/quiz.js'
import './Quiz.css'

const TYPE_LABEL = {
  single: 'Choose one',
  multi: 'Choose all that apply',
  order: 'Put in order',
  code: 'Predict the output',
}

const outcomeById = (id) => OUTCOMES.find((o) => o.id === id)

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function fmtDate(ts) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts)
}

function answerText(q, value) {
  if (value === undefined || value === null || (Array.isArray(value) && !value.length)) return 'No answer'
  const label = (id) => q.options.find((o) => o.id === id)?.label ?? id
  if (q.type === 'order') return value.map((id, i) => `${i + 1}. ${label(id)}`).join('\n')
  if (q.type === 'multi') return value.map(label).join('; ')
  return label(value)
}

/* ------------------------------------------------------------------ */
/* Intro                                                               */
/* ------------------------------------------------------------------ */

function Intro({ onStart, attempts, best }) {
  const passed = best >= COURSE.quizPass
  return (
    <div className="quiz-intro">
      <section className="quiz-rules panel" aria-labelledby="quiz-rules-title">
        <div className="quiz-rules__head">
          <span className="kicker">Before you start</span>
          <h2 id="quiz-rules-title" className="quiz-rules__title">
            Ten questions, marked as you go
          </h2>
          <p className="muted">
            Each answer is checked the moment you submit it, with an explanation of why it is right or where the
            misconception sits. Learn from the mistakes, then retake with a fresh draw.
          </p>
        </div>
        <dl className="quiz-spec">
          <div>
            <dt>Questions</dt>
            <dd>
              {QUIZ_SIZE} drawn at random from a bank of {QUESTIONS.length}
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>About {QUIZ_SECONDS / 60} minutes. When time runs out the attempt is marked as it stands.</dd>
          </div>
          <div>
            <dt>Pass mark</dt>
            <dd>{COURSE.quizPass}% and the badge “Sharp reader”</dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>Unlimited. Your best score counts for {COURSE.weights.quiz}% of the module grade.</dd>
          </div>
          <div>
            <dt>Keyboard</dt>
            <dd>
              <span className="kbd">1</span>–<span className="kbd">5</span> choose, <span className="kbd">Enter</span> check
              and continue
            </dd>
          </div>
        </dl>
        <div className="quiz-rules__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>
            <Icon name="play" />
            {attempts.length ? 'Start a new attempt' : 'Start the quiz'}
          </button>
          <span className="hint">Leaving this page ends the attempt without recording it.</span>
        </div>
      </section>

      <aside className="quiz-history" aria-labelledby="quiz-history-title">
        <div className="quiz-history__best">
          <Ring
            value={best}
            size={92}
            stroke={7}
            color={passed ? 'var(--leaf)' : best ? 'var(--saffron-2)' : 'var(--paper-3)'}
            label={`Best score ${best}%`}
          >
            <span className="quiz-history__pct tabular">{attempts.length ? `${best}%` : '–'}</span>
          </Ring>
          <div>
            <div className="quiz-history__label">Best score</div>
            <div className="muted">
              {!attempts.length ? 'No attempts yet' : passed ? 'Passed. Retake any time to practise.' : `Pass at ${COURSE.quizPass}%`}
            </div>
          </div>
        </div>
        <h3 id="quiz-history-title" className="rule-label">
          Previous attempts
        </h3>
        {attempts.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Finished</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {[...attempts]
                  .map((a, i) => ({ ...a, n: i + 1 }))
                  .reverse()
                  .slice(0, 6)
                  .map((a) => (
                    <tr key={a.at}>
                      <td className="tabular">{a.n}</td>
                      <td className="nowrap">{fmtDate(a.at)}</td>
                      <td className="num">
                        {a.score}/{a.total}
                      </td>
                      <td>
                        <span className={`chip ${a.pct >= COURSE.quizPass ? 'chip--done' : 'chip--warn'}`}>
                          {a.pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="quiz-history__empty">
            Your attempts appear here with the score and date, so you can see your progress between retakes.
          </p>
        )}
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Question                                                            */
/* ------------------------------------------------------------------ */

function OrderList({ q, value, onChange, checked }) {
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <ol className="quiz-order" aria-label="Items to order">
      <AnimatePresence initial={false}>
        {value.map((id, i) => {
          const opt = q.options.find((o) => o.id === id)
          const right = checked && q.correct[i] === id
          const wrong = checked && q.correct[i] !== id
          return (
            <motion.li
              key={id}
              layout
              transition={{ duration: 0.32, ease: EASE_EXPO }}
              className={`quiz-order__item ${right ? 'is-right' : ''} ${wrong ? 'is-wrong' : ''}`}
            >
              <span className="quiz-order__pos tabular">{i + 1}</span>
              <span className="quiz-order__label">{opt.label}</span>
              {checked ? (
                <span className="quiz-order__verdict">
                  <Icon name={right ? 'check' : 'x'} strokeWidth={2.4} />
                  <span className="visually-hidden">{right ? 'correct position' : 'wrong position'}</span>
                </span>
              ) : (
                <span className="quiz-order__moves">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move “${opt.label}” up`}
                  >
                    <Icon name="chevron-up" />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => move(i, 1)}
                    disabled={i === value.length - 1}
                    aria-label={`Move “${opt.label}” down`}
                  >
                    <Icon name="chevron-down" />
                  </button>
                </span>
              )}
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}

function ChoiceList({ q, value, onChange, checked }) {
  const multi = q.type === 'multi'
  const sel = new Set(multi ? value || [] : value ? [value] : [])
  const correct = new Set(Array.isArray(q.correct) ? q.correct : [q.correct])
  const toggle = (id) => {
    if (checked) return
    if (!multi) return onChange(id)
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }
  return (
    <div className="quiz-options" role={multi ? 'group' : 'radiogroup'} aria-label="Answer options">
      {q.options.map((o, i) => {
        const isSel = sel.has(o.id)
        let state = ''
        if (checked) {
          if (correct.has(o.id)) state = 'option--correct'
          else if (isSel) state = 'option--wrong'
        }
        return (
          <button
            key={o.id}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={isSel}
            className={`option quiz-option ${multi ? 'option--multi' : ''} ${state}`}
            onClick={() => toggle(o.id)}
            disabled={checked}
          >
            <span className="option__mark">
              <Icon name={checked && isSel && !correct.has(o.id) ? 'x' : 'check'} strokeWidth={3} />
            </span>
            <span className="quiz-option__text">{o.label}</span>
            <span className="quiz-option__key" aria-hidden="true">
              {i + 1}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Feedback({ q, value }) {
  const right = isCorrect(q, value)
  const chosen = q.type === 'multi' ? value || [] : q.type === 'order' ? [] : [value]
  const hints = q.options.filter((o) => o.misconception && chosen.includes(o.id))
  const missed =
    q.type === 'multi' ? q.options.filter((o) => q.correct.includes(o.id) && !(value || []).includes(o.id)) : []
  return (
    <motion.div
      className={`quiz-feedback ${right ? 'is-right' : 'is-wrong'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_EXPO }}
    >
      <div className="quiz-feedback__verdict">
        <span className="quiz-feedback__icon">
          <Icon name={right ? 'check' : 'x'} strokeWidth={2.4} />
        </span>
        <strong>{right ? 'Correct' : 'Not this time'}</strong>
      </div>
      <p>{q.explanation}</p>
      {!right && hints.length > 0 && (
        <ul className="quiz-feedback__hints">
          {hints.map((h) => (
            <li key={h.id}>
              <span className="quiz-feedback__hintlabel">You chose “{h.label}”.</span> {h.misconception}
            </li>
          ))}
        </ul>
      )}
      {!right && missed.length > 0 && (
        <p className="quiz-feedback__missed">
          Also correct: {missed.map((m) => `“${m.label}”`).join(', ')}.
        </p>
      )}
      {!right && q.type === 'order' && (
        <ol className="quiz-feedback__order">
          {q.correct.map((id) => (
            <li key={id}>{q.options.find((o) => o.id === id).label}</li>
          ))}
        </ol>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

function Results({ result, onRetake, best, reason }) {
  const { draw, responses, score, total, pct } = result
  const passed = pct >= COURSE.quizPass
  const reduce = useReducedMotion()
  const byOutcome = useMemo(() => {
    const map = new Map()
    draw.forEach(({ id }) => {
      const q = questionById(id)
      const row = map.get(q.outcome) || { right: 0, total: 0 }
      row.total++
      if (isCorrect(q, responses[id])) row.right++
      map.set(q.outcome, row)
    })
    return OUTCOMES.filter((o) => map.has(o.id)).map((o) => ({ ...o, ...map.get(o.id) }))
  }, [draw, responses])

  return (
    <div className="quiz-results">
      <motion.section
        className={`quiz-score ${passed ? 'is-pass' : 'is-fail'}`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_EXPO }}
        aria-live="polite"
      >
        <Ring
          value={pct}
          size={148}
          stroke={10}
          color={passed ? 'var(--mint)' : 'var(--saffron)'}
          track="oklch(1 0 0 / 0.12)"
          label={`Score ${pct}%`}
        >
          <span className="quiz-score__pct tabular">{pct}%</span>
        </Ring>
        <div className="quiz-score__text">
          <span className="kicker kicker--on-dark">{reason === 'time' ? 'Time is up' : 'Attempt complete'}</span>
          <h2 className="quiz-score__title">
            {passed ? 'Passed.' : 'Not passed yet.'} {score} of {total} correct.
          </h2>
          <p>
            {passed
              ? `Your best score is ${best}%. It counts for ${COURSE.weights.quiz}% of the module grade.`
              : `You need ${COURSE.quizPass}% to pass. Read the explanations below, then retake with a new set of questions.`}
          </p>
          <div className="quiz-score__actions">
            <button type="button" className="btn btn--primary" onClick={onRetake}>
              <Icon name="reset" />
              Retake with new questions
            </button>
            <Link to="/module/1/assignment" className="btn btn--on-dark">
              Continue to the assignment
              <Icon name="arrow-right" />
            </Link>
          </div>
        </div>
      </motion.section>

      <section className="quiz-breakdown" aria-labelledby="quiz-breakdown-title">
        <h3 id="quiz-breakdown-title" className="rule-label">
          By learning outcome
        </h3>
        <ul className="quiz-breakdown__list">
          {byOutcome.map((o) => (
            <li key={o.id} className="quiz-breakdown__row">
              <div className="quiz-breakdown__label">
                <span className="quiz-breakdown__verb">{o.verb}</span>
                <span className="muted">{o.text}</span>
              </div>
              <div className="quiz-breakdown__score">
                <span className="tabular">
                  {o.right}/{o.total}
                </span>
                <Meter value={(o.right / o.total) * 100} label={`${o.verb}: ${o.right} of ${o.total}`} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="quiz-review-title">
        <h3 id="quiz-review-title" className="rule-label">
          Review every answer
        </h3>
        <ol className="quiz-review">
          {draw.map(({ id }, i) => {
            const q = questionById(id)
            const right = isCorrect(q, responses[id])
            return (
              <li key={id}>
                <details className={`quiz-review__item ${right ? 'is-right' : 'is-wrong'}`} open={!right}>
                  <summary>
                    <span className="quiz-review__status">
                      <Icon name={right ? 'check' : 'x'} strokeWidth={2.4} />
                    </span>
                    <span className="quiz-review__num tabular">{String(i + 1).padStart(2, '0')}</span>
                    <span className="quiz-review__prompt">{q.prompt}</span>
                    <Icon name="chevron-down" className="quiz-review__chev" />
                  </summary>
                  <div className="quiz-review__body">
                    {q.code && <CodeBlock code={q.code} title="mongosh" copy={false} />}
                    <div className="quiz-review__answers">
                      <div>
                        <div className="quiz-review__lbl">Your answer</div>
                        <p className={right ? 'quiz-review__yours is-right' : 'quiz-review__yours is-wrong'}>
                          {answerText(q, responses[id])}
                        </p>
                      </div>
                      {!right && (
                        <div>
                          <div className="quiz-review__lbl">Correct answer</div>
                          <p className="quiz-review__correct">{answerText(q, q.correct)}</p>
                        </div>
                      )}
                    </div>
                    <p className="quiz-review__explain">{q.explanation}</p>
                  </div>
                </details>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Quiz() {
  const attempts = useStore((s) => s.quiz.attempts)
  const best = useStore((s) => s.quiz.best)
  const recordQuizAttempt = useStore((s) => s.recordQuizAttempt)
  const reduce = useReducedMotion()

  const [phase, setPhase] = useState('intro') // intro | running | results
  const [draw, setDraw] = useState([])
  const [index, setIndex] = useState(0)
  const [responses, setResponses] = useState({})
  const [checked, setChecked] = useState({})
  const [remaining, setRemaining] = useState(QUIZ_SECONDS)
  const [result, setResult] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const recordedRef = useRef(false)
  const questionRef = useRef(null)

  const start = () => {
    const d = drawQuiz()
    const initial = {}
    d.forEach((x) => {
      if (x.start) initial[x.id] = x.start
    })
    setDraw(d)
    setResponses(initial)
    setChecked({})
    setIndex(0)
    setRemaining(QUIZ_SECONDS)
    setResult(null)
    setConfirmEnd(false)
    recordedRef.current = false
    setPhase('running')
  }

  const finish = useCallback(
    (reason = 'done') => {
      if (recordedRef.current) return
      recordedRef.current = true
      const score = draw.filter(({ id }) => isCorrect(questionById(id), responses[id])).length
      const answers = Object.fromEntries(
        draw.map(({ id }) => [id, { value: responses[id] ?? null, correct: isCorrect(questionById(id), responses[id]) }]),
      )
      const pct = recordQuizAttempt({ score, total: draw.length, answers })
      setResult({ draw, responses, score, total: draw.length, pct, reason })
      setPhase('results')
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    },
    [draw, responses, recordQuizAttempt, reduce],
  )

  // Timer
  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(t)
  }, [phase])
  useEffect(() => {
    if (phase === 'running' && remaining === 0) finish('time')
  }, [remaining, phase, finish])

  const current = draw[index]
  const q = current ? questionById(current.id) : null
  const value = q ? responses[q.id] : undefined
  const isChecked = q ? Boolean(checked[q.id]) : false
  const hasAnswer =
    q && (q.type === 'order' ? true : q.type === 'multi' ? (value || []).length > 0 : value !== undefined && value !== null)
  const last = index === draw.length - 1

  const setValue = (v) => setResponses((r) => ({ ...r, [q.id]: v }))
  const check = () => {
    if (!hasAnswer || isChecked) return
    setChecked((c) => ({ ...c, [q.id]: true }))
  }
  const next = () => {
    if (last) finish('done')
    else {
      setIndex((i) => i + 1)
      setConfirmEnd(false)
      requestAnimationFrame(() => questionRef.current?.focus({ preventScroll: true }))
    }
  }

  // Keyboard: digits choose, Enter checks / continues
  useEffect(() => {
    if (phase !== 'running' || !q) return
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (/^[1-9]$/.test(e.key) && q.type !== 'order' && !isChecked) {
        const opt = q.options[Number(e.key) - 1]
        if (!opt) return
        e.preventDefault()
        if (q.type === 'multi') {
          const cur = new Set(value || [])
          if (cur.has(opt.id)) cur.delete(opt.id)
          else cur.add(opt.id)
          setValue([...cur])
        } else setValue(opt.id)
      } else if (e.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return
        e.preventDefault()
        if (!isChecked) check()
        else next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const lowTime = remaining <= 60
  const answeredCount = Object.keys(checked).length

  return (
    <ActivityFrame id="quiz">
      {phase === 'intro' && <Intro onStart={start} attempts={attempts} best={best} />}

      {phase === 'running' && q && (
        <section className="quiz-run" aria-label="Quiz attempt">
          <div className="quiz-bar">
            <div className="quiz-bar__count">
              <span className="quiz-bar__q">
                Question <strong className="tabular">{index + 1}</strong> of {draw.length}
              </span>
              <Meter value={((index + (isChecked ? 1 : 0)) / draw.length) * 100} label="Quiz progress" />
            </div>
            <div
              className={`quiz-timer ${lowTime ? 'is-low' : ''}`}
              role="timer"
              aria-label={`Time left ${fmtTime(remaining)}`}
            >
              <Icon name="clock" />
              <span className="tabular">{fmtTime(remaining)}</span>
            </div>
            <span className="visually-hidden" aria-live="assertive">
              {remaining === 60 ? 'One minute left.' : remaining === 0 ? 'Time is up.' : ''}
            </span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={q.id}
              className="quiz-card"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16, transition: { duration: 0.16, ease: EASE_OUT } }}
              transition={{ duration: 0.4, ease: EASE_EXPO }}
            >
              <div className="quiz-card__meta">
                <span className="chip chip--outline">{TYPE_LABEL[q.type]}</span>
                <span className="chip">Outcome: {outcomeById(q.outcome)?.verb}</span>
              </div>
              <h2 className="quiz-card__prompt" tabIndex={-1} ref={questionRef}>
                {q.prompt}
              </h2>
              {q.code && <CodeBlock code={q.code} title="mongosh" copy={false} className="quiz-card__code" />}

              {q.type === 'order' ? (
                <OrderList q={q} value={value} onChange={setValue} checked={isChecked} />
              ) : (
                <ChoiceList q={q} value={value} onChange={setValue} checked={isChecked} />
              )}

              <div aria-live="polite">{isChecked && <Feedback q={q} value={value} />}</div>

              <div className="quiz-card__actions">
                <div className="quiz-card__end">
                  {confirmEnd ? (
                    <>
                      <span className="hint">
                        End now? {draw.length - answeredCount} unchecked question{draw.length - answeredCount === 1 ? '' : 's'} will be
                        marked as they stand.
                      </span>
                      <button type="button" className="btn btn--danger btn--sm" onClick={() => finish('ended')}>
                        End attempt
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmEnd(false)}>
                        Keep going
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmEnd(true)}>
                      End attempt
                    </button>
                  )}
                </div>
                {!isChecked ? (
                  <button type="button" className="btn btn--dark btn--lg" onClick={check} disabled={!hasAnswer}>
                    Check answer
                  </button>
                ) : (
                  <button type="button" className="btn btn--primary btn--lg" onClick={next}>
                    {last ? 'See results' : 'Next question'}
                    <Icon name="arrow-right" />
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      )}

      {phase === 'results' && result && <Results result={result} onRetake={start} best={best} reason={result.reason} />}
    </ActivityFrame>
  )
}
