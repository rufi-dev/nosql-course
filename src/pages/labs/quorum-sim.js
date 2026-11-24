// Leaderless (Dynamo / Cassandra style) replication with tunable N, W, R (Lab 4).
// Writes go to every live replica and are acknowledged after W replies.
// Reads ask R live replicas and return the highest version they report.
// If R + W > N, every read set intersects the set that acknowledged the
// latest write, so the read is guaranteed to see it.

export const BASE_LAT = [8, 14, 22, 35, 52] // model latency per replica (ms)
export const LAG_MODEL_MS = 5000 // a lagging replica applies writes about 5 s late
const LAG_VIS = 5200 // wall ms before a lagging replica applies a write
const visHop = (i) => 420 + BASE_LAT[i] * 7

let seq = 0
const uid = (p) => `${p}${++seq}`

export function estimate(sim) {
  const live = sim.live()
  const wl = live.map((n) => (n.state === 'lagging' ? LAG_MODEL_MS : BASE_LAT[n.id])).sort((a, b) => a - b)
  const rl = live.map((n) => BASE_LAT[n.id]).sort((a, b) => a - b)
  return {
    write: wl.length >= sim.W ? wl[sim.W - 1] : null,
    read: rl.length >= sim.R ? rl[sim.R - 1] : null,
    writeTolerance: sim.N - sim.W,
    readTolerance: sim.N - sim.R,
  }
}

export class QuorumSim {
  constructor({ onFlag } = {}) {
    this.onFlag = onFlag || (() => {})
    this.t = 0
    this.N = 3
    this.W = 2
    this.R = 2
    this.nodes = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `n${i + 1}`, state: 'up', version: 0 }))
    this.version = 0
    this.latestAcked = 0
    this.latestAckedW = 0
    this.msgs = []
    this.ops = []
    this.events = []
    this.lastRead = null
    this.lastWrite = null
    this.readCount = 0
    this.dirty = true
  }

  takeDirty() {
    const d = this.dirty
    this.dirty = false
    return d
  }

  emit(text, tone = 'info') {
    this.events = [...this.events.slice(-79), { id: uid('e'), t: this.t, text, tone }]
    this.dirty = true
  }
  ring() {
    return this.nodes.slice(0, this.N)
  }
  live() {
    return this.ring().filter((n) => n.state !== 'down')
  }
  busy() {
    return this.msgs.length > 0
  }
  send(kind, from, to, delay, data) {
    this.msgs.push({ id: uid('m'), kind, from, to, sent: this.t, arrive: this.t + delay, data })
    this.dirty = true
  }

  setN(n) {
    this.N = n
    this.W = Math.min(this.W, n)
    this.R = Math.min(this.R, n)
    this.dirty = true
  }
  setW(w) {
    this.W = w
    this.dirty = true
  }
  setR(r) {
    this.R = r
    this.dirty = true
  }
  preset(N, W, R) {
    this.N = N
    this.W = W
    this.R = R
    this.dirty = true
  }

  setNodeState(i, state) {
    const node = this.nodes[i]
    if (node.state === state) return
    node.state = state
    this.emit(
      state === 'down'
        ? `${node.name} goes down.`
        : state === 'lagging'
          ? `${node.name} starts lagging: it applies writes about 5 s late.`
          : `${node.name} is back up${node.version < this.latestAcked ? `, still holding old v${node.version}` : ''}.`,
      state === 'down' ? 'bad' : state === 'lagging' ? 'warn' : 'ok',
    )
    if (state === 'down') {
      // Messages to or from a dead replica are lost.
      this.msgs = this.msgs.filter((m) => m.to !== i && m.from !== i)
      for (const op of this.ops) {
        if (op.state !== 'pending' || !op.targets.includes(i)) continue
        if (op.kind === 'read') {
          op.state = 'failed'
          this.lastRead = { state: 'failed', reason: `${node.name} died mid-read` }
          this.emit(`Read failed: ${node.name} died before replying (timeout).`, 'bad')
          this.onFlag('failure')
        } else {
          const stillPossible = op.acks.size + op.targets.filter((t) => t !== i && !op.acks.has(t) && this.nodes[t].state !== 'down').length
          if (stillPossible < op.needed) {
            op.state = 'failed'
            this.lastWrite = { v: op.v, state: 'failed' }
            this.emit(`Write v${op.v} timed out: only ${stillPossible} replicas can still acknowledge, W = ${op.needed}.`, 'bad')
            this.onFlag('failure')
          }
        }
      }
    }
  }

  write() {
    const live = this.live()
    if (live.length < this.W) {
      this.lastWrite = { v: this.version + 1, state: 'refused' }
      this.emit(`Write v${this.version + 1} refused: W = ${this.W} needs ${this.W} replicas, only ${live.length} up (Unavailable).`, 'bad')
      this.onFlag('failure')
      return
    }
    const v = ++this.version
    const op = { id: uid('w'), kind: 'write', v, start: this.t, acks: new Set(), needed: this.W, state: 'pending', targets: live.map((n) => n.id) }
    this.ops = [...this.ops.filter((o) => o.state === 'pending'), op]
    this.lastWrite = { v, state: 'pending', needed: this.W, acks: 0 }
    for (const n of live) this.send('w', 'coord', n.id, n.state === 'lagging' ? LAG_VIS : visHop(n.id), { op })
    this.emit(`Write v${v} sent to all ${live.length} live replicas. Acknowledge after ${this.W}.`, 'write')
  }

  read() {
    const live = this.live()
    if (live.length < this.R) {
      this.lastRead = { state: 'refused', reason: `R = ${this.R}, only ${live.length} up` }
      this.emit(`Read refused: R = ${this.R} needs ${this.R} replicas, only ${live.length} up (Unavailable).`, 'bad')
      this.onFlag('failure')
      return
    }
    const pool = [...live]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const targets = pool.slice(0, this.R).map((n) => n.id)
    const op = { id: uid('r'), kind: 'read', start: this.t, targets, replies: [], state: 'pending', R: this.R, N: this.N, W: this.W }
    this.ops = [...this.ops.filter((o) => o.state === 'pending'), op]
    this.lastRead = { state: 'pending', targets }
    for (const id of targets) this.send('r', 'coord', id, visHop(id), { op })
    this.emit(`Read asks ${targets.map((i) => this.nodes[i].name).join(', ')} (R = ${this.R}).`, 'read')
  }

  tick(dt) {
    this.t += dt
    const due = this.msgs.filter((m) => m.arrive <= this.t).sort((a, b) => a.arrive - b.arrive)
    if (due.length) {
      this.msgs = this.msgs.filter((m) => m.arrive > this.t)
      due.forEach((m) => this.deliver(m))
    }
    if (this.busy()) this.dirty = true
  }

  deliver(m) {
    const { kind, data } = m
    if (kind === 'w') {
      const node = this.nodes[m.to]
      if (node.state === 'down') return
      if (node.version < data.op.v) node.version = data.op.v
      this.send('wa', m.to, 'coord', visHop(m.to), { op: data.op })
    } else if (kind === 'wa') {
      const op = data.op
      op.acks.add(m.from)
      if (op.state === 'pending' && op.acks.size >= op.needed) {
        op.state = 'acked'
        const lat = [...op.acks].map((i) => (this.nodes[i].state === 'lagging' ? LAG_MODEL_MS : BASE_LAT[i])).sort((a, b) => a - b)[op.needed - 1]
        if (op.v > this.latestAcked) {
          this.latestAcked = op.v
          this.latestAckedW = op.needed
        }
        this.lastWrite = { v: op.v, state: 'acked', needed: op.needed, acks: op.acks.size, latency: lat, ackers: [...op.acks] }
        const behind = op.targets.length - op.acks.size
        this.emit(
          `v${op.v} acknowledged by ${[...op.acks].map((i) => this.nodes[i].name).join(', ')} (≈ ${lat} ms).${behind ? ` ${behind} replica${behind > 1 ? 's' : ''} not there yet.` : ''}`,
          'ok',
        )
      } else if (this.lastWrite?.v === op.v && op.state === 'pending') {
        this.lastWrite = { ...this.lastWrite, acks: op.acks.size }
      }
    } else if (kind === 'r') {
      const node = this.nodes[m.to]
      if (node.state === 'down') return
      this.send('ra', m.to, 'coord', visHop(m.to), { op: data.op, version: node.version })
    } else if (kind === 'ra') {
      const op = data.op
      if (op.state !== 'pending') return
      op.replies.push({ id: m.from, version: data.version })
      if (op.replies.length === op.targets.length) {
        op.state = 'done'
        this.readCount += 1
        const best = Math.max(...op.replies.map((r) => r.version))
        const stale = best < this.latestAcked
        const guaranteed = op.R + this.latestAckedW > op.N
        this.lastRead = { state: 'done', value: best, stale, replies: op.replies, targets: op.targets, guaranteed, R: op.R }
        const names = op.replies.map((r) => `${this.nodes[r.id].name}: v${r.version}`).join(', ')
        if (stale) {
          this.emit(`Read returned v${best} (${names}). The latest acknowledged write is v${this.latestAcked}: STALE.`, 'bad')
          this.onFlag('stale')
        } else {
          this.emit(`Read returned v${best} (${names}).${guaranteed && this.latestAcked ? ' Guaranteed fresh: R + W > N.' : ''}`, 'ok')
          if (guaranteed && this.latestAcked > 0) this.onFlag('overlap')
        }
        // Read repair: push the newest version to replicas that answered with an older one.
        for (const r of op.replies) {
          if (r.version < best) {
            this.send('rr', 'coord', r.id, visHop(r.id), { v: best })
            this.emit(`Read repair: ${this.nodes[r.id].name} is sent v${best}.`, 'info')
          }
        }
      }
    } else if (kind === 'rr') {
      const node = this.nodes[m.to]
      if (node.state !== 'down' && node.version < data.v) node.version = data.v
    }
  }
}
