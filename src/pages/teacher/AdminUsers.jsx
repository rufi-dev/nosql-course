import { useMemo, useState } from 'react'
import { api } from '../../lib/api.js'
import { useSession } from '../../lib/session.js'
import { Callout, useDocTitle } from '../../components/ui.jsx'
import { useApi, ErrorBox, SkeletonRows, TeacherCrumbs, SearchIcon, relTime, fmtDate, initials } from './shared.jsx'
import './teacher.css'

const ROLE_LABEL = { student: 'Student', teacher: 'Teacher', admin: 'Admin' }

function RoleSelect({ user, me, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const self = user.id === me
  const change = async (role) => {
    if (role === user.role) return
    setBusy(true)
    setError('')
    try {
      const { user: u } = await api.patch(`/api/admin/users/${user.id}`, { role })
      onChanged(u)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <label className="visually-hidden" htmlFor={`role-${user.id}`}>
        Role for {user.name}
      </label>
      <select
        id={`role-${user.id}`}
        className="select td-role"
        value={user.role}
        disabled={busy || self}
        onChange={(e) => change(e.target.value)}
        title={self ? 'You cannot change your own role' : undefined}
        aria-describedby={error ? `role-err-${user.id}` : undefined}
      >
        {Object.entries(ROLE_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {self && <span className="td-xs td-faint" style={{ display: 'block', marginTop: 4 }}>This is you</span>}
      {error && (
        <span className="td-rowerror" id={`role-err-${user.id}`} role="alert">
          {error}
        </span>
      )}
    </>
  )
}

export default function AdminUsers() {
  useDocTitle('Users and roles')
  const me = useSession((s) => s.user?.id)
  const { loading, data, error, reload, setData } = useApi('/api/admin/users')
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')

  const users = useMemo(() => data?.users || [], [data])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return users.filter(
      (u) => (role === 'all' || u.role === role) && (!needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)),
    )
  }, [users, q, role])
  const counts = users.reduce((acc, u) => ({ ...acc, [u.role]: (acc[u.role] || 0) + 1 }), {})

  const onChanged = (u) => setData((d) => ({ users: d.users.map((x) => (x.id === u.id ? { ...x, role: u.role } : x)) }))

  return (
    <div className="page page--wide td-page">
      <header className="td-head" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <TeacherCrumbs items={[{ to: '/teacher', label: 'Teacher dashboard' }, { label: 'Users and roles' }]} />
        <div className="td-head__titles">
          <div className="kicker">Admin</div>
          <h1 className="td-title">Users and roles</h1>
          <p className="td-sub">
            Everyone signs up as a student. Make colleagues teachers here so they can create classes. Admins can also manage roles.
          </p>
        </div>
      </header>

      <Callout tone="info" title="Before demoting a teacher:">
        archive or hand over their classes first. Changing someone to a teacher removes them from student progress tracking.
      </Callout>

      <div className="td-section" style={{ marginTop: 'var(--s-5)', gap: 'var(--s-3)' }}>
        <div className="td-toolbar">
          <label className="td-search">
            <span className="visually-hidden">Search users</span>
            <SearchIcon />
            <input className="input" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="segmented" role="group" aria-label="Filter by role">
            {[
              ['all', `All ${users.length}`],
              ['student', `Students ${counts.student || 0}`],
              ['teacher', `Teachers ${counts.teacher || 0}`],
              ['admin', `Admins ${counts.admin || 0}`],
            ].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={role === v} onClick={() => setRole(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading && <SkeletonRows rows={5} />}
        {error && <ErrorBox error={error} onRetry={reload} title="Could not load users." />}
        {!loading && !error && (
          <div className="table-wrap">
            <table className="table td-table">
              <caption className="visually-hidden">All user accounts</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Last active</th>
                  <th scope="col" className="num">
                    Classes taught
                  </th>
                  <th scope="col" className="num">
                    Classes joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="td-person">
                        <span className="td-avatar" aria-hidden="true">
                          {initials(u.name)}
                        </span>
                        <span>
                          <span className="td-person__name">{u.name}</span>
                          <span className="td-person__email">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <RoleSelect user={u} me={me} onChanged={onChanged} />
                    </td>
                    <td className="td-small td-nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="td-small td-nowrap">{relTime(u.lastSeenAt)}</td>
                    <td className="num tabular">{u.classesTaught}</td>
                    <td className="num tabular">{u.classesJoined}</td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={6} className="td-muted">
                      No user matches this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
