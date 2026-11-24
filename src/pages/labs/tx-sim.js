// Two-phase commit for one order across two shards (Lab 5).
//   Coordinator: order service. Participant A: products (Tea stock - 1).
//   Participant B: orders (insert o1).
// Modes: 'single' (each actor is one node) or 'raft' (each actor is a Raft
// group, as in Spanner or CockroachDB: records are replicated before they
// count, and a crashed coordinator leader is replaced).
//
// Wall-clock time drives the animation; a separate model clock (in ms,
// from the per-hop latency L) drives the reported latencies.

export const HOP_VIS = 680
export const RAFT_VIS = 520
export const ELECT_VIS = 1000
export const CRASH_AFTER = 140
export const BLOCK_FLAG_MS = 2000

let seq = 0
const uid = (p) => `${p}${++seq}`

export class TxSim {
  constructor({ mode = 'single', aNo = false, crash = false, L = 40, onFlag } = {}) {
    this.cfg = { mode, aNo, crash, L }
    this.onFlag = onFlag || (() => {})
    this.t = 0
    this.running = false
    this.phase = 'idle'
    this.coord = { up: true, votes: {}, decision: null, acks: new Set(), expected: 0, model: 0, crashedAt: null, recoveredAt: null, abortCause: null }
    this.parts = {
      A: { state: 'idle', vote: null, lockAt: null, releaseAt: null, model: 0, lockModel: null, releaseModel: null, stock: 3 },
      B: { state: 'idle', vote: null, lockAt: null, releaseAt: null, model: 0, lockModel: null, releaseModel: null, orders: 0 },
    }
    this.msgs = []
    this.arrows = []
    this.marks = []
    this.timers = []
    this.events = []
    this.counters = { messages: 0, roundTrips: 0, consensus: 0, clientLatency: null, totalLatency: null }
    this.blockedSince = null
    this.wasBlocked = false
    this.nextWaiter = null
    this.waiters = 0
    this.dirty = true
  }

  get raft() {
    return this.cfg.mode === 'raft'
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
  modelOf(a) {
    return a === 'coord' ? this.coord.model : this.parts[a].model
  }
  send(kind, from, to, data = {}) {
    const m = { id: uid('m'), kind, from, to, sent: this.t, arrive: this.t + HOP_VIS, modelSent: this.modelOf(from), data, lost: false }
    this.msgs.push(m)
    this.arrows.push(m)
    this.counters.messages += 1
    this.dirty = true
  }
  after(ms, kind, data) {
    this.timers.push({ at: this.t + ms, kind, data })
  }
  mark(actor, kind, label) {
    this.marks.push({ id: uid('k'), actor, kind, label, t: this.t })
  }
  consensus(actor, label) {
    // One Raft round: leader -> 2 followers -> leader, modelled as 2 hops.
    const L = this.cfg.L
    if (actor === 'coord') this.coord.model += 2 * L
    else this.parts[actor].model += 2 * L
    this.counters.consensus += 1
    this.counters.messages += 4
    this.mark(actor, 'raft', label)
  }

  start() {
    if (this.running || this.phase !== 'idle') return
    this.running = true
    this.phase = 'preparing'
    this.emit('BEGIN: order o1 for 1 × Tea touches two shards, so the order service coordinates a two-phase commit.', 'info')
    this.mark('coord', 'log', 'begin')
    this.send('PREPARE', 'coord', 'A')
    this.send('PREPARE', 'coord', 'B')
    this.emit('Phase 1: coordinator sends PREPARE to Shard A and Shard B.', 'write')
    if (this.cfg.crash) this.after(CRASH_AFTER, 'crash')
  }

  recover() {
    if (this.coord.up || this.raft) return
    this.coord.up = true
    this.coord.recoveredAt = this.t
    this.mark('coord', 'recover', 'restart')
    this.emit('Coordinator restarts and reads its log: PREPARE sent, no decision recorded. It presumes ABORT.', 'warn')
    this.coord.abortCause = 'recovery'
    this.decide('ABORT')
  }

  tick(dt) {
    if (!this.running) return
    this.t += dt
    let guard = 0
    while (guard++ < 100) {
      const m = this.msgs.reduce((a, b) => (!a || b.arrive < a.arrive ? b : a), null)
      const tm = this.timers.reduce((a, b) => (!a || b.at < a.at ? b : a), null)
      const mAt = m && m.arrive <= this.t ? m.arrive : Infinity
      const tAt = tm && tm.at <= this.t ? tm.at : Infinity
      if (mAt === Infinity && tAt === Infinity) break
      if (mAt <= tAt) {
        this.msgs = this.msgs.filter((x) => x !== m)
        this.deliver(m)
      } else {
        this.timers = this.timers.filter((x) => x !== tm)
        this.fire(tm)
      }
    }
    this.checkBlocked()
    this.dirty = true
  }

  checkBlocked() {
    const anyPrepared = ['A', 'B'].some((p) => this.parts[p].state === 'prepared')
    const undecidable = !this.coord.up && !this.raft && anyPrepared && !this.msgs.some((m) => m.to !== 'coord')
    if (undecidable) {
      if (this.blockedSince === null) {
        this.blockedSince = this.t
        this.phase = 'blocked'
        this.nextWaiter = this.t + 1500
        this.emit('BLOCKED: the prepared shards cannot commit or abort on their own. They keep their locks until the coordinator returns.', 'bad')
      }
      if (!this.wasBlocked && this.t - this.blockedSince >= BLOCK_FLAG_MS) {
        this.wasBlocked = true
        this.onFlag('blocked')
      }
      if (this.nextWaiter !== null && this.t >= this.nextWaiter) {
        this.waiters += 1
        this.nextWaiter = this.t + 1700
        this.emit(`Order #${this.waiters + 1} for Tea waits on the locked row. Shoppers see a spinner.`, 'warn')
      }
    } else if (this.blockedSince !== null && this.coord.up && this.phase === 'blocked') {
      this.phase = 'deciding'
    }
  }

  deliver(m) {
    const L = this.cfg.L
    const arriveModel = m.modelSent + L
    if (m.to === 'coord') {
      if (!this.coord.up) {
        m.lost = true
        this.emit(`${m.kind} ${m.data.vote || ''} from Shard ${m.from} is lost: the coordinator is down.`, 'bad')
        return
      }
      this.coord.model = Math.max(this.coord.model, arriveModel)
      if (m.kind === 'VOTE') {
        this.coord.votes[m.from] = m.data.vote
        if (this.coord.decision) return
        if (m.data.vote === 'NO') {
          this.coord.abortCause = 'no-vote'
          this.emit(`Coordinator receives NO from Shard ${m.from}. One NO is enough: the decision is ABORT.`, 'bad')
          this.decide('ABORT')
        } else if (this.coord.votes.A === 'YES' && this.coord.votes.B === 'YES') {
          this.counters.roundTrips += 1
          this.emit('Both shards voted YES. Phase 2: the decision is COMMIT.', 'ok')
          this.decide('COMMIT')
        }
      } else if (m.kind === 'ACK') {
        this.coord.acks.add(m.from)
        if (this.coord.acks.size >= this.coord.expected) {
          this.counters.roundTrips += 1
          this.finish()
        }
      }
      return
    }
    const p = this.parts[m.to]
    p.model = Math.max(p.model, arriveModel)
    if (m.kind === 'PREPARE') {
      p.state = 'locked'
      p.lockAt = this.t
      p.lockModel = p.model
      this.emit(`Shard ${m.to} locks ${m.to === 'A' ? 'the Tea row' : 'order o1'} and checks it can commit.`, 'info')
      if (this.raft) this.after(RAFT_VIS, 'prepared', { P: m.to })
      else this.prepared(m.to)
    } else if (m.kind === 'QUERY') {
      if (p.vote) this.send('VOTE', m.to, 'coord', { vote: p.vote })
    } else if (m.kind === 'COMMIT') {
      if (m.to === 'A') p.stock -= 1
      else p.orders += 1
      p.state = 'committed'
      this.emit(m.to === 'A' ? 'Shard A commits: Tea stock 3 → 2, lock released.' : 'Shard B commits: order o1 inserted, lock released.', 'ok')
      if (this.raft) this.consensus(m.to, 'replicate commit')
      this.release(m.to)
      this.send('ACK', m.to, 'coord')
    } else if (m.kind === 'ABORT') {
      p.state = 'aborted'
      this.emit(`Shard ${m.to} rolls back and releases its lock.`, 'warn')
      this.release(m.to)
      this.send('ACK', m.to, 'coord')
    }
  }

  prepared(P) {
    const p = this.parts[P]
    if (this.raft) this.consensus(P, 'replicate prepare')
    const vote = P === 'A' && this.cfg.aNo ? 'NO' : 'YES'
    p.vote = vote
    if (vote === 'NO') {
      p.state = 'aborted'
      this.release(P)
      this.emit('Shard A: stock would drop below 0. It votes NO and releases its lock at once.', 'bad')
    } else {
      p.state = 'prepared'
      this.emit(`Shard ${P} writes a PREPARE record and votes YES. It can no longer decide alone.`, 'info')
    }
    this.send('VOTE', P, 'coord', { vote })
  }

  release(P) {
    const p = this.parts[P]
    if (p.lockAt !== null && p.releaseAt === null) {
      p.releaseAt = this.t
      p.releaseModel = p.model
    }
  }

  decide(d) {
    this.coord.decision = d
    this.phase = 'deciding'
    if (this.raft) this.after(RAFT_VIS, 'decisionLogged')
    else this.decisionLogged()
  }

  decisionLogged() {
    const d = this.coord.decision
    if (this.raft) this.consensus('coord', `replicate ${d}`)
    this.mark('coord', 'log', `log ${d}`)
    if (this.coord.abortCause === 'recovery') {
      this.emit('Coordinator logs ABORT. The shop never got an answer: its request already failed with a timeout.', 'warn')
    } else {
      this.counters.clientLatency = this.coord.model
      this.emit(`Coordinator makes ${d} durable and answers the shop after ≈ ${Math.round(this.coord.model)} ms of network time.`, d === 'COMMIT' ? 'ok' : 'warn')
    }
    const targets = ['A', 'B'].filter((P) => ['locked', 'prepared'].includes(this.parts[P].state))
    this.coord.expected = targets.length
    this.phase = d === 'COMMIT' ? 'committing' : 'aborting'
    targets.forEach((P) => this.send(d, 'coord', P))
    if (targets.length === 0) this.finish()
  }

  finish() {
    const d = this.coord.decision
    this.running = false
    this.phase = d === 'COMMIT' ? 'committed' : 'aborted'
    this.counters.totalLatency = this.coord.model
    this.mark('coord', 'end', d === 'COMMIT' ? 'done' : 'aborted')
    this.emit(
      d === 'COMMIT'
        ? `Transaction committed on both shards. ${this.counters.messages} messages, ${this.counters.roundTrips} round trips${this.raft ? `, ${this.counters.consensus} consensus rounds` : ''}.`
        : `Transaction aborted everywhere. Nothing changed: Tea stock is still 3 and there is no order.`,
      d === 'COMMIT' ? 'ok' : 'warn',
    )
    if (d === 'COMMIT') this.onFlag('commit')
    else if (this.coord.abortCause === 'no-vote') this.onFlag('abort')
  }

  fire(tm) {
    if (tm.kind === 'crash') {
      this.coord.up = false
      this.coord.crashedAt = this.t
      this.mark('coord', 'crash', 'crash')
      this.emit('The coordinator crashes right after sending PREPARE. No decision is in its log.', 'bad')
      if (this.raft) this.after(ELECT_VIS, 'newLeader')
    } else if (tm.kind === 'newLeader') {
      this.coord.up = true
      this.coord.recoveredAt = this.t
      this.coord.votes = {}
      this.mark('coord', 'recover', 'new leader')
      this.emit('Raft elects a new coordinator leader. The transaction record was replicated, so it asks both shards for their votes and carries on.', 'ok')
      this.send('QUERY', 'coord', 'A')
      this.send('QUERY', 'coord', 'B')
    } else if (tm.kind === 'prepared') {
      this.prepared(tm.data.P)
    } else if (tm.kind === 'decisionLogged') {
      this.decisionLogged()
    }
  }
}
