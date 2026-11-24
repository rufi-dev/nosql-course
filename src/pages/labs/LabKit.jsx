// Shared UI pieces for Labs 2 to 5: mission checklist, ask-predict-verify
// gate, event log, debrief and small readouts.
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../../store.js'
import { LABS } from '../../data/course.js'
import Icon from '../../components/Icon.jsx'
import { APV, EASE_OUT, EASE_EXPO } from '../../components/ui.jsx'
import { fmtClock } from './sim-utils.js'
import './LabKit.css'

export function Mission({ lab, hints = {} }) {
  const def = LABS[lab]
  const cps = useStore((s) => s.labs?.[lab]?.checkpoints || {})
  const done = def.checkpoints.filter((c) => cps[c.id]).length
  return (
    <section className="lk-mission" aria-label="Mission checklist">
      <div className="lk-mission__head">
        <span className="kicker">Mission</span>
        <span className="lk-mission__count tabular">
          {done}/{def.checkpoints.length}
        </span>
      </div>
      <ol className="lk-mission__list">
        {def.checkpoints.map((c, i) => {
          const ok = Boolean(cps[c.id])
          return (
            <li key={c.id} className={`lk-mission__item ${ok ? 'is-done' : ''}`}>
              <span className="lk-mission__tick" aria-hidden="true">
                <AnimatePresence mode="wait" initial={false}>
                  {ok ? (
                    <motion.span
                      key="ok"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.35, ease: EASE_EXPO }}
                    >
                      <Icon name="check" strokeWidth={2.8} />
                    </motion.span>
                  ) : (
                    <motion.span key="n" className="lk-mission__num">
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="lk-mission__text">
                <span className="lk-mission__label">{c.label}</span>
                {hints[c.id] && !ok ? <span className="lk-mission__hint">{hints[c.id]}</span> : null}
              </span>
              <span className="visually-hidden">{ok ? 'done' : 'to do'}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// Ask -> Predict -> Verify where the verification comes from running the
// simulator, not from a reveal button.
//   correct: option id that is right for the current setup
//   verified: true once the simulator has shown the outcome
//   runHint: what to do after locking the prediction
export function PredictGate({ prompt, options, correct, verified, explain, runHint, onLock, title = 'Before you run it' }) {
  const [sel, setSel] = useState(null)
  const [locked, setLocked] = useState(false)
  const stage = !locked ? (sel ? 1 : 0) : verified ? 2 : 1
  const right = sel === correct
  return (
    <section className="lk-predict" aria-label="Ask, predict, verify">
      <div className="lk-predict__head">
        <span className="kicker kicker--ink">{title}</span>
        <APV stage={stage} />
      </div>
      <p className="lk-predict__prompt">{prompt}</p>
      <div className="lk-predict__options" role="radiogroup" aria-label="Your prediction">
        {options.map((o) => {
          const isSel = sel === o.id
          let state = ''
          if (locked && verified) state = o.id === correct ? 'option--correct' : isSel ? 'option--wrong' : ''
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={isSel}
              className={`option ${state}`}
              disabled={locked}
              onClick={() => setSel(o.id)}
            >
              <span className="option__mark">
                <Icon name={locked && verified && isSel && o.id !== correct ? 'x' : 'check'} strokeWidth={3} />
              </span>
              <span>{o.label}</span>
            </button>
          )
        })}
      </div>
      {!locked ? (
        <button
          type="button"
          className="btn btn--dark btn--sm lk-predict__lock"
          disabled={!sel}
          onClick={() => {
            setLocked(true)
            onLock?.(sel)
          }}
        >
          Lock in my prediction
        </button>
      ) : !verified ? (
        <div className="lk-predict__wait">
          <span className="lk-pulse" aria-hidden="true" />
          <span>
            <strong>Prediction locked.</strong> {runHint}
          </span>
        </div>
      ) : (
        <motion.div
          className={`callout ${right ? 'callout--success' : 'callout--warn'}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          <Icon name={right ? 'check-circle' : 'bulb'} />
          <div>
            <strong>{right ? 'Verified: the simulator agrees with you.' : 'The simulator disagrees.'}</strong> {explain}
          </div>
        </motion.div>
      )}
    </section>
  )
}

// events: [{ id, t, text, tone }] newest last; tone: info | ok | warn | bad | write | read
export function EventLog({ events, title = 'Event log', empty = 'Nothing has happened yet. Use the controls to start.', onClear }) {
  const list = [...events].reverse()
  return (
    <section className="lk-log" aria-label={title}>
      <div className="lk-log__head">
        <span className="kicker kicker--ink">{title}</span>
        {onClear && events.length ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <ol className="lk-log__list" aria-live="polite" aria-relevant="additions">
        {list.length === 0 ? <li className="lk-log__empty">{empty}</li> : null}
        <AnimatePresence initial={false}>
          {list.slice(0, 60).map((e) => (
            <motion.li
              key={e.id}
              className={`lk-log__row lk-log__row--${e.tone || 'info'}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <span className="lk-log__time tabular">{typeof e.t === 'number' ? fmtClock(e.t) : e.t}</span>
              <span className="lk-log__dot" aria-hidden="true" />
              <span className="lk-log__text">{e.text}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  )
}

export function Debrief({ show, title = 'What this means for the inventory', children }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.section
          className="lk-debrief"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE_EXPO }}
          aria-label={title}
        >
          <span className="lk-debrief__icon" aria-hidden="true">
            <Icon name="box" />
          </span>
          <div>
            <h3 className="lk-debrief__title">{title}</h3>
            <div className="lk-debrief__body">{children}</div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  )
}

export function Readout({ label, value, tone, sub }) {
  return (
    <div className={`lk-readout ${tone ? `lk-readout--${tone}` : ''}`}>
      <span className="lk-readout__label">{label}</span>
      <span className="lk-readout__value tabular">{value}</span>
      {sub ? <span className="lk-readout__sub">{sub}</span> : null}
    </div>
  )
}

export function ControlGroup({ label, children, hint, id }) {
  return (
    <div className="lk-control" role="group" aria-labelledby={id}>
      <span className="lk-control__label" id={id}>
        {label}
      </span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}
