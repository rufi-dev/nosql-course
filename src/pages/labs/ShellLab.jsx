import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import ActivityFrame from '../../components/ActivityFrame.jsx'
import Shell from '../../components/Shell.jsx'
import DocTag from '../../components/DocTag.jsx'
import CodeBlock, { Highlight } from '../../components/CodeBlock.jsx'
import Icon from '../../components/Icon.jsx'
import { APV, Meter, EASE_OUT, EASE_EXPO } from '../../components/ui.jsx'
import { useStore } from '../../store.js'
import { LABS } from '../../data/course.js'
import { createEngine, idKey } from '../../engine/mongo.js'
import { formatValue } from '../../engine/shell.js'
import './ShellLab.css'

const DB = 'inventory'
const COLL = 'products'
const EMPTY = {}
const LOW_QUERY = 'db.products.find({ stock: { $lt: 5 } })'

const SLIDE_7 = `db.products.insertMany([{_id:"p1",name:"Tea",stock:3,tags:["drink"]},{_id:"p2",name:"Rice",stock:12,tags:["food"]},{_id:"p3",name:"Coffee",stock:2,tags:["drink"]}]);
db.products.find({stock:{$lt:5}});
db.products.updateOne({_id:"p1"},{$inc:{stock:10}});`

const STEPS = [
  {
    id: 'insert',
    title: 'Insert three products',
    ask: 'The database is empty. After this insertMany runs, how many documents will db.products hold?',
    options: [
      { id: '3', label: '3 documents, one per product' },
      { id: '1', label: '1 document that holds the whole array' },
      { id: '0', label: '0, because the collection has to be created first' },
      { id: 'err', label: 'An error, because the database does not exist yet' },
    ],
    answer: '3',
    command: `db.products.insertMany([
  { _id: "p1", name: "Tea", stock: 3, tags: ["drink"] },
  { _id: "p2", name: "Rice", stock: 12, tags: ["food"] },
  { _id: "p3", name: "Coffee", stock: 2, tags: ["drink"] }
])`,
    explain:
      'insertMany stores each array element as its own document. Databases and collections are created on the first write, so there is no CREATE TABLE step. Each product keeps the _id you gave it, and that _id is its identity.',
  },
  {
    id: 'find-low',
    title: 'Find products with stock below 5',
    ask: 'Which products does find({ stock: { $lt: 5 } }) return? Look back at the stock values you inserted.',
    multi: true,
    options: [
      { id: 'tea', label: 'Tea' },
      { id: 'rice', label: 'Rice' },
      { id: 'coffee', label: 'Coffee' },
    ],
    answer: ['tea', 'coffee'],
    command: LOW_QUERY,
    explain:
      '$lt means strictly less than. Tea (3) and Coffee (2) qualify, Rice (12) does not. With no index on stock, the server has to check every document to answer this.',
  },
  {
    id: 'update',
    title: 'Restock Tea with updateOne',
    ask: 'After updateOne({ _id: "p1" }, { $inc: { stock: 10 } }), what is Tea’s stock?',
    options: [
      { id: '3', label: '3, updateOne only matches and changes nothing' },
      { id: '10', label: '10, $inc replaces the value' },
      { id: '13', label: '13, $inc adds 10 to the current 3' },
      { id: 'err', label: 'An error, stock can only be changed with $set' },
    ],
    answer: '13',
    command: 'db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } })',
    explain:
      '$inc adds to the current value on the server in one atomic step, so two tills restocking at the same moment cannot overwrite each other. matchedCount: 1 and modifiedCount: 1 confirm exactly one document changed.',
  },
  {
    id: 'verify',
    title: 'Re-run the query and verify',
    ask: 'Run the same low-stock query again. What comes back now?',
    options: [
      { id: 'tea-coffee', label: 'Tea and Coffee, same as before' },
      { id: 'coffee', label: 'Only Coffee' },
      { id: 'tea', label: 'Only Tea' },
      { id: 'none', label: 'Nothing' },
    ],
    answer: 'coffee',
    command: LOW_QUERY,
    explain:
      'Tea now holds 13 units, so it no longer matches. Reading your data back after a write is how you verify a change, instead of trusting the write result alone.',
  },
  {
    id: 'index',
    title: 'Index stock and read the plan',
    ask: 'After createIndex({ stock: 1 }), how does the server answer the low-stock query?',
    options: [
      { id: 'collscan', label: 'COLLSCAN: it still reads every document' },
      { id: 'ixscan', label: 'IXSCAN: it walks the stock index and fetches only the matches' },
      { id: 'err', label: 'An error: an existing collection cannot be indexed' },
    ],
    answer: 'ixscan',
    command: `db.products.createIndex({ stock: 1 })
db.products.find({ stock: { $lt: 5 } }).explain("executionStats")`,
    explain:
      'With { stock: 1 } the planner reads only the index keys below 5 and fetches those documents. Compare totalDocsExamined with the collection size: that gap is why indexes exist. The price is extra work on every write that touches stock.',
  },
]

const EXPERIMENTS = [
  {
    title: 'Break uniqueness',
    note: 'Insert a second document with _id "p1". Read the E11000 error.',
    code: 'db.products.insertOne({ _id: "p1", name: "Green tea", stock: 5 })',
  },
  {
    title: 'Match inside an array',
    note: 'tags is an array, yet a plain value matches any element.',
    code: 'db.products.find({ tags: { $in: ["drink"] } })',
  },
  {
    title: 'Sort and project',
    note: 'Lowest stock first, only the fields a shelf label needs.',
    code: 'db.products.find({}, { name: 1, stock: 1, _id: 0 }).sort({ stock: 1 })',
  },
  {
    title: 'Total stock per tag',
    note: 'An aggregation pipeline: unwind the tags, then group.',
    code: 'db.products.aggregate([\n  { $unwind: "$tags" },\n  { $group: { _id: "$tags", total: { $sum: "$stock" } } }\n])',
  },
  {
    title: 'Add a field to one product',
    note: 'No schema migration: only this document gets a supplier.',
    code: 'db.products.updateOne({ _id: "p2" }, { $set: { supplier: "Baltic Grains" } })',
  },
]

/* ---------------- detection helpers ---------------- */

const isLowStockFilter = (filter) => {
  if (!filter || typeof filter !== 'object') return false
  const keys = Object.keys(filter)
  if (keys.length !== 1 || keys[0] !== 'stock') return false
  const c = filter.stock
  if (!c || typeof c !== 'object') return false
  if (typeof c.$lt === 'number') return c.$lt > 3 && c.$lt <= 10
  if (typeof c.$lte === 'number') return c.$lte >= 3 && c.$lte < 10
  return false
}
const nameOf = (d) => (typeof d.name === 'string' ? d.name : String(d._id))
const namesToOption = (names) => {
  const set = new Set(names.map((n) => n.toLowerCase()))
  if (set.size === 2 && set.has('tea') && set.has('coffee')) return 'tea-coffee'
  if (set.size === 1 && set.has('coffee')) return 'coffee'
  if (set.size === 1 && set.has('tea')) return 'tea'
  if (set.size === 0) return 'none'
  return null
}
const sameAnswer = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = new Set([].concat(a || []))
    const y = new Set([].concat(b || []))
    return x.size === y.size && [...x].every((v) => y.has(v))
  }
  return a === b
}
const labelFor = (step, value) => {
  if (value === undefined || value === null) return null
  const vals = [].concat(value)
  return vals.map((v) => step.options.find((o) => o.id === v)?.label.split(',')[0] ?? v).join(', ')
}

/* ---------------- step card ---------------- */

function StepCard({ step, index, open, done, current, prediction, actual, onToggle, onLock, onLoad, onRun, onNext, isLast }) {
  const [sel, setSel] = useState(() => new Set())
  const locked = prediction !== undefined
  const correctValue = actual?.option ?? step.answer
  const verdict = locked && done ? sameAnswer(prediction, correctValue) : null
  const stage = done && locked ? 2 : locked ? 1 : 0

  const toggle = (id) => {
    if (locked) return
    setSel((prev) => {
      const next = new Set(step.multi ? prev : [])
      if (step.multi && prev.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <li className={`shl-step ${open ? 'is-open' : ''} ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}>
      <button type="button" className="shl-step__head" aria-expanded={open} onClick={onToggle}>
        <span className="shl-step__num" aria-hidden="true">
          {done ? (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35, ease: EASE_EXPO }}>
              <Icon name="check" strokeWidth={2.6} />
            </motion.span>
          ) : (
            String(index + 1).padStart(2, '0')
          )}
        </span>
        <span className="shl-step__title">{step.title}</span>
        <span className="shl-step__state">
          {done ? <span className="chip chip--done">Done</span> : current ? <span className="chip chip--accent">Next</span> : null}
          <Icon name="chevron-down" className="shl-step__chev" />
        </span>
      </button>

      <div className="shl-step__body" inert={!open}>
        <div className="shl-step__inner">
          <div className="shl-step__content">
            <APV stage={stage} />
            <p className="shl-step__ask">{step.ask}</p>

            <div className="shl-step__options" role={step.multi ? 'group' : 'radiogroup'} aria-label="Your prediction">
              {step.options.map((o) => {
                const chosen = locked ? [].concat(prediction).includes(o.id) : sel.has(o.id)
                const isRight = [].concat(correctValue).includes(o.id)
                const tone = done && locked ? (isRight ? 'option--correct' : chosen ? 'option--wrong' : '') : ''
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={step.multi ? 'checkbox' : 'radio'}
                    aria-checked={chosen}
                    disabled={locked}
                    className={`option ${step.multi ? 'option--multi' : ''} ${tone}`}
                    onClick={() => toggle(o.id)}
                  >
                    <span className="option__mark">
                      <Icon name={tone === 'option--wrong' ? 'x' : 'check'} strokeWidth={3} />
                    </span>
                    <span>{o.label}</span>
                  </button>
                )
              })}
            </div>

            {!locked ? (
              <div className="shl-step__actions">
                <button
                  type="button"
                  className="btn btn--dark btn--sm"
                  disabled={!sel.size}
                  onClick={() => onLock(step.multi ? [...sel] : [...sel][0])}
                >
                  Lock in my prediction
                </button>
                <span className="hint">{step.multi ? 'Select all that apply. ' : ''}The command appears once you commit.</span>
              </div>
            ) : (
              <motion.div
                className="shl-step__cmd"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                <CodeBlock code={step.command} title="Command" />
                <div className="shl-step__actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => onRun(step.command)}>
                    <Icon name="play" />
                    Run it
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => onLoad(step.command)}>
                    <Icon name="terminal" />
                    Load into shell
                  </button>
                  {!done && <span className="hint">Waiting for the shell to confirm this step.</span>}
                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {done && (
                <motion.div
                  className="shl-verify"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE_EXPO }}
                >
                  <div className="shl-verify__grid">
                    <div className="shl-verify__cell">
                      <span className="shl-verify__label">You predicted</span>
                      <span className="shl-verify__value">{locked ? labelFor(step, prediction) : 'No prediction recorded'}</span>
                    </div>
                    <div className="shl-verify__cell">
                      <span className="shl-verify__label">The shell returned</span>
                      <span className="shl-verify__value">{actual?.text ?? 'Confirmed in an earlier session'}</span>
                    </div>
                  </div>
                  <div className={`callout ${verdict === false ? 'callout--warn' : 'callout--success'}`}>
                    <Icon name={verdict === false ? 'bulb' : 'check-circle'} />
                    <div>
                      <strong>{verdict === null ? 'Verified.' : verdict ? 'Your prediction held.' : 'Your prediction missed. Here is why.'}</strong>{' '}
                      {step.explain}
                    </div>
                  </div>
                  {!isLast && (
                    <button type="button" className="btn btn--sm shl-verify__next" onClick={onNext}>
                      Next step
                      <Icon name="arrow-right" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </li>
  )
}

/* ---------------- collection view ---------------- */

function CollectionView({ engine, view, onReset }) {
  const dbName = engine.currentDb
  const { docs, indexes } = engine.peek(dbName, COLL)
  const lf = view.lastFind
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(false), 3500)
    return () => clearTimeout(t)
  }, [confirm])

  return (
    <section className="shl-coll" aria-label="Collection view">
      <header className="shl-coll__head">
        <div className="shl-coll__titles">
          <span className="kicker kicker--ink">Collection view</span>
          <h3 className="shl-coll__title">
            <span className="mono">
              {dbName}.{COLL}
            </span>
            <span className="chip chip--mono">
              {docs.length} doc{docs.length === 1 ? '' : 's'}
            </span>
          </h3>
        </div>
        <button
          type="button"
          className={`btn btn--sm ${confirm ? 'btn--danger' : 'btn--ghost'}`}
          onClick={() => {
            if (confirm) {
              setConfirm(false)
              onReset()
            } else setConfirm(true)
          }}
        >
          <Icon name="reset" />
          {confirm ? 'Click again to erase' : 'Reset database'}
        </button>
      </header>

      <div className="shl-coll__meta">
        <span className="shl-coll__metalabel">Indexes</span>
        <AnimatePresence initial={false}>
          {(indexes.length ? indexes : [{ name: '_id_' }]).map((ix) => (
            <motion.span
              key={ix.name}
              className={`chip chip--mono ${ix.name === '_id_' ? 'chip--outline' : 'chip--info'}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, ease: EASE_EXPO }}
            >
              {ix.name}
            </motion.span>
          ))}
        </AnimatePresence>
        {view.plan && (
          <span className={`chip ${view.plan.stage === 'IXSCAN' ? 'chip--done' : 'chip--warn'}`}>
            {view.plan.stage} · {view.plan.examined} of {view.plan.total} docs read
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {lf && (
          <motion.div
            className="shl-coll__query"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <span className="shl-coll__metalabel">Last find</span>
            <code className="shl-coll__filter">
              <Highlight code={formatValue(lf.filter)} />
            </code>
            <span className="shl-coll__count">
              {lf.count} of {docs.length} matched
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {docs.length === 0 ? (
        <div className="shl-coll__empty">
          <span className="shl-coll__shelf" aria-hidden="true" />
          <p>
            <strong>No documents yet.</strong> Run step 1 and three product tags drop onto this shelf.
          </p>
        </div>
      ) : (
        <div className="shl-coll__grid">
          <AnimatePresence mode="popLayout" initial={false}>
            {docs.map((d) => {
              const k = idKey(d._id)
              const state = view.newIds.has(k) ? 'new' : lf ? (lf.ids.has(k) ? 'match' : 'dim') : undefined
              return (
                <motion.div
                  key={k}
                  layout
                  initial={{ opacity: 0, y: -22, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.5, ease: EASE_EXPO }}
                >
                  <DocTag doc={d} state={state} changed={view.changed[k] || []} compact />
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
      <ul className="shl-coll__legend" aria-label="Legend">
        <li>
          <span className="shl-dot shl-dot--new" /> just inserted
        </li>
        <li>
          <span className="shl-dot shl-dot--match" /> matched the last find
        </li>
        <li>
          <span className="shl-dot shl-dot--changed" /> field changed
        </li>
      </ul>
    </section>
  )
}

/* ---------------- page ---------------- */

const freshView = () => ({ newIds: new Set(), changed: {}, lastFind: null, plan: null })

export default function ShellLab() {
  const lab = LABS.shell
  const checkpoints = useStore((s) => s.labs.shell?.checkpoints) || EMPTY
  const data = useStore((s) => s.labs.shell?.data) || EMPTY
  const predictions = data.predictions || EMPTY
  const actuals = data.actuals || EMPTY
  const doneCount = lab.checkpoints.filter((c) => checkpoints[c.id]).length

  const engine = useMemo(() => {
    const e = createEngine({ db: DB })
    const snap = useStore.getState().labs.shell?.data?.snapshot
    if (snap) {
      try {
        e.restore(snap)
      } catch {
        /* corrupt snapshot: start empty */
      }
    }
    return e
  }, [])

  const shellRef = useRef(null)
  const shellWrapRef = useRef(null)
  const seen = useRef(engine.seq)
  const [view, setView] = useState(freshView)
  const [openId, setOpenId] = useState(null)
  const [copied, setCopied] = useState(false)
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const currentId = STEPS.find((s) => !checkpoints[s.id])?.id ?? null
  const activeId = openId === undefined ? null : openId ?? currentId

  const handleResult = useCallback(
    (entries, eng) => {
      const ops = eng.opsSince(seen.current)
      seen.current = eng.seq
      const st = useStore.getState()
      const cps = { ...(st.labs.shell?.checkpoints || {}) }
      const prev = st.labs.shell?.data || {}
      const nextActuals = { ...(prev.actuals || {}) }
      let awaitVerify = Boolean(prev.awaitVerify)
      let summary = prev.summary || null
      const hits = []
      const hit = (id) => {
        if (!cps[id] && !hits.includes(id)) {
          hits.push(id)
          cps[id] = true
        }
      }

      const newIds = new Set()
      const changed = {}
      let lastFind
      let plan

      for (const op of ops) {
        if (op.type === 'reset' || op.type === 'dropDatabase' || (op.type === 'drop' && op.coll === COLL)) {
          lastFind = null
          continue
        }
        if (op.coll !== COLL) continue
        if (op.type === 'insert') {
          op.ids.forEach((id) => newIds.add(idKey(id)))
          lastFind = null
          const count = eng.peek(op.db, COLL).docs.length
          if (count >= 3) {
            if (!cps.insert) nextActuals.insert = { text: `${count} documents in ${op.db}.${COLL}`, option: String(count) }
            hit('insert')
          }
        } else if (op.type === 'update') {
          Object.assign(changed, op.changed)
          lastFind = null
          const restocked = op.ids.filter((id) => {
            const k = idKey(id)
            const b = op.before?.[k]
            const a = op.after?.[k]
            return typeof b?.stock === 'number' && typeof a?.stock === 'number' && a.stock > b.stock
          })
          if (restocked.length) {
            const k = idKey(restocked[0])
            const after = op.after[k]
            nextActuals.update = {
              text: `${nameOf(after)} stock is now ${after.stock} (was ${op.before[k].stock})`,
              option: nameOf(after).toLowerCase() === 'tea' ? String(after.stock) : null,
            }
            hit('update')
            awaitVerify = true
          }
        } else if (op.type === 'delete') {
          lastFind = null
        } else if (op.type === 'find') {
          lastFind = { ids: new Set(op.ids.map(idKey)), filter: op.filter, count: op.count }
          if (isLowStockFilter(op.filter) && op.count > 0 && op.docs) {
            const names = op.docs.map(nameOf)
            const text = names.join(', ')
            summary = {
              schema: formatValue(eng.peek(op.db, COLL).docs[0] ?? op.docs[0]),
              query: `db.${COLL}.find(${formatValue(op.filter)})`,
              result: formatValue(op.docs),
              at: Date.now(),
            }
            if (!cps['find-low']) {
              nextActuals['find-low'] = { text, option: names.map((n) => n.toLowerCase()) }
              hit('find-low')
            } else if (awaitVerify && cps.update && !cps.verify) {
              // the first low-stock find after a restock verifies the change
              nextActuals.verify = { text, option: namesToOption(names) }
              hit('verify')
              awaitVerify = false
            }
          }
        } else if (op.type === 'explain') {
          plan = { stage: op.stage, examined: op.totalDocsExamined, total: op.collectionSize, index: op.indexName }
          if (op.stage === 'IXSCAN' && op.indexKey && 'stock' in op.indexKey) {
            nextActuals.index = {
              text: `IXSCAN on ${op.indexName}: read ${op.totalDocsExamined} of ${op.collectionSize} documents`,
              option: 'ixscan',
            }
            hit('index')
          }
        }
      }

      setView((v) => ({
        newIds,
        changed,
        lastFind: lastFind === undefined ? v.lastFind : lastFind,
        plan: plan ?? v.plan,
      }))
      if (newIds.size || Object.keys(changed).length) {
        timers.current.push(
          setTimeout(() => setView((v) => ({ ...v, newIds: new Set(), changed: {} })), 1900),
        )
      }

      st.setLabData('shell', { snapshot: eng.snapshot(), actuals: nextActuals, awaitVerify, summary })
      hits.forEach((id) => st.setLabCheckpoint('shell', id))
    },
    [],
  )

  const lockPrediction = (stepId, value) => {
    // pin the step open so its Verify panel stays visible once the shell confirms it
    setOpenId(stepId)
    useStore.getState().setLabData('shell', { predictions: { ...predictions, [stepId]: value } })
  }

  const revealShell = () => {
    if (window.matchMedia('(max-width: 1100px)').matches) {
      shellWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
  const loadCommand = (code) => {
    shellRef.current?.setInput(code)
    revealShell()
  }
  const runCommand = (code) => {
    shellRef.current?.run(code)
    revealShell()
  }

  const resetDb = () => {
    engine.reset()
    engine.use(DB)
    seen.current = engine.seq
    setView(freshView())
    useStore.getState().setLabData('shell', { snapshot: engine.snapshot(), awaitVerify: false })
    shellRef.current?.clear()
    shellRef.current?.print('Database reset. inventory.products is empty again. Your checkpoints are kept.', 'info')
  }

  const copySummary = async () => {
    const s = data.summary
    if (!s) return
    const text = `Schema (one product document)\n${s.schema}\n\nQuery\n${s.query}\n\nResult\n${s.result}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <ActivityFrame id="lab-shell">
      <div className="shl">
        <section className="shl-brief" aria-label="Lab brief">
          <div className="shl-brief__case">
            <span className="kicker kicker--on-dark">Running case</span>
            <p className="shl-brief__text">
              The corner shop keeps its inventory in one collection. Build it from an empty database, find what is about to
              run out, restock it, and prove the change. Predict every result before you run it.
            </p>
            <div className="shl-brief__chips">
              <span className="shl-brief__chip">
                database <b>inventory</b>
              </span>
              <span className="shl-brief__chip">
                collection <b>products</b>
              </span>
              <span className="shl-brief__chip">engine runs in your browser</span>
            </div>
          </div>
          <div className="shl-brief__progress">
            <div className="shl-brief__count">
              <span className="shl-brief__big tabular">{doneCount}</span>
              <span>
                of {lab.checkpoints.length}
                <br />
                checkpoints
              </span>
            </div>
            <Meter value={(doneCount / lab.checkpoints.length) * 100} dark label="Lab 1 checkpoints" />
            <button type="button" className="btn btn--on-dark btn--sm" onClick={() => loadCommand(SLIDE_7)}>
              <Icon name="copy" />
              Load the slide 7 example
            </button>
          </div>
        </section>

        <div className="shl-main">
          <div className="shl-mission">
            <div className="shl-mission__head">
              <h2 className="shl-h2">Mission</h2>
              <span className="faint">Ask, predict, verify. Five steps.</span>
            </div>
            <ol className="shl-steps">
              {STEPS.map((s, i) => (
                <StepCard
                  key={s.id}
                  step={s}
                  index={i}
                  open={activeId === s.id}
                  done={Boolean(checkpoints[s.id])}
                  current={currentId === s.id}
                  prediction={predictions[s.id]}
                  actual={actuals[s.id]}
                  isLast={i === STEPS.length - 1}
                  onToggle={() => setOpenId(activeId === s.id ? undefined : s.id)}
                  onLock={(v) => lockPrediction(s.id, v)}
                  onLoad={loadCommand}
                  onRun={runCommand}
                  onNext={() => setOpenId(STEPS[i + 1]?.id ?? null)}
                />
              ))}
            </ol>
            {doneCount === lab.checkpoints.length && (
              <motion.div
                className="callout callout--success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE_EXPO }}
              >
                <Icon name="award" />
                <div>
                  <strong>Lab 1 complete.</strong> You built, queried, changed and indexed a collection. Keep the shell open
                  for the experiments below, or move on to mapping a shard key.
                </div>
              </motion.div>
            )}
          </div>

          <div className="shl-work">
            <div ref={shellWrapRef} className="shl-shellwrap">
              <Shell
                ref={shellRef}
                engine={engine}
                onResult={handleResult}
                minHeight={200}
                maxHeight={380}
                welcome="Connected to inventory, an in-browser MongoDB-style database. Type help for commands."
              />
            </div>
            <CollectionView engine={engine} view={view} onReset={resetDb} />
          </div>
        </div>

        <div className="shl-extras">
          <section className="shl-panel" aria-labelledby="shl-exp">
            <div className="shl-panel__head">
              <h2 id="shl-exp" className="shl-h2">
                Free experiments
              </h2>
              <span className="chip chip--outline">Not graded</span>
            </div>
            <ul className="shl-exps">
              {EXPERIMENTS.map((x) => (
                <li key={x.title} className="shl-exp">
                  <div className="shl-exp__text">
                    <span className="shl-exp__title">{x.title}</span>
                    <span className="shl-exp__note">{x.note}</span>
                    <code className="shl-exp__code">
                      <Highlight code={x.code.replace(/\n\s*/g, ' ')} />
                    </code>
                  </div>
                  <button type="button" className="btn btn--sm" onClick={() => loadCommand(x.code)} aria-label={`Load: ${x.title}`}>
                    Load
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="shl-panel shl-panel--real" aria-labelledby="shl-real">
            <div className="shl-panel__head">
              <h2 id="shl-real" className="shl-h2">
                Now on a real MongoDB
              </h2>
            </div>
            <p className="muted">
              This shell is a teaching engine. Paste the same commands into a real MongoDB playground and check that every
              result matches what you saw here.
            </p>
            <a className="btn btn--dark" href="https://play.db-ai.dev/" target="_blank" rel="noreferrer">
              Open DB AI MongoDB Playground
              <Icon name="external" />
            </a>
            <div className="shl-handoff">
              <span className="shl-coll__metalabel">Bring to the assignment</span>
              <ol className="shl-handoff__list">
                <li>
                  <b>Schema:</b> one product document
                </li>
                <li>
                  <b>Query:</b> the low-stock find
                </li>
                <li>
                  <b>Result:</b> what it returned before and after the restock
                </li>
              </ol>
              <button type="button" className="btn btn--sm" onClick={copySummary} disabled={!data.summary}>
                <Icon name={copied ? 'check' : 'copy'} />
                {copied ? 'Copied' : data.summary ? 'Copy my schema, query and result' : 'Run the low-stock query first'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </ActivityFrame>
  )
}
