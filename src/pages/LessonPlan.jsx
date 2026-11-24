import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LESSON_PLAN, activityById, COURSE, STAGES, stageOfActivity } from '../data/course.js'
import { useStore } from '../store.js'
import { stageStatus } from '../lib/stages.js'
import Icon from '../components/Icon.jsx'
import { useDocTitle, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import './app-pages.css'
import './LessonPlan.css'

const TOTAL = 90 * 60
const fmt = (s) => {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
const segAt = (sec) => Math.max(0, LESSON_PLAN.findIndex((s) => sec >= s.from * 60 && sec < s.to * 60))

function useClassTimer() {
  const [elapsed, setElapsed] = useState(() => Number(sessionStorage.getItem('lp-elapsed') || 0))
  const [running, setRunning] = useState(false)
  const last = useRef(null)
  useEffect(() => {
    if (!running) return
    last.current = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = (now - last.current) / 1000
      last.current = now
      setElapsed((e) => Math.min(TOTAL, e + dt))
    }, 250)
    return () => clearInterval(id)
  }, [running])
  useEffect(() => {
    sessionStorage.setItem('lp-elapsed', String(elapsed))
    if (elapsed >= TOTAL) setRunning(false)
  }, [elapsed])
  return { elapsed, setElapsed, running, setRunning }
}



function StageChip({ activityId }) {
  const stage = stageOfActivity(activityId)
  const open = useStore((st) => stageStatus(st, stage.id).open)
  if (open) return null
  return (
    <span className="chip chip--outline" title="Read out the class code to open it for students">
      <Icon name="lock" /> {stage.title} locked
    </span>
  )
}

function StageAccess() {
  const state = useStore()
  const unlock = useStore((s) => s.unlockStage)
  const relock = useStore((s) => s.relockStage)
  const [showCodes, setShowCodes] = useState(false)
  return (
    <section className="lp-stages" aria-labelledby="stages-h">
      <div className="lp-stages__head">
        <div>
          <div className="kicker">Teacher controls</div>
          <h2 id="stages-h" className="home-h2">
            Stage access
          </h2>
          <p className="muted lp-stages__lead">
            Students move step by step: each stage opens only when every activity before it is finished. To move the class
            on early, read out a stage's class code; students type it on the locked screen. Opening a stage below
            affects this browser only.
          </p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={showCodes} onChange={(e) => setShowCodes(e.target.checked)} />
          Show class codes
        </label>
      </div>
      <ol className="lp-stages__list">
        {STAGES.map((stage, i) => {
          const st = stageStatus(state, stage.id)
          const early = st.reason === 'teacher' || st.reason === 'code'
          return (
            <li key={stage.id} className={`lp-stage ${st.open ? 'is-open' : ''}`}>
              <span className="lp-stage__n">{i + 1}</span>
              <div className="lp-stage__body">
                <span className="lp-stage__title">{stage.title}</span>
                <span className="faint">{stage.lead}</span>
              </div>
              <span className="lp-stage__status">
                {i === 0 ? (
                  <span className="chip chip--done">Always open</span>
                ) : !st.open ? (
                  <span className="chip chip--outline">
                    <Icon name="lock" /> Locked
                  </span>
                ) : early ? (
                  <span className="chip chip--accent">Opened early</span>
                ) : (
                  <span className="chip chip--done">
                    <Icon name="check" /> Open by progress
                  </span>
                )}
              </span>
              <span className="lp-stage__code mono" aria-label={stage.code ? `Class code for ${stage.title}` : undefined}>
                {stage.code ? (showCodes ? stage.code : '••••-••') : ''}
              </span>
              <span className="lp-stage__action">
                {i === 0 ? null : !st.open ? (
                  <button type="button" className="btn btn--sm" onClick={() => unlock(stage.id, 'teacher')}>
                    Open on this device
                  </button>
                ) : early ? (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => relock(stage.id)}>
                    Lock again
                  </button>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="faint lp-stages__note">
        Codes live in <code>src/data/course.js</code> under <code>STAGES</code>. Change them before each run of the course.
      </p>
    </section>
  )
}

export default function LessonPlan() {
  useDocTitle('90-minute lesson plan')
  const { elapsed, setElapsed, running, setRunning } = useClassTimer()
  const [projector, setProjector] = useState(false)
  const current = segAt(elapsed)
  const seg = LESSON_PLAN[current]
  const segLeft = seg.to * 60 - elapsed
  const projRef = useRef(null)

  const jump = useCallback(
    (i) => {
      const idx = Math.max(0, Math.min(LESSON_PLAN.length - 1, i))
      setElapsed(LESSON_PLAN[idx].from * 60)
    },
    [setElapsed],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, button, a')) return
      if (e.code === 'Space') {
        e.preventDefault()
        setRunning((r) => !r)
      } else if (e.key === 'ArrowRight') jump(current + 1)
      else if (e.key === 'ArrowLeft') jump(current - 1)
      else if (e.key.toLowerCase() === 'p') setProjector((p) => !p)
      else if (e.key === 'Escape') setProjector(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, jump, setRunning])

  useEffect(() => {
    if (projector) projRef.current?.focus()
  }, [projector])

  return (
    <div className="page page--wide apppage lp">
      <header className="apphead">
        <div>
          <div className="kicker">For teachers · Module 1</div>
          <h1 className="apphead__title">The 90-minute lesson plan</h1>
          <p className="apphead__sub">
            One segment per slide of the lesson deck. Each has a question to ask, a prediction to collect and the activity
            that verifies it. Outcome: {COURSE.outcome.toLowerCase()}
          </p>
        </div>
      </header>

      {/* Timer */}
      <section className="lp-timer" aria-label="Class timer">
        <div className="lp-timer__clock">
          <span className="lp-timer__time tabular" aria-live="off">
            {fmt(elapsed)}
          </span>
          <span className="lp-timer__of">of 90:00</span>
        </div>
        <div className="lp-timer__track" aria-hidden="true">
          {LESSON_PLAN.map((s, i) => (
            <button
              key={s.slide}
              type="button"
              tabIndex={-1}
              className={`lp-timer__seg ${i === current ? 'is-current' : ''} ${elapsed >= s.to * 60 ? 'is-past' : ''}`}
              style={{ flexGrow: s.to - s.from }}
              onClick={() => jump(i)}
              title={`${s.from}′ ${s.title}`}
            >
              <span
                className="lp-timer__fill"
                style={{
                  transform: `scaleX(${Math.max(0, Math.min(1, (elapsed - s.from * 60) / ((s.to - s.from) * 60)))})`,
                }}
              />
            </button>
          ))}
        </div>
        <div className="lp-timer__controls">
          <button type="button" className="btn btn--icon" onClick={() => jump(current - 1)} aria-label="Previous segment">
            <Icon name="chevron-left" />
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setRunning((r) => !r)} aria-pressed={running}>
            <Icon name={running ? 'pause' : 'play'} /> {running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start class'}
          </button>
          <button type="button" className="btn btn--icon" onClick={() => jump(current + 1)} aria-label="Next segment">
            <Icon name="chevron-right" />
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setRunning(false)
              setElapsed(0)
            }}
          >
            <Icon name="reset" /> Reset
          </button>
          <button type="button" className="btn btn--dark" onClick={() => setProjector(true)}>
            <Icon name="maximize" /> Projector mode
          </button>
        </div>
        <p className="faint lp-timer__keys">
          <span className="kbd">Space</span> start or pause · <span className="kbd">←</span> <span className="kbd">→</span> segments ·{' '}
          <span className="kbd">P</span> projector
        </p>
      </section>

      <StageAccess />

      {/* Run sheet */}
      <ol className="lp-sheet">
        {LESSON_PLAN.map((s, i) => {
          const a = activityById(s.activity)
          const isCur = i === current
          return (
            <motion.li
              key={s.slide}
              className={`lp-row ${isCur ? 'is-current' : ''} ${elapsed >= s.to * 60 ? 'is-past' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_EXPO, delay: i * 0.04 }}
            >
              <button type="button" className="lp-row__time" onClick={() => jump(i)} aria-label={`Jump timer to ${s.from} minutes`}>
                <span className="tabular">
                  {s.from}′–{s.to}′
                </span>
                <span className="lp-row__slide">Slide {String(s.slide).padStart(2, '0')}</span>
              </button>
              <div className="lp-row__main">
                <h2 className="lp-row__title">{s.title}</h2>
                <p className="lp-row__focus">{s.focus}</p>
                <dl className="lp-row__apv">
                  <div>
                    <dt>Ask</dt>
                    <dd>{s.ask}</dd>
                  </div>
                  <div>
                    <dt>Predict</dt>
                    <dd>{s.predict}</dd>
                  </div>
                  <div>
                    <dt>Verify</dt>
                    <dd>{s.verify}</dd>
                  </div>
                </dl>
              </div>
              <div className="lp-row__go">
                <StageChip activityId={s.activity} />
                <Link to={a.path} className="btn btn--sm">
                  {a.short.split(' · ')[0]} <Icon name="arrow-up-right" />
                </Link>
                {isCur && (
                  <span className="chip chip--accent tabular">
                    <Icon name="clock" /> {fmt(Math.max(0, segLeft))} left
                  </span>
                )}
              </div>
            </motion.li>
          )
        })}
      </ol>

      <section className="lp-env">
        <h2 className="home-h2">Environment</h2>
        <p className="muted">
          Browser only. The course labs simulate everything; for the real-database comparison use{' '}
          {COURSE.externalTools.map((t, i) => (
            <span key={t.url}>
              {i > 0 ? ' and ' : ''}
              <a href={t.url} target="_blank" rel="noreferrer">
                {t.name}
              </a>
            </span>
          ))}
          . Deliverable at minute 90: schema or structure, query, result, and a short trade-off justification.
        </p>
      </section>

      {/* Projector overlay */}
      <AnimatePresence>
        {projector && (
          <motion.div
            className="proj"
            role="dialog"
            aria-modal="true"
            aria-label="Projector mode"
            tabIndex={-1}
            ref={projRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <div className="proj__top">
              <span className="proj__slide">
                Slide {String(seg.slide).padStart(2, '0')} / 08 · {seg.from}′–{seg.to}′
              </span>
              <span className="proj__clock tabular">{fmt(elapsed)}</span>
              <button type="button" className="btn btn--on-dark btn--sm" onClick={() => setProjector(false)}>
                <Icon name="minimize" /> Exit
              </button>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                className="proj__body"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.6, ease: EASE_EXPO }}
              >
                <h2 className="proj__title">{seg.title}</h2>
                <div className="proj__ask">
                  <span className="proj__label">Ask</span>
                  <p>{seg.ask}</p>
                </div>
                <div className="proj__row">
                  <div>
                    <span className="proj__label">Predict</span>
                    <p>{seg.predict}</p>
                  </div>
                  <div>
                    <span className="proj__label">Verify</span>
                    <p>{seg.verify}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="proj__bottom">
              <div className="proj__bar">
                <span style={{ transform: `scaleX(${elapsed / TOTAL})` }} />
              </div>
              <div className="cluster">
                <button type="button" className="btn btn--on-dark btn--icon" onClick={() => jump(current - 1)} aria-label="Previous segment">
                  <Icon name="chevron-left" />
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setRunning((r) => !r)}>
                  <Icon name={running ? 'pause' : 'play'} /> {running ? 'Pause' : 'Run'}
                </button>
                <button type="button" className="btn btn--on-dark btn--icon" onClick={() => jump(current + 1)} aria-label="Next segment">
                  <Icon name="chevron-right" />
                </button>
              </div>
              <span className="proj__left tabular">{fmt(Math.max(0, segLeft))} left in this segment</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
