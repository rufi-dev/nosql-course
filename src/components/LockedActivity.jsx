import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useStore } from '../store.js'
import { activityById, STEPS, COMPLETION_RULES, STAGES } from '../data/course.js'
import { activityStatus } from '../lib/stages.js'
import Icon from './Icon.jsx'
import { Meter, useDocTitle, EASE_EXPO } from './ui.jsx'
import './LockedActivity.css'

// Shown in place of an activity whose stage is not open yet for this learner.
export default function LockedActivity({ activityId }) {
  const state = useStore()
  const status = activityStatus(state, activityId)
  const a = activityById(activityId)
  useDocTitle(`${a.short} (locked)`)

  const missing = status.missing.map(activityById)
  const earlierIds = STAGES.slice(0, status.index).flatMap((st) => st.activities)
  const doneEarlier = earlierIds.length - missing.length
  const first = missing[0]

  return (
    <div className="locked">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/course">My course</Link>
        <Icon name="chevron-right" />
        <Link to="/module/1">Module 1</Link>
        <Icon name="chevron-right" />
        <span aria-current="page">{a.short}</span>
      </nav>

      <motion.section
        className="locked__card"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_EXPO }}
        aria-labelledby="locked-h"
      >
        <div className="locked__head">
          <span className="locked__icon" aria-hidden="true">
            <Icon name="lock" />
          </span>
          <div>
            <div className="kicker kicker--on-dark">
              Stage {status.index + 1} · {status.stage.title} · locked
            </div>
            <h1 id="locked-h" className="locked__title">
              {a.title}
            </h1>
            <p className="locked__lead">
              This opens when you finish {status.previous ? `the ${status.previous.title} stage` : 'the earlier stages'}
              {status.index > 1 ? ' and everything before it' : ''}. Work through the module step by step.
            </p>
          </div>
        </div>
        <div className="locked__progress">
          <span className="tabular">
            {missing.length} activit{missing.length === 1 ? 'y' : 'ies'} left before this opens
          </span>
          <Meter dark value={earlierIds.length ? (doneEarlier / earlierIds.length) * 100 : 0} label="Progress toward this stage" />
        </div>
        {first && (
          <Link to={first.path} className="btn btn--primary btn--lg locked__cta">
            Continue with {first.short} <Icon name="arrow-right" />
          </Link>
        )}
      </motion.section>

      <div className="locked__grid">
        <section className="locked__todo" aria-labelledby="todo-h">
          <h2 id="todo-h" className="locked__h2">
            Still to finish
          </h2>
          <ol className="locked__list">
            {missing.map((m) => (
              <li key={m.id}>
                <Link to={m.path} className="locked__item">
                  <span className="locked__itemicon">
                    <Icon name={STEPS[m.step].icon} />
                  </span>
                  <span className="locked__itemtext">
                    <span>{m.short}</span>
                    <span className="faint">
                      {COMPLETION_RULES[m.id] || (m.completion === 'auto' ? 'Completes automatically when you finish it' : 'Mark it done when finished')}
                    </span>
                  </span>
                  <Icon name="arrow-right" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="locked__teacher" aria-labelledby="teach-h">
          <h2 id="teach-h" className="locked__h2">
            Moving on as a class?
          </h2>
          <p className="muted">
            Your teacher can open the {status.stage.title} stage for the whole class from the class dashboard, for example
            during a live session. When they do, it unlocks here within a minute, no reload needed.
          </p>
          <p className="faint locked__note">
            <Icon name="shield" /> Locks are checked by the server, so work in a locked stage cannot be saved early.
          </p>
        </section>
      </div>
    </div>
  )
}
