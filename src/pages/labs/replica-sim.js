// Discrete-event model of a three-member MongoDB replica set (Lab 3).
//
// Semantics modelled:
//  - w:1 is acknowledged once the primary has applied the write.
//  - w:"majority" is acknowledged once 2 of 3 members have applied it.
//  - Secondaries apply oplog entries after the replication lag.
//  - A network partition isolates Riga (and the Riga shop app).
//    An isolated primary keeps taking w:1 writes until it steps down
//    (election timeout, 10 s compressed to 3 s). The majority side
//    (Tallinn + Vilnius) elects the most up-to-date member.
//  - On heal, the old primary rejoins as a secondary and rolls back
//    every oplog entry the new primary does not have.

export const NODES = ['riga', 'tallinn', 'vilnius']
export const CITY = {
  riga: { name: 'Riga', code: 'RIX' },
  tallinn: { name: 'Tallinn', code: 'TLL' },
  vilnius: { name: 'Vilnius', code: 'VNO' },
  'app-riga': { name: 'Riga shop app', code: 'APP' },
  'app-tallinn': { name: 'Tallinn shop app', code: 'APP' },
}
export const ELECTION_MS = 3000 // stands in for electionTimeoutMillis = 10 s
export const WTIMEOUT_MS = 4500
export const HOP = 280 // client <-> node and progress hops (visual)
export const ELECTION_ROUND_MS = 600

let seq = 0
const uid = (p) => `${p}${++seq}`

export class ReplicaSim {
  constructor({ onFlag } = {}) {
    this.onFlag = onFlag || (() => {})
    this.t = 0
    this.lag = 1200
    this.term = 1
    this.base = 13
    this.nodes = {
      riga: { role: 'PRIMARY', ops: [] },
      tallinn: { role: 'SECONDARY', ops: [] },
      vilnius: { role: 'SECONDARY', ops: [] },
    }
    this.partition = false
    this.cutAt = null
    this.msgs = []
    this.timers = []
    this.writes = []
    this.lastRead = null
    this.nextValue = 14
    this.opSeq = 0
    this.acked = new Set() // op ids acknowledged to a client
    this.rolled = [] // { op, at, index }
    this.lost = [] // { x, y, at } for visuals, positions filled by the view
    this.lostMsgs = [] // { msg, progress, at }
    this.events = []
    this.flags = { stepDown: false, elected: false }
    this.dirty = true
  }

  // ---------- helpers ----------
  takeDirty() {
    const d = this.dirty
    this.dirty = false
    return d
  }

  emit(text, tone = 'info') {
    this.events = [...this.events.slice(-79), { id: uid('e'), t: this.t, text, tone }]
    this.dirty = true
  }
  side(x) {
    return x === 'riga' || x === 'app-riga' ? 'west' : 'east'
  }
  canTalk(a, b) {
    return !this.partition || this.side(a) === this.side(b)
  }
  lagFor(node) {
    return node === 'vilnius' ? Math.round(this.lag * 1.4) : this.lag
  }
  primary() {
    return NODES.find((n) => this.nodes[n].role === 'PRIMARY') || null
  }
  primaryFor(client) {
    return NODES.find((n) => this.nodes[n].role === 'PRIMARY' && this.canTalk(client, n)) || null
  }
  has(node, opId) {
    return this.nodes[node].ops.some((o) => o.id === opId)
  }
  lastOp(node) {
    const ops = this.nodes[node].ops
    return ops.length ? ops[ops.length - 1] : null
  }
  valueOf(node) {
    return this.lastOp(node)?.value ?? this.base
  }
  replicaCount(opId) {
    return NODES.filter((n) => this.has(n, opId)).length
  }
  majorityCommitted(op) {
    return this.replicaCount(op.id) >= 2
  }
  behind(node) {
    const p = this.primary()
    if (!p || p === node) return 0
    return this.nodes[p].ops.filter((o) => !this.has(node, o.id)).length
  }
  // The newest write a client was told succeeded and that still exists.
  truthOp() {
    let best = null
    for (const n of NODES)
      for (const o of this.nodes[n].ops) if (this.acked.has(o.id) && (!best || o.id > best.id)) best = o
    return best
  }
  send(kind, from, to, delay, data) {
    this.msgs.push({ id: uid('m'), kind, from, to, sent: this.t, arrive: this.t + Math.max(30, delay), data })
    this.dirty = true
  }
  after(ms, kind, data) {
    this.timers.push({ at: this.t + ms, kind, data })
  }
  pendingTimer(kind) {
    return this.timers.find((t) => t.kind === kind) || null
  }
  busy() {
    return (
      this.msgs.length > 0 ||
      this.timers.length > 0 ||
      this.rolled.length > 0 ||
      this.lostMsgs.length > 0 ||
      this.writes.some((w) => w.state === 'waiting')
    )
  }

  // ---------- actions ----------
  setLag(ms) {
    this.lag = ms
    this.dirty = true
  }

  write(client, wc) {
    const value = this.nextValue
    const p = this.primaryFor(client)
    const wcText = wc === 'majority' ? 'w: "majority"' : 'w: 1'
    if (!p) {
      const candidate = NODES.find((n) => this.nodes[n].role === 'CANDIDATE' && this.canTalk(client, n))
      this.emit(
        `${CITY[client].name}: write Tea stock = ${value} refused, NotWritablePrimary. ${
          candidate ? 'An election is still running on this side.' : 'No primary is reachable from this side of the partition.'
        }`,
        'bad',
      )
      return
    }
    this.nextValue++
    const w = { id: uid('w'), value, wc, client, start: this.t, state: 'sending', primary: p, opId: null }
    this.writes = [...this.writes.slice(-11), w]
    this.send('write', client, p, HOP, { w })
    this.emit(`${CITY[client].name} sends Tea stock = ${value} to ${CITY[p].name} with ${wcText}.`, 'write')
  }

  read(client, pref, rc) {
    let node = null
    if (pref === 'primary') node = this.primaryFor(client)
    else if (pref === 'secondary') {
      const c = NODES.filter((n) => this.nodes[n].role === 'SECONDARY' && this.canTalk(client, n))
      // Drivers pick any eligible secondary; favour the one furthest behind so lag is visible.
      c.sort((a, b) => this.behind(b) - this.behind(a))
      node = c[0] || null
    } else node = client === 'app-riga' ? 'riga' : 'tallinn'
    if (!node) {
      this.emit(
        `${CITY[client].name}: read refused. ${pref === 'primary' ? 'No primary is reachable' : 'No secondary is reachable'} (readPreference "${pref}").`,
        'bad',
      )
      return
    }
    const r = { id: uid('r'), client, node, pref, rc, start: this.t, state: 'sending' }
    this.lastRead = r
    this.send('read', client, node, HOP, { r })
    this.emit(`${CITY[client].name} reads Tea stock from ${CITY[node].name} (readPreference "${pref}"${rc === 'majority' ? ', readConcern "majority"' : ''}).`, 'read')
  }

  cut() {
    if (this.partition) return
    this.partition = true
    this.cutAt = this.t
    // Messages already crossing the cut are lost.
    const crossing = this.msgs.filter((m) => this.side(m.from) !== this.side(m.to))
    if (crossing.length) {
      this.msgs = this.msgs.filter((m) => !crossing.includes(m))
      for (const m of crossing) {
        this.lostMsgs.push({ msg: m, progress: (this.t - m.sent) / (m.arrive - m.sent), at: this.t })
        if (m.kind === 'ack' && m.data.w.state !== 'acked') {
          m.data.w.state = 'unknown'
        }
      }
      this.emit(`${crossing.length} message${crossing.length > 1 ? 's' : ''} in flight lost in the partition.`, 'bad')
    }
    if (this.nodes.riga.role === 'PRIMARY') {
      this.emit('Network cut around Riga. Riga is still primary but can only see itself: 1 of 3 votes.', 'bad')
      this.after(ELECTION_MS, 'stepdown')
      this.after(ELECTION_MS + 80, 'electionStart')
    } else {
      this.emit('Network cut around Riga. Riga is a secondary, so the majority side keeps its primary.', 'bad')
    }
  }

  heal() {
    if (!this.partition) return
    this.partition = false
    this.timers = this.timers.filter((t) => t.kind !== 'stepdown' && t.kind !== 'electionStart')
    this.emit('Network healed. All three members can talk again.', 'ok')
    if (!NODES.some((n) => this.nodes[n].role === 'CANDIDATE')) this.reconcile()
  }

  // After a heal: roll back divergent history on Riga, then catch everyone up.
  reconcile() {
    const p = this.primary()
    if (!p) return
    if (p !== 'riga') {
      const riga = this.nodes.riga
      const divergent = riga.ops.filter((o) => !this.has(p, o.id))
      if (divergent.length) {
        riga.ops = riga.ops.filter((o) => this.has(p, o.id))
        const gone = new Set(divergent.map((o) => o.id))
        for (const w of this.writes) if (w.opId && gone.has(w.opId)) w.state = 'rolledback'
        let lostAcked = false
        divergent.forEach((op, i) => {
          this.rolled.push({ op, at: this.t + i * 260, index: i })
          const wasAcked = this.acked.has(op.id)
          if (wasAcked) {
            lostAcked = true
            this.acked.delete(op.id)
          }
          this.emit(
            `ROLLBACK on Riga: Tea stock = ${op.value} (${op.wc === 'majority' ? 'w: "majority", never acknowledged' : wasAcked ? 'w: 1, already acknowledged to the shop' : 'w: 1'}) never reached a majority and is removed.`,
            'bad',
          )
        })
        this.emit(
          `Riga rejoins as a secondary of ${CITY[p].name}. Rolled-back writes are saved to a rollback file for manual review, not re-applied.`,
          'warn',
        )
        if (lostAcked) this.onFlag('rollback')
      } else {
        this.emit(`Riga rejoins as a secondary of ${CITY[p].name}. It has nothing to roll back.`, 'ok')
      }
    }
    // Catch-up: every member pulls what it is missing from the primary.
    for (const n of NODES) {
      if (n === p) continue
      const missing = this.nodes[p].ops.filter((o) => !this.has(n, o.id))
      missing.forEach((op, i) => this.send('oplog', p, n, this.lagFor(n) + i * 120, { op }))
    }
  }

  // ---------- simulation loop ----------
  tick(dt) {
    this.t += dt
    let guard = 0
    while (guard++ < 200) {
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
    const nRolled = this.rolled.length
    const nLost = this.lostMsgs.length
    this.rolled = this.rolled.filter((r) => this.t - r.at < 2600)
    this.lostMsgs = this.lostMsgs.filter((l) => this.t - l.at < 900)
    if (this.busy() || nRolled !== this.rolled.length || nLost !== this.lostMsgs.length) this.dirty = true
  }

  deliver(m) {
    if (!this.canTalk(m.from, m.to)) {
      this.lostMsgs.push({ msg: m, progress: 1, at: this.t })
      if (m.kind === 'oplog') this.emit(`Oplog entry for ${CITY[m.to].name} lost in the partition.`, 'warn')
      return
    }
    const { kind, data } = m
    if (kind === 'write') {
      const w = data.w
      const p = m.to
      if (this.nodes[p].role !== 'PRIMARY') {
        w.state = 'failed'
        this.emit(`${CITY[p].name} is no longer primary: write Tea stock = ${w.value} rejected (NotWritablePrimary).`, 'bad')
        return
      }
      const op = { id: ++this.opSeq, term: this.term, value: w.value, wc: w.wc, at: this.t }
      this.nodes[p].ops.push(op)
      w.opId = op.id
      w.state = w.wc === 'majority' ? 'waiting' : 'applied'
      for (const n of NODES) {
        if (n !== p && this.canTalk(p, n) && this.nodes[n].role !== 'PRIMARY') this.send('oplog', p, n, this.lagFor(n), { op })
      }
      if (w.wc === 1) {
        this.send('ack', p, w.client, HOP, { w })
      } else {
        this.after(WTIMEOUT_MS, 'wtimeout', { w })
        this.emit(`${CITY[p].name} applied Tea stock = ${w.value}. Waiting for one more member before acknowledging.`, 'info')
      }
    } else if (kind === 'oplog') {
      const n = m.to
      const op = data.op
      if (!this.has(n, op.id)) {
        this.nodes[n].ops = [...this.nodes[n].ops, op].sort((a, b) => a.id - b.id)
      }
      if (this.nodes[m.from].role === 'PRIMARY') this.send('progress', n, m.from, HOP * 0.7, { opId: op.id })
    } else if (kind === 'progress') {
      const p = m.to
      for (const w of this.writes) {
        if (w.state === 'waiting' && w.primary === p && w.opId && this.replicaCount(w.opId) >= 2) {
          w.state = 'majority'
          this.send('ack', p, w.client, HOP, { w })
        }
      }
    } else if (kind === 'ack') {
      const w = data.w
      if (w.state === 'timeout' || w.state === 'failed') return
      w.state = 'acked'
      w.ackAt = this.t
      if (w.opId) this.acked.add(w.opId)
      const ms = Math.round(w.ackAt - w.start)
      if (w.wc === 'majority') {
        this.emit(`Acknowledged: Tea stock = ${w.value} with w: "majority" after ${ms} ms. Two members have it, so it can never be rolled back.`, 'ok')
        this.onFlag('majority')
      } else {
        this.emit(`Acknowledged: Tea stock = ${w.value} with w: 1 after ${ms} ms. Only ${CITY[m.from].name} has it so far.`, 'ok')
      }
    } else if (kind === 'read') {
      const r = data.r
      const node = m.to
      const ops = this.nodes[node].ops
      let op = ops.length ? ops[ops.length - 1] : null
      if (r.rc === 'majority') {
        op = [...ops].reverse().find((o) => this.majorityCommitted(o)) || null
      }
      r.role = this.nodes[node].role
      this.send('reply', node, r.client, HOP, { r, value: op?.value ?? this.base, opId: op?.id ?? 0 })
    } else if (kind === 'reply') {
      const { r, value, opId } = data
      const truth = this.truthOp()
      const committed = opId === 0 || this.replicaCount(opId) >= 2
      r.state = 'done'
      r.value = value
      r.opId = opId
      r.truth = truth?.value ?? null
      r.stale = Boolean(truth && opId < truth.id)
      r.uncommitted = !committed
      r.at = this.t
      const where = `${CITY[r.node].name} (${(r.role || '').toLowerCase()})`
      if (r.stale) {
        this.emit(`Read from ${where}: Tea stock = ${value}. The latest acknowledged write is ${truth.value}, so this read is STALE.`, 'bad')
        if (r.role === 'SECONDARY') this.onFlag('stale-read')
      } else if (r.uncommitted) {
        this.emit(`Read from ${where}: Tea stock = ${value}. Fresh, but not on a majority yet: it could still be rolled back.`, 'warn')
      } else {
        this.emit(`Read from ${where}: Tea stock = ${value}. Up to date.`, 'ok')
      }
    }
  }

  fire(tm) {
    if (tm.kind === 'wtimeout') {
      const w = tm.data.w
      if (w.state === 'waiting') {
        w.state = 'timeout'
        this.emit(
          `wtimeout: Tea stock = ${w.value} did not reach a majority within ${WTIMEOUT_MS / 1000} s. The write is not undone; it may survive or be rolled back later.`,
          'bad',
        )
      }
    } else if (tm.kind === 'stepdown') {
      if (this.partition && this.nodes.riga.role === 'PRIMARY') {
        this.nodes.riga.role = 'SECONDARY'
        for (const w of this.writes) {
          if (w.primary === 'riga' && (w.state === 'waiting' || w.state === 'sending')) {
            w.state = 'failed'
            this.emit(`Write Tea stock = ${w.value} interrupted: primary stepped down before a majority confirmed it.`, 'bad')
          }
        }
        this.flags.stepDown = true
        this.emit(
          'Riga has not reached a majority for the election timeout (10 s, shown as 3 s) and STEPS DOWN to secondary. The Riga side has no primary now.',
          'warn',
        )
      }
    } else if (tm.kind === 'electionStart') {
      const east = ['tallinn', 'vilnius']
      if (east.some((n) => this.nodes[n].role === 'PRIMARY')) return
      const cand = east.reduce((best, n) => ((this.lastOp(n)?.id ?? 0) > (this.lastOp(best)?.id ?? 0) ? n : best), 'tallinn')
      this.nodes[cand].role = 'CANDIDATE'
      this.emit(
        `Tallinn and Vilnius stop hearing Riga's heartbeats. ${CITY[cand].name} has the newest oplog and calls an election for term ${this.term + 1}.`,
        'info',
      )
      this.after(ELECTION_ROUND_MS, 'elected', { cand })
    } else if (tm.kind === 'elected') {
      const c = tm.data.cand
      this.term += 1
      this.nodes[c].role = 'PRIMARY'
      this.flags.elected = true
      this.emit(`${CITY[c].name} wins 2 of 3 votes and becomes PRIMARY (term ${this.term}). The majority side accepts writes again.`, 'ok')
      for (const n of NODES) {
        if (n === c || !this.canTalk(c, n)) continue
        const missing = this.nodes[c].ops.filter((o) => !this.has(n, o.id))
        missing.forEach((op, i) => this.send('oplog', c, n, this.lagFor(n) + i * 120, { op }))
      }
      if (this.flags.stepDown) this.onFlag('partition')
      if (!this.partition) this.reconcile()
    }
  }
}
