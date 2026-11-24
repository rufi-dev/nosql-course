// API integration tests against a real PostgreSQL database.
// Needs the local database running (npm run dev:db). Run: npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/nosql_course_test'
process.env.ADMIN_EMAIL = 'admin@test.local'
process.env.NODE_ENV = 'test'

const { createApp } = await import('../server/index.js')
const { migrate, pool } = await import('../server/db.js')

let server
let base

class Client {
  constructor() {
    this.cookie = ''
  }
  async req(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0]
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
    return { status: res.status, body: json }
  }
  get = (p) => this.req('GET', p)
  post = (p, b = {}) => this.req('POST', p, b)
  put = (p, b = {}) => this.req('PUT', p, b)
  patch = (p, b = {}) => this.req('PATCH', p, b)
  del = (p) => this.req('DELETE', p)
}

before(async () => {
  await migrate()
  await pool.query(
    'TRUNCATE post_likes, posts, review_assignments, submissions, quiz_attempts, progress, enrollments, sessions, classes, users RESTART IDENTITY CASCADE',
  )
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  server?.close()
  await pool.end()
})

const admin = new Client()
const s1 = new Client()
const s2 = new Client()
const t2 = new Client()
let classId
let joinCode

const LEARN_DONE_STATE = {
  diagnostic: { answers: { sql: 'some', nosql: ['mongo'], cap: 'a' }, done: true },
  lectures: {
    1: { t: 214, max: 214, answers: {}, watched: Array.from({ length: 43 }, (_, i) => i) },
    2: { t: 226, max: 226, answers: {}, watched: Array.from({ length: 46 }, (_, i) => i) },
  },
  reading: {
    visited: Object.fromEntries(
      ['design-problem', 'models', 'identity', 'operations', 'partitioning', 'cap', 'worked-example', 'pitfalls'].map((c) => [c, 1]),
    ),
  },
  explore: { seen: Object.fromEntries(['app', 'mongos', 'config', 'shard', 'primary', 'index', 'storage', 'oplog', 'secondary'].map((h) => [h, 1])) },
  activities: {
    'lecture-1': { done: true, at: 1 },
    'lecture-2': { done: true, at: 1 },
    reading: { done: true, at: 1 },
    explore: { done: true, at: 1 },
  },
}

const FIELDS = {
  schema: '{ _id: "p1", name: "Tea", stock: 3, tags: ["drink"] } // also Rice and Coffee',
  queries:
    'db.products.insertMany([{_id:"p1",name:"Tea",stock:3,tags:["drink"]}]); db.products.find({ stock: { $lt: 5 } }); db.products.updateOne({ _id: "p1" }, { $inc: { stock: 10 } })',
  result: "[ { _id: 'p1', name: 'Tea', stock: 3 }, { _id: 'p3', name: 'Coffee' } ] { acknowledged: true, modifiedCount: 1 } Tea 13",
  shardKey: '{ warehouse: 1, sku: 1 }',
  justification: Array(70).fill('cardinality targeted lag partition').join(' '),
}

test('admin signs up and creates a class with a private join code', async () => {
  const r = await admin.post('/api/auth/signup', { name: 'Ada Admin', email: 'ADMIN@test.local', password: 'correct horse' })
  assert.equal(r.status, 201)
  assert.equal(r.body.user.role, 'admin')
  const c = await admin.post('/api/teacher/classes', { name: 'Group A' })
  assert.equal(c.status, 201)
  assert.match(c.body.class.joinCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  classId = c.body.class.id
  joinCode = c.body.class.joinCode
})

test('students cannot join with a wrong code, can with the real one', async () => {
  const bad = await s1.post('/api/auth/signup', { name: 'Sam', email: 'sam@test.local', password: 'password123', joinCode: 'ZZZZ-ZZZZ' })
  assert.equal(bad.status, 400)
  const ok = await s1.post('/api/auth/signup', { name: 'Sam', email: 'sam@test.local', password: 'password123', joinCode: joinCode.toLowerCase().replace('-', '') })
  assert.equal(ok.status, 201)
  assert.equal(ok.body.user.role, 'student')
  assert.equal(ok.body.currentClassId, classId)
  assert.equal(ok.body.classes[0].joinCode, undefined, 'students never receive join codes')
  const dup = await s2.post('/api/auth/signup', { name: 'Dup', email: 'SAM@test.local', password: 'password123' })
  assert.equal(dup.status, 409)
  const s2up = await s2.post('/api/auth/signup', { name: 'Tia', email: 'tia@test.local', password: 'password123' })
  assert.equal(s2up.status, 201)
  assert.equal((await s2.get('/api/progress')).status, 409, 'no class yet')
  const join = await s2.post('/api/classes/join', { code: joinCode })
  assert.equal(join.status, 200)
})

test('login, wrong password and logout', async () => {
  const c = new Client()
  assert.equal((await c.post('/api/auth/login', { email: 'sam@test.local', password: 'nope-nope' })).status, 401)
  assert.equal((await c.post('/api/auth/login', { email: 'sam@test.local', password: 'password123' })).status, 200)
  assert.equal((await c.get('/api/auth/me')).body.user.name, 'Sam')
  await c.post('/api/auth/logout')
  assert.equal((await c.get('/api/auth/me')).body.user, null)
})

test('the server enforces stage locks', async () => {
  // Labs are locked: lab checkpoints and a fake completion are dropped.
  let r = await s1.put('/api/progress', {
    state: { labs: { shell: { checkpoints: { insert: 1, 'find-low': 1, update: 1, verify: 1, index: 1 } } }, activities: { 'lab-shell': { done: true } } },
  })
  assert.equal(r.status, 200)
  assert.equal(r.body.state.activities['lab-shell'], undefined)
  assert.deepEqual(r.body.state.labs.shell.checkpoints, {})

  // Manual "done" without evidence is ignored.
  r = await s1.put('/api/progress', { state: { diagnostic: { done: true }, activities: { 'lecture-1': { done: true } } } })
  assert.ok(r.body.state.activities.start)
  assert.equal(r.body.state.activities['lecture-1'], undefined)

  // With evidence, Learn completes and Practise opens.
  r = await s1.put('/api/progress', { state: LEARN_DONE_STATE })
  assert.ok(r.body.state.activities['lecture-1'] && r.body.state.activities.reading && r.body.state.activities.explore)
  assert.ok(r.body.state.stages.opened.practise)

  // Quiz still locked (labs not done).
  assert.equal((await s1.post('/api/quiz/attempts')).status, 403)
  assert.equal((await s1.post('/api/assignment/submit', { fields: FIELDS })).status, 403)
})

test('teacher opens a stage for the whole class', async () => {
  const r = await admin.put(`/api/teacher/classes/${classId}/stages`, { stageId: 'apply', open: true })
  assert.equal(r.status, 200)
  assert.equal(r.body.class.stageOverrides.apply, true)
  const p = await s1.get('/api/progress')
  assert.ok(p.body.state.stages.unlocked.apply)
})

test('quiz is drawn and graded on the server, answers hidden until answered', async () => {
  const a = await s1.post('/api/quiz/attempts')
  assert.equal(a.status, 201)
  assert.equal(a.body.questions.length, 10)
  for (const q of a.body.questions) {
    assert.equal(q.correct, undefined)
    assert.equal(q.explanation, undefined)
    for (const o of q.options) assert.equal(o.misconception, undefined)
  }
  for (const q of a.body.questions) {
    const answer = q.type === 'multi' ? [q.options[0].id] : q.type === 'order' ? q.start || q.options.map((o) => o.id) : q.options[0].id
    const r = await s1.post(`/api/quiz/attempts/${a.body.id}/answer`, { questionId: q.id, answer })
    assert.equal(r.status, 200)
    assert.ok('correctAnswer' in r.body && 'explanation' in r.body)
  }
  const again = await s1.post(`/api/quiz/attempts/${a.body.id}/answer`, { questionId: a.body.questions[0].id, answer: 'a' })
  assert.equal(again.status, 409)
  const f = await s1.post(`/api/quiz/attempts/${a.body.id}/finish`)
  assert.equal(f.status, 200)
  assert.equal(f.body.total, 10)
  assert.equal(f.body.review.length, 10)
  assert.equal(f.body.state.quiz.attempts.length, 1)
})

test('assignment submission is auto-checked on the server', async () => {
  const empty = await s1.post('/api/assignment/submit', { fields: { ...FIELDS, result: '' } })
  assert.equal(empty.status, 400)
  const r = await s1.post('/api/assignment/submit', { fields: FIELDS })
  assert.equal(r.status, 200)
  assert.ok(r.body.submission.autoScore >= 80, `auto score ${r.body.submission.autoScore}`)
  assert.ok(r.body.state.activities.assignment)
})

test('peer review: samples fill in, classmates replace them when they submit', async () => {
  let w = await s1.get('/api/workshop')
  assert.equal(w.body.phase, 'assessment')
  assert.equal(w.body.targets.length, 3)
  assert.ok(w.body.targets.every((t) => t.kind === 'sample'))
  assert.equal(w.body.targets[0].reference, null, 'reference hidden before reviewing')

  // s2 gets apply via the class override and submits.
  await s2.put('/api/progress', { state: { diagnostic: { done: true } } })
  assert.equal((await s2.post('/api/assignment/submit', { fields: FIELDS })).status, 200)

  w = await s1.get('/api/workshop')
  assert.equal(w.body.targets.filter((t) => t.kind === 'peer').length, 1)

  const scores = { schema: 5, query: 4, result: 4, tradeoff: 3 }
  for (const t of w.body.targets) {
    const r = await s1.post('/api/workshop/reviews', { targetId: t.id, scores, comment: 'Clear schema and a well argued shard key choice overall.' })
    assert.equal(r.status, 200)
    if (t.kind === 'sample') {
      assert.equal(typeof r.body.target.review.accuracy, 'number')
      assert.ok(r.body.target.reference)
    }
  }
  const dup = await s1.post('/api/workshop/reviews', { targetId: w.body.targets[0].id, scores, comment: 'Trying to change my review after seeing it.' })
  assert.equal(dup.status, 409)
  const p = await s1.get('/api/progress')
  assert.ok(p.body.state.activities.workshop)
  assert.ok(p.body.state.badges['peer-reviewer'])

  // s2 sees the review it received.
  const a2 = await s2.get('/api/assignment')
  assert.equal(a2.body.reviewsReceived.length, 1)
  assert.equal(a2.body.reviewsReceived[0].reviewer, 'Classmate 1')
})

test('forum: posts, replies, likes and roles', async () => {
  const p = await s1.post('/api/forum', { body: 'The reorder list matters most. I would shard on warehouse and sku.' })
  assert.equal(p.status, 201)
  const postId = p.body.posts[0].id
  assert.ok(p.body.state.activities.discussion)
  const reply = await admin.post('/api/forum', { classId, parentId: postId, body: 'Good. What does that cost the chain-wide query?' })
  assert.equal(reply.status, 201)
  const nested = await s2.post('/api/forum', { parentId: reply.body.posts[1].id, body: 'Nested reply' })
  assert.equal(nested.status, 400)
  const like = await s2.post(`/api/forum/${postId}/like`)
  assert.deepEqual(like.body, { likes: 1, likedByMe: true })
  const list = await s2.get('/api/forum')
  assert.equal(list.body.posts.length, 2)
  assert.equal(list.body.posts[1].author.role, 'teacher')
  assert.equal((await s2.del(`/api/forum/${postId}`)).status, 403)
})

test('teacher sees the class list, grades a submission, exports CSV', async () => {
  const o = await admin.get(`/api/teacher/classes/${classId}/overview`)
  assert.equal(o.status, 200)
  assert.equal(o.body.students.length, 2)
  const sam = o.body.students.find((s) => s.name === 'Sam')
  assert.ok(sam.done >= 6)
  assert.ok(sam.stages.learn.complete)
  assert.equal(o.body.pendingGrading, 2)

  const subs = await admin.get(`/api/teacher/classes/${classId}/submissions`)
  const tiaSub = subs.body.submissions.find((s) => s.student.name === 'Tia')
  const g = await admin.put(`/api/teacher/submissions/${tiaSub.id}/grade`, {
    scores: { schema: 5, query: 4, result: 4, tradeoff: 2 },
    feedback: 'Strong schema; justify the partition behaviour.',
  })
  assert.equal(g.status, 200)
  assert.equal(g.body.submission.teacherScore, 75)

  // Sam reviewed Tia: accuracy is now measured against the teacher's scores.
  const d = await admin.get(`/api/teacher/classes/${classId}/students/${sam.id}`)
  const peerReview = d.body.reviewsGiven.find((r) => r.kind === 'peer')
  assert.equal(peerReview.accuracy, 95)

  const tia = await s2.get('/api/progress')
  assert.equal(tia.body.state.assignment.score, 75)

  const csv = await admin.get(`/api/teacher/classes/${classId}/export.csv`)
  assert.equal(csv.status, 200)
  assert.match(csv.body, /Sam/)
  assert.match(csv.body, /Tia/)
})

test('access control between teachers and students', async () => {
  // Students cannot use teacher routes.
  assert.equal((await s1.get(`/api/teacher/classes/${classId}/overview`)).status, 403)
  // Another teacher cannot see this class.
  await t2.post('/api/auth/signup', { name: 'Tom Teacher', email: 'tom@test.local', password: 'password123' })
  const users = await admin.get('/api/admin/users')
  const tom = users.body.users.find((u) => u.email === 'tom@test.local')
  assert.equal((await admin.patch(`/api/admin/users/${tom.id}`, { role: 'teacher' })).status, 200)
  assert.equal((await t2.get(`/api/teacher/classes/${classId}/overview`)).status, 403)
  assert.equal((await t2.get('/api/teacher/classes')).body.classes.length, 0)
  // Non-admins cannot change roles.
  assert.equal((await t2.get('/api/admin/users')).status, 403)
})

test('teacher resets a student password and signs them out', async () => {
  const o = await admin.get(`/api/teacher/classes/${classId}/overview`)
  const tia = o.body.students.find((s) => s.name === 'Tia')
  const r = await admin.post(`/api/teacher/classes/${classId}/students/${tia.id}/password`, { password: 'newpassword1' })
  assert.equal(r.status, 200)
  assert.equal((await s2.get('/api/auth/me')).body.user, null)
  assert.equal((await s2.post('/api/auth/login', { email: 'tia@test.local', password: 'newpassword1' })).status, 200)
})

test('regenerating the join code invalidates the old one', async () => {
  const r = await admin.post(`/api/teacher/classes/${classId}/code`)
  assert.notEqual(r.body.class.joinCode, joinCode)
  const c = new Client()
  const bad = await c.post('/api/auth/signup', { name: 'Late', email: 'late@test.local', password: 'password123', joinCode })
  assert.equal(bad.status, 400)
})

test('mutations require JSON (no cross-site form posts)', async () => {
  const res = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' })
  assert.equal(res.status, 415)
})
