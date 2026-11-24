import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useStore, moduleProgress, nextActivity } from '../store.js'
import { MODULES, OUTCOMES, STEPS, COURSE, STAGES, activityById, totalMinutes } from '../data/course.js'
import { stageStatus } from '../lib/stages.js'
import Icon from '../components/Icon.jsx'
import { useDocTitle, EASE_EXPO, Ring } from '../components/ui.jsx'
import './ModuleOverview.css'

export default function ModuleOverview() {
  useDocTitle('Module 1')
  const state = useStore()
  const { activities } = state
  const { done, total, pct } = moduleProgress(activities)
  const next = nextActivity(activities)
  const mod = MODULES[0]
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  return (
    <div className="mo">
      <header className="mo__head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/course">My course</Link>
          <Icon name="chevron-right" />
          <span aria-current="page">Module 1</span>
        </nav>
        <div className="mo__headgrid">
          <div>
            <div className="kicker">
              Module <span className="kicker__num">01</span> · Week 1
            </div>
            <h1 className="mo__title">{mod.title}</h1>
            <p className="mo__lead">
              A shop chain keeps its inventory in Riga, Tallinn and Vilnius. You will model it, build it in a browser
              shell, spread it across machines, and defend what happens to the stock count when the network fails.
            </p>
            <div className="mo__actions">
              {next ? (
                <Link to={next.path} className="btn btn--primary btn--lg">
                  {done ? `Continue: ${next.short}` : 'Start the module'} <Icon name="arrow-right" />
                </Link>
              ) : (
                <Link to="/certificate" className="btn btn--primary btn--lg">
                  <Icon name="award" /> View certificate
                </Link>
              )}
              <Link to="/lesson-plan" className="btn btn--lg">
                <Icon name="calendar" /> 90-minute class plan
              </Link>
            </div>
          </div>
          <div className="mo__stat">
            <Ring value={pct} size={92} stroke={8} label={`Module 1 ${pct}% complete`}>
              <span className="mo__pct">{pct}%</span>
            </Ring>
            <dl>
              <div>
                <dt>Activities</dt>
                <dd className="tabular">
                  {done} of {total}
                </dd>
              </div>
              <div>
                <dt>Workload</dt>
                <dd>
                  {h} h {m} min
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <section className="mo__section" aria-labelledby="mo-acts">
        <div className="mo__sechead">
          <h2 id="mo-acts">Activities</h2>
          <p className="faint">
            Five stages, step by step. Each stage opens when the one before it is finished; inside a stage, any order.
          </p>
        </div>
        <div className="mo__groups">
          {STAGES.map((stage, gi) => {
            const st = stageStatus(state, stage.id)
            const items = stage.activities.map(activityById)
            const mins = items.reduce((s, a) => s + a.minutes, 0)
            return (
              <motion.div
                className={`mo__group ${st.open ? '' : 'is-locked'}`}
                key={stage.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE_EXPO, delay: gi * 0.05 }}
              >
                <div className="mo__grouphead">
                  <span className="mo__stagename">
                    <span className="mo__stagenum">{gi + 1}</span>
                    {stage.title}
                    {!st.open && (
                      <span className="mo__stagelock">
                        <Icon name="lock" /> Opens when {st.previous?.title} is finished
                      </span>
                    )}
                    {st.open && st.complete && (
                      <span className="mo__stagedone">
                        <Icon name="check" /> Complete
                      </span>
                    )}
                    {st.open && !st.complete && (st.reason === 'teacher' || st.reason === 'code') && (
                      <span className="mo__stageearly">Opened early by your teacher</span>
                    )}
                  </span>
                  <span className="faint tabular">{mins} min</span>
                </div>
                <ol className="mo__list">
                  {items.map((a) => {
                    const isDone = activities[a.id]?.done
                    const isNext = next?.id === a.id && st.open
                    const locked = !st.open
                    return (
                      <li key={a.id}>
                        <Link
                          to={a.path}
                          className={`mo__row ${isDone ? 'is-done' : ''} ${isNext ? 'is-next' : ''} ${locked ? 'is-locked' : ''}`}
                        >
                          <span className="mo__icon">
                            <Icon name={locked ? 'lock' : STEPS[a.step].icon} />
                          </span>
                          <span className="mo__rowtitle">
                            <span>{a.title}</span>
                            <span className="mo__rowlead">{a.lead}</span>
                          </span>
                          <span className="mo__tool">{STEPS[a.step].tool}</span>
                          <span className="mo__min tabular">{a.minutes} min</span>
                          <span className="mo__state">
                            {isDone ? (
                              <span className="mo__tick" aria-label="Done">
                                <Icon name="check" strokeWidth={2.6} />
                              </span>
                            ) : locked ? (
                              <span className="chip chip--outline">Locked</span>
                            ) : isNext ? (
                              <span className="chip chip--next">{done ? 'Next' : 'Start'}</span>
                            ) : (
                              <span className="chip chip--outline">To do</span>
                            )}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              </motion.div>
            )
          })}
        </div>
      </section>

      <section className="mo__section mo__twocol">
        <div>
          <div className="mo__sechead">
            <h2>By the end of this module you can</h2>
          </div>
          <ol className="mo__outcomes">
            {OUTCOMES.map((o) => (
              <li key={o.id}>
                <span>
                  <strong>{o.verb}</strong> {o.text.replace(/^\w+\s/, '')}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="mo__sechead">
            <h2>Environment</h2>
          </div>
          <div className="mo__env">
            <p className="muted">
              Everything runs in this browser. The labs simulate MongoDB and distributed nodes, so nothing needs
              installing. To repeat a step on real databases:
            </p>
            {COURSE.externalTools.map((t) => (
              <a key={t.url} className="mo__envlink" href={t.url} target="_blank" rel="noreferrer">
                <span>
                  <strong>{t.name}</strong>
                  <span className="faint">{t.note}</span>
                </span>
                <Icon name="arrow-up-right" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
