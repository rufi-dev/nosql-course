import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import { Callout, EASE_EXPO } from '../components/ui.jsx'
import { GUIDED, SEED_POSTS } from '../data/forum.js'
import { api } from '../lib/api.js'
import { applyServerState } from '../lib/sync.js'
import { useSession } from '../lib/session.js'
import './Discussion.css'

// The class thread lives on the server: everyone in the class sees the same
// posts, replies and "Helpful" counts. The course team's example answers are
// static and shown separately, never mixed into the class thread.

const MAX = 1500
const MIN = 10
const REFRESH_MS = 30_000

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function when(ts) {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 8) return `${d} day${d === 1 ? '' : 's'} ago`
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(ts)
}

function RichText({ text }) {
  return text.split(/(`[^`\n]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part,
  )
}

/* ------------------------------------------------------------------ */

function Composer({ parentId = null, onPost, onDone, autoFocus = false, compact = false }) {
  const userName = useSession((s) => s.user?.name)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [posting, setPosting] = useState(false)
  const id = parentId ? `dsc-reply-${parentId}` : 'dsc-new'

  const submit = async (e) => {
    e.preventDefault()
    if (body.trim().length < MIN) {
      setError(`Write at least ${MIN} characters.`)
      return
    }
    setPosting(true)
    setError('')
    try {
      await onPost(body.trim(), parentId)
      setBody('')
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setPosting(false)
    }
  }

  return (
    <form className={`dsc-composer ${compact ? 'dsc-composer--compact' : ''}`} onSubmit={submit}>
      {!compact && (
        <p className="dsc-composer__as">
          <span className="dsc-avatar dsc-avatar--mine" aria-hidden="true">
            {initials(userName)}
          </span>
          <span>
            Posting as <strong>{userName}</strong>. <Link to="/settings">Change your name</Link>
          </span>
        </p>
      )}
      <div className="field">
        <label className={compact ? 'visually-hidden' : 'label'} htmlFor={`${id}-body`}>
          {parentId ? 'Your reply' : 'Your answer'}
        </label>
        <textarea
          id={`${id}-body`}
          className="textarea"
          rows={compact ? 3 : 5}
          maxLength={MAX}
          value={body}
          autoFocus={autoFocus}
          disabled={posting}
          onChange={(e) => {
            setBody(e.target.value)
            if (error) setError('')
          }}
          placeholder={
            parentId
              ? 'Build on the point, or ask a question about it.'
              : 'Name the system, the operation that matters most, and your shard key with its cost.'
          }
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? 'true' : undefined}
        />
        <div className="dsc-composer__foot" id={`${id}-hint`}>
          <span className="hint">
            Wrap code in backticks: <code>`{'{ stock: 1 }'}`</code>
          </span>
          <span className="hint tabular">
            {body.length}/{MAX}
          </span>
        </div>
      </div>
      {error ? (
        <p className="dsc-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dsc-composer__actions">
        {onDone && parentId ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDone} disabled={posting}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className={`btn btn--dark ${compact ? 'btn--sm' : ''}`} disabled={posting || body.trim().length < MIN}>
          <Icon name={posting ? 'clock' : parentId ? 'reply' : 'chat'} />
          {posting ? 'Posting…' : parentId ? 'Post reply' : 'Post to the discussion'}
        </button>
      </div>
    </form>
  )
}

function Post({ post, replies = [], isReply = false, actions }) {
  const [replying, setReplying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const reduce = useReducedMotion()
  const teacher = post.author.role === 'teacher'

  const remove = async () => {
    setBusy(true)
    try {
      await actions.remove(post.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.li
      layout={!reduce}
      className={`dsc-post ${isReply ? 'dsc-post--reply' : ''}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.45, ease: EASE_EXPO }}
    >
      <article
        className={`dsc-card ${teacher ? 'dsc-card--ta' : ''} ${post.mine ? 'dsc-card--mine' : ''}`}
        aria-label={`Post by ${post.author.name}`}
      >
        <header className="dsc-card__head">
          <span className={`dsc-avatar ${teacher ? 'dsc-avatar--ta' : post.mine ? 'dsc-avatar--mine' : ''}`} aria-hidden="true">
            {initials(post.author.name)}
          </span>
          <div className="dsc-card__who">
            <span className="dsc-card__author">{post.author.name}</span>
            <span className="dsc-card__meta">
              {teacher && <span className="chip chip--done">Teacher</span>}
              {post.mine && <span className="chip chip--info">You</span>}
              <time dateTime={new Date(post.at).toISOString()} className="faint">
                {when(post.at)}
              </time>
            </span>
          </div>
        </header>
        <p className="dsc-card__body">
          <RichText text={post.body} />
        </p>
        <footer className="dsc-card__actions">
          <button
            type="button"
            className={`dsc-act ${post.likedByMe ? 'is-on' : ''}`}
            aria-pressed={post.likedByMe}
            onClick={() => actions.like(post.id)}
          >
            <Icon name="thumb" />
            Helpful
            <span className="tabular">{post.likes}</span>
          </button>
          {!isReply && (
            <button type="button" className="dsc-act" onClick={() => setReplying((r) => !r)} aria-expanded={replying}>
              <Icon name="reply" />
              Reply
            </button>
          )}
          {post.mine &&
            (confirmDelete ? (
              <span className="dsc-confirm">
                <span className="hint">Delete{replies.length ? ' this post and its replies' : ''}?</span>
                <button type="button" className="btn btn--danger btn--sm" onClick={remove} disabled={busy}>
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="dsc-act dsc-act--quiet" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" />
                Delete
              </button>
            ))}
        </footer>
      </article>

      {(replies.length > 0 || replying) && (
        <div className="dsc-replies">
          <ul className="dsc-list">
            <AnimatePresence initial={false}>
              {replies.map((r) => (
                <Post key={r.id} post={r} isReply actions={actions} />
              ))}
            </AnimatePresence>
          </ul>
          <AnimatePresence initial={false}>
            {replying && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.3, ease: EASE_EXPO }}
              >
                <Composer parentId={post.id} onPost={actions.post} compact autoFocus onDone={() => setReplying(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  )
}

function ExampleCard({ p, reply }) {
  const ta = p.role === 'ta'
  return (
    <li className={`dsc-post ${reply ? 'dsc-post--reply' : ''}`}>
      <article className={`dsc-card dsc-card--sample ${ta ? 'dsc-card--ta' : ''}`} aria-label={`Example by ${p.author}`}>
        <header className="dsc-card__head">
          <span className={`dsc-avatar ${ta ? 'dsc-avatar--ta' : ''}`} aria-hidden="true">
            {initials(p.author)}
          </span>
          <div className="dsc-card__who">
            <span className="dsc-card__author">{p.author}</span>
            <span className="dsc-card__meta">
              {ta && <span className="chip chip--done">Teaching assistant</span>}
              <span className="chip chip--outline">Example</span>
            </span>
          </div>
        </header>
        <p className="dsc-card__body">
          <RichText text={p.body} />
        </p>
      </article>
    </li>
  )
}

// Read-only example answers written for the course.
function Examples() {
  const tops = SEED_POSTS.filter((p) => !p.parentId)
  const repliesOf = (id) => SEED_POSTS.filter((p) => p.parentId === id).sort((a, b) => a.at - b.at)
  return (
    <details className="dsc-examples">
      <summary>
        <Icon name="bulb" />
        <span className="dsc-examples__title">Example answers from the course team</span>
        <span className="faint dsc-examples__meta">{SEED_POSTS.length} posts · not from your class</span>
        <Icon name="chevron-down" className="dsc-examples__chev" />
      </summary>
      <div className="dsc-examples__body">
        <p className="muted">
          Written for the course to show the depth expected. Read one or two, then answer about a system you know.
        </p>
        <ul className="dsc-list">
          {tops.map((p) => (
            <ExampleCard key={p.id} p={p} />
          ))}
        </ul>
        {tops.map((p) =>
          repliesOf(p.id).length ? (
            <div key={`r-${p.id}`} className="dsc-replies dsc-examples__replies">
              <div className="dsc-examples__replyto faint">Replies to {p.author}</div>
              <ul className="dsc-list">
                {repliesOf(p.id).map((r) => (
                  <ExampleCard key={r.id} p={r} reply />
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </details>
  )
}

/* ------------------------------------------------------------------ */

export default function Discussion() {
  const learner = useSession((s) => s.learner)
  const preview = learner === 'preview'
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState('')
  const [sort, setSort] = useState('top')
  const listRef = useRef(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError('')
    try {
      const res = await api.get('/api/forum')
      setPosts(res.posts)
      setError('')
    } catch (err) {
      if (!quiet) setError(err.message)
    }
  }, [])

  // First load, then refresh every 30 s while the page is visible.
  useEffect(() => {
    if (preview) return undefined
    load()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load(true)
    }, REFRESH_MS)
    const onVis = () => document.visibilityState === 'visible' && load(true)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [preview, load])

  const actions = useMemo(
    () => ({
      post: async (body, parentId) => {
        const res = await api.post('/api/forum', { body, ...(parentId ? { parentId } : null) })
        setPosts(res.posts)
        if (res.state) applyServerState(res.state)
      },
      remove: async (id) => {
        try {
          const res = await api.del(`/api/forum/${id}`)
          setPosts(res.posts)
          if (res.state) applyServerState(res.state)
        } catch (err) {
          setError(err.message)
        }
      },
      like: async (id) => {
        // Optimistic toggle, corrected by the server's answer.
        setPosts((ps) =>
          ps.map((p) => (p.id === id ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) } : p)),
        )
        try {
          const res = await api.post(`/api/forum/${id}/like`)
          setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, likes: res.likes, likedByMe: res.likedByMe } : p)))
        } catch (err) {
          setError(err.message)
          load(true)
        }
      },
    }),
    [load],
  )

  const { threads, total } = useMemo(() => {
    const all = posts || []
    const tops = all.filter((p) => !p.parentId)
    const repliesOf = (id) => all.filter((p) => p.parentId === id).sort((a, b) => a.at - b.at)
    const lastActivity = (p) => Math.max(p.at, ...repliesOf(p.id).map((r) => r.at))
    const sorted = [...tops].sort((a, b) => (sort === 'top' ? b.likes - a.likes || b.at - a.at : lastActivity(b) - lastActivity(a)))
    return { threads: sorted.map((p) => ({ post: p, replies: repliesOf(p.id) })), total: all.length }
  }, [posts, sort])

  const mine = (posts || []).filter((p) => p.mine).length

  return (
    <ActivityFrame id="discussion">
      <div className="dsc">
        <section className="dsc-guided" aria-labelledby="dsc-guided-title">
          <div className="dsc-guided__main">
            <span className="kicker kicker--on-dark">Guided question · Module 1</span>
            <h2 id="dsc-guided-title" className="dsc-guided__title">
              {GUIDED.title}
            </h2>
            <p className="dsc-guided__prompt">{GUIDED.prompt}</p>
          </div>
          <ol className="dsc-guided__think" aria-label="Questions to think about">
            {GUIDED.thinking.map((q, i) => (
              <li key={q}>
                <span className="dsc-guided__n">{i + 1}</span>
                {q}
              </li>
            ))}
          </ol>
        </section>

        {preview ? (
          <Callout tone="info" icon="eye" title="Teacher preview:">
            students post here and see their own class thread. To read and reply to a class, open it from your{' '}
            <Link to="/teacher">dashboard</Link>.
          </Callout>
        ) : (
          <>
            <section className="dsc-compose" aria-labelledby="dsc-compose-title">
              <div className="dsc-compose__head">
                <h3 id="dsc-compose-title" className="dsc-compose__title">
                  {mine ? 'Add another answer' : 'Post your answer'}
                </h3>
                {mine ? (
                  <span className="chip chip--done">
                    <Icon name="check" />
                    You have posted {mine} time{mine === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="hint">Your first post completes this activity.</span>
                )}
              </div>
              <Composer
                onPost={actions.post}
                onDone={() => requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}
              />
            </section>

            <section className="dsc-thread" aria-labelledby="dsc-thread-title" ref={listRef}>
              <div className="dsc-thread__head">
                <h3 id="dsc-thread-title" className="rule-label">
                  {posts ? `${total} post${total === 1 ? '' : 's'} in your class` : 'Your class'}
                </h3>
                <div className="segmented" role="group" aria-label="Sort posts">
                  <button type="button" aria-pressed={sort === 'top'} onClick={() => setSort('top')}>
                    Top
                  </button>
                  <button type="button" aria-pressed={sort === 'new'} onClick={() => setSort('new')}>
                    Newest
                  </button>
                </div>
              </div>
              {error ? (
                <Callout tone="warn" title="The discussion could not update.">
                  {error}{' '}
                  <button type="button" className="btn btn--sm" onClick={() => load()}>
                    <Icon name="reset" />
                    Try again
                  </button>
                </Callout>
              ) : null}
              {!posts && !error ? (
                <div className="dsc-loading" aria-busy="true" aria-label="Loading posts">
                  <div className="skeleton" style={{ height: 120 }} />
                  <div className="skeleton" style={{ height: 120 }} />
                </div>
              ) : posts && posts.length === 0 ? (
                <div className="dsc-empty">
                  <span className="dsc-empty__icon">
                    <Icon name="chat" />
                  </span>
                  <div>
                    <div className="dsc-empty__title">No posts in your class yet</div>
                    <p className="muted">Be the first: your answer starts the conversation for everyone in the class.</p>
                  </div>
                </div>
              ) : (
                <ul className="dsc-list">
                  <AnimatePresence initial={false}>
                    {threads.map(({ post, replies }) => (
                      <Post key={post.id} post={post} replies={replies} actions={actions} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </section>
          </>
        )}

        <Examples />

        {!preview && (
          <Callout tone="info">
            Everyone in your class sees these posts, replies and “Helpful” marks, with the name on your account. Your
            teacher can reply and remove posts. The thread refreshes every 30 seconds.
          </Callout>
        )}
      </div>
    </ActivityFrame>
  )
}
