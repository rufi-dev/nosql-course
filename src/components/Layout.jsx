import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useStore, moduleProgress } from '../store.js'
import { useSession, isTeacherRole } from '../lib/session.js'
import { useSync } from '../lib/sync.js'
import { COURSE, BADGES } from '../data/course.js'
import Icon from './Icon.jsx'
import { Ring, EASE_OUT } from './ui.jsx'
import './Layout.css'

export function LogoMark({ size = 30, onDark = false }) {
  // A three-node replica set: one primary (saffron), two secondaries.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logomark">
      <path
        d="M16 7.5 7.5 23h17L16 7.5Z"
        fill="none"
        stroke={onDark ? 'var(--rack-ink-3)' : 'var(--rack-3)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="7.5" r="4.6" fill="var(--saffron)" stroke={onDark ? 'var(--rack)' : 'var(--paper)'} strokeWidth="2" />
      <circle cx="7.5" cy="23" r="4.2" fill={onDark ? 'var(--mint)' : 'var(--rack-2)'} stroke={onDark ? 'var(--rack)' : 'var(--paper)'} strokeWidth="2" />
      <circle cx="24.5" cy="23" r="4.2" fill={onDark ? 'var(--mint)' : 'var(--rack-2)'} stroke={onDark ? 'var(--rack)' : 'var(--paper)'} strokeWidth="2" />
    </svg>
  )
}

const NAV = {
  anon: [
    { to: '/', label: 'Overview', end: true },
    { to: '/playground', label: 'Playground' },
    { to: '/lesson-plan', label: 'Lesson plan' },
  ],
  student: [
    { to: '/', label: 'Overview', end: true },
    { to: '/course', label: 'My course' },
    { to: '/module/1', label: 'Module 1' },
    { to: '/playground', label: 'Playground' },
  ],
  teacher: [
    { to: '/', label: 'Overview', end: true },
    { to: '/teacher', label: 'Dashboard' },
    { to: '/module/1', label: 'Preview course' },
    { to: '/lesson-plan', label: 'Lesson plan' },
    { to: '/playground', label: 'Playground' },
  ],
}

const SYNC_LABEL = {
  saved: { icon: 'check', text: 'Saved' },
  saving: { icon: 'upload', text: 'Saving' },
  pending: { icon: 'clock', text: 'Saving' },
  offline: { icon: 'wifi-off', text: 'Offline, will retry' },
  error: { icon: 'alert', text: 'Not saved, retrying' },
}

function SyncStatus() {
  const status = useSync((s) => s.status)
  const label = SYNC_LABEL[status]
  if (!label) return null
  return (
    <span className={`syncstatus syncstatus--${status}`} role="status" aria-live="polite" title={label.text}>
      <Icon name={label.icon} />
      <span className="syncstatus__text">{label.text}</span>
    </span>
  )
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function AccountMenu({ dark }) {
  const { user, classes, currentClassId, switchClass, logout } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const teacher = isTeacherRole(user.role)
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const current = classes.find((c) => c.id === currentClassId)
  return (
    <div className="acct" ref={ref}>
      <button
        type="button"
        className={`toolchip acct__btn ${dark ? 'is-dark' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="acct__avatar" aria-hidden="true">
          {initials(user.name) || <Icon name="user" />}
        </span>
        <span className="acct__name">{user.name.split(' ')[0]}</span>
        <Icon name="chevron-down" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="acct__menu"
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <div className="acct__who">
              <strong>{user.name}</strong>
              <span className="faint">{user.email}</span>
              <span className="chip chip--outline acct__role">
                {user.role === 'admin' ? 'Admin teacher' : teacher ? 'Teacher' : 'Student'}
              </span>
            </div>
            {!teacher && (
              <div className="acct__section">
                <div className="acct__label">Class</div>
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={c.id === currentClassId}
                    className={`acct__item ${c.id === currentClassId ? 'is-current' : ''}`}
                    onClick={async () => {
                      setOpen(false)
                      if (c.id !== currentClassId) {
                        await switchClass(c.id)
                        navigate('/course')
                      }
                    }}
                  >
                    <span>{c.name}</span>
                    {c.id === currentClassId && <Icon name="check" />}
                  </button>
                ))}
                <Link to="/join" role="menuitem" className="acct__item">
                  <span>{current ? 'Join another class' : 'Join a class'}</span>
                  <Icon name="plus" />
                </Link>
              </div>
            )}
            <div className="acct__section">
              {teacher && (
                <Link to="/teacher" role="menuitem" className="acct__item">
                  <span>Teacher dashboard</span>
                  <Icon name="grid" />
                </Link>
              )}
              {user.role === 'admin' && (
                <Link to="/admin/users" role="menuitem" className="acct__item">
                  <span>Users and roles</span>
                  <Icon name="users" />
                </Link>
              )}
              {!teacher && (
                <>
                  <Link to="/grades" role="menuitem" className="acct__item">
                    <span>Grades</span>
                    <Icon name="chart" />
                  </Link>
                  <Link to="/badges" role="menuitem" className="acct__item">
                    <span>Badges and certificate</span>
                    <Icon name="award" />
                  </Link>
                </>
              )}
              <Link to="/settings" role="menuitem" className="acct__item">
                <span>Settings</span>
                <Icon name="settings" />
              </Link>
              <button
                type="button"
                role="menuitem"
                className="acct__item"
                onClick={async () => {
                  setOpen(false)
                  await logout()
                  navigate('/')
                }}
              >
                <span>Log out</span>
                <Icon name="arrow-up-right" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TopBar({ dark }) {
  const activities = useStore((s) => s.activities)
  const badges = useStore((s) => s.badges)
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  const learner = useSession((s) => s.learner)
  const { pct } = moduleProgress(activities)
  const earned = Object.keys(badges).length
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const role = !user ? 'anon' : isTeacherRole(user.role) ? 'teacher' : 'student'
  const nav = NAV[role]

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const mobileExtra =
    role === 'anon'
      ? [
          { to: '/login', label: 'Log in' },
          { to: '/signup', label: 'Create account' },
        ]
      : role === 'student'
        ? [
            { to: '/grades', label: 'Grades' },
            { to: '/badges', label: 'Badges' },
            { to: '/settings', label: 'Settings' },
          ]
        : [{ to: '/settings', label: 'Settings' }]

  return (
    <header className={`topbar ${dark ? 'topbar--dark' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="topbar__inner page page--wide">
        <Link to="/" className="brand" aria-label={`${COURSE.title}, overview`}>
          <LogoMark onDark={dark} />
          <span className="brand__text">
            <span className="brand__name">NoSQL & NewSQL</span>
            <span className="brand__sub">Distributed Architectures</span>
          </span>
        </Link>

        <nav className="topnav" aria-label="Main">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="topnav__link">
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar__tools">
          {status === 'loading' ? (
            <span className="skeleton topbar__skel" aria-hidden="true" />
          ) : role === 'anon' ? (
            <>
              <Link to="/login" className={`btn btn--sm topbar__login ${dark ? 'btn--on-dark' : 'btn--ghost'}`}>
                Log in
              </Link>
              <Link to="/signup" className="btn btn--sm btn--primary topbar__signup">
                Create account
              </Link>
            </>
          ) : (
            <>
              {learner === 'synced' && <SyncStatus />}
              {role === 'student' && (
                <>
                  <Link to="/badges" className="toolchip toolchip--badges" aria-label={`Badges: ${earned} of ${BADGES.length} earned`}>
                    <Icon name="award" />
                    <span className="tabular">
                      {earned}/{BADGES.length}
                    </span>
                  </Link>
                  <Link to="/grades" className="toolchip toolchip--progress" aria-label={`Module 1 progress ${pct}%, open grades`}>
                    <Ring
                      value={pct}
                      size={24}
                      stroke={3}
                      track={dark ? 'oklch(1 0 0 / 0.15)' : 'var(--paper-3)'}
                      color={dark ? 'var(--mint)' : 'var(--leaf)'}
                    />
                    <span className="tabular">{pct}%</span>
                  </Link>
                </>
              )}
              <AccountMenu dark={dark} />
            </>
          )}
          <button
            type="button"
            className="toolchip toolchip--icon menu-btn"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Main"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
          >
            {[...nav, ...mobileExtra].map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="mobile-nav__link">
                {n.label}
                <Icon name="chevron-right" />
              </NavLink>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function Footer({ flush }) {
  return (
    <footer className={`site-footer ${flush ? 'site-footer--flush' : ''}`}>
      <div className="page page--wide site-footer__inner">
        <div className="site-footer__brand">
          <LogoMark size={26} />
          <div>
            <div className="site-footer__title">{COURSE.title}</div>
            <div className="faint">Progress is saved to your account and shared with your teacher.</div>
          </div>
        </div>
        <nav className="site-footer__links" aria-label="Footer">
          <Link to="/course">My course</Link>
          <Link to="/grades">Grades</Link>
          <Link to="/badges">Badges</Link>
          <Link to="/lesson-plan">90-minute lesson plan</Link>
          <Link to="/playground">Playground</Link>
          <Link to="/settings">Settings and data</Link>
        </nav>
        <div className="site-footer__ext">
          <span className="faint">External tools</span>
          {COURSE.externalTools.map((t) => (
            <a key={t.url} href={t.url} target="_blank" rel="noreferrer">
              {t.name}
              <Icon name="arrow-up-right" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className="toast"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="toast__icon">
              <Icon name={t.icon || 'check'} />
            </span>
            <div>
              <div className="toast__title">{t.title}</div>
              {t.body ? <div className="toast__body">{t.body}</div> : null}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="x" width={16} height={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function ScrollManager() {
  const { pathname } = useLocation()
  const setLastVisited = useStore((s) => s.setLastVisited)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (pathname.startsWith('/module/1/')) setLastVisited(pathname)
  }, [pathname, setLastVisited])
  return null
}

export default function SiteLayout() {
  const motionPref = useStore((s) => s.settings.motion)
  const { pathname } = useLocation()
  const dark = pathname === '/'
  useEffect(() => {
    if (motionPref === 'reduce') document.documentElement.dataset.motion = 'reduce'
    else delete document.documentElement.dataset.motion
  }, [motionPref])

  return (
    <MotionConfig reducedMotion={motionPref === 'reduce' ? 'always' : motionPref === 'full' ? 'never' : 'user'}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ScrollManager />
      <TopBar dark={dark} />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer flush={dark} />
      <Toasts />
    </MotionConfig>
  )
}
