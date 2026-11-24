import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import ActivityFrame, { SectionHead } from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import DocTag from '../components/DocTag.jsx'
import { Callout, Reveal, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import { useStore } from '../store.js'
import { OUTCOMES, ACTIVITIES, activityById } from '../data/course.js'
import './Start.css'

const DIAGNOSTIC = [
  {
    id: 'sql',
    prompt: 'How often have you written a SQL transaction (BEGIN … COMMIT)?',
    multi: false,
    options: [
      { id: 'often', label: 'Often, it is routine' },
      { id: 'some', label: 'A few times' },
      { id: 'never', label: 'Never' },
    ],
  },
  {
    id: 'nosql',
    prompt: 'Which of these have you used, even briefly?',
    multi: true,
    options: [
      { id: 'mongo', label: 'MongoDB or another document store' },
      { id: 'redis', label: 'Redis or another key-value store' },
      { id: 'cassandra', label: 'Cassandra, HBase or another wide-column store' },
      { id: 'none', label: 'None of these yet' },
    ],
  },
  {
    id: 'cap',
    prompt:
      'The link between two data centres fails. A database keeps answering every request on both sides, even if some answers are old. What is it favouring?',
    multi: false,
    options: [
      { id: 'c', label: 'Consistency' },
      { id: 'a', label: 'Availability' },
      { id: 'both', label: 'Both, because it is distributed' },
      { id: 'unsure', label: 'Not sure yet' },
    ],
  },
]

function recommendations(answers) {
  const recs = []
  const nosql = answers.nosql || []
  if (answers.sql === 'never') {
    recs.push({
      activity: 'lab-tx',
      text: 'Lab 5 ends with a plain SQL transaction. Read that panel first: it is the baseline every distributed transaction is compared with.',
    })
  }
  if (!nosql.length || nosql.includes('none')) {
    recs.push({
      activity: 'lab-shell',
      text: 'New to document stores? Spend five minutes in the Playground before Lab 1. Type db.help and try a find.',
      to: '/playground',
    })
  } else if (nosql.includes('mongo')) {
    recs.push({
      activity: 'lab-shard',
      text: 'You have used MongoDB: the shard key lab is where you will learn most. Try the keys you would have picked at work.',
    })
  }
  if (answers.cap === 'a') {
    recs.push({ activity: 'lecture-2', text: 'Correct, it favours availability. Lecture 1.2 shows what that costs once the link heals.' })
  } else if (answers.cap) {
    recs.push({
      activity: 'lecture-2',
      text: 'Answering everyone with possibly old data favours availability. Lecture 1.2 pauses on exactly this question; watch for it.',
    })
  }
  return recs
}

function DiagQuestion({ q, value, onChange, index }) {
  const sel = q.multi ? value || [] : value
  const toggle = (id) => {
    if (!q.multi) return onChange(id)
    let next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]
    if (id === 'none' && !sel.includes('none')) next = ['none']
    else if (id !== 'none') next = next.filter((x) => x !== 'none')
    onChange(next)
  }
  return (
    <fieldset className="diag__q">
      <legend>
        <span className="diag__n">{String(index + 1).padStart(2, '0')}</span>
        {q.prompt}
      </legend>
      <div className="diag__opts" role={q.multi ? 'group' : 'radiogroup'}>
        {q.options.map((o) => {
          const on = q.multi ? sel.includes(o.id) : sel === o.id
          return (
            <button
              key={o.id}
              type="button"
              role={q.multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              className={`option ${q.multi ? 'option--multi' : ''}`}
              onClick={() => toggle(o.id)}
            >
              <span className="option__mark">
                <Icon name="check" strokeWidth={3} />
              </span>
              <span>{o.label}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function Start() {
  const diagnostic = useStore((s) => s.diagnostic)
  const answer = useStore((s) => s.answerDiagnostic)
  const finish = useStore((s) => s.finishDiagnostic)
  const answered = DIAGNOSTIC.every((q) => {
    const v = diagnostic.answers[q.id]
    return q.multi ? v && v.length : v
  })
  const recs = diagnostic.done ? recommendations(diagnostic.answers) : []

  return (
    <ActivityFrame id="start" width="wide">
      <div className="start">
        {/* 1. The situation */}
        <section className="start__situation" aria-labelledby="sit-h">
          <div className="start__story">
            <div className="kicker">The situation</div>
            <h2 id="sit-h" className="start__h2">
              A customer in Vilnius buys the last bag of Coffee. At the same second, so does someone in Riga.
            </h2>
            <div className="prose start__prose">
              <p>
                A small chain sells tea, rice and coffee from shops in Riga, Tallinn and Vilnius. Its app shows stock
                levels to staff and customers. Last winter it sold Coffee it did not have: two shops, one stock count,
                two different answers.
              </p>
              <p>
                The owner asks for one thing: <strong>the low-stock list must be right</strong>, because that is what
                staff use to reorder. Everything in this module, from the data model to the shard key to what happens
                when the network fails, follows from that one query.
              </p>
            </div>
            <Callout tone="accent" icon="bulb" title="Ask before you design:">
              which query or operation matters most to the user? Hold your answer. You will test it in Lecture 1.1
              and defend it in the assignment.
            </Callout>
          </div>
          <div className="start__shelf" aria-label="The three products in the running case">
            {[
              { _id: 'p1', name: 'Tea', stock: 3, tags: ['drink'] },
              { _id: 'p2', name: 'Rice', stock: 12, tags: ['food'] },
              { _id: 'p3', name: 'Coffee', stock: 2, tags: ['drink'] },
            ].map((d, i) => (
              <Reveal key={d._id} delay={0.1 + i * 0.08} y={24}>
                <DocTag doc={d} state={d.stock < 5 ? 'match' : undefined} />
              </Reveal>
            ))}
            <p className="start__shelfnote">
              <span className="start__dot" /> Below 5: the two products staff need to reorder.
            </p>
          </div>
        </section>

        {/* 2. Outcomes */}
        <section aria-labelledby="out-h">
          <SectionHead kicker="Module outcome" title="By the end of the module you will be able to">
            Each outcome is checked by something you do, not just something you read.
          </SectionHead>
          <div className="table-wrap">
            <table className="table start__outcomes">
              <thead>
                <tr>
                  <th scope="col">Outcome</th>
                  <th scope="col">How it is checked</th>
                  <th scope="col">Where</th>
                </tr>
              </thead>
              <tbody>
                {OUTCOMES.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong className="start__verb">{o.verb}</strong> {o.text.replace(/^\w+\s/, '')}
                    </td>
                    <td className="muted">{o.assessed}</td>
                    <td>
                      <span className="start__where">
                        {o.evidence.map((id) => {
                          const a = activityById(id)
                          return (
                            <Link key={id} to={a.path} className="chip chip--outline start__chiplink">
                              {a.short.split(' · ')[0]}
                            </Link>
                          )
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint start__workload">
            Workload: {ACTIVITIES.reduce((s, a) => s + a.minutes, 0)} minutes across {ACTIVITIES.length} activities,
            including one 90-minute class session if your teacher runs it live.
          </p>
        </section>

        {/* 3. Diagnostic */}
        <section className="diag" aria-labelledby="diag-h">
          <SectionHead kicker="Warm-up · not graded" title="Where are you starting from?">
            Three quick questions. Your answers only shape the tips below; they never count toward a grade.
          </SectionHead>
          <div className="diag__grid">
            {DIAGNOSTIC.map((q, i) => (
              <DiagQuestion key={q.id} q={q} index={i} value={diagnostic.answers[q.id]} onChange={(v) => answer(q.id, v)} />
            ))}
          </div>
          <div className="diag__actions">
            <button type="button" className="btn btn--dark btn--lg" disabled={!answered} onClick={finish}>
              {diagnostic.done ? 'Update my tips' : 'Show my starting tips'}
              <Icon name="arrow-right" />
            </button>
            {!answered && <span className="hint">Answer all three to continue.</span>}
          </div>
          <AnimatePresence>
            {diagnostic.done && recs.length > 0 && (
              <motion.div
                className="diag__recs"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: EASE_EXPO }}
                aria-live="polite"
              >
                <div className="kicker">Your starting tips</div>
                <ol className="diag__reclist">
                  {recs.map((r, i) => {
                    const a = activityById(r.activity)
                    return (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 + i * 0.08 }}
                      >
                        <p>{r.text}</p>
                        <Link to={r.to || a.path} className="btn btn--sm">
                          {r.to ? 'Open the playground' : a.short} <Icon name="arrow-right" />
                        </Link>
                      </motion.li>
                    )
                  })}
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </ActivityFrame>
  )
}
