import { COURSE, LABS } from '../data/course.js'
import { labProgress } from '../store.js'

// Derives the learner's grade report from store state.
// Each item: { key, label, weight, status, pct (0-100 or null when not started) }
export function computeGrades(state) {
  const labKeys = Object.keys(LABS)
  const labPcts = labKeys.map((k) => labProgress(state.labs, k).pct)
  const labsDone = labPcts.filter((p) => p === 100).length
  const labsStarted = labPcts.some((p) => p > 0)
  const labsPct = Math.round(labPcts.reduce((a, b) => a + b, 0) / labKeys.length)

  const attempts = state.quiz.attempts.length
  const reviews = Object.values(state.workshop.reviews || {})
  const peerPct = reviews.length
    ? Math.round(
        (reviews.reduce((s, r) => s + (typeof r.accuracy === 'number' ? r.accuracy : 100), 0) / reviews.length) *
          Math.min(1, reviews.length / 3),
      )
    : null

  const items = [
    {
      key: 'labs',
      label: 'Labs 1–5',
      weight: COURSE.weights.labs,
      status: `${labsDone} of ${labKeys.length} complete`,
      pct: labsStarted ? labsPct : null,
      to: '/module/1/lab/shell',
    },
    {
      key: 'quiz',
      label: 'Quiz 1',
      weight: COURSE.weights.quiz,
      status: attempts ? `Best of ${attempts} attempt${attempts > 1 ? 's' : ''}` : 'Not attempted',
      pct: attempts ? state.quiz.best : null,
      to: '/module/1/quiz',
    },
    {
      key: 'assignment',
      label: 'Assignment',
      weight: COURSE.weights.assignment,
      status: state.assignment.submittedAt ? 'Submitted · auto-checked' : 'Not submitted',
      pct: state.assignment.submittedAt ? state.assignment.score ?? 0 : null,
      to: '/module/1/assignment',
    },
    {
      key: 'peer',
      label: 'Peer review',
      weight: COURSE.weights.peer,
      status: state.assignment.submittedAt || reviews.length ? `${reviews.length} of 3 reviews` : 'Opens after you submit',
      pct: peerPct,
      to: '/module/1/workshop',
    },
  ]

  const total = Math.round(items.reduce((s, it) => s + ((it.pct ?? 0) * it.weight) / 100, 0))
  const graded = items.filter((it) => it.pct !== null)
  const gradedWeight = graded.reduce((s, it) => s + it.weight, 0)
  const soFar = gradedWeight ? Math.round(graded.reduce((s, it) => s + it.pct * it.weight, 0) / gradedWeight) : null
  const onTrack = soFar === null ? null : soFar >= COURSE.passMark
  return { items, total, soFar, gradedWeight, onTrack, passMark: COURSE.passMark }
}
