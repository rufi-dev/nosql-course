import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useStore, moduleProgress } from '../store.js'
import { useSession } from '../lib/session.js'
import { ACTIVITIES, MODULES, STAGES, STEPS, activityById } from '../data/course.js'
import { stageStatus, activityForPath } from '../lib/stages.js'
import Icon from './Icon.jsx'
import LockedActivity from './LockedActivity.jsx'
import { Meter, EASE_OUT } from './ui.jsx'
import './ModuleLayout.css'

function minutesLeft(activities) {
  const m = ACTIVITIES.filter((a) => !activities[a.id]?.done).reduce((s, a) => s + a.minutes, 0)
  if (m === 0) return 'All done'
  const h = Math.floor(m / 60)
  const r = m % 60
  return `About ${h ? `${h} h ` : ''}${r ? `${r} min` : ''} left`
}

function ActivityList({ state }) {
  const { activities } = state
  const nextId = ACTIVITIES.find((a) => !activities[a.id]?.done)?.id
  return (
    <ol className="rail__groups">
      {STAGES.map((stage) => {
        const st = stageStatus(state, stage.id)
        return (
          <li key={stage.id} className={`rail__group ${st.open ? '' : 'is-locked'}`}>
            <div className="rail__grouplabel">
              <span>{stage.title}</span>
              {!st.open ? (
                <span className="rail__lock" title={`Opens after ${st.previous?.title}`}>
                  <Icon name="lock" />
                  <span className="visually-hidden">locked</span>
                </span>
              ) : st.complete ? (
                <span className="rail__stagedone" aria-label="stage complete">
                  <Icon name="check" strokeWidth={2.6} />
                </span>
              ) : st.reason === 'teacher' || st.reason === 'code' ? (
                <span className="rail__early">opened early</span>
              ) : null}
            </div>
            <ol className="rail__items">
              {stage.activities.map(activityById).map((a) => {
                const done = activities[a.id]?.done
                const isNext = a.id === nextId && st.open
                const locked = !st.open
                return (
                  <li key={a.id}>
                    <NavLink
                      to={a.path}
                      className={`rail__item ${done ? 'is-done' : ''} ${isNext ? 'is-next' : ''} ${locked ? 'is-locked' : ''}`}
                    >
                      <span className="rail__status" aria-hidden="true">
                        {done ? (
                          <Icon name="check" strokeWidth={2.6} />
                        ) : locked ? (
                          <Icon name="lock" />
                        ) : (
                          <Icon name={STEPS[a.step].icon} />
                        )}
                      </span>
                      <span className="rail__title">{a.short}</span>
                      <span className="rail__min tabular">{a.minutes}′</span>
                      <span className="visually-hidden">
                        {done ? ', done' : locked ? ', locked' : isNext ? ', next' : ', to do'}
                      </span>
                    </NavLink>
                  </li>
                )
              })}
            </ol>
          </li>
        )
      })}
    </ol>
  )
}

export default function ModuleLayout() {
  const state = useStore()
  const syncStages = useStore((s) => s.syncStages)
  const preview = useSession((s) => s.learner === 'preview')
  const { activities } = state
  const { done, total, pct } = moduleProgress(activities)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  // Record stages already reached by earlier progress (no toasts).
  useEffect(() => syncStages(false), [syncStages])
  const mod = MODULES[0]

  const current = activityForPath(pathname, ACTIVITIES)
  const locked = current ? !stageStatus(state, STAGES.find((s) => s.activities.includes(current.id)).id).open : false

  return (
    <div className="module-layout page page--wide">
      <aside className="rail" aria-label="Module 1 activities">
        <div className="rail__inner">
          <Link to="/module/1" className="rail__head">
            <span className="kicker">
              Module <span className="kicker__num">01</span>
            </span>
            <span className="rail__modtitle">{mod.short}</span>
          </Link>
          <div className="rail__progress">
            <div className="spread">
              <span className="tabular">
                <strong>{done}</strong> of {total} done
              </span>
              <span className="faint">{minutesLeft(activities)}</span>
            </div>
            <Meter value={pct} label="Module 1 progress" />
          </div>
          <button
            type="button"
            className="rail__toggle"
            aria-expanded={open}
            aria-controls="rail-list"
            onClick={() => setOpen((o) => !o)}
          >
            <span>{open ? 'Hide activities' : 'Show all activities'}</span>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} />
          </button>
          <div id="rail-list" className="rail__list rail__list--desktop">
            <ActivityList state={state} />
          </div>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                className="rail__list rail__list--mobile"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                <ActivityList state={state} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
      <div className="module-main" key={`${pathname}-${locked}`}>
        {preview && (
          <div className="preview-banner" role="note">
            <Icon name="eye" />
            <span>
              <strong>Teacher preview.</strong> Every stage is open and nothing you do here is saved. Students see stages
              unlock step by step.
            </span>
            <Link to="/teacher" className="btn btn--sm">
              Dashboard
            </Link>
          </div>
        )}
        <div className="route-enter">{locked ? <LockedActivity activityId={current.id} /> : <Outlet />}</div>
      </div>
    </div>
  )
}
