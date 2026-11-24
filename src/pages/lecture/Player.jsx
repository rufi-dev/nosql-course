// Timeline-driven lecture player: stage, captions, scrubber, controls,
// embedded questions. The clock is a tiny external store so only the parts
// that depend on time re-render each frame.
/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useStore, LECTURE_BUCKET } from '../../store.js'
import Icon from '../../components/Icon.jsx'
import { Predict, EASE_EXPO } from '../../components/ui.jsx'
import { FxContext, makeFx, W, H } from './kit.jsx'
import { ShopScene, ModelsScene, WorkloadScene, PathScene } from './Lecture1Scenes.jsx'
import { CitiesScene, ReplicationScene, PartitionScene, TwoPCScene } from './Lecture2Scenes.jsx'
import './scenes.css'

const SCENES = {
  shop: ShopScene,
  models: ModelsScene,
  workload: WorkloadScene,
  path: PathScene,
  cities: CitiesScene,
  replication: ReplicationScene,
  partition: PartitionScene,
  twopc: TwoPCScene,
}

export class Clock {
  constructor(duration, t = 0) {
    this.duration = duration
    this.t = t
    this.playing = false
    this.rate = 1
    this.subs = new Set()
  }
  subscribe = (fn) => {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }
  emit() {
    this.subs.forEach((f) => f())
  }
  seek(t) {
    this.t = Math.max(0, Math.min(this.duration, t))
    this.emit()
  }
  setPlaying(p) {
    if (this.playing === p) return
    this.playing = p
    this.emit()
  }
  setRate(r) {
    this.rate = r
    this.emit()
  }
}

export function useClockValue(clock, select) {
  return useSyncExternalStore(clock.subscribe, () => select(clock))
}

export const fmtTime = (s) => {
  const v = Math.max(0, Math.floor(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

export function cueIndexAt(cues, t) {
  let idx = -1
  for (let i = 0; i < cues.length; i++) {
    if (t >= cues[i].start) idx = i
    else break
  }
  return idx
}

export function chapterIndexAt(chapters, t) {
  let idx = 0
  for (let i = 0; i < chapters.length; i++) if (t >= chapters[i].t) idx = i
  return idx
}

/* ---------------- Stage ---------------- */

function SceneBox({ id, t, style }) {
  const Comp = SCENES[id]
  return (
    <div className="lec-scene" style={style}>
      {Comp ? <Comp t={t} /> : null}
    </div>
  )
}

function StageFrame({ lecture, clock, reduce }) {
  const t = useClockValue(clock, (c) => c.t)
  const fx = useMemo(() => makeFx(reduce), [reduce])
  const scenes = lecture.scenes
  let idx = scenes.findIndex((s) => t >= s.start && t < s.end)
  if (idx === -1) idx = scenes.length - 1
  const sc = scenes[idx]
  const local = t - sc.start
  const XF = 0.9
  const prev = idx > 0 && local < XF ? scenes[idx - 1] : null
  const k = prev ? fx.ramp(local, 0, XF) : 1
  return (
    <FxContext.Provider value={fx}>
      {prev && <SceneBox id={prev.id} t={prev.end - prev.start} style={{ opacity: 1 - k }} />}
      <SceneBox
        id={sc.id}
        t={local}
        style={{
          opacity: k,
          transform: !reduce && k < 1 ? `scale(${(1.02 - 0.02 * k).toFixed(4)})` : undefined,
          filter: !reduce && k < 0.98 ? `blur(${((1 - k) * 6).toFixed(2)}px)` : undefined,
        }}
      />
    </FxContext.Provider>
  )
}

function Viewport({ children, onSize }) {
  const ref = useRef(null)
  const [box, setBox] = useState({ s: 1, x: 0, y: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const s = Math.min(w / W, h / H)
      setBox({ s, x: (w - W * s) / 2, y: (h - H * s) / 2 })
      onSize?.(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onSize])
  return (
    <div className="lec-viewport" ref={ref}>
      <div className="lec-canvas" style={{ transform: `translate(${box.x}px, ${box.y}px) scale(${box.s})` }}>
        {children}
      </div>
    </div>
  )
}

/* ---------------- Captions ---------------- */

function Captions({ lecture, clock }) {
  const idx = useClockValue(clock, (c) => {
    const i = cueIndexAt(lecture.cues, c.t)
    return i >= 0 && c.t < lecture.cues[i].end ? i : -1
  })
  const cue = idx >= 0 ? lecture.cues[idx] : null
  const words = cue ? cue.text.split(' ') : []
  return (
    <div className="lec-captions" aria-hidden="true">
      {cue ? (
        <p key={idx} className="lec-captions__text">
          {words.map((w, i) => (
            <span key={i}>
              <span className="lec-captions__word" style={{ animationDelay: `${Math.min(i * 28, 700)}ms` }}>
                {w}
              </span>{' '}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
}

/* ---------------- Scrubber ---------------- */

function Scrubber({ lecture, clock, answered, onSeek }) {
  const t = useClockValue(clock, (c) => c.t)
  const ref = useRef(null)
  const dragging = useRef(false)
  const [hover, setHover] = useState(null)
  const d = lecture.duration

  const timeFromEvent = (e) => {
    const r = ref.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d
  }
  const onKeyDown = (e) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = t + 5
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = t - 5
    else if (e.key === 'PageUp') next = t + 30
    else if (e.key === 'PageDown') next = t - 30
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = d
    if (next !== null) {
      e.preventDefault()
      e.stopPropagation()
      onSeek(next)
    }
  }
  const chapter = (time) => lecture.chapters[chapterIndexAt(lecture.chapters, time)]

  return (
    <div
      ref={ref}
      className="lec-scrub"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(d)}
      aria-valuenow={Math.round(t)}
      aria-valuetext={`${fmtTime(t)} of ${fmtTime(d)}, ${chapter(t).title}`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        onSeek(timeFromEvent(e))
      }}
      onPointerMove={(e) => {
        const time = timeFromEvent(e)
        setHover(time)
        if (dragging.current) onSeek(time)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div className="lec-scrub__track">
        <div className="lec-scrub__fill" style={{ transform: `scaleX(${t / d})` }} />
        {hover !== null && <div className="lec-scrub__ghost" style={{ transform: `scaleX(${hover / d})` }} />}
      </div>
      {lecture.chapters.slice(1).map((c) => (
        <span key={c.t} className="lec-scrub__tick" style={{ left: `${(c.t / d) * 100}%` }} />
      ))}
      {lecture.questions.map((q) => (
        <span
          key={q.id}
          className={`lec-scrub__q ${answered[q.id] ? 'is-done' : ''}`}
          style={{ left: `${(q.t / d) * 100}%` }}
          title={`Question at ${fmtTime(q.t)}`}
        />
      ))}
      <span className="lec-scrub__thumb" style={{ left: `${(t / d) * 100}%` }} />
      {hover !== null && (
        <span className="lec-scrub__tip" style={{ left: `${(hover / d) * 100}%` }}>
          <strong>{fmtTime(hover)}</strong> {chapter(hover).title}
        </span>
      )}
    </div>
  )
}

function TimeLabel({ clock, duration }) {
  const s = useClockValue(clock, (c) => Math.floor(c.t))
  return (
    <span className="lec-time tabular">
      {fmtTime(s)} <span className="lec-time__sep">/</span> {fmtTime(duration)}
    </span>
  )
}

function ChapterLabel({ lecture, clock }) {
  const i = useClockValue(clock, (c) => chapterIndexAt(lecture.chapters, c.t))
  return <span className="lec-chaptername">{lecture.chapters[i].title}</span>
}

/* ---------------- Player ---------------- */

const RATES = [1, 1.25, 1.5]
const EMPTY = {}

export default function Player({ lecture, clock, activeQ, setActiveQ, next }) {
  const reduce = useReducedMotion()
  const wrapRef = useRef(null)
  const shown = useRef(new Set())
  const playing = useClockValue(clock, (c) => c.playing)
  const rate = useClockValue(clock, (c) => c.rate)
  const atStart = useClockValue(clock, (c) => c.t < 0.05)
  const ended = useClockValue(clock, (c) => c.t >= c.duration - 0.02)
  const cueIdx = useClockValue(clock, (c) => cueIndexAt(lecture.cues, c.t))
  const [captions, setCaptions] = useState(true)
  const [readAloud, setReadAloud] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [stageW, setStageW] = useState(900)
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
  const answers = useStore((s) => s.lectures[lecture.id]?.answers || EMPTY)
  const setProgress = useStore((s) => s.setLectureProgress)
  const markWatched = useStore((s) => s.markLectureWatched)
  const answerQ = useStore((s) => s.answerLectureQuestion)
  const compact = stageW < 700

  const save = useCallback(() => setProgress(lecture.id, Math.round(clock.t * 10) / 10), [clock, lecture.id, setProgress])

  // Main clock loop
  useEffect(() => {
    if (!playing) return
    let raf
    let last = performance.now()
    let lastSave = last
    let lastBucket = -1
    const credit = (t) => {
      const b = Math.floor(Math.min(t, clock.duration - 0.001) / LECTURE_BUCKET)
      if (b !== lastBucket) {
        lastBucket = b
        markWatched(lecture.id, b)
      }
    }
    credit(clock.t)
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const prev = clock.t
      const nextT = prev + dt * clock.rate
      const stored = useStore.getState().lectures[lecture.id]?.answers || {}
      const q = lecture.questions.find((x) => prev < x.t && nextT >= x.t && !stored[x.id] && !shown.current.has(x.id))
      if (q) {
        shown.current.add(q.id)
        clock.seek(q.t)
        clock.setPlaying(false)
        setActiveQ(q)
        save()
        return
      }
      if (nextT >= clock.duration) {
        credit(clock.duration)
        clock.seek(clock.duration)
        clock.setPlaying(false)
        save()
        return
      }
      clock.seek(nextT)
      credit(nextT)
      if (now - lastSave > 1000) {
        lastSave = now
        save()
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, clock, lecture, save, setActiveQ, markWatched])

  // Pause when the tab is hidden; save on unmount
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        clock.setPlaying(false)
        save()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      save()
    }
  }, [clock, save])

  // Fullscreen state
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // Read aloud
  useEffect(() => {
    if (!canSpeak) return
    const synth = window.speechSynthesis
    if (!readAloud || !playing || cueIdx < 0) {
      synth.cancel()
      return
    }
    const cue = lecture.cues[cueIdx]
    if (clock.t > cue.end) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(cue.text)
    u.lang = 'en-GB'
    u.rate = Math.min(1.6, 0.98 * rate)
    synth.speak(u)
  }, [readAloud, playing, cueIdx, rate, canSpeak, lecture, clock])
  useEffect(() => () => canSpeak && window.speechSynthesis.cancel(), [canSpeak])

  const play = () => {
    if (activeQ) return
    if (clock.t >= clock.duration - 0.02) clock.seek(0)
    clock.setPlaying(true)
  }
  const pause = () => {
    clock.setPlaying(false)
    save()
  }
  const toggle = () => (clock.playing ? pause() : play())
  const seek = (time) => {
    if (activeQ) setActiveQ(null)
    clock.seek(time)
  }
  const toggleFs = () => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    else el.requestFullscreen?.()
  }
  const cycleRate = () => clock.setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])

  const onKeyDown = (e) => {
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const onControl = e.target.closest?.('button, a, [role="radio"], [role="checkbox"]')
    const k = e.key.toLowerCase()
    if ((k === ' ' && !onControl) || k === 'k') {
      e.preventDefault()
      toggle()
    } else if (k === 'arrowright' && !onControl) {
      e.preventDefault()
      seek(clock.t + 5)
    } else if (k === 'arrowleft' && !onControl) {
      e.preventDefault()
      seek(clock.t - 5)
    } else if (k === 'c') {
      setCaptions((c) => !c)
    } else if (k === 'f') {
      toggleFs()
    }
  }

  const continueAfterQ = () => {
    setActiveQ(null)
    clock.setPlaying(true)
  }

  const qPanel = activeQ ? (
    <div className={`lec-qpanel ${compact ? 'lec-qpanel--below' : ''}`}>
      <div className="lec-qpanel__head">
        <span className="lec-qpanel__label">Question in the lecture · {fmtTime(activeQ.t)}</span>
      </div>
      <Predict
        key={activeQ.id}
        prompt={activeQ.prompt}
        options={activeQ.options}
        correct={activeQ.correct}
        explain={activeQ.explain}
        initial={answers[activeQ.id]}
        onAnswer={(choice) => answerQ(lecture.id, activeQ.id, choice)}
        compact
      />
      <div className="lec-qpanel__actions">
        {answers[activeQ.id] ? (
          <button type="button" className="btn btn--primary" onClick={continueAfterQ}>
            <Icon name="play" />
            Continue the lecture
          </button>
        ) : (
          <button type="button" className="btn btn--on-dark btn--sm" onClick={continueAfterQ}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  ) : null

  return (
    <div
      ref={wrapRef}
      className={`lec-player ${fullscreen ? 'is-fullscreen' : ''} ${playing ? 'is-playing' : ''}`}
      onKeyDown={onKeyDown}
      tabIndex={-1}
      aria-label={`Lecture ${lecture.number}: ${lecture.title}`}
      role="region"
    >
      <div className="lec-stage">
        <div
          className="lec-stage__click"
          onClick={() => (activeQ || ended ? null : toggle())}
          aria-hidden="true"
        >
          <Viewport onSize={setStageW}>
            <StageFrame lecture={lecture} clock={clock} reduce={Boolean(reduce)} />
          </Viewport>
        </div>

        <AnimatePresence>
          {!playing && !activeQ && !ended && (
            <motion.div
              key="paused"
              className={`lec-poster ${atStart ? 'is-start' : ''}`}
              onClick={play}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.3 }}
            >
              {atStart && !compact && (
                <div className="lec-poster__title">
                  <span className="lec-kicker">Lecture {lecture.number}</span>
                  <h2>{lecture.title}</h2>
                  <span className="lec-poster__meta">
                    {fmtTime(lecture.duration)} · {lecture.questions.length} questions inside · captions on
                  </span>
                </div>
              )}
              <button type="button" className="lec-bigplay" onClick={play} aria-label={atStart ? 'Play lecture' : 'Resume lecture'}>
                <Icon name="play" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeQ && !compact && (
            <motion.div
              key="q"
              className="lec-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
              transition={{ duration: 0.35, ease: EASE_EXPO }}
            >
              <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: EASE_EXPO }}>
                {qPanel}
              </motion.div>
            </motion.div>
          )}
          {activeQ && compact && (
            <motion.div key="qs" className="lec-overlay lec-overlay--hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="lec-pill lec-pill--saffron">Question: answer below</span>
            </motion.div>
          )}
          {ended && !activeQ && (
            <motion.div
              key="end"
              className="lec-overlay lec-overlay--end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.4 }}
            >
              <div className="lec-end">
                <span className="lec-kicker">Lecture complete</span>
                {next && (
                  <Link to={next.path} className="lec-upnext">
                    <span className="lec-upnext__label">Up next</span>
                    <strong>{next.short}</strong>
                    <span className="lec-upnext__meta">
                      {next.minutes} min <Icon name="arrow-right" />
                    </span>
                  </Link>
                )}
                <button type="button" className="btn btn--on-dark btn--sm" onClick={() => { clock.seek(0); clock.setPlaying(true) }}>
                  <Icon name="reset" />
                  Replay
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {compact && qPanel}

      {captions && <Captions lecture={lecture} clock={clock} />}

      <div className="lec-controls">
        <Scrubber lecture={lecture} clock={clock} answered={answers} onSeek={seek} />
        <div className="lec-controls__row">
          <button
            type="button"
            className="lec-ctl lec-ctl--play"
            onClick={toggle}
            aria-label={playing ? 'Pause (K)' : 'Play (K)'}
            disabled={Boolean(activeQ)}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button type="button" className="lec-ctl" onClick={() => seek(clock.t - 5)} aria-label="Back 5 seconds">
            <SkipIcon dir="back" />
          </button>
          <button type="button" className="lec-ctl" onClick={() => seek(clock.t + 5)} aria-label="Forward 5 seconds">
            <SkipIcon dir="fwd" />
          </button>
          <TimeLabel clock={clock} duration={lecture.duration} />
          <ChapterLabel lecture={lecture} clock={clock} />
          <span className="lec-controls__spacer" />
          <button type="button" className="lec-ctl lec-ctl--text" onClick={cycleRate} aria-label={`Playback speed ${rate} times`}>
            {rate}×
          </button>
          <button
            type="button"
            className={`lec-ctl ${captions ? 'is-on' : ''}`}
            onClick={() => setCaptions((c) => !c)}
            aria-pressed={captions}
            aria-label="Captions (C)"
          >
            <Icon name="captions" />
          </button>
          {canSpeak && (
            <button
              type="button"
              className={`lec-ctl ${readAloud ? 'is-on' : ''}`}
              onClick={() => setReadAloud((r) => !r)}
              aria-pressed={readAloud}
              aria-label="Read captions aloud"
              title="Read captions aloud"
            >
              <Icon name="volume" />
            </button>
          )}
          <button
            type="button"
            className="lec-ctl"
            onClick={toggleFs}
            aria-label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
          >
            <Icon name={fullscreen ? 'minimize' : 'maximize'} />
          </button>
        </div>
      </div>
    </div>
  )
}

function SkipIcon({ dir }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'back' ? (
        <>
          <path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" />
          <path d="M4.5 4.5v4h4" />
        </>
      ) : (
        <>
          <path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4" />
          <path d="M19.5 4.5v4h-4" />
        </>
      )}
      <text x="12" y="15.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="var(--font-sans)">
        5
      </text>
    </svg>
  )
}
