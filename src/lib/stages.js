import { STAGES, stageOfActivity, activityById } from '../data/course.js'

// Pure helpers: given store state, which stages and activities are open?
//
// A stage is open when
//   - it is the first stage, or
//   - every activity in every earlier stage is done, or
//   - it was opened before (progress, teacher, or class code). Openings are
//     remembered, so undoing a tick later never locks a learner out again.

const isDone = (state, id) => Boolean(state.activities?.[id]?.done)

export function stageComplete(state, stageId) {
  const stage = STAGES.find((s) => s.id === stageId)
  return Boolean(stage) && stage.activities.every((id) => isDone(state, id))
}

export function stageStatus(state, stageId) {
  const index = STAGES.findIndex((s) => s.id === stageId)
  const stage = STAGES[index]
  const earlier = STAGES.slice(0, index)
  const missing = earlier.flatMap((s) => s.activities).filter((id) => !isDone(state, id))
  const unlocked = state.stages?.unlocked?.[stageId]
  const opened = state.stages?.opened?.[stageId]

  let open = false
  let reason = null
  if (index === 0) {
    open = true
    reason = 'first'
  } else if (missing.length === 0) {
    open = true
    reason = 'progress'
  } else if (unlocked) {
    open = true
    reason = unlocked.via === 'code' ? 'code' : 'teacher'
  } else if (opened) {
    open = true
    reason = 'progress'
  }

  const done = stage.activities.filter((id) => isDone(state, id)).length
  return {
    stage,
    index,
    open,
    reason,
    missing,
    complete: done === stage.activities.length,
    done,
    total: stage.activities.length,
    previous: earlier[earlier.length - 1] || null,
  }
}

export function activityStatus(state, activityId) {
  const stage = stageOfActivity(activityId)
  if (!stage) return { open: true, stage: null }
  return { ...stageStatus(state, stage.id), activity: activityById(activityId) }
}

export const isActivityOpen = (state, activityId) => activityStatus(state, activityId).open

// Stages whose prerequisites are now met but which are not yet recorded as opened.
export function newlyOpenedStages(state) {
  return STAGES.slice(1).filter((s) => {
    if (state.stages?.opened?.[s.id]) return false
    return stageStatus(state, s.id).missing.length === 0
  })
}

// Which activity does a module path belong to?
export function activityForPath(pathname, activities) {
  return activities.find((a) => pathname === a.path || pathname.startsWith(`${a.path}/`)) || null
}
