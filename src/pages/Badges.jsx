import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useStore, labProgress } from '../store.js'
import { BADGES, LABS, ACTIVITIES, COURSE } from '../data/course.js'
import Icon from '../components/Icon.jsx'
import { useDocTitle, EASE_EXPO } from '../components/ui.jsx'
import './app-pages.css'
import './Badges.css'

export function certificateRequirements(state) {
  const labsDone = Object.keys(LABS).filter((k) => labProgress(state.labs, k).pct === 100).length
  const reviews = Object.keys(state.workshop.reviews || {}).length
  const actsDone = ACTIVITIES.filter((a) => state.activities[a.id]?.done).length
  return [
    {
      id: 'quiz',
      label: `Pass Quiz 1 (${COURSE.quizPass} % or more)`,
      progress: state.quiz.best ? `best ${state.quiz.best} %` : 'not attempted',
      ok: state.quiz.best >= COURSE.quizPass,
      to: '/module/1/quiz',
    },
    { id: 'labs', label: 'Complete all five labs', progress: `${labsDone} of 5`, ok: labsDone === 5, to: '/module/1/lab/shell' },
    {
      id: 'assignment',
      label: 'Submit the assignment',
      progress: state.assignment.submittedAt ? 'submitted' : 'not submitted',
      ok: Boolean(state.assignment.submittedAt),
      to: '/module/1/assignment',
    },
    { id: 'peer', label: 'Assess three peer submissions', progress: `${reviews} of 3`, ok: reviews >= 3, to: '/module/1/workshop' },
    {
      id: 'all',
      label: 'Tick every Module 1 activity',
      progress: `${actsDone} of ${ACTIVITIES.length}`,
      ok: actsDone === ACTIVITIES.length,
      to: '/module/1',
    },
  ]
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function Badges() {
  useDocTitle('Badges')
  const state = useStore()
  const reqs = certificateRequirements(state)
  const ready = reqs.every((r) => r.ok)
  const earned = BADGES.filter((b) => state.badges[b.id]).length

  return (
    <div className="page page--wide apppage">
      <header className="apphead">
        <div>
          <div className="kicker">My progress</div>
          <h1 className="apphead__title">Badges and certificate</h1>
          <p className="apphead__sub">
            Badges mark milestones along the way. The certificate is issued automatically when the completion rules are
            met. {earned} of {BADGES.length} badges earned.
          </p>
        </div>
      </header>

      <ol className="badges">
        {BADGES.map((b, i) => {
          const at = state.badges[b.id]
          return (
            <motion.li
              key={b.id}
              className={`badge ${at ? 'is-earned' : ''}`}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE_EXPO, delay: i * 0.05 }}
            >
              <span className="badge__medal" aria-hidden="true">
                <svg viewBox="0 0 80 80" className="badge__shape">
                  <path d="M40 4 70 21v38L40 76 10 59V21L40 4Z" />
                </svg>
                <Icon name={b.icon} />
              </span>
              <span className="badge__title">{b.title}</span>
              <span className="badge__how">{b.how}</span>
              <span className={`chip ${at ? 'chip--done' : 'chip--outline'}`}>
                {at ? (
                  <>
                    <Icon name="check" /> Earned {fmtDate(at)}
                  </>
                ) : (
                  <>
                    <Icon name="lock" /> Not yet
                  </>
                )}
              </span>
            </motion.li>
          )
        })}
      </ol>

      <section className={`certreq ${ready ? 'is-ready' : ''}`} aria-labelledby="cert-h">
        <div className="certreq__head">
          <span className="certreq__icon">
            <Icon name="award" />
          </span>
          <div>
            <h2 id="cert-h" className="home-h2">
              Module 1 certificate
            </h2>
            <p className="muted">{ready ? 'All requirements met. Your certificate is ready to print or save as PDF.' : 'Certificate requirements'}</p>
          </div>
          {ready && (
            <Link to="/certificate" className="btn btn--primary certreq__cta">
              View certificate <Icon name="arrow-right" />
            </Link>
          )}
        </div>
        <ul className="certreq__list">
          {reqs.map((r) => (
            <li key={r.id} className={r.ok ? 'is-ok' : ''}>
              <Icon name={r.ok ? 'check-circle' : 'lock'} />
              <span className="certreq__label">{r.label}</span>
              <span className="faint tabular">{r.progress}</span>
              {!r.ok && (
                <Link to={r.to} className="btn btn--ghost btn--sm">
                  Go <Icon name="arrow-right" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
