import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useStore } from '../store.js'
import { ACTIVITIES, activityById, activityIndex, STEPS } from '../data/course.js'
import { isActivityOpen } from '../lib/stages.js'
import Icon from './Icon.jsx'
import { useDocTitle, EASE_OUT } from './ui.jsx'
import './ActivityFrame.css'

// Wraps every Module 1 activity: header (breadcrumb, step, title, lead, meta),
// the activity itself, and a footer with completion + previous / next.
//
// Props:
//   id        activity id from data/course.js
//   width     'prose' | 'wide' (default 'wide')
//   headerAside  optional node rendered at the right of the header
//   footerNote   optional node above the footer navigation
//   hideLead     hide the lead paragraph
//   canComplete  for manual activities: false keeps "Mark as done" disabled
//   completeHint what is still needed before it can be marked done
export default function ActivityFrame({
  id,
  width = 'wide',
  headerAside,
  footerNote,
  hideLead,
  canComplete = true,
  completeHint,
  children,
}) {
  const a = activityById(id)
  const idx = activityIndex(id)
  const prev = ACTIVITIES[idx - 1]
  const next = ACTIVITIES[idx + 1]
  const done = useStore((s) => Boolean(s.activities[id]?.done))
  const complete = useStore((s) => s.completeActivity)
  const uncomplete = useStore((s) => s.uncompleteActivity)
  const nextOpen = useStore((s) => (next ? isActivityOpen(s, next.id) : true))
  const step = STEPS[a.step]
  useDocTitle(a.short)

  return (
    <article className={`activity activity--${width}`}>
      <header className="activity__header">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/course">My course</Link>
          <Icon name="chevron-right" />
          <Link to="/module/1">Module 1</Link>
          <Icon name="chevron-right" />
          <span aria-current="page">{a.short}</span>
        </nav>
        <div className="activity__headgrid">
          <div className="activity__titles">
            <div className="activity__kicker">
              <span className="activity__stepicon">
                <Icon name={step.icon} />
              </span>
              <span className="kicker kicker--ink">
                <span className="kicker__num">{String(idx + 1).padStart(2, '0')}</span>
                {step.label}
              </span>
              <span className="chip chip--outline">{step.tool}</span>
            </div>
            <h1 className="activity__title">{a.title}</h1>
            {!hideLead && <p className="activity__lead">{a.lead}</p>}
            <div className="activity__meta">
              <span className="chip">
                <Icon name="clock" />
                {a.minutes} min
              </span>
              {done ? (
                <span className="chip chip--done">
                  <Icon name="check" />
                  Done
                </span>
              ) : (
                <span className="chip chip--outline">{a.completion === 'manual' ? 'Mark done when finished' : 'Completes automatically'}</span>
              )}
            </div>
          </div>
          {headerAside ? <div className="activity__aside">{headerAside}</div> : null}
        </div>
      </header>

      <div className="activity__body">{children}</div>

      <footer className="activity__footer">
        {footerNote}
        {a.completion === 'manual' && (
          <div className={`complete-bar ${done ? 'is-done' : ''}`}>
            <div>
              <div className="complete-bar__title">
                {done ? 'Marked as done' : canComplete ? 'Finished this activity?' : 'Not finished yet'}
              </div>
              <div className="complete-bar__sub" id={`cb-${id}`}>
                {done
                  ? 'It shows as ticked on the module page.'
                  : canComplete
                    ? 'Mark it done to tick it off and move on.'
                    : completeHint || 'Complete the activity to mark it done.'}
              </div>
            </div>
            {done ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => uncomplete(id)}>
                Undo
              </button>
            ) : (
              <motion.button
                type="button"
                className="btn btn--dark"
                onClick={() => canComplete && complete(id)}
                disabled={!canComplete}
                aria-describedby={`cb-${id}`}
                whileTap={canComplete ? { scale: 0.97 } : undefined}
                transition={{ duration: 0.15, ease: EASE_OUT }}
              >
                <Icon name={canComplete ? 'check' : 'lock'} />
                Mark as done
              </motion.button>
            )}
          </div>
        )}
        <nav className="pager" aria-label="Activity navigation">
          {prev ? (
            <Link to={prev.path} className="pager__link pager__link--prev">
              <span className="pager__dir">
                <Icon name="arrow-left" /> Previous
              </span>
              <span className="pager__title">{prev.short}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={next.path} className={`pager__link pager__link--next ${nextOpen ? '' : 'is-locked'}`}>
              <span className="pager__dir">
                {nextOpen ? (
                  <>
                    Next <Icon name="arrow-right" />
                  </>
                ) : (
                  <>
                    <Icon name="lock" /> Next, locked
                  </>
                )}
              </span>
              <span className="pager__title">{next.short}</span>
            </Link>
          ) : (
            <Link to="/grades" className="pager__link pager__link--next">
              <span className="pager__dir">
                Finish <Icon name="arrow-right" />
              </span>
              <span className="pager__title">See your grades</span>
            </Link>
          )}
        </nav>
      </footer>
    </article>
  )
}

// Section heading used inside activities for consistent rhythm.
export function SectionHead({ kicker, title, children, aside }) {
  return (
    <div className="section-head">
      <div>
        {kicker ? <div className="kicker">{kicker}</div> : null}
        <h2 className="section-head__title">{title}</h2>
        {children ? <p className="section-head__sub">{children}</p> : null}
      </div>
      {aside}
    </div>
  )
}
