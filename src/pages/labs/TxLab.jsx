import { useReducer, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import ActivityFrame from '../../components/ActivityFrame.jsx'
import Icon from '../../components/Icon.jsx'
import CodeBlock from '../../components/CodeBlock.jsx'
import { EASE_OUT } from '../../components/ui.jsx'
import { useStore } from '../../store.js'
import { Mission, PredictGate, EventLog, Debrief, ControlGroup, Readout } from './LabKit.jsx'
import { TxSim } from './tx-sim.js'
import { checkpoint, useFrame, fmtMs, clamp, lerp } from './sim-utils.js'
import './TxLab.css'

const X = { coord: 112, A: 344, B: 536 }
const TOP = 82
const K = 0.055
const ACTORS = [
  { id: 'coord', title: 'Order service', sub: 'coordinator' },
  { id: 'A', title: 'Shard A', sub: 'products · Tea' },
  { id: 'B', title: 'Shard B', sub: 'orders' },
]
const ARROW_TONE = { PREPARE: 'sky', QUERY: 'sky', COMMIT: 'leaf', ABORT: 'coral', ACK: 'ink' }

const SCRIPT = `CREATE TABLE products (
  id    VARCHAR(10) PRIMARY KEY,
  name  VARCHAR(40) NOT NULL,
  stock INT NOT NULL CHECK (stock >= 0)
);
CREATE TABLE orders (
  id         VARCHAR(10) PRIMARY KEY,
  product_id VARCHAR(10) NOT NULL REFERENCES products(id),
  qty        INT NOT NULL
);
INSERT INTO products VALUES ('p1', 'Tea', 3), ('p2', 'Rice', 12), ('p3', 'Coffee', 2);

BEGIN;
UPDATE products SET stock = stock - 1 WHERE id = 'p1' AND stock > 0;
INSERT INTO orders (id, product_id, qty) VALUES ('o1', 'p1', 1);
COMMIT;

SELECT * FROM products;
SELECT * FROM orders;`

const SQL_STEPS = [
  {
    sql: '-- tables created, Tea stock = 3, no orders',
    s1: { tea: 3, orders: [] },
    s2: { tea: 3, orders: [] },
    locks: [],
    log: [],
    note: 'Both sessions see the same committed data. Session 2 is another shop checking stock at the same moment.',
  },
  {
    sql: 'BEGIN;',
    s1: { tea: 3, orders: [] },
    s2: { tea: 3, orders: [] },
    locks: [],
    log: ['txn 701 begins'],
    note: 'One node, one transaction id, one snapshot. No other machine is involved.',
  },
  {
    sql: "UPDATE products SET stock = stock - 1 WHERE id = 'p1' AND stock > 0;",
    s1: { tea: 2, orders: [] },
    s2: { tea: 3, orders: [] },
    locks: ['row lock: products p1 (Tea), held by txn 701'],
    log: ['txn 701 begins', 'update p1 stock 3 → 2 (uncommitted)'],
    note: 'Session 1 sees its own change. Session 2 still reads 3 (MVCC: readers are not blocked). Another UPDATE of Tea would wait on the row lock.',
  },
  {
    sql: "INSERT INTO orders (id, product_id, qty) VALUES ('o1', 'p1', 1);",
    s1: { tea: 2, orders: ['o1'] },
    s2: { tea: 3, orders: [] },
    locks: ['row lock: products p1 (Tea), held by txn 701', 'new row: orders o1, invisible to others'],
    log: ['txn 701 begins', 'update p1 stock 3 → 2 (uncommitted)', 'insert o1 (uncommitted)'],
    note: 'Still invisible to Session 2. If the node crashed now, recovery would discard both changes.',
  },
  {
    sql: 'COMMIT;',
    s1: { tea: 2, orders: ['o1'] },
    s2: { tea: 2, orders: ['o1'] },
    locks: [],
    log: ['txn 701 begins', 'update p1 stock 3 → 2', 'insert o1', 'COMMIT record flushed to disk (one fsync)'],
    note: 'Atomic: both changes appear together. Cost: one log flush on one machine and zero network round trips. Locks are released at once.',
  },
]

function timeMap(sim) {
  const end = sim.coord.recoveredAt ?? sim.t
  const g0 = sim.blockedSince !== null ? sim.blockedSince + 1200 : null
  const gap = g0 !== null && end > g0 ? [g0, end] : null
  const ty = (t) => {
    if (!gap) return TOP + t * K
    const [a, b] = gap
    if (t <= a) return TOP + t * K
    if (t >= b) return TOP + a * K + 28 + (t - b) * K
    return TOP + a * K + (28 * (t - a)) / (b - a)
  }
  return { ty, gap }
}

function Sequence({ sim, reduce }) {
  const { ty, gap } = timeMap(sim)
  const now = sim.t
  const H = Math.max(340, ty(now) + 70)
  const crashedAt = sim.coord.crashedAt
  const recoveredAt = sim.coord.recoveredAt
  const raft = sim.raft
  const summary = `Two-phase commit, phase ${sim.phase}. ${sim.counters.messages} messages so far.`

  return (
    <svg className="tx-seq" viewBox={`0 0 640 ${H}`} role="img" aria-label={summary}>
      <defs>
        {['sky', 'leaf', 'coral', 'ink'].map((tone) => (
          <marker key={tone} id={`tx-head-${tone}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className={`tx-head tx-head--${tone}`} />
          </marker>
        ))}
      </defs>

      {ACTORS.map((a) => (
        <g key={a.id} className={`tx-actor tx-actor--${a.id} ${a.id === 'coord' && !sim.coord.up ? 'is-down' : ''}`}>
          {raft ? (
            <>
              <rect x={X[a.id] - 82 + 8} y={4} width={164} height={52} rx={10} className="tx-actor__stack" />
              <rect x={X[a.id] - 82 + 4} y={8} width={164} height={52} rx={10} className="tx-actor__stack" />
            </>
          ) : null}
          <rect x={X[a.id] - 82} y={12} width={164} height={52} rx={10} className="tx-actor__box" />
          <text x={X[a.id]} y={34} textAnchor="middle" className="tx-actor__t">
            {a.title}
          </text>
          <text x={X[a.id]} y={51} textAnchor="middle" className="tx-actor__s">
            {raft ? `${a.sub} · Raft ×3` : a.sub}
          </text>
        </g>
      ))}

      {/* lifelines */}
      {['A', 'B'].map((p) => (
        <line key={p} x1={X[p]} y1={64} x2={X[p]} y2={H - 12} className="tx-life" />
      ))}
      {crashedAt === null ? (
        <line x1={X.coord} y1={64} x2={X.coord} y2={H - 12} className="tx-life" />
      ) : (
        <>
          <line x1={X.coord} y1={64} x2={X.coord} y2={ty(crashedAt)} className="tx-life" />
          <line x1={X.coord} y1={ty(crashedAt)} x2={X.coord} y2={recoveredAt !== null ? ty(recoveredAt) : H - 12} className="tx-life is-down" />
          {recoveredAt !== null ? <line x1={X.coord} y1={ty(recoveredAt)} x2={X.coord} y2={H - 12} className="tx-life" /> : null}
        </>
      )}

      {/* locks */}
      {['A', 'B'].map((p) => {
        const part = sim.parts[p]
        if (part.lockAt === null) return null
        const y1 = ty(part.lockAt)
        const y2 = ty(part.releaseAt ?? now)
        const blockedFrom = sim.blockedSince !== null && (part.releaseAt === null || part.releaseAt > sim.blockedSince) ? ty(sim.blockedSince) : null
        return (
          <g key={`lock-${p}`}>
            <rect x={X[p] - 7} y={y1} width={14} height={Math.max(2, y2 - y1)} rx={3} className="tx-lock" />
            {blockedFrom !== null ? (
              <rect x={X[p] - 7} y={blockedFrom} width={14} height={Math.max(2, y2 - blockedFrom)} rx={3} className="tx-lock is-blocked" />
            ) : null}
            <text x={X[p] + 14} y={y1 + 12} className="tx-lock__t">
              {p === 'A' ? 'lock Tea row' : 'lock o1'}
            </text>
            {part.state === 'committed' ? (
              <text x={X[p] + 14} y={y2 + 4} className="tx-effect tx-effect--ok">
                {p === 'A' ? 'Tea 3 → 2' : 'o1 inserted'}
              </text>
            ) : part.state === 'aborted' && part.releaseAt !== null ? (
              <text x={X[p] + 14} y={y2 + 4} className="tx-effect tx-effect--bad">
                rolled back
              </text>
            ) : part.state === 'prepared' ? (
              <text x={X[p] + 14} y={y2 - 4} className="tx-effect tx-effect--warn">
                {sim.phase === 'blocked' ? `blocked ${((now - sim.blockedSince) / 1000).toFixed(1)} s` : 'prepared'}
              </text>
            ) : null}
          </g>
        )
      })}

      {/* arrows */}
      {sim.arrows.map((m) => {
        const p = reduce ? (now >= m.arrive ? 1 : 0.999) : clamp((now - m.sent) / (m.arrive - m.sent), 0, 1)
        const x1 = X[m.from]
        const y1 = ty(m.sent)
        const x2full = X[m.to]
        const y2full = ty(m.arrive)
        const x2 = lerp(x1, x2full, p)
        const y2 = lerp(y1, y2full, p)
        const tone = m.kind === 'VOTE' ? (m.data.vote === 'NO' ? 'coral' : 'leaf') : ARROW_TONE[m.kind]
        const label = m.kind === 'VOTE' ? `VOTE ${m.data.vote}` : m.kind
        const mx = (x1 + x2full) / 2
        const my = (y1 + y2full) / 2
        return (
          <g key={m.id} className={`tx-arrow tx-arrow--${tone} ${m.lost && p >= 1 ? 'is-lost' : ''}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={p < 1 || !m.lost ? `url(#tx-head-${tone})` : undefined} />
            {p > 0.35 ? (
              <text x={mx} y={my - 6} textAnchor="middle" className="tx-arrow__t">
                {label}
              </text>
            ) : null}
            {m.lost && p >= 1 ? <path d={`M${x2 - 6} ${y2 - 6} L${x2 + 6} ${y2 + 6} M${x2 + 6} ${y2 - 6} L${x2 - 6} ${y2 + 6}`} className="tx-x" /> : null}
          </g>
        )
      })}

      {/* marks */}
      {sim.marks.map((k) => {
        const x = X[k.actor]
        const y = ty(k.t)
        if (k.kind === 'crash')
          return (
            <g key={k.id} className="tx-mark tx-mark--crash">
              <circle cx={x} cy={y} r={11} />
              <path d={`M${x - 5} ${y - 5} L${x + 5} ${y + 5} M${x + 5} ${y - 5} L${x - 5} ${y + 5}`} />
              <text x={x - 18} y={y + 4} textAnchor="end">
                crash
              </text>
            </g>
          )
        if (k.kind === 'recover')
          return (
            <g key={k.id} className="tx-mark tx-mark--recover">
              <circle cx={x} cy={y} r={8} />
              <text x={x - 16} y={y + 4} textAnchor="end">
                {k.label}
              </text>
            </g>
          )
        if (k.kind === 'raft')
          return (
            <g key={k.id} className="tx-mark tx-mark--raft">
              <rect x={x - 22} y={y - 4} width={10} height={8} rx={2} />
              <rect x={x - 34} y={y - 4} width={10} height={8} rx={2} />
              <text x={x - 40} y={y + 4} textAnchor="end">
                raft
              </text>
            </g>
          )
        if (k.kind === 'end') return null
        return (
          <g key={k.id} className="tx-mark tx-mark--log">
            <rect x={x - 5} y={y - 5} width={10} height={10} rx={2} />
            <text x={x - 14} y={y + 4} textAnchor="end">
              {k.label}
            </text>
          </g>
        )
      })}

      {gap ? (
        <g className="tx-break">
          <rect x={20} y={TOP + gap[0] * K + 4} width={600} height={20} />
          <text x={320} y={TOP + gap[0] * K + 18} textAnchor="middle">
            time passes, locks still held
          </text>
        </g>
      ) : null}
    </svg>
  )
}

export default function TxLab() {
  const reduce = useReducedMotion()
  const cps = useStore((s) => s.labs.tx?.checkpoints || {})
  const [, force] = useReducer((x) => x + 1, 0)
  const [seen, setSeen] = useState({})
  const [cfg, setCfg] = useState({ mode: 'single', aNo: false, crash: false, L: 40 })
  const flag = (f) => {
    checkpoint('tx', f)
    setSeen((s) => (s[f] ? s : { ...s, [f]: true }))
  }
  const [sim, setSim] = useState(() => new TxSim({ ...cfg, onFlag: flag }))
  const [step, setStep] = useState(0)

  useFrame((dt) => {
    sim.tick(dt)
    if (sim.takeDirty()) force()
  })

  const running = sim.running
  const update = (patch) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    if (!running) setSim(new TxSim({ ...next, onFlag: flag }))
  }
  const run = () => {
    const s = sim.phase === 'idle' ? sim : new TxSim({ ...cfg, onFlag: flag })
    s.start()
    setSim(s)
    force()
  }
  const reset = () => setSim(new TxSim({ ...cfg, onFlag: flag }))

  const goStep = (n) => {
    const v = clamp(n, 0, SQL_STEPS.length - 1)
    setStep(v)
    if (v === SQL_STEPS.length - 1) checkpoint('tx', 'sql')
  }
  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(SCRIPT)
    } catch {
      /* clipboard unavailable */
    }
    checkpoint('tx', 'sql')
  }

  const A = sim.parts.A
  const c = sim.counters
  const L = cfg.L
  let lockText = '–'
  if (sim.blockedSince !== null && A.releaseAt !== null) lockText = `${((A.releaseAt - A.lockAt) / 1000).toFixed(1)} s`
  else if (A.releaseModel !== null && A.lockModel !== null) lockText = fmtMs(A.releaseModel - A.lockModel)
  else if (sim.phase === 'blocked') lockText = `${((sim.t - sim.blockedSince) / 1000).toFixed(1)} s and counting`
  else if (A.lockAt !== null) lockText = 'holding…'
  const S = SQL_STEPS[step]

  return (
    <ActivityFrame id="lab-tx">
      <div className="lk-intro">
        <Mission
          lab="tx"
          hints={{
            commit: 'Leave both switches off and press Run order.',
            abort: 'Turn on "Shard A votes NO", then run.',
            blocked: 'Single nodes, turn on "Crash coordinator after PREPARE", run, and wait.',
            sql: 'Scroll to the SQL comparison and step through to COMMIT, or copy the script.',
          }}
        />
        <PredictGate
          prompt="The coordinator crashes right after sending PREPARE, and both shards vote YES. What do the shards do?"
          options={[
            { id: 'a', label: 'Commit on their own, since both voted YES' },
            { id: 'b', label: 'Abort on their own after a timeout' },
            { id: 'c', label: 'Wait, holding their locks, until the coordinator comes back' },
            { id: 'd', label: 'Ask each other and agree on an outcome' },
          ]}
          correct="c"
          verified={Boolean(seen.blocked)}
          runHint='Choose Single nodes, switch on "Crash coordinator after PREPARE", and press Run order.'
          explain="After voting YES a participant has promised to commit if asked, but it does not know whether the other shard voted YES or whether the coordinator already decided ABORT. Committing or aborting alone could break atomicity, so it waits. Asking the other shard does not help: it is in the same position."
        />
      </div>

      <div className="lk-sim tx-sim">
        <div className="lk-sim__controls">
          <ControlGroup label="Participants" id="tx-mode">
            <div className="segmented" role="group" aria-labelledby="tx-mode">
              <button type="button" aria-pressed={cfg.mode === 'single'} disabled={running} onClick={() => update({ mode: 'single' })}>
                Single nodes
              </button>
              <button type="button" aria-pressed={cfg.mode === 'raft'} disabled={running} onClick={() => update({ mode: 'raft' })}>
                Raft groups
              </button>
            </div>
          </ControlGroup>

          <ControlGroup label="Failures" id="tx-fail">
            <label className="switch">
              <input type="checkbox" checked={cfg.aNo} disabled={running} onChange={(e) => update({ aNo: e.target.checked })} />
              <span>Shard A votes NO (stock would go below 0)</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={cfg.crash} disabled={running} onChange={(e) => update({ crash: e.target.checked })} />
              <span>Crash coordinator after PREPARE</span>
            </label>
          </ControlGroup>

          <ControlGroup
            id="tx-lat"
            label={
              <>
                Network hop <output className="lk-val">{L} ms</output>
              </>
            }
            hint="Latency between the order service and each shard."
          >
            <input
              type="range"
              className="range"
              min={5}
              max={150}
              step={5}
              value={L}
              disabled={running}
              aria-labelledby="tx-lat"
              style={{ '--pct': `${((L - 5) / 145) * 100}%` }}
              onChange={(e) => update({ L: Number(e.target.value) })}
            />
          </ControlGroup>

          <div className="lk-actions">
            <button type="button" className="btn btn--primary" onClick={run} disabled={running}>
              <Icon name="play" />
              {sim.phase === 'idle' ? 'Run order' : 'Run again'}
            </button>
            {!sim.coord.up && !sim.raft && running ? (
              <motion.button
                type="button"
                className="btn btn--dark"
                onClick={() => {
                  sim.recover()
                  force()
                }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Icon name="reset" />
                Recover coordinator
              </motion.button>
            ) : null}
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={running && sim.phase !== 'blocked'}>
            <Icon name="reset" />
            Clear diagram
          </button>
        </div>

        <div className="lk-sim__stage">
          <div className="tx-status">
            <span className={`chip ${sim.phase === 'committed' ? 'chip--done' : sim.phase === 'blocked' || sim.phase === 'aborted' ? 'chip--warn' : 'chip--outline'}`}>
              {sim.phase === 'idle' ? 'Ready' : sim.phase}
            </span>
            <span className="chip chip--outline">Tea stock {A.stock}</span>
            <span className="chip chip--outline">orders {sim.parts.B.orders}</span>
          </div>
          <div className="tx-seqwrap">
            <Sequence sim={sim} reduce={reduce} />
          </div>
          <div className="lk-readouts tx-readouts">
            <Readout label="Messages" value={c.messages} sub={sim.raft ? `incl. ${c.consensus * 4} for Raft` : 'between machines'} />
            <Readout label="Round trips" value={c.roundTrips} sub={sim.raft ? `+ ${c.consensus} consensus rounds` : 'prepare, then commit'} />
            <Readout
              label="Shop waits"
              value={c.clientLatency !== null ? fmtMs(c.clientLatency) : sim.blockedSince !== null ? 'timed out' : '–'}
              tone={sim.blockedSince !== null ? 'bad' : undefined}
              sub="network time to decision"
            />
            <Readout label="Tea row locked" value={lockText} tone={sim.phase === 'blocked' ? 'bad' : undefined} sub="on Shard A" />
          </div>
        </div>
      </div>

      <div className="lk-row">
        <EventLog events={sim.events} />
        <section className="tx-cost" aria-labelledby="tx-cost-title">
          <span className="kicker kicker--ink" id="tx-cost-title">
            What one order costs at {L} ms per hop
          </span>
          <div className="table-wrap">
            <table className="table tx-table">
              <thead>
                <tr>
                  <th scope="col">Setup</th>
                  <th scope="col" className="num">
                    Messages
                  </th>
                  <th scope="col">Before the shop hears back</th>
                  <th scope="col">Coordinator crash</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">1 SQL node</th>
                  <td className="num">0</td>
                  <td>one local log flush</td>
                  <td>n/a, but the node is a single point of failure</td>
                </tr>
                <tr>
                  <th scope="row">2PC, 2 shards</th>
                  <td className="num">8</td>
                  <td>2 hops ≈ {fmtMs(2 * L)}</td>
                  <td>
                    <span className="chip chip--warn">blocks</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">2PC over Raft</th>
                  <td className="num">28</td>
                  <td>2 hops + 2 consensus rounds ≈ {fmtMs(6 * L)}</td>
                  <td>
                    <span className="chip chip--done">survives</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">Assumes each Raft round reaches a follower one hop away and back.</p>
        </section>
      </div>

      <section className="tx-newsql" aria-labelledby="tx-newsql-title">
        <div className="lk-h">
          <div>
            <span className="kicker">NewSQL</span>
            <h2 id="tx-newsql-title">How Spanner and CockroachDB keep 2PC from blocking</h2>
            <p>
              Each participant, and the transaction record itself, is a Raft (or Paxos) group of three replicas. A PREPARE or COMMIT
              only counts once a majority of the group has it, so when a leader dies a follower already knows the state and takes
              over. Switch to <strong>Raft groups</strong>, crash the coordinator, and watch the order finish anyway. The price is a
              consensus round inside every phase: more messages and more latency for every cross-shard write.
            </p>
          </div>
        </div>
      </section>

      <section className="tx-sql" aria-labelledby="tx-sql-title">
        <div className="lk-h">
          <div>
            <span className="kicker">Compare</span>
            <h2 id="tx-sql-title">The same order as one SQL transaction</h2>
            <p>On a single node the database gives you atomicity with a local log and row locks. Step through it, then run it for real in DB Fiddle.</p>
          </div>
        </div>
        <div className="tx-sql__grid">
          <div className="tx-sql__code">
            <CodeBlock code={SCRIPT} lang="sql" title="postgresql · inventory" copy={false} />
            <div className="cluster">
              <button type="button" className="btn btn--dark btn--sm" onClick={copyScript}>
                <Icon name="copy" />
                Copy for DB Fiddle
              </button>
              <a className="btn btn--ghost btn--sm" href="https://dbfiddle.uk/" target="_blank" rel="noreferrer">
                Open DB Fiddle
                <Icon name="external" />
              </a>
            </div>
            <p className="hint">In DB Fiddle, choose a PostgreSQL version, paste the script and press Run.</p>
          </div>

          <div className="tx-step">
            <ol className="tx-step__list">
              {SQL_STEPS.map((s, i) => (
                <li key={i}>
                  <button type="button" className={`tx-step__stmt ${i === step ? 'is-on' : ''} ${i < step ? 'is-past' : ''}`} onClick={() => goStep(i)} aria-current={i === step ? 'step' : undefined}>
                    <span className="tx-step__n tabular">{i}</span>
                    <code>{s.sql}</code>
                  </button>
                </li>
              ))}
            </ol>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                className="tx-step__state"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                <div className="tx-sessions">
                  {[
                    ['Session 1 · your order', S.s1],
                    ['Session 2 · another shop', S.s2],
                  ].map(([label, v]) => (
                    <div key={label} className="tx-session">
                      <span className="tx-session__l">{label}</span>
                      <span className="tx-session__v">
                        Tea stock <strong className="tabular">{v.tea}</strong>
                      </span>
                      <span className="tx-session__v">orders {v.orders.length ? <strong>{v.orders.join(', ')}</strong> : <em>none</em>}</span>
                    </div>
                  ))}
                </div>
                <div className="tx-step__meta">
                  <div>
                    <span className="tx-step__h">Locks</span>
                    {S.locks.length ? (
                      <ul>
                        {S.locks.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="faint">none</p>
                    )}
                  </div>
                  <div>
                    <span className="tx-step__h">Write-ahead log</span>
                    {S.log.length ? (
                      <ul className="mono">
                        {S.log.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="faint">empty</p>
                    )}
                  </div>
                </div>
                <p className="tx-step__note">{S.note}</p>
              </motion.div>
            </AnimatePresence>
            <div className="cluster">
              <button type="button" className="btn btn--sm" onClick={() => goStep(step - 1)} disabled={step === 0}>
                <Icon name="arrow-left" />
                Back
              </button>
              <button type="button" className="btn btn--dark btn--sm" onClick={() => goStep(step + 1)} disabled={step === SQL_STEPS.length - 1}>
                Next statement
                <Icon name="arrow-right" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <Debrief show={Boolean(cps.commit && (cps.blocked || cps.sql))}>
        <p>
          Keeping the stock decrement and the order in one transaction is cheap on one node and expensive across shards: two round
          trips at best, and a stuck checkout when the coordinator dies at the wrong moment.
        </p>
        <p>
          So model to avoid it: keep an order and the stock it reserves in the same document or the same shard when you can, use
          NewSQL when you truly need cross-shard ACID, and accept eventual consistency (for example, a reservation that is confirmed
          a moment later) where the shop can tolerate it.
        </p>
      </Debrief>
    </ActivityFrame>
  )
}
