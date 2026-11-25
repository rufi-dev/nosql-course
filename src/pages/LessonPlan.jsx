import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LESSON_PLAN, activityById, COURSE, STAGES, stageOfActivity } from '../data/course.js'
import { useSession, isTeacherRole } from '../lib/session.js'
import { api } from '../lib/api.js'
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
  return (
    <span className="chip chip--outline" title="The Module 1 stage this activity belongs to">
      Stage {STAGES.indexOf(stage) + 1} · {stage.title}
    </span>
  )
}

// Teachers open stages for a whole class here (same control as the dashboard).
function StageAccess() {
  const user = useSession((s) => s.user)
  const classes = useSession((s) => s.classes)
  const reload = useSession((s) => s.reload)
  const teacher = isTeacherRole(user?.role)
  const active = classes.filter((c) => !c.archived)
  const [classId, setClassId] = useState(null)
  const [pending, setPending] = useState({}) // optimistic switch state while saving
  const [error, setError] = useState('')
  const cls = active.find((c) => c.id === classId) || active[0]

  if (!teacher) {
    return (
      <section className="lp-stages lp-stages--note">
        <Icon name="lock" />
        <p className="muted">
          Module 1 opens stage by stage for each student. Teachers can open a stage for the whole class during a live
          session from this page or the class dashboard.{' '}
          {user ? null : (
            <>
              <Link to="/login?next=/lesson-plan">Log in as a teacher</Link> to use it.
            </>
          )}
        </p>
      </section>
    )
  }

  const toggle = async (stageId, open) => {
    setPending((p) => ({ ...p, [stageId]: open }))
    setError('')
    try {
      await api.put(`/api/teacher/classes/${cls.id}/stages`, { stageId, open })
      await reload()
    } catch (err) {
      setError(`Could not update ${stageId}: ${err.message}`)
    } finally {
      setPending((p) => {
        const next = { ...p }
        delete next[stageId]
        return next
      })
    }
  }

  return (
    <section className="lp-stages" aria-labelledby="stages-h">
      <div className="lp-stages__head">
        <div>
          <div className="kicker">Teacher controls</div>
          <h2 id="stages-h" className="home-h2">
            Stage access for the class
          </h2>
          <p className="muted lp-stages__lead">
            Students move step by step: each stage opens when they finish everything before it. Open a stage here to move
            the whole class on together; their screens update within a minute.
          </p>
        </div>
        {active.length > 1 && (
          <label className="field lp-stages__pick">
            <span className="label">Class</span>
            <select className="select" value={cls?.id} onChange={(e) => setClassId(e.target.value)}>
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!cls ? (
        <p className="muted">
          You have no classes yet. <Link to="/teacher">Create one on the dashboard</Link> and share its join code.
        </p>
      ) : (
        <>
          <ol className="lp-stages__list">
            {STAGES.map((stage, i) => {
              const open = i === 0 || (pending[stage.id] ?? Boolean(cls.stageOverrides?.[stage.id]))
              return (
                <li key={stage.id} className={`lp-stage ${open ? 'is-open' : ''}`}>
                  <span className="lp-stage__n">{i + 1}</span>
                  <div className="lp-stage__body">
                    <span className="lp-stage__title">{stage.title}</span>
                    <span className="faint">{stage.lead}</span>
                  </div>
                  <span className="lp-stage__status">
                    {i === 0 ? (
                      <span className="chip chip--done">Always open</span>
                    ) : open ? (
                      <span className="chip chip--accent">Open for {cls.name}</span>
                    ) : (
                      <span className="chip chip--outline">
                        <Icon name="lock" /> By progress only
                      </span>
                    )}
                  </span>
                  <span className="lp-stage__action">
                    {i > 0 && (
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={open}
                          aria-busy={stage.id in pending}
                          onChange={(e) => toggle(stage.id, e.target.checked)}
                          aria-label={`Open ${stage.title} for ${cls.name}`}
                        />
                        {open ? 'Open' : 'Locked'}
                      </label>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
          {error && <p className="lp-stages__error">{error}</p>}
          <p className="faint lp-stages__note">
            Class code for {cls.name}: <strong className="mono">{cls.joinCode}</strong>. Manage the class on the{' '}
            <Link to={`/teacher/classes/${cls.id}`}>dashboard</Link>.
          </p>
        </>
      )}
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
          <button type="button" className="btn btn--icon lp-timer__prev" onClick={() => jump(current - 1)} aria-label="Previous segment">
            <Icon name="chevron-left" />
          </button>
          <button type="button" className="btn btn--primary lp-timer__play" onClick={() => setRunning((r) => !r)} aria-pressed={running}>
            <Icon name={running ? 'pause' : 'play'} /> {running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start class'}
          </button>
          <button type="button" className="btn btn--icon lp-timer__next" onClick={() => jump(current + 1)} aria-label="Next segment">
            <Icon name="chevron-right" />
          </button>
          <button
            type="button"
            className="btn btn--ghost lp-timer__reset"
            onClick={() => {
              setRunning(false)
              setElapsed(0)
            }}
          >
            <Icon name="reset" /> Reset
          </button>
          <button type="button" className="btn btn--dark lp-timer__proj" onClick={() => setProjector(true)}>
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
