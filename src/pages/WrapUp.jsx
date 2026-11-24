import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import ActivityFrame, { SectionHead } from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import { Callout, EASE_EXPO } from '../components/ui.jsx'
import { useStore, moduleProgress } from '../store.js'
import { OUTCOMES, MODULES, activityById } from '../data/course.js'
import './WrapUp.css'

const TAKEAWAYS = [
  ['Start from the query that matters most.', 'For the shop it is the low-stock list; it chose the model, the index and the read settings.'],
  ['The model decides what the database can do for you.', 'Key-value hides fields, documents expose them, column families are built per query.'],
  ['Atomic updates beat clever code.', '$inc on one document is safe under concurrency; read-modify-write is not.'],
  ['A shard key is a bet on your workload.', 'High cardinality, even frequency, not monotonic, and present in the queries you want targeted.'],
  ['Replicas buy durability and reads, and cost freshness.', 'Replica lag makes secondaries stale; w: "majority" makes writes survive failover.'],
  ['CAP is a choice made during a partition.', 'MongoDB refuses writes on the minority side; quorum stores let you tune R and W per request.'],
  ['Coordination is the expensive part.', '2PC costs round trips and locks and can block; NewSQL replicates every participant to survive failures.'],
]

const FURTHER = [
  { title: 'MongoDB Manual: Sharding', url: 'https://www.mongodb.com/docs/manual/sharding/' },
  { title: 'MongoDB Manual: Replication', url: 'https://www.mongodb.com/docs/manual/replication/' },
  { title: 'Jepsen analyses of distributed databases', url: 'https://jepsen.io/analyses' },
  { title: 'Spanner: Google’s Globally-Distributed Database (paper)', url: 'https://research.google/pubs/spanner-googles-globally-distributed-database-2/' },
]

const SCALE = [
  { v: 1, label: 'Not yet' },
  { v: 2, label: 'With help' },
  { v: 3, label: 'Mostly' },
  { v: 4, label: 'Confidently' },
  { v: 5, label: 'Could teach it' },
]

export default function WrapUp() {
  const reflection = useStore((s) => s.reflection)
  const save = useStore((s) => s.saveReflection)
  const submit = useStore((s) => s.submitReflection)
  const activities = useStore((s) => s.activities)
  const { done, total } = moduleProgress(activities)
  const [copied, setCopied] = useState(false)
  const conf = reflection.confidence || {}
  const rated = OUTCOMES.filter((o) => conf[o.id]).length
  const canSubmit = rated === OUTCOMES.length
  const weakest = OUTCOMES.filter((o) => conf[o.id] && conf[o.id] <= 2)

  const feedbackText = () =>
    [
      'Module 1 feedback',
      `Overall rating: ${reflection.rating || '-'} / 5`,
      `Time taken: ${reflection.minutes || '-'} minutes`,
      `What was unclear: ${reflection.unclear || '-'}`,
      'Confidence by outcome:',
      ...OUTCOMES.map((o) => `  ${o.verb}: ${conf[o.id] || '-'} / 5`),
    ].join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedbackText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <ActivityFrame id="wrap-up">
      <div className="wrap">
        <section aria-labelledby="take-h">
          <SectionHead kicker="Summary" title="Seven things to keep" />
          <ol className="take">
            {TAKEAWAYS.map(([t, d], i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5, ease: EASE_EXPO, delay: i * 0.04 }}
              >
                <span className="take__n">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <p className="take__t">{t}</p>
                  <p className="take__d">{d}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="self-h">
          <SectionHead kicker="Self-assessment" title="How confident are you with each outcome?">
            Be honest; nobody grades this. It tells you where to go back before Module 2.
          </SectionHead>
          <div className="selfa">
            {OUTCOMES.map((o) => (
              <div key={o.id} className="selfa__row">
                <div className="selfa__text">
                  <strong>{o.verb}</strong> {o.text.replace(/^\w+\s/, '')}
                </div>
                <div className="segmented selfa__scale" role="radiogroup" aria-label={`Confidence: ${o.verb}`}>
                  {SCALE.map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      role="radio"
                      aria-checked={conf[o.id] === s.v}
                      aria-pressed={conf[o.id] === s.v}
                      title={s.label}
                      onClick={() => save({ confidence: { ...conf, [o.id]: s.v } })}
                    >
                      {s.v}
                      <span className="visually-hidden"> {s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="faint selfa__legend">1 not yet · 2 with help · 3 mostly · 4 confidently · 5 could teach it</p>
          </div>
          <AnimatePresence>
            {weakest.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Callout tone="accent" icon="compass" title="Go back to:">
                  {weakest.map((o, i) => {
                    const a = activityById(o.evidence[0])
                    return (
                      <span key={o.id}>
                        {i > 0 ? ', ' : ''}
                        <Link to={a.path}>{a.short}</Link> ({o.verb.toLowerCase()})
                      </span>
                    )
                  })}
                  .
                </Callout>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section aria-labelledby="fb-h" className="fb">
          <SectionHead kicker="Two minutes of feedback" title="Help improve the next run">
            The course is piloted with student groups; what was unclear and how long it took shapes the next version.
          </SectionHead>
          <div className="fb__grid">
            <div className="field">
              <label className="label" htmlFor="fb-unclear">
                What was unclear, or where did you lose interest?
              </label>
              <textarea
                id="fb-unclear"
                className="textarea"
                value={reflection.unclear}
                onChange={(e) => save({ unclear: e.target.value })}
                placeholder="For example: the difference between readPreference and readConcern"
              />
            </div>
            <div className="fb__side">
              <div className="field">
                <label className="label" htmlFor="fb-min">
                  Roughly how many minutes did the module take?
                </label>
                <input
                  id="fb-min"
                  className="input"
                  type="number"
                  min="0"
                  max="1000"
                  inputMode="numeric"
                  value={reflection.minutes}
                  onChange={(e) => save({ minutes: e.target.value })}
                  placeholder="e.g. 150"
                />
              </div>
              <div className="field">
                <span className="label" id="fb-rate">
                  Overall, how useful was it?
                </span>
                <div className="stars" role="radiogroup" aria-labelledby="fb-rate">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={reflection.rating === n}
                      className={`stars__btn ${reflection.rating >= n ? 'is-on' : ''}`}
                      onClick={() => save({ rating: n })}
                      aria-label={`${n} of 5`}
                    >
                      <Icon name="star" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="fb__actions">
            <button type="button" className="btn btn--dark btn--lg" disabled={!canSubmit} onClick={submit}>
              <Icon name="check" /> {reflection.submittedAt ? 'Update reflection' : 'Submit reflection'}
            </button>
            <button type="button" className="btn btn--lg" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy feedback for your teacher'}
            </button>
            {!canSubmit && <span className="hint">Rate all six outcomes to submit ({rated}/6).</span>}
          </div>
          {reflection.submittedAt && (
            <Callout tone="success" title="Reflection saved.">
              {done === total ? (
                <>
                  Module 1 is complete. <Link to="/certificate">View your certificate</Link>.
                </>
              ) : (
                <>
                  {total - done} activit{total - done === 1 ? 'y is' : 'ies are'} still open. See the{' '}
                  <Link to="/module/1">module page</Link>.
                </>
              )}
            </Callout>
          )}
        </section>

        <section className="next2" aria-labelledby="next-h">
          <div>
            <div className="kicker kicker--on-dark">Next: Module 2</div>
            <h2 id="next-h" className="next2__title">
              {MODULES[1].title}
            </h2>
            <p className="next2__lead">
              You stored each product as one document. Next you will decide what belongs inside it, and what should live
              elsewhere, when orders and suppliers arrive.
            </p>
            <Link to="/module/2" className="btn btn--on-dark">
              Preview Module 2 <Icon name="arrow-right" />
            </Link>
          </div>
          <div className="next2__further">
            <div className="kicker kicker--on-dark">Further reading</div>
            <ul>
              {FURTHER.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {f.title} <Icon name="arrow-up-right" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </ActivityFrame>
  )
}
