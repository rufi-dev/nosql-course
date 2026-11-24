import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useStore, labProgress } from '../store.js'
import { computeGrades } from '../lib/grades.js'
import { LABS, COURSE } from '../data/course.js'
import Icon from '../components/Icon.jsx'
import { Meter, Ring, useDocTitle, EASE_EXPO } from '../components/ui.jsx'
import './app-pages.css'
import './Grades.css'

const fmtDate = (ts) =>
  new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Grades() {
  useDocTitle('Grades')
  const state = useStore()
  const g = computeGrades(state)

  return (
    <div className="page page--wide apppage">
      <header className="apphead">
        <div>
          <div className="kicker">Grades · user report</div>
          <h1 className="apphead__title">Module 1 grade report</h1>
          <p className="apphead__sub">
            Quiz, lab, assignment and peer-review marks flow into one report, so you can see at any time what is done and
            what each part is worth.
          </p>
        </div>
      </header>

      <div className="grades">
        <section className="grades__main">
          <div className="table-wrap">
            <table className="table grades__table">
              <thead>
                <tr>
                  <th scope="col">Grade item</th>
                  <th scope="col" className="num">
                    Weight
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Grade
                  </th>
                  <th scope="col" className="num">
                    Contributes
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it, i) => (
                  <motion.tr
                    key={it.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: EASE_EXPO, delay: i * 0.05 }}
                  >
                    <th scope="row">
                      <Link to={it.to} className="grades__item">
                        {it.label}
                      </Link>
                    </th>
                    <td className="num">{it.weight} %</td>
                    <td className="muted">{it.status}</td>
                    <td className="num">
                      {it.pct === null ? (
                        <span className="faint">–</span>
                      ) : (
                        <span className="grades__pct">
                          <Meter value={it.pct} label={`${it.label} ${it.pct}%`} className="grades__meter" />
                          <strong>{it.pct} %</strong>
                        </span>
                      )}
                    </td>
                    <td className="num tabular">{it.pct === null ? '–' : `${Math.round((it.pct * it.weight) / 100)} / ${it.weight}`}</td>
                  </motion.tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Module total</th>
                  <td className="num">100 %</td>
                  <td className="muted">Pass mark {COURSE.passMark} %</td>
                  <td className="num" />
                  <td className="num">
                    <strong className="tabular">{g.total} / 100</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {g.onTrack === null ? (
            <p className="grades__banner">
              <Icon name="info" /> Nothing graded yet. Labs are worth the most: start with{' '}
              <Link to="/module/1/lab/shell">Lab 1</Link>.
            </p>
          ) : (
            <p className={`grades__banner ${g.onTrack ? 'is-ok' : 'is-warn'}`}>
              <Icon name={g.onTrack ? 'chart' : 'alert'} />
              {g.onTrack
                ? `On track: graded items so far average ${g.soFar} %, above the ${COURSE.passMark} % pass mark.`
                : `Graded items so far average ${g.soFar} %, below the ${COURSE.passMark} % pass mark. Labs and the quiz can still lift it.`}
            </p>
          )}

          <section className="grades__labs" aria-labelledby="labs-h">
            <h2 id="labs-h" className="home-h2">
              Labs by checkpoint
            </h2>
            <div className="grades__labgrid">
              {Object.entries(LABS).map(([key, lab], i) => {
                const p = labProgress(state.labs, key)
                return (
                  <Link key={key} to={`/module/1/lab/${key === 'tx' ? 'transactions' : key}`} className="labcard">
                    <span className="labcard__head">
                      <span className="labcard__n">Lab {i + 1}</span>
                      <span className="tabular faint">
                        {p.done}/{p.total}
                      </span>
                    </span>
                    <span className="labcard__title">{lab.title}</span>
                    <ul className="labcard__cps">
                      {lab.checkpoints.map((c) => {
                        const on = state.labs[key]?.checkpoints?.[c.id]
                        return (
                          <li key={c.id} className={on ? 'is-on' : ''}>
                            <Icon name={on ? 'check-circle' : 'target'} />
                            {c.label}
                          </li>
                        )
                      })}
                    </ul>
                  </Link>
                )
              })}
            </div>
          </section>
        </section>

        <aside className="grades__side">
          <div className="sidecard grades__total">
            <Ring value={g.total} size={128} stroke={10} label={`${g.total} of 100 points earned`}>
              <span className="grades__ringval">
                {g.total}
                <small>/100</small>
              </span>
            </Ring>
            <p className="muted">Points earned toward the Module 1 grade. Items not yet attempted count as zero.</p>
          </div>
          <div className="sidecard">
            <h2 className="sidecard__title">Quiz attempts</h2>
            {state.quiz.attempts.length ? (
              <ul className="gradelist">
                {[...state.quiz.attempts].reverse().slice(0, 6).map((a, i) => (
                  <li key={i}>
                    <span>{fmtDate(a.at)}</span>
                    <span className="faint tabular">
                      {a.score}/{a.total}
                    </span>
                    <span className={`tabular gradelist__val ${a.pct >= COURSE.quizPass ? 'is-pass' : ''}`}>{a.pct}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="faint sidecard__small">No attempts yet. The best attempt counts.</p>
            )}
            <Link to="/module/1/quiz" className="btn btn--sm">
              Open Quiz 1 <Icon name="arrow-right" />
            </Link>
          </div>
          <div className="sidecard">
            <h2 className="sidecard__title">How the weights work</h2>
            <p className="faint sidecard__small">
              Labs 40 %, quiz 30 %, assignment 20 %, peer review 10 %. The assignment grade is an automatic, provisional
              check against the rubric; a teacher can adjust it. Peer review scores how closely your assessments match the
              instructor's.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
