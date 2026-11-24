import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import ActivityFrame from '../components/ActivityFrame.jsx'
import Icon from '../components/Icon.jsx'
import { Callout, EASE_EXPO } from '../components/ui.jsx'
import { useStore } from '../store.js'
import { GUIDED, SEED_POSTS } from '../data/forum.js'
import './Discussion.css'

const MAX = 1500
const MIN = 10

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

function Composer({ parentId = null, onDone, autoFocus = false, compact = false }) {
  const name = useStore((s) => s.profile.name)
  const setName = useStore((s) => s.setName)
  const addPost = useStore((s) => s.addPost)
  const [draftName, setDraftName] = useState(name || '')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const id = parentId ? `dsc-reply-${parentId}` : 'dsc-new'
  const needName = !name

  const submit = (e) => {
    e.preventDefault()
    const author = (name || draftName).trim()
    if (!author) {
      setError('Add a display name so others know who posted.')
      document.getElementById(`${id}-name`)?.focus()
      return
    }
    if (body.trim().length < MIN) {
      setError(`Write at least ${MIN} characters.`)
      return
    }
    if (needName) setName(author)
    addPost({ parentId, author, role: 'learner', body: body.trim() })
    setBody('')
    setError('')
    onDone?.()
  }

  return (
    <form className={`dsc-composer ${compact ? 'dsc-composer--compact' : ''}`} onSubmit={submit}>
      {needName && (
        <div className="field dsc-composer__name">
          <label className="label" htmlFor={`${id}-name`}>
            Display name
          </label>
          <input
            id={`${id}-name`}
            className="input"
            value={draftName}
            maxLength={40}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => draftName.trim() && setName(draftName.trim())}
            placeholder="How classmates will see you"
            autoComplete="nickname"
          />
        </div>
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
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className={`btn btn--dark ${compact ? 'btn--sm' : ''}`} disabled={body.trim().length < MIN}>
          <Icon name={parentId ? 'reply' : 'chat'} />
          {parentId ? 'Post reply' : 'Post to the discussion'}
        </button>
      </div>
    </form>
  )
}

function Post({ post, replies = [], isReply = false }) {
  const liked = useStore((s) => Boolean(s.forum.likes[post.id]))
  const toggleLike = useStore((s) => s.toggleLike)
  const deletePost = useStore((s) => s.deletePost)
  const [replying, setReplying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const reduce = useReducedMotion()
  const count = (post.helpful || 0) + (liked ? 1 : 0)
  const ta = post.role === 'ta'

  return (
    <motion.li
      layout={!reduce}
      className={`dsc-post ${isReply ? 'dsc-post--reply' : ''}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.45, ease: EASE_EXPO }}
    >
      <article className={`dsc-card ${ta ? 'dsc-card--ta' : ''} ${post.mine ? 'dsc-card--mine' : ''}`} aria-label={`Post by ${post.author}`}>
        <header className="dsc-card__head">
          <span className={`dsc-avatar ${ta ? 'dsc-avatar--ta' : post.mine ? 'dsc-avatar--mine' : ''}`} aria-hidden="true">
            {initials(post.author)}
          </span>
          <div className="dsc-card__who">
            <span className="dsc-card__author">{post.author}</span>
            <span className="dsc-card__meta">
              {ta && <span className="chip chip--done">Teaching assistant</span>}
              {post.mine && <span className="chip chip--info">You</span>}
              {post.sample && <span className="chip chip--outline">Sample post</span>}
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
            className={`dsc-act ${liked ? 'is-on' : ''}`}
            aria-pressed={liked}
            onClick={() => toggleLike(post.id)}
          >
            <Icon name="thumb" />
            Helpful
            <span className="tabular">{count}</span>
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
                <button type="button" className="btn btn--danger btn--sm" onClick={() => deletePost(post.id)}>
                  Delete
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>
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
                <Post key={r.id} post={r} isReply />
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
                <Composer parentId={post.id} compact autoFocus onDone={() => setReplying(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  )
}

/* ------------------------------------------------------------------ */

export default function Discussion() {
  const userPosts = useStore((s) => s.forum.posts)
  const likes = useStore((s) => s.forum.likes)
  const [sort, setSort] = useState('top')
  const listRef = useRef(null)

  const { threads, total } = useMemo(() => {
    const all = [...SEED_POSTS.map((p) => ({ ...p, sample: true })), ...userPosts.map((p) => ({ ...p, helpful: 0 }))]
    const score = (p) => (p.helpful || 0) + (likes[p.id] ? 1 : 0)
    const tops = all.filter((p) => !p.parentId)
    const repliesOf = (id) => all.filter((p) => p.parentId === id).sort((a, b) => a.at - b.at)
    const lastActivity = (p) => Math.max(p.at, ...repliesOf(p.id).map((r) => r.at))
    const sorted = [...tops].sort((a, b) =>
      sort === 'top' ? score(b) - score(a) || b.at - a.at : lastActivity(b) - lastActivity(a),
    )
    return { threads: sorted.map((p) => ({ post: p, replies: repliesOf(p.id) })), total: all.length }
  }, [userPosts, likes, sort])

  const mine = userPosts.length

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
            onDone={() =>
              requestAnimationFrame(() =>
                listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              )
            }
          />
        </section>

        <section className="dsc-thread" aria-labelledby="dsc-thread-title" ref={listRef}>
          <div className="dsc-thread__head">
            <h3 id="dsc-thread-title" className="rule-label">
              {total} posts
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
          <ul className="dsc-list">
            <AnimatePresence initial={false}>
              {threads.map(({ post, replies }) => (
                <Post key={post.id} post={post} replies={replies} />
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <Callout tone="info">
          Posts, replies and “Helpful” marks are saved in this browser only. Classmates on other devices will not see
          them. Posts marked “Sample post” were written for the course to start the conversation.
        </Callout>
      </div>
    </ActivityFrame>
  )
}
