import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import { Meter, EASE_OUT } from '../components/ui.jsx'
import { useStore } from '../store.js'
import { CHAPTERS } from './reading/chapters.jsx'
import './Reading.css'

export default function Reading() {
  const { chapterId } = useParams()
  const navigate = useNavigate()
  const visited = useStore((s) => s.reading.visited)
  const last = useStore((s) => s.reading.last)
  const visit = useStore((s) => s.visitChapter)

  const idx = Math.max(0, CHAPTERS.findIndex((c) => c.id === (chapterId || last || CHAPTERS[0].id)))
  const ch = CHAPTERS[idx]
  const prev = CHAPTERS[idx - 1]
  const next = CHAPTERS[idx + 1]
  const visitedCount = CHAPTERS.filter((c) => visited[c.id]).length

  useEffect(() => {
    visit(ch.id)
  }, [ch.id, visit])

  useEffect(() => {
    if (chapterId) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [chapterId])

  const go = (id) => navigate(`/module/1/reading/${id}`)

  return (
    <ActivityFrame
      id="reading"
      canComplete={visitedCount === CHAPTERS.length}
      completeHint={`Open all ${CHAPTERS.length} chapters to mark the reading done. ${visitedCount} of ${CHAPTERS.length} opened so far.`}
    >
      <div className="book">
        <nav className="book__toc" aria-label="Table of contents">
          <div className="book__tochead">
            <span className="book__tocTitle">Table of contents</span>
            <span className="faint tabular">
              {visitedCount}/{CHAPTERS.length}
            </span>
          </div>
          <Meter value={(visitedCount / CHAPTERS.length) * 100} label="Chapters opened" />
          <ol>
            {CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <Link
                  to={`/module/1/reading/${c.id}`}
                  className={`book__toclink ${i === idx ? 'is-current' : ''} ${visited[c.id] ? 'is-visited' : ''}`}
                  aria-current={i === idx ? 'page' : undefined}
                >
                  <span className="book__tocnum">{visited[c.id] && i !== idx ? <Icon name="check" strokeWidth={2.4} /> : i + 1}</span>
                  <span>{c.short}</span>
                </Link>
              </li>
            ))}
          </ol>
          <label className="book__select field">
            <span className="visually-hidden">Jump to chapter</span>
            <select className="select" value={ch.id} onChange={(e) => go(e.target.value)}>
              {CHAPTERS.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {i + 1}. {c.title}
                </option>
              ))}
            </select>
          </label>
        </nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={ch.id}
            className="book__page"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            <header className="book__chhead">
              <span className="kicker kicker--ink">
                Chapter <span className="kicker__num">{String(idx + 1).padStart(2, '0')}</span> of {CHAPTERS.length} · {ch.minutes} min
              </span>
              <h2 className="book__chtitle">{ch.title}</h2>
            </header>
            <div className="prose book__prose">
              <ch.Body />
            </div>
            <nav className="book__nav" aria-label="Chapter navigation">
              {prev ? (
                <Link to={`/module/1/reading/${prev.id}`} className="book__navlink">
                  <Icon name="chevron-left" />
                  <span>
                    <small>Previous</small>
                    {prev.short}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link to={`/module/1/reading/${next.id}`} className="book__navlink book__navlink--next">
                  <span>
                    <small>Next</small>
                    {next.short}
                  </span>
                  <Icon name="chevron-right" />
                </Link>
              ) : (
                <span className="book__end">
                  <Icon name="check-circle" /> End of the reading
                </span>
              )}
            </nav>
          </motion.div>
        </AnimatePresence>
      </div>
    </ActivityFrame>
  )
}
