import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useStore, moduleProgress, nextActivity } from '../store.js'
import { useSession } from '../lib/session.js'
import { COURSE, MODULES, ACTIVITIES, STAGES, BADGES, STEPS } from '../data/course.js'
import { stageStatus } from '../lib/stages.js'
import { computeGrades } from '../lib/grades.js'
import Icon from '../components/Icon.jsx'
import { Ring, Meter, useDocTitle, EASE_EXPO } from '../components/ui.jsx'
import './app-pages.css'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function CourseHome() {
  useDocTitle('My course')
  const state = useStore()
  const { activities, profile, badges } = state
  const { done, total, pct } = moduleProgress(activities)
  const next = nextActivity(activities)
  const grades = computeGrades(state)
  const earned = BADGES.filter((b) => badges[b.id])
  const minutesLeft = ACTIVITIES.filter((a) => !activities[a.id]?.done).reduce((s, a) => s + a.minutes, 0)
  const moduleDone = done === total
  const currentClass = useSession((s) => s.classes.find((c) => c.id === s.currentClassId))
  const preview = useSession((s) => s.learner === 'preview')

  return (
    <div className="page page--wide apppage">
      <header className="apphead">
        <div>
          <div className="kicker">
            {preview ? 'Teacher preview · nothing is saved' : currentClass ? `My course · ${currentClass.name}` : 'My course'}
          </div>
          <h1 className="apphead__title">{COURSE.title}</h1>
          <p className="apphead__sub">
            {greeting()}
            {profile.name ? `, ${profile.name.split(' ')[0]}` : ''}.{' '}
            {moduleDone
              ? 'Module 1 is complete. Your certificate is ready.'
              : done
                ? `You are ${pct}% through Module 1.`
                : 'Everything starts with the corner shop problem in Module 1.'}
          </p>
        </div>
        {preview && (
          <Link to="/teacher" className="btn btn--sm">
            <Icon name="grid" /> Back to the dashboard
          </Link>
        )}
      </header>

      <div className="home-grid">
        <div className="home-main">
          {/* Continue card */}
          <motion.section
            className="continue"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_EXPO }}
            aria-label="Continue where you left off"
          >
            <div className="continue__ring">
              <Ring value={pct} size={112} stroke={9} track="oklch(1 0 0 / 0.12)" color="var(--saffron)" label={`Module 1, ${pct}% complete`}>
                <span className="continue__pct">
                  {pct}
                  <small>%</small>
                </span>
              </Ring>
              <span className="continue__count tabular">
                {done} of {total} activities
              </span>
            </div>
            <div className="continue__body">
              {next ? (
                <>
                  <span className="kicker kicker--on-dark">
                    {done ? 'Up next' : 'Start here'} · {STEPS[next.step].label}
                  </span>
                  <h2 className="continue__title">{next.title}</h2>
                  <p className="continue__lead">{next.lead}</p>
                  <div className="continue__actions">
                    <Link to={next.path} className="btn btn--primary btn--lg">
                      {done ? 'Continue' : 'Start Module 1'} <Icon name="arrow-right" />
                    </Link>
                    <span className="continue__meta">
                      <Icon name="clock" /> {next.minutes} min · {Math.round(minutesLeft / 6) / 10} h left in the module
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="kicker kicker--on-dark">Module 1 complete</span>
                  <h2 className="continue__title">Every activity is ticked.</h2>
                  <p className="continue__lead">Collect your certificate, then look at what Module 2 will cover.</p>
                  <div className="continue__actions">
                    <Link to="/certificate" className="btn btn--primary btn--lg">
                      <Icon name="award" /> View certificate
                    </Link>
                    <Link to="/module/2" className="btn btn--on-dark btn--lg">
                      Module 2 preview
                    </Link>
                  </div>
                </>
              )}
            </div>
          </motion.section>

          {/* Modules */}
          <section aria-labelledby="modules-h">
            <div className="spread home-sechead">
              <h2 id="modules-h" className="home-h2">
                Modules
              </h2>
              <span className="faint">{COURSE.format.pace}</span>
            </div>
            <ol className="modlist">
              {MODULES.map((m, i) => {
                const live = m.status === 'live'
                const status = live ? (moduleDone ? 'done' : done ? 'continue' : 'start') : 'locked'
                return (
                  <motion.li
                    key={m.n}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE_EXPO, delay: 0.1 + i * 0.03 }}
                  >
                    <Link to={`/module/${m.n}`} className={`modrow modrow--${status}`}>
                      <span className="modrow__n">{String(m.n).padStart(2, '0')}</span>
                      <span className="modrow__body">
                        <span className="modrow__title">{m.title}</span>
                        {live ? (
                          <span className="modrow__progress">
                            <Meter value={pct} label="Module 1 progress" />
                            <span className="tabular">
                              {done}/{total}
                            </span>
                          </span>
                        ) : (
                          <span className="modrow__work">{m.practical}</span>
                        )}
                      </span>
                      <span className="modrow__status">
                        {status === 'done' && (
                          <span className="chip chip--done">
                            <Icon name="check" /> Done
                          </span>
                        )}
                        {status === 'continue' && <span className="chip chip--next">Continue</span>}
                        {status === 'start' && <span className="chip chip--next">Start</span>}
                        {status === 'locked' && (
                          <span className="chip chip--outline">
                            <Icon name="lock" /> Opens after Module {m.n - 1}
                          </span>
                        )}
                      </span>
                    </Link>
                  </motion.li>
                )
              })}
            </ol>
          </section>
        </div>

        <aside className="home-side">
          <section className="sidecard">
            <div className="spread">
              <h2 className="sidecard__title">Grades</h2>
              <Link to="/grades" className="sidecard__link">
                Report <Icon name="arrow-right" />
              </Link>
            </div>
            <div className="sidecard__big tabular">
              {grades.total}
              <small>% of the module grade earned</small>
            </div>
            <ul className="gradelist">
              {grades.items.map((it) => (
                <li key={it.key}>
                  <span>{it.label}</span>
                  <span className="faint">{it.weight}%</span>
                  <span className="tabular gradelist__val">{it.pct === null ? '–' : `${it.pct}%`}</span>
                </li>
              ))}
            </ul>
            {grades.onTrack !== null && (
              <p className={`sidecard__note ${grades.onTrack ? 'is-ok' : 'is-warn'}`}>
                <Icon name={grades.onTrack ? 'check-circle' : 'alert'} />
                {grades.onTrack ? 'On track: graded work so far is above the pass mark.' : 'Below the pass mark so far. Labs carry the most weight.'}
              </p>
            )}
          </section>

          <section className="sidecard">
            <div className="spread">
              <h2 className="sidecard__title">Badges</h2>
              <Link to="/badges" className="sidecard__link">
                All <Icon name="arrow-right" />
              </Link>
            </div>
            <div className="badgerow">
              {BADGES.map((b) => (
                <span key={b.id} className={`badgemini ${badges[b.id] ? 'is-earned' : ''}`} title={`${b.title}: ${b.how}`}>
                  <Icon name={b.icon} />
                  <span className="visually-hidden">
                    {b.title} {badges[b.id] ? 'earned' : 'not yet earned'}
                  </span>
                </span>
              ))}
            </div>
            <p className="faint sidecard__small">
              {earned.length ? `${earned.length} of ${BADGES.length} earned. Latest: ${earned[earned.length - 1].title}.` : 'Finish a lab to earn your first badge.'}
            </p>
          </section>

          <section className="sidecard">
            <h2 className="sidecard__title">Stages this week</h2>
            <ul className="workload">
              {STAGES.map((stage) => {
                const items = ACTIVITIES.filter((a) => stage.activities.includes(a.id))
                const mins = items.reduce((s, a) => s + a.minutes, 0)
                const left = items.filter((a) => !activities[a.id]?.done).reduce((s, a) => s + a.minutes, 0)
                const st = stageStatus(state, stage.id)
                return (
                  <li key={stage.id} className={st.open ? '' : 'is-locked'}>
                    <span className="workload__name">
                      {!st.open && <Icon name="lock" />}
                      {stage.title}
                    </span>
                    <span className="workload__bar" aria-hidden="true">
                      <span style={{ width: `${((mins - left) / mins) * 100}%` }} />
                    </span>
                    <span className="tabular faint">{mins}′</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="sidecard sidecard--links">
            <Link to="/lesson-plan">
              <Icon name="calendar" /> 90-minute lesson plan
            </Link>
            <Link to="/playground">
              <Icon name="terminal" /> Free playground
            </Link>
            <a href={COURSE.externalTools[0].url} target="_blank" rel="noreferrer">
              <Icon name="external" /> {COURSE.externalTools[0].name}
            </a>
          </section>
        </aside>
      </div>
    </div>
  )
}
