import { Navigate, useLocation } from 'react-router-dom'
import { useSession, isTeacherRole } from '../lib/session.js'

export function PageLoading() {
  return (
    <div className="page route-loading" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 14, width: 140 }} />
      <div className="skeleton" style={{ height: 44, width: 'min(560px, 90%)' }} />
      <div className="skeleton" style={{ height: 18, width: 'min(420px, 70%)' }} />
      <div className="skeleton" style={{ height: 280, marginTop: 16 }} />
    </div>
  )
}

const nextParam = (loc) => `?next=${encodeURIComponent(loc.pathname + loc.search)}`

// Signed in (any role).
export function RequireAuth({ children }) {
  const status = useSession((s) => s.status)
  const loc = useLocation()
  if (status === 'loading') return <PageLoading />
  if (status === 'anon') return <Navigate to={`/login${nextParam(loc)}`} replace />
  return children
}

// Course content: students in a class (synced) or teachers (preview).
export function RequireLearner({ children }) {
  const status = useSession((s) => s.status)
  const learner = useSession((s) => s.learner)
  const loc = useLocation()
  if (status === 'loading' || (status === 'ready' && learner === 'loading')) return <PageLoading />
  if (status === 'anon') return <Navigate to={`/signup${nextParam(loc)}`} replace />
  if (learner === 'none') return <Navigate to={`/join${nextParam(loc)}`} replace />
  return children
}

export function RequireTeacher({ children }) {
  const status = useSession((s) => s.status)
  const role = useSession((s) => s.user?.role)
  const loc = useLocation()
  if (status === 'loading') return <PageLoading />
  if (status === 'anon') return <Navigate to={`/login${nextParam(loc)}`} replace />
  if (!isTeacherRole(role)) return <Navigate to="/course" replace />
  return children
}

export function RequireAdmin({ children }) {
  const status = useSession((s) => s.status)
  const role = useSession((s) => s.user?.role)
  const loc = useLocation()
  if (status === 'loading') return <PageLoading />
  if (status === 'anon') return <Navigate to={`/login${nextParam(loc)}`} replace />
  if (role !== 'admin') return <Navigate to="/teacher" replace />
  return children
}

// Signed-in users skip the login/signup pages.
export function GuestOnly({ children }) {
  const status = useSession((s) => s.status)
  const role = useSession((s) => s.user?.role)
  const loc = useLocation()
  if (status === 'loading') return <PageLoading />
  if (status === 'ready') {
    const next = new URLSearchParams(loc.search).get('next')
    return <Navigate to={next && next.startsWith('/') ? next : isTeacherRole(role) ? '/teacher' : '/course'} replace />
  }
  return children
}
