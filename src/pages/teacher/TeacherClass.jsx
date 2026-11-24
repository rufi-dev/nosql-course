import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, download } from '../../lib/api.js'
import { useSession } from '../../lib/session.js'
import { STAGES, OUTCOMES, COURSE } from '../../data/course.js'
import { GUIDED } from '../../data/forum.js'
import Icon from '../../components/Icon.jsx'
import { Callout, Meter, useDocTitle } from '../../components/ui.jsx'
import {
  useApi,
  ErrorBox,
  CopyButton,
  SkeletonRows,
  TeacherCrumbs,
  GradeChip,
  RichText,
  relTime,
  fmtDate,
  fmtDateTime,
  initials,
  SearchIcon,
} from './shared.jsx'
import './teacher.css'

const TABS = [
  { id: 'students', label: 'Students' },
  { id: 'stages', label: 'Stages' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'feedback', label: 'Feedback' },
]

/* ------------------------------------------------------------------ */
/* Header: name, join code, archive                                    */
/* ------------------------------------------------------------------ */

function ClassHeader({ cls, onChange }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cls.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmCode, setConfirmCode] = useState(false)

  const patch = async (body) => {
    setBusy(true)
    setError('')
    try {
      const { class: c } = await api.patch(`/api/teacher/classes/${cls.id}`, body)
      onChange(c)
      useSession
        .getState()
        .reload()
        .catch(() => {})
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveName = async (e) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('The name needs at least 2 characters.')
    if (await patch({ name: name.trim() })) setEditing(false)
  }

  const newCode = async () => {
    setBusy(true)
    setError('')
    try {
      const { class: c } = await api.post(`/api/teacher/classes/${cls.id}/code`)
      onChange(c)
      setConfirmCode(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="td-head" style={{ alignItems: 'stretch', flexDirection: 'column' }}>
      <TeacherCrumbs items={[{ to: '/teacher', label: 'Teacher dashboard' }, { label: cls.name }]} />
      <div className="td-head__titles">
        <div className="kicker">
          Class{cls.archived ? ' · archived' : ''} · created {fmtDate(cls.createdAt)}
        </div>
        {editing ? (
          <form className="td-rename" onSubmit={saveName}>
            <label className="visually-hidden" htmlFor="td-rename">
              Class name
            </label>
            <input id="td-rename" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
            <button type="submit" className="btn btn--dark btn--sm" disabled={busy}>
              Save
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setEditing(false)
                setName(cls.name)
                setError('')
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="cluster" style={{ '--gap': '12px' }}>
            <h1 className="td-title">{cls.name}</h1>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
              <Icon name="settings" /> Rename
            </button>
          </div>
        )}
      </div>

      <div className="td-codepanel">
        <div>
          <div className="td-codepanel__label">Join code</div>
          <div className="td-codepanel__code" aria-live="polite">
            {cls.joinCode}
          </div>
        </div>
        <div className="td-codepanel__actions">
          <CopyButton text={cls.joinCode} label="Copy code" className="btn btn--on-dark btn--sm" />
          {!confirmCode ? (
            <button type="button" className="btn btn--on-dark btn--sm" onClick={() => setConfirmCode(true)} disabled={busy}>
              <Icon name="reset" /> New code
            </button>
          ) : (
            <div className="td-confirm" role="alert">
              <span>The old code stops working. Students already in the class stay.</span>
              <button type="button" className="btn btn--primary btn--sm" onClick={newCode} disabled={busy}>
                Make a new code
              </button>
              <button type="button" className="btn btn--on-dark btn--sm" onClick={() => setConfirmCode(false)}>
                Cancel
              </button>
            </div>
          )}
          <label className="switch">
            <input type="checkbox" checked={cls.archived} disabled={busy} onChange={(e) => patch({ archived: e.target.checked })} />
            Archived
          </label>
        </div>
      </div>
      {cls.archived && (
        <Callout tone="info" title="This class is archived.">
          Nobody can join with its code. Students already in it keep their work.
        </Callout>
      )}
      {error && (
        <Callout tone="warn" title="Could not save.">
          {error}
        </Callout>
      )}
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

function StageDots({ stages }) {
  return (
    <span className="td-dots" role="img" aria-label={STAGES.map((s) => `${s.title} ${stages[s.id].done} of ${stages[s.id].total}`).join(', ')}>
      {STAGES.map((s) => {
        const st = stages[s.id]
        const cls = st.complete ? 'is-complete' : st.done > 0 ? 'is-partial' : st.open ? 'is-open' : ''
        return (
          <span
            key={s.id}
            className={`td-dot ${cls}`}
            style={st.done > 0 && !st.complete ? { '--fill': `${Math.round((st.done / st.total) * 100)}%` } : undefined}
            title={`${s.title}: ${st.done}/${st.total}${st.open ? '' : ' (locked)'}`}
          />
        )
      })}
    </span>
  )
}

function Funnel({ funnel, stuck, count }) {
  const maxStuck = Math.max(0, ...Object.values(stuck))
  const stuckId = maxStuck > 0 ? Object.keys(stuck).find((k) => stuck[k] === maxStuck) : null
  const stuckAct = funnel.find((f) => f.id === stuckId)
  return (
    <div className="td-section" style={{ gap: 'var(--s-3)' }}>
      <div className="td-sechead">
        <h3 className="td-h3">Where students stop</h3>
        {stuckAct && (
          <span className="td-stuck-note">
            <Icon name="flag" /> Most students ({maxStuck}) are on <strong>{stuckAct.short}</strong>
          </span>
        )}
      </div>
      <div className="td-funnel">
        {STAGES.map((s) => (
          <div key={s.id} className="td-funnel__stage">
            <span className="td-funnel__stagehead">{s.title}</span>
            {funnel
              .filter((f) => f.stage === s.id)
              .map((f) => (
                <div key={f.id} className={`td-bar ${f.id === stuckId ? 'is-stuck' : ''}`}>
                  <span className="td-bar__label" title={f.short}>
                    {f.short}
                  </span>
                  <span
                    className="td-bar__track"
                    role="img"
                    aria-label={`${f.short}: ${f.done} of ${count} finished${stuck[f.id] ? `, ${stuck[f.id]} currently here` : ''}`}
                  >
                    <span className="td-bar__fill" style={{ width: `${count ? (f.done / count) * 100 : 0}%` }} />
                  </span>
                  <span className="td-bar__count">
                    {f.done}/{count}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  progress: (a, b) => b.pct - a.pct || a.name.localeCompare(b.name),
  grade: (a, b) => b.grades.total - a.grades.total || a.name.localeCompare(b.name),
  active: (a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0),
}

function StudentsTab({ data, cls }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('name')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const students = data.students
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return students.filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle)).sort(SORTS[sort])
  }, [students, q, sort])

  const exportCsv = async () => {
    setExporting(true)
    setExportError('')
    try {
      await download(`/api/teacher/classes/${cls.id}/export.csv`, 'grades.csv')
    } catch (err) {
      setExportError(err.message)
    } finally {
      setExporting(false)
    }
  }

  if (!students.length) {
    return (
      <div className="td-card">
        <div className="td-h3">No students yet</div>
        <p className="td-muted">
          Share the join code <span className="td-code__value">{cls.joinCode}</span>. New students enter it when they sign up; students who
          already have an account enter it on the Join page. They appear here as soon as they join.
        </p>
      </div>
    )
  }

  return (
    <div className="td-section" style={{ gap: 'var(--s-6)' }}>
      <Funnel funnel={data.funnel} stuck={data.stuck} count={students.length} />

      <div className="td-section" style={{ gap: 'var(--s-3)' }}>
        <div className="td-toolbar">
          <label className="td-search">
            <span className="visually-hidden">Search students</span>
            <SearchIcon />
            <input className="input" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="cluster" style={{ '--gap': '8px' }}>
            <span className="td-small td-muted">Sort by</span>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
              <option value="name">Name</option>
              <option value="progress">Progress</option>
              <option value="grade">Grade</option>
              <option value="active">Last active</option>
            </select>
          </label>
          <div className="td-toolbar__end">
            <button type="button" className="btn btn--sm" onClick={exportCsv} disabled={exporting}>
              <Icon name="download" /> {exporting ? 'Preparing…' : 'Export grades (CSV)'}
            </button>
          </div>
        </div>
        {exportError && (
          <Callout tone="warn" title="Export failed.">
            {exportError}
          </Callout>
        )}

        <div className="table-wrap">
          <table className="table td-table">
            <caption className="visually-hidden">Students in {cls.name}</caption>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Last active</th>
                <th scope="col">Progress</th>
                <th scope="col">Now on</th>
                <th scope="col">Stages</th>
                <th scope="col" className="num">
                  Quiz best
                </th>
                <th scope="col">Assignment</th>
                <th scope="col" className="num">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const to = `/teacher/classes/${cls.id}/students/${s.id}`
                return (
                  <tr key={s.id} className="is-click" onClick={(e) => !e.target.closest('a,button') && navigate(to)}>
                    <td>
                      <span className="td-person">
                        <span className="td-avatar" aria-hidden="true">
                          {initials(s.name)}
                        </span>
                        <span>
                          <Link to={to} className="td-person__name">
                            {s.name}
                          </Link>
                          <span className="td-person__email">{s.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="td-nowrap td-small">{relTime(s.lastSeenAt)}</td>
                    <td>
                      <span className="td-progress">
                        <Meter value={s.pct} label={`${s.name} progress ${s.pct}%`} />
                        <span className="tabular">
                          {s.pct}% · {s.done}/{s.total}
                        </span>
                      </span>
                    </td>
                    <td>
                      {s.current ? (
                        <span className="td-now">
                          <small>{STAGES.find((x) => x.id === s.current.stage)?.title}</small>
                          {s.current.short}
                        </span>
                      ) : (
                        <span className="chip chip--done">
                          <Icon name="check" /> Finished
                        </span>
                      )}
                    </td>
                    <td>
                      <StageDots stages={s.stages} />
                    </td>
                    <td className="num tabular">{s.quizAttempts ? `${s.quizBest}%` : <span className="td-faint">–</span>}</td>
                    <td>
                      {s.graded ? (
                        <span className="chip chip--done">Graded</span>
                      ) : s.submitted ? (
                        <span className="chip chip--accent">Needs grading</span>
                      ) : (
                        <span className="td-faint td-small">Not submitted</span>
                      )}
                    </td>
                    <td className="num">
                      <span className="cluster" style={{ '--gap': '8px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <span className="tabular" style={{ fontWeight: 700 }}>
                          {s.grades.total}
                        </span>
                        <GradeChip grades={s.grades} passMark={COURSE.passMark} />
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!list.length && (
                <tr>
                  <td colSpan={8} className="td-muted">
                    No student matches “{q}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="td-faint td-xs">
          Stage squares: filled when a stage is complete, partly filled while in progress, outlined when open, grey when locked. Grade is points
          earned out of 100; the pass mark is {COURSE.passMark}.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

function StagesTab({ cls, students, onChange }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const overrides = cls.stageOverrides || {}

  const toggle = async (stageId, open) => {
    setBusy(stageId)
    setError('')
    const before = cls
    onChange({ ...cls, stageOverrides: { ...overrides, [stageId]: open || undefined } }) // optimistic
    try {
      const { class: c } = await api.put(`/api/teacher/classes/${cls.id}/stages`, { stageId, open })
      onChange(c)
    } catch (err) {
      onChange(before)
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="td-section">
      <Callout tone="info" title="How stages open.">
        Each student moves step by step: a stage opens for them when they finish everything before it. Switch a stage on here to open it for
        every student in this class at once, for example when the lesson plan reaches it. Students see the change within a minute, without
        reloading.
      </Callout>
      {error && (
        <Callout tone="warn" title="Could not change the stage.">
          {error}
        </Callout>
      )}
      <ol className="td-stagelist">
        {STAGES.map((s, i) => {
          const forced = Boolean(overrides[s.id])
          const reached = students.filter((st) => st.stages[s.id]?.open).length
          const finished = students.filter((st) => st.stages[s.id]?.complete).length
          return (
            <li key={s.id} className={`td-stage ${i === 0 || forced ? 'is-open' : ''}`}>
              <span className="td-stage__n">{i + 1}</span>
              <span className="td-stage__body">
                <span className="td-stage__title">{s.title}</span>
                <span className="td-small td-muted">{s.lead}</span>
                {students.length > 0 && (
                  <span className="td-xs td-faint">
                    Open for {reached} of {students.length} · finished by {finished}
                  </span>
                )}
              </span>
              <span className="td-stage__control">
                {i === 0 ? (
                  <span className="chip chip--done">Always open</span>
                ) : (
                  <>
                    <span className={`chip ${forced ? 'chip--accent' : 'chip--outline'}`}>
                      {forced ? (
                        'Open for everyone'
                      ) : (
                        <>
                          <Icon name="lock" /> By progress only
                        </>
                      )}
                    </span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={forced}
                        disabled={busy === s.id}
                        onChange={(e) => toggle(s.id, e.target.checked)}
                        aria-label={`Open ${s.title} for the whole class`}
                      />
                      <span className="visually-hidden">Open for the whole class</span>
                    </label>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Submissions                                                         */
/* ------------------------------------------------------------------ */

function SubmissionsTab({ cls }) {
  const { loading, data, error, reload } = useApi(`/api/teacher/classes/${cls.id}/submissions`)
  if (loading) return <SkeletonRows rows={3} />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const subs = data.submissions
  if (!subs.length) {
    return (
      <div className="td-card">
        <div className="td-h3">No submissions yet</div>
        <p className="td-muted">
          The assignment opens for a student when they finish the labs, or for everyone when you switch on Check and apply in the Stages tab.
          Submissions appear here, oldest ungraded first.
        </p>
      </div>
    )
  }
  return (
    <div className="table-wrap">
      <table className="table td-table">
        <caption className="visually-hidden">Assignment submissions</caption>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Submitted</th>
            <th scope="col" className="num">
              Auto-check
            </th>
            <th scope="col">Teacher grade</th>
            <th scope="col" className="num">
              Peer reviews
            </th>
            <th scope="col">
              <span className="visually-hidden">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td>
                <Link to={`/teacher/classes/${cls.id}/students/${s.student.id}`} className="td-person__name">
                  {s.student.name}
                </Link>
              </td>
              <td className="td-small td-nowrap">{fmtDateTime(s.submittedAt)}</td>
              <td className="num tabular">{s.autoScore}%</td>
              <td>
                {s.status === 'graded' ? (
                  <span className="chip chip--done tabular">{s.teacherScore}%</span>
                ) : (
                  <span className="chip chip--accent">Needs grading</span>
                )}
              </td>
              <td className="num tabular">{s.reviewsReceived}</td>
              <td className="num">
                <Link to={`/teacher/submissions/${s.id}`} className={`btn btn--sm ${s.status === 'graded' ? '' : 'btn--dark'}`}>
                  {s.status === 'graded' ? 'Review grade' : 'Grade'} <Icon name="arrow-right" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Discussion                                                          */
/* ------------------------------------------------------------------ */

function Post({ post, cls, onPosts, replies = [] }) {
  const [replying, setReplying] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isTeacher = post.author.role === 'teacher'

  const del = async () => {
    setBusy(true)
    setError('')
    try {
      const { posts } = await api.del(`/api/forum/${post.id}`)
      onPosts(posts)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <li>
      <article className={`td-post ${isTeacher ? 'is-teacher' : ''}`}>
        <header className="td-post__head">
          <span className="td-avatar" aria-hidden="true">
            {initials(post.author.name)}
          </span>
          <span className="td-post__author">{post.author.name}</span>
          {isTeacher && <span className="chip chip--done">Teacher</span>}
          <span className="td-faint td-xs">{fmtDateTime(post.at)}</span>
        </header>
        <div className="td-post__body">
          <RichText text={post.body} />
        </div>
        <div className="td-post__actions">
          <span>
            <Icon name="thumb" width={13} height={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {post.likes} helpful
          </span>
          {!post.parentId && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplying((v) => !v)} aria-expanded={replying}>
              <Icon name="reply" /> Reply
            </button>
          )}
          {!confirmDel ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(true)}>
              <Icon name="trash" /> Delete
            </button>
          ) : (
            <span className="td-confirm td-confirm--light" role="alert">
              {replies.length ? `Delete this post and its ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}?` : 'Delete this post?'}
              <button type="button" className="btn btn--danger btn--sm" onClick={del} disabled={busy}>
                Delete
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
        {error && <span className="td-rowerror">{error}</span>}
        {replying && (
          <Composer
            cls={cls}
            parentId={post.id}
            label={`Reply to ${post.author.name}`}
            onPosts={(p) => {
              onPosts(p)
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        )}
      </article>
      {replies.length > 0 && (
        <ul className="td-replies">
          {replies.map((r) => (
            <Post key={r.id} post={r} cls={cls} onPosts={onPosts} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Composer({ cls, parentId = null, label, onPosts, onCancel }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = `td-compose-${parentId || 'top'}`
  const submit = async (e) => {
    e.preventDefault()
    if (body.trim().length < 2) return setError('Write a little more first.')
    setBusy(true)
    setError('')
    try {
      const { posts } = await api.post('/api/forum', { classId: cls.id, parentId, body: body.trim() })
      setBody('')
      onPosts(posts)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="td-composer" onSubmit={submit}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        style={{ minHeight: parentId ? 80 : 100 }}
        placeholder={parentId ? 'Your reply as the teacher' : 'Post a prompt, a hint or a summary for the whole class'}
      />
      <div className="td-composer__row">
        <span className="hint">
          Wrap code in backticks, e.g. <code>{'{ stock: 1 }'}</code>. {body.length}/4000
        </span>
        <span className="cluster" style={{ '--gap': '6px' }}>
          {onCancel && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--dark btn--sm" disabled={busy || !body.trim()}>
            <Icon name="chat" /> {busy ? 'Posting…' : parentId ? 'Reply as teacher' : 'Post as teacher'}
          </button>
        </span>
      </div>
      {error && (
        <span className="td-rowerror" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}

function DiscussionTab({ cls }) {
  const { loading, data, error, reload, setData } = useApi(`/api/forum?classId=${cls.id}`)
  const setPosts = (posts) => setData({ posts })
  const posts = data?.posts || []
  const top = posts.filter((p) => !p.parentId).sort((a, b) => b.at - a.at)
  const repliesOf = (id) => posts.filter((p) => p.parentId === id).sort((a, b) => a.at - b.at)

  return (
    <div className="td-section">
      <div className="td-card">
        <span className="kicker">Guided question</span>
        <div className="td-h3">{GUIDED.title}</div>
        <p className="td-small td-muted">{GUIDED.prompt}</p>
      </div>
      <div className="td-card">
        <Composer cls={cls} label="Post to the class" onPosts={setPosts} />
      </div>
      {loading && <SkeletonRows rows={3} height={90} />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!loading && !error && top.length === 0 && (
        <p className="td-muted">
          No posts yet. The discussion opens for students with the Check and apply stage; their first post ticks the activity.
        </p>
      )}
      {!loading && !error && top.length > 0 && (
        <ul className="td-thread">
          {top.map((p) => (
            <Post key={p.id} post={p} cls={cls} onPosts={setPosts} replies={repliesOf(p.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

function Stars({ value }) {
  return (
    <span className="td-stars" role="img" aria-label={`${value || 0} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" className={n <= value ? 'is-on' : ''} />
      ))}
    </span>
  )
}

function FeedbackTab({ cls }) {
  const { loading, data, error, reload } = useApi(`/api/teacher/classes/${cls.id}/feedback`)
  if (loading) return <SkeletonRows rows={3} height={80} />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const { reflections, averages } = data
  if (!reflections.length) {
    return (
      <div className="td-card">
        <div className="td-h3">No reflections yet</div>
        <p className="td-muted">
          Students submit a short reflection in the Wrap-up at the end of the module: how confident they are with each outcome, what was
          unclear, how long it took, and an overall rating. It all collects here.
        </p>
      </div>
    )
  }
  return (
    <div className="td-split">
      <div className="td-section" style={{ gap: 'var(--s-3)' }}>
        <h3 className="td-h3">Reflections ({reflections.length})</h3>
        <ul className="td-reflections">
          {[...reflections]
            .sort((a, b) => b.submittedAt - a.submittedAt)
            .map((r) => (
              <li key={r.student.id} className="td-reflection">
                <div className="td-sechead">
                  <Link to={`/teacher/classes/${cls.id}/students/${r.student.id}`} className="td-person__name">
                    {r.student.name}
                  </Link>
                  <span className="cluster td-xs td-faint" style={{ '--gap': '10px' }}>
                    <Stars value={r.rating} />
                    {r.minutes ? <span>{r.minutes} min</span> : null}
                    <span>{fmtDate(r.submittedAt)}</span>
                  </span>
                </div>
                {r.unclear ? (
                  <div className="td-reflection__quote">
                    <span className="td-xs td-faint" style={{ display: 'block', marginBottom: 4 }}>
                      What was unclear
                    </span>
                    {r.unclear}
                  </div>
                ) : (
                  <span className="td-xs td-faint">Nothing reported as unclear.</span>
                )}
              </li>
            ))}
        </ul>
      </div>
      <aside className="td-side">
        <div className="td-card">
          <h3 className="td-h3">Class averages</h3>
          <dl className="td-kv">
            <dt>Overall rating</dt>
            <dd>{averages.rating ? `${averages.rating} / 5` : '–'}</dd>
            <dt>Time taken</dt>
            <dd>{averages.minutes ? `${averages.minutes} min` : '–'}</dd>
            <dt>Reflections</dt>
            <dd>{reflections.length}</dd>
          </dl>
        </div>
        <div className="td-card">
          <h3 className="td-h3">Confidence by outcome</h3>
          <div className="td-confbars">
            {OUTCOMES.map((o) => {
              const v = averages.confidence?.[o.id]
              return (
                <div key={o.id} className="td-conf" title={o.text}>
                  <span className="td-conf__verb">{o.verb}</span>
                  <Meter value={v ? (v / 5) * 100 : 0} label={`${o.verb} confidence ${v ?? 'not rated'} of 5`} />
                  <span className="tabular td-small">{v ?? '–'}</span>
                </div>
              )
            })}
          </div>
          <p className="td-xs td-faint">1 not yet · 5 could teach it. Low scores point to the activity to revisit in class.</p>
        </div>
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TeacherClass() {
  const { classId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'students'
  const overview = useApi(`/api/teacher/classes/${classId}/overview`)
  const cls = overview.data?.class
  useDocTitle(cls ? cls.name : 'Class')

  const setCls = (c) => overview.setData((d) => ({ ...d, class: { ...d.class, ...c } }))
  const selectTab = (id) => {
    setParams(id === 'students' ? {} : { tab: id }, { replace: true })
    if (id === 'students' || id === 'stages') overview.reload(true)
  }
  const onTabKey = (e) => {
    const i = TABS.findIndex((t) => t.id === tab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
      selectTab(next.id)
      document.getElementById(`td-tab-${next.id}`)?.focus()
    }
  }

  if (overview.loading && !overview.data) {
    return (
      <div className="page page--wide td-page">
        <SkeletonRows rows={1} height={20} />
        <div style={{ height: 16 }} />
        <SkeletonRows rows={1} height={48} />
        <div style={{ height: 16 }} />
        <SkeletonRows rows={5} />
      </div>
    )
  }
  if (overview.error) {
    return (
      <div className="page page--wide td-page">
        <TeacherCrumbs items={[{ to: '/teacher', label: 'Teacher dashboard' }, { label: 'Class' }]} />
        <ErrorBox
          error={overview.error}
          onRetry={overview.error.status === 404 || overview.error.status === 403 ? null : overview.reload}
          title="Could not open this class."
        />
        <Link to="/teacher" className="btn btn--sm" style={{ marginTop: 12 }}>
          <Icon name="arrow-left" /> Back to your classes
        </Link>
      </div>
    )
  }

  const { students, averages, pendingGrading } = overview.data
  const panelId = `td-panel-${tab}`

  return (
    <div className="page page--wide td-page">
      <ClassHeader cls={cls} onChange={setCls} />

      <dl className="td-stats" aria-label="Class summary">
        <div>
          <dt>Students</dt>
          <dd>{students.length}</dd>
        </div>
        <div>
          <dt>Average progress</dt>
          <dd>{averages.pct}%</dd>
        </div>
        <div>
          <dt>Average grade</dt>
          <dd>{averages.grade} / 100</dd>
        </div>
        <div>
          <dt>Needs grading</dt>
          <dd>
            {pendingGrading ? (
              <button type="button" className="btn btn--ghost btn--sm" style={{ padding: 0, minHeight: 0 }} onClick={() => selectTab('submissions')}>
                {pendingGrading} submission{pendingGrading === 1 ? '' : 's'}
              </button>
            ) : (
              'None'
            )}
          </dd>
        </div>
      </dl>

      <div className="td-tabs">
        <div className="segmented" role="tablist" aria-label="Class sections" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`td-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`td-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
              {t.id === 'submissions' && pendingGrading > 0 && <span className="td-tabcount">{pendingGrading}</span>}
            </button>
          ))}
        </div>
      </div>

      <section id={panelId} role="tabpanel" aria-labelledby={`td-tab-${tab}`} tabIndex={-1}>
        {tab === 'students' && <StudentsTab data={overview.data} cls={cls} />}
        {tab === 'stages' && <StagesTab cls={cls} students={students} onChange={setCls} />}
        {tab === 'submissions' && <SubmissionsTab cls={cls} />}
        {tab === 'discussion' && <DiscussionTab cls={cls} />}
        {tab === 'feedback' && <FeedbackTab cls={cls} />}
      </section>
    </div>
  )
}
