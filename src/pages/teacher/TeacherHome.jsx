import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '../../lib/api.js'
import { useSession } from '../../lib/session.js'
import Icon from '../../components/Icon.jsx'
import { useDocTitle, EASE_EXPO } from '../../components/ui.jsx'
import { useApi, ErrorBox, CopyButton, SkeletonRows, fmtDate } from './shared.jsx'
import './teacher.css'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function ClassRow({ c, isNew }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_EXPO }}
      className={`td-classrow ${isNew ? 'is-new' : ''} ${c.archived ? 'is-archived' : ''}`}
    >
      <div className="td-classrow__main">
        <Link to={`/teacher/classes/${c.id}`} className="td-classrow__name">
          {c.name}
        </Link>
        <span className="td-classrow__meta">
          <span>
            <Icon name="users" width={13} height={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
            {c.students} student{c.students === 1 ? '' : 's'}
          </span>
          <span>Created {fmtDate(c.createdAt)}</span>
          {isNew && <span className="chip chip--accent">New: share the code</span>}
          {c.archived && <span className="chip chip--outline">Archived</span>}
        </span>
      </div>
      <span className="td-code" aria-label={`Join code ${c.joinCode}`}>
        <span className="td-code__value">{c.joinCode}</span>
        <CopyButton text={c.joinCode} label="Copy code" className="btn btn--ghost btn--sm" />
      </span>
      <Link to={`/teacher/classes/${c.id}`} className="btn btn--sm">
        Open <Icon name="arrow-right" />
      </Link>
    </motion.li>
  )
}

export default function TeacherHome() {
  useDocTitle('Teacher dashboard')
  const user = useSession((s) => s.user)
  const { loading, data, error, reload, setData } = useApi('/api/teacher/classes')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newId, setNewId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const classes = data?.classes || []
  const active = classes.filter((c) => !c.archived)
  const archived = classes.filter((c) => c.archived)
  const totalStudents = active.reduce((s, c) => s + (c.students || 0), 0)

  const create = async (e) => {
    e.preventDefault()
    if (name.trim().length < 2) {
      setCreateError('Give the class a name of at least 2 characters.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const { class: c } = await api.post('/api/teacher/classes', { name: name.trim() })
      setData((d) => ({ classes: [c, ...(d?.classes || [])] }))
      setNewId(c.id)
      setName('')
      useSession
        .getState()
        .reload()
        .catch(() => {})
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page page--wide td-page">
      <header className="td-head">
        <div className="td-head__titles">
          <div className="kicker">Teacher dashboard</div>
          <h1 className="td-title">
            {greeting()}
            {user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
          </h1>
          <p className="td-sub">
            Create a class, share its join code, and follow every student's progress, submissions and feedback.
          </p>
        </div>
        <div className="td-links">
          <Link to="/module/1" className="btn btn--sm">
            <Icon name="eye" /> Preview the course
          </Link>
          <Link to="/lesson-plan" className="btn btn--sm">
            <Icon name="calendar" /> Lesson plan
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin/users" className="btn btn--sm">
              <Icon name="shield" /> Users and roles
            </Link>
          )}
        </div>
      </header>

      <section className="td-section" aria-labelledby="create-h">
        <h2 id="create-h" className="visually-hidden">
          Create a class
        </h2>
        <form className="td-create" onSubmit={create} noValidate>
          <div className="field">
            <label className="label" htmlFor="td-new-class">
              New class
            </label>
            <input
              id="td-new-class"
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (createError) setCreateError('')
              }}
              placeholder="e.g. Group A, Spring 2027"
              maxLength={100}
              aria-invalid={createError ? 'true' : undefined}
              aria-describedby={createError ? 'td-new-class-err' : 'td-new-class-hint'}
            />
            {createError ? (
              <span className="td-rowerror" id="td-new-class-err" role="alert">
                {createError}
              </span>
            ) : (
              <span className="hint" id="td-new-class-hint">
                Each class gets its own private join code. You can make a new code at any time.
              </span>
            )}
          </div>
          <button type="submit" className="btn btn--primary" disabled={creating}>
            <Icon name="plus" /> {creating ? 'Creating…' : 'Create class'}
          </button>
        </form>
      </section>

      <section className="td-section" aria-labelledby="classes-h">
        <div className="td-sechead">
          <h2 id="classes-h" className="td-h2">
            Your classes
          </h2>
          {!loading && !error && active.length > 0 && (
            <span className="td-faint td-small">
              {active.length} active · {totalStudents} student{totalStudents === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {loading && <SkeletonRows rows={3} height={68} />}
        {error && <ErrorBox error={error} onRetry={reload} title="Could not load your classes." />}

        {!loading && !error && active.length === 0 && (
          <div className="td-card">
            <div className="td-h3">Start your first class in three steps</div>
            <ol className="td-steps">
              <li>
                <span className="td-steps__n">01</span>
                <span>
                  <strong>Create a class</strong>
                  <span>Name it after the group or semester, above.</span>
                </span>
              </li>
              <li>
                <span className="td-steps__n">02</span>
                <span>
                  <strong>Share the join code</strong>
                  <span>Read it out in class or post it on your course page.</span>
                </span>
              </li>
              <li>
                <span className="td-steps__n">03</span>
                <span>
                  <strong>Students sign up with it</strong>
                  <span>They appear in the class list, with progress saved as they work.</span>
                </span>
              </li>
            </ol>
          </div>
        )}

        {!loading && !error && active.length > 0 && (
          <ul className="td-classes">
            <AnimatePresence initial={false}>
              {active.map((c) => (
                <ClassRow key={c.id} c={c} isNew={c.id === newId} />
              ))}
            </AnimatePresence>
          </ul>
        )}

        {!loading && !error && archived.length > 0 && (
          <div className="td-section" style={{ marginTop: 'var(--s-4)', gap: 'var(--s-3)' }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ alignSelf: 'flex-start' }}
              aria-expanded={showArchived}
              onClick={() => setShowArchived((v) => !v)}
            >
              <Icon name={showArchived ? 'chevron-up' : 'chevron-down'} />
              {showArchived ? 'Hide' : 'Show'} archived classes ({archived.length})
            </button>
            {showArchived && (
              <ul className="td-classes">
                {archived.map((c) => (
                  <ClassRow key={c.id} c={c} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
