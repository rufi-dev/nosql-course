// Who is signed in, their classes, and how the learner store is driven:
//   'synced'  student in a class: progress loaded from and saved to the server
//   'preview' teacher or admin: everything unlocked, nothing saved
//   'none'    student without a class yet (must join one)
import { create } from 'zustand'
import { api } from './api.js'
import { useStore } from '../store.js'
import { STAGES } from '../data/course.js'
import { startSync, stopSync, flush } from './sync.js'

const ALL_OPEN = () => Object.fromEntries(STAGES.map((s) => [s.id, { via: 'teacher', at: Date.now() }]))

export const isTeacherRole = (role) => role === 'teacher' || role === 'admin'

export const useSession = create((set, get) => ({
  status: 'loading', // 'loading' | 'anon' | 'ready'
  learner: 'loading', // 'loading' | 'synced' | 'preview' | 'none'
  user: null,
  classes: [],
  currentClassId: null,
  error: null,

  currentClass: () => get().classes.find((c) => c.id === get().currentClassId) || null,

  async init() {
    try {
      await get().apply(await api.get('/api/auth/me'))
    } catch (err) {
      set({ status: 'anon', learner: 'none', error: err.message })
    }
  },

  // Apply a session payload from the API and (re)start the learner store.
  async apply(payload) {
    const { user, classes = [], currentClassId = null } = payload || {}
    const prevUser = get().user
    const prevClass = get().currentClassId
    set({ user, classes, currentClassId, status: user ? 'ready' : 'anon', error: null })
    const st = useStore.getState()
    st.setName(user?.name || '')

    const sameLearner = prevUser?.id === user?.id && prevClass === currentClassId && get().learner === 'synced'
    if (sameLearner) return

    stopSync()
    st.resetLearner()
    if (!user) return set({ learner: 'none' })
    if (isTeacherRole(user.role)) {
      st.resetLearner({ stages: { opened: {}, unlocked: ALL_OPEN() } })
      return set({ learner: 'preview' })
    }
    if (!currentClassId) return set({ learner: 'none' })
    set({ learner: 'loading' })
    try {
      const { state } = await api.get('/api/progress')
      startSync(state)
      set({ learner: 'synced' })
    } catch (err) {
      if (err.code === 'no_class') set({ learner: 'none' })
      else set({ learner: 'none', error: err.message })
    }
  },

  async login(email, password) {
    await get().apply(await api.post('/api/auth/login', { email, password }))
  },
  async signup({ name, email, password, joinCode }) {
    await get().apply(await api.post('/api/auth/signup', { name, email, password, joinCode }))
  },
  async logout() {
    await flush().catch(() => {})
    stopSync()
    await api.post('/api/auth/logout').catch(() => {})
    await get().apply({ user: null })
  },
  async join(code) {
    await flush().catch(() => {})
    await get().apply(await api.post('/api/classes/join', { code }))
  },
  async switchClass(classId) {
    await flush().catch(() => {})
    await get().apply(await api.post('/api/classes/current', { classId }))
  },
  async updateName(name) {
    const payload = await api.patch('/api/auth/me', { name })
    set({ user: payload.user })
    useStore.getState().setName(payload.user.name)
  },
  // Re-read classes (e.g. after a teacher creates one) without touching progress.
  async reload() {
    const payload = await api.get('/api/auth/me')
    set({ user: payload.user, classes: payload.classes, currentClassId: payload.currentClassId })
  },
}))

// The sync layer asks for a re-check when the server says the session or class is gone.
if (typeof window !== 'undefined') {
  window.addEventListener('nsql:session-check', () => {
    const { learner } = useSession.getState()
    useSession.setState({ learner: learner === 'synced' ? 'loading' : learner })
    useSession.getState().init()
  })
}
