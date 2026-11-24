import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import CodeBlock from '../components/CodeBlock.jsx'
import { Callout, Meter, EASE_EXPO, EASE_OUT } from '../components/ui.jsx'
import { useStore } from '../store.js'
import { COURSE } from '../data/course.js'
import { RUBRIC, RUBRIC_MAX, STRONG_EXAMPLE, COMMON_ERRORS } from '../data/peers.js'
import './Assignment.css'

/* ------------------------------------------------------------------ */
/* Automated pre-check: transparent, one point per check               */
/* ------------------------------------------------------------------ */

const wordCount = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length

function autoCheck(d) {
  const schema = d.schema || ''
  const queries = d.queries || ''
  const result = d.result || ''
  const just = d.justification || ''
  const data = `${schema}\n${queries}`
  const t = (re, s) => re.test(s)

  const groups = {
    schema: [
      { label: 'Defines an _id for each product', pass: t(/_id/, data) },
      { label: 'Has a name field', pass: t(/\bname\b/, data) },
      { label: 'Stores stock as a number', pass: t(/stock\s*:\s*-?\d/, data) },
      { label: 'Models tags as an array', pass: t(/tags\s*:\s*\[/, data) },
      { label: 'Includes Tea, Rice and Coffee', pass: t(/tea/i, data) && t(/rice/i, data) && t(/coffee/i, data) },
    ],
    query: [
      { label: 'Inserts with insertMany', pass: t(/insertMany\s*\(/, queries) },
      { label: 'Finds low stock with $lt: 5', pass: t(/\$lt\s*:\s*5\b/, queries) },
      { label: 'Updates one record with updateOne', pass: t(/updateOne\s*\(/, queries) },
      { label: 'Restocks with $inc', pass: t(/\$inc\s*:/, queries) },
      {
        label: 'Targets Tea in the update',
        pass: t(/updateOne\s*\(\s*\{\s*(_id\s*:\s*["']p1["']|name\s*:\s*["']Tea["'])/, queries),
      },
    ],
    result: [
      { label: 'Pastes real shell output', pass: t(/[{[]/, result) },
      { label: 'Low-stock result includes Tea', pass: t(/tea/i, result) },
      { label: 'Low-stock result includes Coffee', pass: t(/coffee/i, result) },
      { label: 'Shows Tea at 13 after the update', pass: t(/\b13\b/, result) },
      { label: 'Shows the update acknowledgement', pass: t(/(modifiedCount|matchedCount|acknowledged)/, result) },
    ],
    tradeoff: [
      {
        label: 'Names a shard key and argues for it (60+ words)',
        pass: (d.shardKey || '').trim().length > 2 && wordCount(just) >= 60,
      },
      {
        label: 'Reasons about cardinality or write spread',
        pass: t(/(cardinalit|distinct|spread|evenly|hot ?shard|hotspot|monoton|balanc)/i, just),
      },
      { label: 'Reasons about query isolation', pass: t(/(target|isolat|scatter|broadcast|single shard|one shard)/i, just) },
      { label: 'Explains replica lag or stale reads', pass: t(/(\blag|stale|secondar|replicat)/i, just) },
      {
        label: 'Says what happens during a partition (CAP)',
        pass: t(/(partition|\bcap\b|consisten|availab|steps? down|stepped down|elect)/i, just),
      },
    ],
  }

  const checks = RUBRIC.map((c) => {
    const items = groups[c.id]
    return { id: c.id, title: c.title, items, points: items.filter((i) => i.pass).length }
  })
  const total = checks.reduce((s, c) => s + c.points, 0)
  return { checks, total, score: Math.round((total / RUBRIC_MAX) * 100) }
}

function feedbackText(checks) {
  const total = checks.reduce((s, c) => s + c.points, 0)
  const missing = checks.flatMap((c) => c.items.filter((i) => !i.pass).map((i) => i.label.toLowerCase()))
  let lead
  if (total >= 18) lead = 'Strong submission: every part of the brief is covered.'
  else if (total >= 14) lead = 'Solid work with a few gaps.'
  else if (total >= 9) lead = 'The core is there, but several parts of the brief are missing.'
  else lead = 'Much of the brief is missing.'
  if (!missing.length) return `${lead} Your teacher may still adjust the grade after reading it.`
  return `${lead} To improve: ${missing.slice(0, 3).join('; ')}${missing.length > 3 ? `; and ${missing.length - 3} more below` : ''}.`
}

function fmtTime(ts) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(ts)
}
function fmtDateTime(ts) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts)
}
function fmtSize(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
}

// Lab 2 stores its choice in its own shape; accept a string or a small object.
function labChoiceText(choice) {
  if (!choice) return ''
  if (typeof choice === 'string') return choice
  if (typeof choice === 'object') {
    if (typeof choice.label === 'string') return choice.label
    if (typeof choice.key === 'string') return choice.key
    if (choice.key && typeof choice.key === 'object') return JSON.stringify(choice.key)
    return JSON.stringify(choice)
  }
  return String(choice)
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function Disclosure({ title, meta, icon, children, defaultOpen = false }) {
  return (
    <details className="asg-disclosure" open={defaultOpen}>
      <summary>
        <span className="asg-disclosure__icon">
          <Icon name={icon} />
        </span>
        <span className="asg-disclosure__title">{title}</span>
        {meta ? <span className="asg-disclosure__meta">{meta}</span> : null}
        <Icon name="chevron-down" className="asg-disclosure__chev" />
      </summary>
      <div className="asg-disclosure__body">{children}</div>
    </details>
  )
}

function RubricTable() {
  return (
    <div className="table-wrap">
      <table className="table asg-rubric">
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th scope="col">1 · Beginning</th>
            <th scope="col">3 · Developing</th>
            <th scope="col">5 · Strong</th>
          </tr>
        </thead>
        <tbody>
          {RUBRIC.map((c, i) => (
            <tr key={c.id}>
              <th scope="row">
                <span className="asg-rubric__num">{i + 1}</span>
                {c.title}
                <span className="asg-rubric__pts">0 to 5 points</span>
              </th>
              <td>{c.levels[1]}</td>
              <td>{c.levels[3]}</td>
              <td>{c.levels[5]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Brief() {
  return (
    <section className="asg-brief" aria-labelledby="asg-brief-title">
      <div className="asg-brief__main">
        <span className="kicker kicker--on-dark">The brief · lesson slide 8</span>
        <h2 id="asg-brief-title" className="asg-brief__title">
          Run the finished database, then defend it.
        </h2>
        <p className="asg-brief__task">
          Create the product inventory, insert three documents, query low stock and update one record. Then map a
          shard key and explain the replica lag and CAP trade-offs.
        </p>
      </div>
      <ol className="asg-deliver" aria-label="Deliverables">
        {['Schema or structure', 'Query', 'Result', 'Trade-off justification'].map((d, i) => (
          <li key={d}>
            <span className="asg-deliver__n">{i + 1}</span>
            {d}
          </li>
        ))}
      </ol>
      <dl className="asg-brief__facts">
        <div>
          <dt>Due</dt>
          <dd>End of Module 1</dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>{COURSE.weights.assignment}% of the module grade</dd>
        </div>
        <div>
          <dt>Marking</dt>
          <dd>Automatic pre-check now, teacher review later</dd>
        </div>
      </dl>
    </section>
  )
}

function Prep() {
  return (
    <section className="asg-prep" aria-label="Before you write">
      <Disclosure title="Rubric" meta="4 criteria · 20 points" icon="grid">
        <RubricTable />
      </Disclosure>
      <Disclosure title="A strong example" meta="Scores 5 on every criterion" icon="star">
        <div className="asg-example">
          <CodeBlock code={STRONG_EXAMPLE.schema} title="Schema" copy={false} />
          <CodeBlock code={STRONG_EXAMPLE.queries} title="Queries" copy={false} />
          <CodeBlock code={STRONG_EXAMPLE.result} title="Result" copy={false} />
          <div className="asg-example__just">
            <div className="asg-example__label">
              Shard key <code>{STRONG_EXAMPLE.shardKey}</code>
            </div>
            <p>{STRONG_EXAMPLE.justification}</p>
          </div>
          <p className="hint">
            Use it to see the level of detail expected, not as text to copy. Your shard key can differ if you justify it.
          </p>
        </div>
      </Disclosure>
      <Disclosure title="Common errors" meta={`${COMMON_ERRORS.length} to avoid`} icon="alert">
        <ul className="asg-errors">
          {COMMON_ERRORS.map((e) => (
            <li key={e.title}>
              <strong>{e.title}</strong>
              <span>{e.body}</span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

const SELF_CHECK = [
  { id: 'consistent', label: 'All three documents use the same field names and types' },
  { id: 'lt', label: 'My low-stock query uses $lt: 5, and its output lists Tea and Coffee only' },
  { id: 'inc', label: 'My update adds to the stock with $inc, and I show Tea at 13' },
  { id: 'key', label: 'I name one shard key and say why it beats an alternative' },
  { id: 'lag', label: 'I say which reads can tolerate a lagging secondary and which cannot' },
  { id: 'cap', label: 'I say what the system does during a network partition' },
]

function Form({ onSubmit }) {
  const draft = useStore((s) => s.assignment.draft)
  const save = useStore((s) => s.saveAssignmentDraft)
  const shardData = useStore((s) => s.labs.shard?.data || {})
  const shellData = useStore((s) => s.labs.shell?.data || {})
  const [savedAt, setSavedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [fileError, setFileError] = useState('')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const update = (patch) => {
    save(patch)
    setSaving(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setSaving(false)
      setSavedAt(Date.now())
    }, 450)
    if (Object.keys(errors).length) {
      const next = { ...errors }
      Object.keys(patch).forEach((k) => delete next[k])
      setErrors(next)
    }
  }

  const labChoice = typeof shardData.choiceLabel === 'string' ? shardData.choiceLabel : labChoiceText(shardData.choice)
  const labJust = typeof shardData.justification === 'string' ? shardData.justification : ''
  const shellSummary = shellData.summary && typeof shellData.summary === 'object' ? shellData.summary : null

  const words = wordCount(draft.justification)
  const wordState = words === 0 ? '' : words < 120 ? 'is-under' : words <= 200 ? 'is-good' : 'is-over'
  const selfCheck = draft.selfCheck || {}
  const ticked = SELF_CHECK.filter((c) => selfCheck[c.id]).length

  const onFile = (e) => {
    const file = e.target.files?.[0]
    setFileError('')
    if (!file) return
    const meta = { name: file.name, size: file.size }
    const textual = /\.(txt|js|json|md)$/i.test(file.name)
    if (textual && file.size <= 50 * 1024) {
      const reader = new FileReader()
      reader.onload = () => update({ attachment: { ...meta, text: String(reader.result) } })
      reader.onerror = () => setFileError('That file could not be read. Try a plain .txt or .js file.')
      reader.readAsText(file)
    } else {
      update({ attachment: meta })
      if (file.size > 5 * 1024 * 1024) setFileError('Only the file name and size are kept in this browser.')
    }
    e.target.value = ''
  }

  const submit = (e) => {
    e.preventDefault()
    const required = {
      schema: 'Add your schema or document structure.',
      queries: 'Add the queries you ran.',
      result: 'Paste the output you got.',
      shardKey: 'Name the shard key you chose.',
      justification: 'Write the trade-off justification.',
    }
    const next = {}
    Object.entries(required).forEach(([k, msg]) => {
      if (!(draft[k] || '').trim()) next[k] = msg
    })
    setErrors(next)
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0]
      document.getElementById(`asg-${first}`)?.focus()
      return
    }
    onSubmit()
  }

  const field = (id, label, hint, props = {}) => (
    <div className="field">
      <label className="label" htmlFor={`asg-${id}`}>
        {label}
      </label>
      {hint ? (
        <span className="hint" id={`asg-${id}-hint`}>
          {hint}
        </span>
      ) : null}
      <textarea
        id={`asg-${id}`}
        className="textarea mono"
        value={draft[id] || ''}
        onChange={(e) => update({ [id]: e.target.value })}
        aria-invalid={errors[id] ? 'true' : undefined}
        aria-describedby={`asg-${id}-hint${errors[id] ? ` asg-${id}-err` : ''}`}
        spellCheck={false}
        {...props}
      />
      {errors[id] ? (
        <span className="asg-error" id={`asg-${id}-err`}>
          {errors[id]}
        </span>
      ) : null}
    </div>
  )

  return (
    <form className="asg-form" onSubmit={submit} noValidate>
      <div className="asg-fields">
        <div className="asg-step">
          <span className="asg-step__n">1</span>
          {field('schema', 'Schema or structure', 'One document as it is stored, with a comment on why it is shaped this way.', {
            rows: 8,
            placeholder: '{\n  _id: "p1",\n  name: "Tea",\n  ...\n}',
          })}
        </div>

        <div className="asg-step">
          <span className="asg-step__n">2</span>
          <div className="stack" style={{ '--gap': '8px' }}>
            {field('queries', 'Queries', 'insertMany, the low-stock find, updateOne, and the re-check.', {
              rows: 9,
              placeholder: 'db.products.insertMany([ ... ]);\ndb.products.find({ ... });',
            })}
            {shellSummary && (
              <button
                type="button"
                className="btn btn--ghost btn--sm asg-prefill"
                onClick={() =>
                  update({
                    schema: draft.schema?.trim() ? draft.schema : shellSummary.schema || '',
                    queries: [
                      'db.products.insertMany([ /* p1 Tea, p2 Rice, p3 Coffee */ ])',
                      shellSummary.query,
                      'db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } })',
                      shellSummary.query,
                    ].join('\n'),
                    result: draft.result?.trim() ? draft.result : shellSummary.result || '',
                  })
                }
              >
                <Icon name="terminal" />
                Use my Lab 1 results
              </button>
            )}
          </div>
        </div>

        <div className="asg-step">
          <span className="asg-step__n">3</span>
          {field('result', 'Result', 'Paste the shell output, including Tea after the restock.', {
            rows: 7,
            placeholder: "[ { _id: 'p1', name: 'Tea', stock: 3, ... }, ... ]",
          })}
        </div>

        <div className="asg-step">
          <span className="asg-step__n">4</span>
          <div className="stack" style={{ '--gap': '18px' }}>
            <div className="field">
              <label className="label" htmlFor="asg-shardKey">
                Shard key
              </label>
              <span className="hint" id="asg-shardKey-hint">
                The key document you would pass to sh.shardCollection.
              </span>
              <div className="asg-inline">
                <input
                  id="asg-shardKey"
                  className="input mono"
                  value={draft.shardKey || ''}
                  onChange={(e) => update({ shardKey: e.target.value })}
                  placeholder='{ storeId: 1, _id: "hashed" }'
                  aria-invalid={errors.shardKey ? 'true' : undefined}
                  aria-describedby="asg-shardKey-hint"
                  spellCheck={false}
                />
                {labChoice && (
                  <button type="button" className="btn btn--sm" onClick={() => update({ shardKey: labChoice })}>
                    <Icon name="map" />
                    Use my Lab 2 choice
                  </button>
                )}
              </div>
              {errors.shardKey ? <span className="asg-error">{errors.shardKey}</span> : null}
            </div>

            <div className="field">
              <div className="spread">
                <label className="label" htmlFor="asg-justification">
                  Trade-off justification
                </label>
                <span className={`asg-words tabular ${wordState}`} aria-live="polite">
                  {words} words · aim for 120 to 200
                </span>
              </div>
              <span className="hint" id="asg-justification-hint">
                Why this key (cardinality, write spread, query isolation), which reads tolerate replica lag, and what
                happens during a partition.
              </span>
              <textarea
                id="asg-justification"
                className="textarea"
                rows={9}
                value={draft.justification || ''}
                onChange={(e) => update({ justification: e.target.value })}
                aria-invalid={errors.justification ? 'true' : undefined}
                aria-describedby="asg-justification-hint"
              />
              {errors.justification ? <span className="asg-error">{errors.justification}</span> : null}
              {labJust && !(draft.justification || '').trim() && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm asg-prefill"
                  onClick={() => update({ justification: labJust })}
                >
                  <Icon name="map" />
                  Start from my Lab 2 notes
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="asg-step">
          <span className="asg-step__n asg-step__n--opt">+</span>
          <div className="field">
            <span className="label" id="asg-file-label">
              Attachment <span className="faint">(optional)</span>
            </span>
            <span className="hint">A script or notes file. Small .txt, .js, .json or .md files are kept in full.</span>
            {draft.attachment ? (
              <div className="asg-file">
                <Icon name="file" />
                <span className="asg-file__name">{draft.attachment.name}</span>
                <span className="faint tabular">{fmtSize(draft.attachment.size)}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--icon btn--sm"
                  onClick={() => update({ attachment: null })}
                  aria-label={`Remove ${draft.attachment.name}`}
                >
                  <Icon name="x" />
                </button>
              </div>
            ) : (
              <label className="btn asg-filebtn">
                <Icon name="upload" />
                Choose a file
                <input type="file" className="visually-hidden" onChange={onFile} aria-labelledby="asg-file-label" />
              </label>
            )}
            {fileError ? <span className="hint">{fileError}</span> : null}
          </div>
        </div>
      </div>

      <aside className="asg-side" aria-label="Self-check and submit">
        <div className="asg-side__card">
          <div className="asg-save" aria-live="polite">
            <span className={`asg-save__dot ${saving ? 'is-saving' : ''}`} aria-hidden="true" />
            {saving ? 'Saving…' : savedAt ? `Draft saved at ${fmtTime(savedAt)}` : 'Drafts save automatically'}
          </div>
          <div>
            <div className="spread">
              <h3 className="asg-side__title">Self-check</h3>
              <span className="faint tabular">
                {ticked}/{SELF_CHECK.length}
              </span>
            </div>
            <p className="hint">Tick each line only if it is true of your draft. It does not change your grade.</p>
          </div>
          <ul className="asg-checklist">
            {SELF_CHECK.map((c) => (
              <li key={c.id}>
                <label className="asg-check">
                  <input
                    type="checkbox"
                    checked={Boolean(selfCheck[c.id])}
                    onChange={(e) => update({ selfCheck: { ...selfCheck, [c.id]: e.target.checked } })}
                  />
                  <span className="asg-check__box" aria-hidden="true">
                    <Icon name="check" strokeWidth={3} />
                  </span>
                  <span>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="submit" className="btn btn--primary btn--lg btn--block">
            <Icon name="upload" />
            Submit for grading
          </button>
          <p className="hint">
            Submitting runs an automatic check against the rubric and gives a provisional grade. You can edit and resubmit
            until your teacher grades it.
          </p>
        </div>
      </aside>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Submitted view                                                      */
/* ------------------------------------------------------------------ */

function Submitted() {
  const a = useStore((s) => s.assignment)
  const withdraw = useStore((s) => s.withdrawAssignment)
  const checks = a.checks || []
  const total = checks.reduce((s, c) => s + c.points, 0)
  const d = a.draft || {}

  return (
    <motion.div
      className="asg-done"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_EXPO }}
    >
      <section className="asg-status" aria-labelledby="asg-status-title">
        <h2 id="asg-status-title" className="asg-status__title">
          Assignment · Submission status
        </h2>
        <div className="table-wrap">
          <table className="table asg-status__table">
            <tbody>
              <tr className="is-ok">
                <th scope="row">Submission status</th>
                <td>Submitted for grading</td>
              </tr>
              <tr className="is-ok">
                <th scope="row">Grading status</th>
                <td>Auto-checked, provisional</td>
              </tr>
              <tr>
                <th scope="row">Due</th>
                <td>End of Module 1</td>
              </tr>
              <tr>
                <th scope="row">Submitted</th>
                <td>{fmtDateTime(a.submittedAt)}</td>
              </tr>
              <tr>
                <th scope="row">File</th>
                <td>
                  {d.attachment ? (
                    <span className="asg-file asg-file--plain">
                      <Icon name="file" />
                      <span className="asg-file__name">{d.attachment.name}</span>
                      <span className="faint tabular">{fmtSize(d.attachment.size)}</span>
                    </span>
                  ) : (
                    <span className="faint">No file attached</span>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Grade</th>
                <td>
                  <strong className="asg-grade tabular">
                    {total} / {RUBRIC_MAX}
                  </strong>{' '}
                  <span className="faint">({a.score}%, provisional)</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Feedback</th>
                <td>{feedbackText(checks)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="asg-status__actions">
          <Link to="/module/1/workshop" className="btn btn--primary">
            Go to peer review
            <Icon name="arrow-right" />
          </Link>
          <button type="button" className="btn" onClick={withdraw}>
            <Icon name="reset" />
            Edit submission
          </button>
        </div>
        <Callout tone="info">
          This grade comes from an automatic check of what your submission contains. It cannot judge how good your
          reasoning is, so your teacher may raise or lower it after reading it.
        </Callout>
      </section>

      <section aria-labelledby="asg-checks-title">
        <h3 id="asg-checks-title" className="rule-label">
          Rubric and automatic checks
        </h3>
        <div className="asg-checks">
          {checks.map((c, i) => {
            const crit = RUBRIC.find((r) => r.id === c.id)
            return (
              <motion.article
                key={c.id}
                className="asg-crit"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.08 * i }}
              >
                <header className="asg-crit__head">
                  <span className="asg-crit__title">{c.title}</span>
                  <span className="asg-crit__pts tabular">
                    {c.points}
                    <span className="faint">/5</span>
                  </span>
                </header>
                <Meter value={(c.points / 5) * 100} label={`${c.title}: ${c.points} of 5`} />
                <ul className="asg-crit__items">
                  {c.items.map((it) => (
                    <li key={it.label} className={it.pass ? 'is-pass' : 'is-miss'}>
                      <Icon name={it.pass ? 'check' : 'x'} strokeWidth={2.4} />
                      <span>
                        {it.label}
                        <span className="visually-hidden">{it.pass ? ', found' : ', not found'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {crit && <p className="asg-crit__level">Level 5 looks like: {crit.levels[5]}</p>}
              </motion.article>
            )
          })}
        </div>
      </section>

      <Disclosure title="Your submission" meta="Read only" icon="file">
        <div className="asg-example">
          <CodeBlock code={d.schema || ''} title="Schema" copy={false} />
          <CodeBlock code={d.queries || ''} title="Queries" copy={false} />
          <CodeBlock code={d.result || ''} title="Result" copy={false} />
          <div className="asg-example__just">
            <div className="asg-example__label">
              Shard key <code>{d.shardKey}</code>
            </div>
            <p>{d.justification}</p>
          </div>
        </div>
      </Disclosure>

      <Disclosure title="View rubric" meta="4 criteria · 20 points" icon="grid">
        <RubricTable />
      </Disclosure>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */

export default function Assignment() {
  const submittedAt = useStore((s) => s.assignment.submittedAt)
  const draft = useStore((s) => s.assignment.draft)
  const submitAssignment = useStore((s) => s.submitAssignment)
  const preview = useMemo(() => autoCheck(draft || {}), [draft])

  const onSubmit = () => {
    submitAssignment({ checks: preview.checks, score: preview.score })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <ActivityFrame id="assignment">
      <AnimatePresence mode="wait" initial={false}>
        {submittedAt ? (
          <Submitted key="done" />
        ) : (
          <motion.div
            key="form"
            className="asg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <Brief />
            <Prep />
            <Form onSubmit={onSubmit} />
          </motion.div>
        )}
      </AnimatePresence>
    </ActivityFrame>
  )
}
