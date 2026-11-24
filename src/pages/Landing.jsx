import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import ClusterHero from '../components/ClusterHero.jsx'
import DocTag from '../components/DocTag.jsx'
import Icon from '../components/Icon.jsx'
import { Highlight } from '../components/CodeBlock.jsx'
import { Reveal, Predict, useDocTitle, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import { useStore, nextActivity, moduleProgress } from '../store.js'
import { COURSE, OUTCOMES, MODULES, STEPS, LESSON_PLAN, totalMinutes } from '../data/course.js'
import './Landing.css'

const SEED = [
  { _id: 'p1', name: 'Tea', stock: 3, tags: ['drink'] },
  { _id: 'p2', name: 'Rice', stock: 12, tags: ['food'] },
  { _id: 'p3', name: 'Coffee', stock: 2, tags: ['drink'] },
]

const TEASER_STEPS = [
  {
    code: 'db.products.insertMany([ …three products… ])',
    note: 'Three documents land in the products collection. No schema to declare first.',
  },
  {
    code: 'db.products.find({ stock: { $lt: 5 } })',
    note: 'The query that matters most to the shop: what is about to run out?',
  },
  {
    code: 'db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } })',
    note: 'Restock Tea in place. One document, one atomic update.',
  },
  {
    code: 'db.products.find({ stock: { $lt: 5 } })',
    note: 'Run it again: only Coffee is low now. Predict, then verify.',
  },
]

function InventoryTeaser() {
  const [step, setStep] = useState(-1)
  const reduce = useReducedMotion()
  const docs = step >= 0 ? SEED.map((d) => (d._id === 'p1' && step >= 2 ? { ...d, stock: 13 } : d)) : []
  const lowIds = step === 1 ? ['p1', 'p3'] : step === 3 ? ['p3'] : null
  const run = (i) => setStep(i)

  return (
    <div className="teaser">
      <ol className="teaser__steps">
        {TEASER_STEPS.map((s, i) => {
          const enabled = i <= step + 1
          return (
            <li key={i}>
              <button
                type="button"
                className={`teaser__cmd ${i === step ? 'is-current' : ''} ${i < step ? 'is-past' : ''}`}
                onClick={() => run(i)}
                disabled={!enabled}
                aria-pressed={i === step}
              >
                <span className="teaser__num">{String(i + 1).padStart(2, '0')}</span>
                <code className="teaser__code">
                  <Highlight code={s.code} />
                </code>
                <span className="teaser__run" aria-hidden="true">
                  <Icon name={i < step ? 'check' : 'play'} />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="teaser__stage" aria-live="polite">
        <div className="teaser__shelf">
          <AnimatePresence initial={false}>
            {docs.map((d, i) => (
              <motion.div
                key={d._id}
                layout
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -40, rotate: i === 1 ? 2 : -2 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.7, ease: EASE_EXPO, delay: step === 0 ? i * 0.09 : 0 }}
              >
                <DocTag
                  doc={d}
                  state={lowIds ? (lowIds.includes(d._id) ? 'match' : 'dim') : step === 0 ? 'new' : undefined}
                  changed={step === 2 && d._id === 'p1' ? ['stock'] : []}
                  key={`${d._id}-${step}`}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {step < 0 && (
            <div className="teaser__empty">
              <Icon name="database" />
              <span>
                <strong>products</strong> is empty. Run step 01.
              </span>
            </div>
          )}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            className="teaser__note"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            {step < 0 ? 'Press the first command. Each one changes the shelf on the right.' : TEASER_STEPS[step].note}
            {lowIds ? (
              <span className="teaser__result">
                {' '}
                Result: {lowIds.map((id) => SEED.find((d) => d._id === id).name).join(', ')}
              </span>
            ) : null}
          </motion.p>
        </AnimatePresence>
        {step === 3 && (
          <div className="teaser__done">
            <Link to="/module/1/lab/shell" className="btn btn--dark btn--sm">
              Do it properly in Lab 1 <Icon name="arrow-right" />
            </Link>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep(-1)}>
              <Icon name="reset" /> Replay
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const ANATOMY = ['begin', 'watch', 'read', 'explore', 'experiment', 'check', 'apply', 'review', 'discuss', 'reflect']
const ANATOMY_NOTE = {
  begin: 'A practical situation and a warm-up',
  watch: 'Two short animated lectures',
  read: 'Chapters with a worked example',
  explore: 'Hotspot diagram of the cluster',
  experiment: 'Five browser labs',
  check: 'Ten questions with explanations',
  apply: 'Deliver the finished database',
  review: 'Assess three peers on a rubric',
  discuss: 'One guided question',
  reflect: 'Self-assessment and feedback',
}

export default function Landing() {
  useDocTitle(null)
  const activities = useStore((s) => s.activities)
  const next = nextActivity(activities)
  const { done } = moduleProgress(activities)
  const started = done > 0
  const hours = Math.round((totalMinutes / 60) * 10) / 10

  return (
    <div className="landing">
      {/* ---------- Hero ---------- */}
      <section className="hero">
        <div className="hero__inner page page--wide">
          <div className="hero__copy">
            <motion.div
              className="hero__kicker"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_EXPO }}
            >
              <span className="kicker kicker--on-dark">Open course · Module 1 is live</span>
            </motion.div>
            <h1 className="hero__title">
              {['Three products.', 'Three cities.', 'One stock count', 'that must not lie.'].map((line, i) => (
                <span className="hero__line" key={i}>
                  <motion.span
                    initial={{ y: '105%' }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.08 + i * 0.08 }}
                  >
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p
              className="hero__lead"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.45 }}
            >
              {COURSE.title}: a browser-first course. Explain the model, build a working example, and defend the
              trade-offs when the network between your machines fails.
            </motion.p>
            <motion.div
              className="hero__ctas"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.55 }}
            >
              <Link to={started && next ? next.path : '/module/1/start'} className="btn btn--primary btn--lg">
                {started && next ? `Continue: ${next.short}` : 'Start Module 1'}
                <Icon name="arrow-right" />
              </Link>
              <Link to="/playground" className="btn btn--on-dark btn--lg">
                <Icon name="terminal" />
                Open the playground
              </Link>
            </motion.div>
            <motion.dl
              className="hero__facts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.75 }}
            >
              <div>
                <dt>Module 1</dt>
                <dd>{hours} h of guided work</dd>
              </div>
              <div>
                <dt>Labs</dt>
                <dd>5, in the browser</dd>
              </div>
              <div>
                <dt>Install</dt>
                <dd>Nothing</dd>
              </div>
            </motion.dl>
          </div>
          <motion.div
            className="hero__viz"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: EASE_EXPO, delay: 0.2 }}
          >
            <ClusterHero />
          </motion.div>
        </div>
        <button
          type="button"
          className="hero__scroll"
          onClick={() => document.getElementById('case')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span>Scroll</span>
          <span className="hero__scrollline" aria-hidden="true" />
        </button>
      </section>

      {/* ---------- Running case ---------- */}
      <section className="band band--case" id="case">
        <div className="page page--wide case">
          <Reveal className="case__copy">
            <div className="kicker">The running case</div>
            <h2 className="display-2">
              One small inventory carries the whole course.
            </h2>
            <p className="case__lead">
              Insert three documents, query low stock, update one record. Then spread it across machines: map a shard
              key, add replicas, and explain what replica lag and CAP do to the number a customer sees.
            </p>
            <p className="case__hint">
              <Icon name="bulb" /> Try it here. Four commands, the same ones you will run in Lab 1.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <InventoryTeaser />
          </Reveal>
        </div>
      </section>

      {/* ---------- At a glance ---------- */}
      <section className="band">
        <div className="page page--wide glance">
          <Reveal className="glance__head">
            <div className="kicker">The course at a glance</div>
            <p className="glance__sentence">
              <span className="num">8</span> weekly modules, <span className="num">5</span> browser labs a module,{' '}
              <span className="num">8</span> auto-graded quizzes and <span className="num">1</span> peer-reviewed
              capstone. Self-paced, built around practice.
            </p>
          </Reveal>
          <Reveal className="manifest" delay={0.05}>
            {[
              ['For', COURSE.audience],
              ['Before you start', COURSE.prerequisites],
              ['Format', `${COURSE.format.pace}. ${COURSE.format.weekly}. ${COURSE.format.session}.`],
              ['Language', COURSE.format.language],
              ['Tools', `${COURSE.format.tools} Optional real databases: DB AI MongoDB Playground and DB Fiddle.`],
              ['Your data', 'Progress, quiz scores, posts and submissions stay in this browser. Export them any time.'],
            ].map(([k, v]) => (
              <div className="manifest__row" key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------- Outcomes ---------- */}
      <section className="band band--sunk">
        <div className="page page--wide">
          <Reveal className="section-intro">
            <div className="kicker">Learning outcomes</div>
            <h2 className="display-2">What you can do after the course, and how we check.</h2>
          </Reveal>
          <ol className="outcomes">
            {OUTCOMES.map((o, i) => (
              <Reveal as="li" key={o.id} className="outcome" delay={i * 0.04}>
                <span className="outcome__verb">{o.verb}</span>
                <span className="outcome__text">{o.text}</span>
                <span className="outcome__how">
                  <Icon name="check-circle" />
                  {o.assessed}
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Course map ---------- */}
      <section className="band">
        <div className="page page--wide">
          <Reveal className="section-intro section-intro--split">
            <div>
              <div className="kicker">Course map</div>
              <h2 className="display-2">Eight modules, from one shelf to a planet-scale inventory.</h2>
            </div>
            <Link to="/course" className="btn">
              Open my course <Icon name="arrow-right" />
            </Link>
          </Reveal>
          <ol className="coursemap">
            {MODULES.map((m, i) => (
              <Reveal as="li" key={m.n} delay={i * 0.035} className={`coursemap__row ${m.status === 'live' ? 'is-live' : ''}`}>
                <span className="coursemap__n">{String(m.n).padStart(2, '0')}</span>
                <span className="coursemap__title">{m.title}</span>
                <span className="coursemap__work">{m.practical}</span>
                <span className="coursemap__status">
                  {m.status === 'live' ? (
                    <Link to="/module/1" className="btn btn--primary btn--sm">
                      Enter <Icon name="arrow-right" />
                    </Link>
                  ) : (
                    <Link to={`/module/${m.n}`} className="chip chip--outline coursemap__chip">
                      <Icon name="lock" /> In production
                    </Link>
                  )}
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Anatomy ---------- */}
      <section className="band band--rack">
        <div className="page page--wide">
          <Reveal className="section-intro">
            <div className="kicker kicker--on-dark">Anatomy of a module</div>
            <h2 className="display-2 on-dark">The same rhythm every week, so you always know the next step.</h2>
          </Reveal>
          <ol className="anatomy">
            {ANATOMY.map((k, i) => (
              <Reveal as="li" key={k} delay={i * 0.05} className="anatomy__step" y={10}>
                <span className="anatomy__dot">
                  <Icon name={STEPS[k].icon} />
                </span>
                <span className="anatomy__label">
                  <span className="anatomy__n">{String(i + 1).padStart(2, '0')}</span>
                  {STEPS[k].label}
                </span>
                <span className="anatomy__note">{ANATOMY_NOTE[k]}</span>
                <span className="anatomy__tool">{STEPS[k].tool}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Ask predict verify ---------- */}
      <section className="band">
        <div className="page page--wide apv-section">
          <Reveal className="apv-section__copy">
            <div className="kicker">How you learn here</div>
            <h2 className="display-2">Ask. Predict. Verify.</h2>
            <p className="case__lead">
              Before every command, simulation or video question you commit to a prediction. Then the system shows
              you what actually happens. Being wrong in a lab is cheap; being wrong in production is not.
            </p>
            <ul className="apv-list">
              <li>
                <strong>Ask</strong> a question that matters to the user of the system.
              </li>
              <li>
                <strong>Predict</strong> the result before you run anything.
              </li>
              <li>
                <strong>Verify</strong> against the real output, and read why.
              </li>
            </ul>
          </Reveal>
          <Reveal delay={0.08}>
            <Predict
              prompt="Tea has stock 3, Rice 12, Coffee 2. Which products does find({ stock: { $lt: 5 } }) return?"
              multi
              options={[
                { id: 'tea', label: 'Tea' },
                { id: 'rice', label: 'Rice' },
                { id: 'coffee', label: 'Coffee' },
              ]}
              correct={['tea', 'coffee']}
              explain="$lt means strictly less than. Tea (3) and Coffee (2) are below 5; Rice (12) is not."
            />
          </Reveal>
        </div>
      </section>

      {/* ---------- Assessment ---------- */}
      <section className="band band--sunk">
        <div className="page page--wide assess">
          <Reveal className="section-intro">
            <div className="kicker">Assessment</div>
            <h2 className="display-2">Practical work carries most of the grade.</h2>
          </Reveal>
          <Reveal className="weights" delay={0.05}>
            <div className="weights__bar" role="img" aria-label="Grade weights: labs 40%, quizzes 30%, assignment 20%, peer review 10%">
              {[
                ['labs', 'Labs', COURSE.weights.labs],
                ['quiz', 'Quizzes', COURSE.weights.quiz],
                ['assignment', 'Assignment', COURSE.weights.assignment],
                ['peer', 'Peer review', COURSE.weights.peer],
              ].map(([k, label, w], i) => (
                <motion.span
                  key={k}
                  className={`weights__seg weights__seg--${k}`}
                  style={{ flexGrow: w }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.15 + i * 0.1 }}
                >
                  <span className="weights__pct">{w}%</span>
                  <span className="weights__label">{label}</span>
                </motion.span>
              ))}
            </div>
            <dl className="weights__legend">
              <div>
                <dt>Labs, 40%</dt>
                <dd>Five browser labs, graded by checkpoints you reach.</dd>
              </div>
              <div>
                <dt>Quizzes, 30%</dt>
                <dd>Ten questions per module, marked at once. Best attempt counts.</dd>
              </div>
              <div>
                <dt>Assignment, 20%</dt>
                <dd>Schema, query, result and a trade-off justification, checked against a rubric.</dd>
              </div>
              <div>
                <dt>Peer review, 10%</dt>
                <dd>Assess three submissions; scored on how close you are to the instructor.</dd>
              </div>
            </dl>
            <p className="faint assess__pass">Pass mark {COURSE.passMark}%. Badges mark milestones; a certificate is issued when Module 1 is complete.</p>
          </Reveal>
        </div>
      </section>

      {/* ---------- Teach ---------- */}
      <section className="band">
        <div className="page page--wide teach">
          <Reveal className="teach__copy">
            <div className="kicker">For teachers</div>
            <h2 className="display-2">Running it live? The 90-minute plan is built in.</h2>
            <p className="case__lead">
              Eight segments, one per slide, each with a question to ask, a prediction to collect and the activity that
              verifies it. A projector-friendly timer keeps the session on track.
            </p>
            <Link to="/lesson-plan" className="btn btn--dark">
              <Icon name="calendar" /> Open the lesson plan
            </Link>
          </Reveal>
          <Reveal className="teach__timeline" delay={0.08}>
            {LESSON_PLAN.map((seg) => (
              <div className="teach__seg" key={seg.slide} style={{ flexGrow: seg.to - seg.from }}>
                <span className="teach__time tabular">{seg.from}′</span>
                <span className="teach__bar" />
                <span className="teach__title">{seg.title}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="final">
        <div className="page page--wide final__inner">
          <Reveal>
            <h2 className="final__title">Start with the corner shop problem.</h2>
          </Reveal>
          <Reveal delay={0.08} className="final__ctas">
            <Link to={started && next ? next.path : '/module/1/start'} className="btn btn--primary btn--lg">
              {started && next ? `Continue: ${next.short}` : 'Start Module 1'} <Icon name="arrow-right" />
            </Link>
            <Link to="/module/1" className="btn btn--on-dark btn--lg">
              See every activity
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
