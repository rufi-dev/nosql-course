// Transparent automated pre-check for the Module 1 assignment, one point per
// check. Shared: the browser previews it, the server computes the stored grade.
import { RUBRIC, RUBRIC_MAX } from '../data/peers.js'

export const wordCount = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length

export function autoCheck(d) {
  const schema = d.schema || ''
  const queries = d.queries || ''
  const result = d.result || ''
  const just = d.justification || ''
  const data = `${schema}\n${queries}`
  const t = (re, s) => re.test(s)

  const groups = {
    schema: [
      { label: 'Defines an _id for each product', pass: t(/_id/, data) },
      { label: 'Has a name field', pass: t(/\bname\b/, data) },
      { label: 'Stores stock as a number', pass: t(/stock\s*:\s*-?\d/, data) },
      { label: 'Models tags as an array', pass: t(/tags\s*:\s*\[/, data) },
      { label: 'Includes Tea, Rice and Coffee', pass: t(/tea/i, data) && t(/rice/i, data) && t(/coffee/i, data) },
    ],
    query: [
      { label: 'Inserts with insertMany', pass: t(/insertMany\s*\(/, queries) },
      { label: 'Finds low stock with $lt: 5', pass: t(/\$lt\s*:\s*5\b/, queries) },
      { label: 'Updates one record with updateOne', pass: t(/updateOne\s*\(/, queries) },
      { label: 'Restocks with $inc', pass: t(/\$inc\s*:/, queries) },
      {
        label: 'Targets Tea in the update',
        pass: t(/updateOne\s*\(\s*\{\s*(_id\s*:\s*["']p1["']|name\s*:\s*["']Tea["'])/, queries),
      },
    ],
    result: [
      { label: 'Pastes real shell output', pass: t(/[{[]/, result) },
      { label: 'Low-stock result includes Tea', pass: t(/tea/i, result) },
      { label: 'Low-stock result includes Coffee', pass: t(/coffee/i, result) },
      { label: 'Shows Tea at 13 after the update', pass: t(/\b13\b/, result) },
      { label: 'Shows the update acknowledgement', pass: t(/(modifiedCount|matchedCount|acknowledged)/, result) },
    ],
    tradeoff: [
      {
        label: 'Names a shard key and argues for it (60+ words)',
        pass: (d.shardKey || '').trim().length > 2 && wordCount(just) >= 60,
      },
      {
        label: 'Reasons about cardinality or write spread',
        pass: t(/(cardinalit|distinct|spread|evenly|hot ?shard|hotspot|monoton|balanc)/i, just),
      },
      { label: 'Reasons about query isolation', pass: t(/(target|isolat|scatter|broadcast|single shard|one shard)/i, just) },
      { label: 'Explains replica lag or stale reads', pass: t(/(\blag|stale|secondar|replicat)/i, just) },
      {
        label: 'Says what happens during a partition (CAP)',
        pass: t(/(partition|\bcap\b|consisten|availab|steps? down|stepped down|elect)/i, just),
      },
    ],
  }

  const checks = RUBRIC.map((c) => {
    const items = groups[c.id]
    return { id: c.id, title: c.title, items, points: items.filter((i) => i.pass).length }
  })
  const total = checks.reduce((s, c) => s + c.points, 0)
  return { checks, total, score: Math.round((total / RUBRIC_MAX) * 100) }
}

export function feedbackText(checks) {
  const total = checks.reduce((s, c) => s + c.points, 0)
  const missing = checks.flatMap((c) => c.items.filter((i) => !i.pass).map((i) => i.label.toLowerCase()))
  let lead
  if (total >= 18) lead = 'Strong submission: every part of the brief is covered.'
  else if (total >= 14) lead = 'Solid work with a few gaps.'
  else if (total >= 9) lead = 'The core is there, but several parts of the brief are missing.'
  else lead = 'Much of the brief is missing.'
  if (!missing.length) return `${lead} Your teacher may still adjust the grade after reading it.`
  return `${lead} To improve: ${missing.slice(0, 3).join('; ')}${missing.length > 3 ? `; and ${missing.length - 3} more below` : ''}.`
}

// Teacher rubric scores (0-5 per criterion) to a 0-100 grade.
export function rubricScore(scores) {
  const total = RUBRIC.reduce((s, c) => s + Math.max(0, Math.min(5, Number(scores?.[c.id]) || 0)), 0)
  return Math.round((total / RUBRIC_MAX) * 100)
}
