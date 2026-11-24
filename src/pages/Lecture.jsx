import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import { EASE_EXPO } from '../components/ui.jsx'
import { useStore, lectureWatchedPct } from '../store.js'
import { ACTIVITIES, activityIndex } from '../data/course.js'
import { LECTURES } from '../data/lectures.js'
import Player, { Clock, useClockValue, cueIndexAt, chapterIndexAt, fmtTime } from './lecture/Player.jsx'
import './Lecture.css'

const EMPTY = {}

export default function Lecture() {
  const { lectureId } = useParams()
  const lecture = LECTURES[lectureId]
  if (!lecture) {
    return (
      <ActivityFrame id="lecture-1">
        <div className="callout callout--warn">
          <Icon name="alert" />
          <div>
            <strong>That lecture does not exist.</strong> <Link to="/module/1/lecture/1">Open Lecture 1.1</Link> or{' '}
            <Link to="/module/1/lecture/2">Lecture 1.2</Link>.
          </div>
        </div>
      </ActivityFrame>
    )
  }
  return <LectureView key={lecture.id} lecture={lecture} />
}

function LectureView({ lecture }) {
  const [params] = useSearchParams()
  const [clock] = useState(() => {
    // ?t=95 deep-links to a moment; otherwise resume from the saved position
    const linked = Number(params.get('t'))
    if (Number.isFinite(linked) && linked > 0) return new Clock(lecture.duration, Math.min(linked, lecture.duration))
    const saved = useStore.getState().lectures[lecture.id]
    const start = saved && saved.t > 1 && saved.t < lecture.duration - 1 ? saved.t : 0
    return new Clock(lecture.duration, start)
  })
  const [resumedAt] = useState(() => clock.t)
  const [linked] = useState(() => Number(params.get('t')) > 0)
  const [activeQ, setActiveQ] = useState(null)
  const lectureState = useStore((s) => s.lectures[lecture.id])
  const answers = useStore((s) => s.lectures[lecture.id]?.answers || EMPTY)
  const done = useStore((s) => Boolean(s.activities[lecture.activity]?.done))
  const complete = useStore((s) => s.completeActivity)
  const watchedPct = lectureWatchedPct(lectureState, lecture.duration)
  const canComplete = watchedPct >= 90
  const next = ACTIVITIES[activityIndex(lecture.activity) + 1]

  const seek = (t) => {
    setActiveQ(null)
    clock.seek(t)
  }
  const openQuestion = (q) => {
    clock.setPlaying(false)
    clock.seek(q.t)
    setActiveQ(q)
  }

  return (
    <ActivityFrame
      id={lecture.activity}
      canComplete={canComplete}
      completeHint={`Watch at least 90% of the lecture to mark it done. You have watched ${watchedPct}% so far; skipping ahead does not count.`}
    >
      <div className="lec-page">
        {resumedAt > 1 && (
          <div className="lec-resume">
            <Icon name="clock" />
            <span>
              {linked ? 'Starting at' : 'Picking up where you left off, at'}{' '}
              <strong className="tabular">{fmtTime(resumedAt)}</strong>.
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => seek(0)}>
              Start over
            </button>
          </div>
        )}

        <Player lecture={lecture} clock={clock} activeQ={activeQ} setActiveQ={setActiveQ} next={next} />

        <p className="lec-shortcuts">
          <span className={`chip ${canComplete ? 'chip--done' : ''}`}>
            <Icon name={canComplete ? 'check' : 'eye'} /> Watched {watchedPct}%
          </span>
          <span>
            <span className="kbd">Space</span> play or pause
          </span>
          <span>
            <span className="kbd">←</span> <span className="kbd">→</span> 5 seconds
          </span>
          <span>
            <span className="kbd">C</span> captions
          </span>
          <span>
            <span className="kbd">F</span> full screen
          </span>
        </p>

        {canComplete && !done && (
          <motion.div
            className="lec-nudge"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_EXPO }}
          >
            <div>
              <strong>You have watched the lecture.</strong>
              <span>Mark it as done to tick it off, or replay any chapter first.</span>
            </div>
            <button type="button" className="btn btn--dark" onClick={() => complete(lecture.activity)}>
              <Icon name="check" />
              Mark as done
            </button>
          </motion.div>
        )}

        <div className="lec-below">
          <Transcript lecture={lecture} clock={clock} onSeek={seek} />
          <aside className="lec-side">
            <Chapters lecture={lecture} clock={clock} onSeek={seek} />
            <section className="lec-sidecard" aria-labelledby={`lq-${lecture.id}`}>
              <h3 id={`lq-${lecture.id}`} className="lec-sidecard__title">
                Questions in this lecture
              </h3>
              <ol className="lec-qlist">
                {lecture.questions.map((q) => {
                  const a = answers[q.id]
                  const right = a === q.correct
                  return (
                    <li key={q.id}>
                      <button type="button" className="lec-qitem" onClick={() => openQuestion(q)}>
                        <span className="lec-qitem__time tabular">{fmtTime(q.t)}</span>
                        <span className="lec-qitem__prompt">{q.prompt}</span>
                        {a ? (
                          <span className={`chip ${right ? 'chip--done' : 'chip--warn'}`}>
                            <Icon name={right ? 'check' : 'x'} />
                            {right ? 'Correct' : 'Review'}
                          </span>
                        ) : (
                          <span className="chip chip--outline">Not answered</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </ActivityFrame>
  )
}

function Chapters({ lecture, clock, onSeek }) {
  const current = useClockValue(clock, (c) => chapterIndexAt(lecture.chapters, c.t))
  return (
    <section className="lec-sidecard" aria-labelledby={`lc-${lecture.id}`}>
      <h3 id={`lc-${lecture.id}`} className="lec-sidecard__title">
        Chapters
      </h3>
      <ol className="lec-chapters">
        {lecture.chapters.map((c, i) => (
          <li key={c.t}>
            <button
              type="button"
              className={`lec-chapter ${i === current ? 'is-current' : ''} ${i < current ? 'is-past' : ''}`}
              onClick={() => onSeek(c.t)}
              aria-current={i === current ? 'step' : undefined}
            >
              <span className="lec-chapter__n tabular">{String(i + 1).padStart(2, '0')}</span>
              <span className="lec-chapter__title">{c.title}</span>
              <span className="lec-chapter__t tabular">{fmtTime(c.t)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Transcript({ lecture, clock, onSeek }) {
  const active = useClockValue(clock, (c) => cueIndexAt(lecture.cues, c.t))
  const listRef = useRef(null)
  const userScroll = useRef(0)
  const programmatic = useRef(false)

  useEffect(() => {
    const list = listRef.current
    if (!list || active < 0) return
    if (Date.now() - userScroll.current < 4000) return
    const item = list.querySelector(`[data-cue="${active}"]`)
    if (!item) return
    programmatic.current = true
    list.scrollTo({ top: Math.max(0, item.offsetTop - list.clientHeight / 3), behavior: 'smooth' })
    const id = setTimeout(() => (programmatic.current = false), 600)
    return () => clearTimeout(id)
  }, [active])

  return (
    <section className="lec-transcript" aria-labelledby={`lt-${lecture.id}`}>
      <div className="lec-transcript__head">
        <h3 id={`lt-${lecture.id}`} className="lec-sidecard__title">
          Transcript
        </h3>
        <span className="hint">Select a line to jump to that moment.</span>
      </div>
      <ol
        className="lec-transcript__list"
        ref={listRef}
        onScroll={() => {
          if (!programmatic.current) userScroll.current = Date.now()
        }}
      >
        {lecture.cues.map((c, i) => {
          const chapterStart = lecture.chapters.find((ch) => ch.t === c.start)
          return (
            <li key={c.start} data-cue={i}>
              {chapterStart && <div className="lec-transcript__chapter">{chapterStart.title}</div>}
              <button
                type="button"
                className={`lec-line ${i === active ? 'is-active' : ''} ${i < active ? 'is-past' : ''}`}
                onClick={() => onSeek(c.start)}
                aria-current={i === active ? 'true' : undefined}
              >
                <span className="lec-line__t tabular">{fmtTime(c.start)}</span>
                <span className="lec-line__text">{c.text}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
