import { Link, useParams } from 'react-router-dom'
import { MODULES } from '../data/course.js'
import { useStore, moduleProgress } from '../store.js'
import Icon from '../components/Icon.jsx'
import { useDocTitle, Meter } from '../components/ui.jsx'
import NotFound from './NotFound.jsx'
import './app-pages.css'

export default function ModulePreview() {
  const { n } = useParams()
  const num = Number(n)
  const mod = MODULES.find((m) => m.n === num)
  const activities = useStore((s) => s.activities)
  const { pct } = moduleProgress(activities)
  useDocTitle(mod ? `Module ${mod.n}` : 'Not found')
  if (!mod || mod.status === 'live') return <NotFound />
  const prev = MODULES.find((m) => m.n === num - 1)
  const next = MODULES.find((m) => m.n === num + 1)

  return (
    <div className="page page--wide apppage">
      <header className="apphead">
        <div>
          <div className="kicker">
            Module <span className="kicker__num">{String(mod.n).padStart(2, '0')}</span> · Preview
          </div>
          <h1 className="apphead__title">{mod.title}</h1>
          <p className="apphead__sub">
            Practical work: {mod.practical}. This module is in production and opens after Module {mod.n - 1}.
          </p>
        </div>
      </header>
      <div className="preview">
        <section aria-labelledby="topics-h">
          <h2 id="topics-h" className="home-h2" style={{ marginBottom: 12 }}>
            What it will cover
          </h2>
          <ol className="preview__topics">
            {mod.topics.map((t, i) => (
              <li key={t}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="muted" style={{ marginTop: 20, maxWidth: '60ch' }}>
            Every module follows the same rhythm as Module 1: a practical situation, two short lectures, a reading, an
            interactive diagram, browser labs, a quiz, an assignment with peer review, a discussion and a reflection.
          </p>
        </section>
        <aside className="preview__lock">
          <span className="preview__lockicon">
            <Icon name="lock" />
          </span>
          <strong>Opens after Module {mod.n - 1}</strong>
          {mod.n === 2 ? (
            <>
              <span className="muted">Module 1 progress</span>
              <Meter value={pct} label="Module 1 progress" />
              <Link to="/module/1" className="btn btn--dark">
                Go to Module 1 <Icon name="arrow-right" />
              </Link>
            </>
          ) : (
            <span className="muted">Modules open one after another so each builds on the last.</span>
          )}
        </aside>
      </div>
      <nav className="preview__nav" aria-label="Module navigation">
        {prev ? (
          <Link to={`/module/${prev.n}`} className="btn btn--ghost">
            <Icon name="arrow-left" /> Module {prev.n}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/module/${next.n}`} className="btn btn--ghost">
            Module {next.n} <Icon name="arrow-right" />
          </Link>
        ) : (
          <Link to="/course" className="btn btn--ghost">
            Back to my course <Icon name="arrow-right" />
          </Link>
        )}
      </nav>
    </div>
  )
}
