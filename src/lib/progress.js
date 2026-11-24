// Pure progress helpers shared by the browser and the server.
import { ACTIVITIES, LABS, LECTURE_BUCKET } from '../data/course.js'

export const labProgress = (labs, lab) => {
  const def = LABS[lab]
  const done = def.checkpoints.filter((c) => labs?.[lab]?.checkpoints?.[c.id]).length
  return { done, total: def.checkpoints.length, pct: Math.round((done / def.checkpoints.length) * 100) }
}

export const moduleProgress = (activities) => {
  const done = ACTIVITIES.filter((a) => activities?.[a.id]?.done).length
  return { done, total: ACTIVITIES.length, pct: Math.round((done / ACTIVITIES.length) * 100) }
}

export const nextActivity = (activities) => ACTIVITIES.find((a) => !activities?.[a.id]?.done) || null

// Share of a lecture actually played, 0-100.
export const lectureWatchedPct = (lectureState, duration) => {
  const buckets = Math.ceil(duration / LECTURE_BUCKET)
  const watched = new Set(lectureState?.watched || []).size
  return Math.min(100, Math.round((watched / buckets) * 100))
}
