import { useReducer, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import ActivityFrame from '../../components/ActivityFrame.jsx'
import Icon from '../../components/Icon.jsx'
import { EASE_OUT } from '../../components/ui.jsx'
import { useStore } from '../../store.js'
import { Mission, PredictGate, EventLog, Debrief, ControlGroup, Readout } from './LabKit.jsx'
import { QuorumSim, estimate } from './quorum-sim.js'
import { checkpoint, useFrame, msgPos, fmtMs } from './sim-utils.js'
import './QuorumLab.css'

const onFlag = (f) => checkpoint('quorum', f)
const C = { x: 230, y: 230 }
const RING = 148
const PRESETS = [
  { id: 'strong', label: 'Strong', N: 3, W: 2, R: 2 },
  { id: 'fastw', label: 'Fast writes', N: 3, W: 1, R: 3 },
  { id: 'fastr', label: 'Fast reads', N: 3, W: 3, R: 1 },
  { id: 'eventual', label: 'Eventual', N: 3, W: 1, R: 1 },
]
const STATES = [
  { id: 'up', label: 'Up' },
  { id: 'lagging', label: 'Lagging' },
  { id: 'down', label: 'Down' },
]

const angleOf = (i, n) => -Math.PI / 2 + (i * 2 * Math.PI) / n
const polar = (a, r) => ({ x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) })

function arcPath(a1, a2, r) {
  const p1 = polar(a1, r)
  const p2 = polar(a2, r)
  const large = a2 - a1 > Math.PI ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`
}

export default function QuorumLab() {
  const reduce = useReducedMotion()
  const cps = useStore((s) => s.labs.quorum?.checkpoints || {})
  const [sim, setSim] = useState(() => new QuorumSim({ onFlag }))
  const [, force] = useReducer((x) => x + 1, 0)
  const [lockReads, setLockReads] = useState(null)

  useFrame((dt) => {
    sim.tick(dt)
    if (sim.takeDirty()) force()
  })
  const act = (fn) => {
    fn()
    force()
  }

  const { N, W, R } = sim
  const overlap = R + W > N
  const est = estimate(sim)
  const live = sim.live().length
  const half = Math.PI / N - 0.07
  const wSet = new Set(Array.from({ length: W }, (_, i) => i))
  const rSet = new Set(Array.from({ length: R }, (_, i) => N - R + i))
  const config = `${N}-${W}-${R}`
  const lastRead = sim.lastRead
  const lastWrite = sim.lastWrite
  const contacted = lastRead?.targets ? new Set(lastRead.targets) : new Set()
  const ackers = lastWrite?.ackers ? new Set(lastWrite.ackers) : new Set()

  const reset = () => {
    setSim(new QuorumSim({ onFlag }))
    setLockReads(null)
  }

  return (
    <ActivityFrame id="lab-quorum">
      <div className="lk-intro">
        <Mission
          lab="quorum"
          hints={{
            overlap: 'Use the Strong preset, write once, then read.',
            stale: 'Use Eventual (W1 R1), set one replica to Lagging, write, then read a few times.',
            failure: 'Set replicas Down until a write or read is refused.',
          }}
        />
        <PredictGate
          key={config}
          title={`Predict for N ${N} · W ${W} · R ${R}`}
          prompt="With these settings, can a read miss the latest acknowledged write?"
          options={[
            { id: 'yes', label: 'Yes, it depends on which replicas answer the read' },
            { id: 'no', label: 'No, every read is guaranteed to see it' },
          ]}
          correct={overlap ? 'no' : 'yes'}
          verified={lockReads !== null && sim.readCount > lockReads}
          onLock={() => setLockReads(sim.readCount)}
          runHint="Write a new version, then read. Mark a replica as Lagging to make it interesting."
          explain={
            overlap
              ? `R + W = ${R + W} is greater than N = ${N}, so any ${R} replicas you read must include at least ${R + W - N} that acknowledged the write.`
              : `R + W = ${R + W} is not greater than N = ${N}, so the ${R} replica${R > 1 ? 's' : ''} you read can all be ones that have not received the write yet.`
          }
        />
      </div>

      <div className="lk-sim quo-sim">
        <div className="lk-sim__controls">
          <ControlGroup label="Presets" id="quo-presets">
            <div className="quo-presets">
              {PRESETS.map((p) => {
                const on = p.N === N && p.W === W && p.R === R
                return (
                  <button key={p.id} type="button" className={`quo-preset ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => act(() => sim.preset(p.N, p.W, p.R))}>
                    <span>{p.label}</span>
                    <code>
                      N{p.N} W{p.W} R{p.R}
                    </code>
                  </button>
                )
              })}
            </div>
          </ControlGroup>

          {[
            ['N', 'Replicas', N, 3, 5, (v) => sim.setN(v)],
            ['W', 'Write quorum', W, 1, N, (v) => sim.setW(v)],
            ['R', 'Read quorum', R, 1, N, (v) => sim.setR(v)],
          ].map(([k, label, val, min, max, set]) => (
            <ControlGroup
              key={k}
              id={`quo-${k}`}
              label={
                <>
                  {label} <output className="lk-val">{k} = {val}</output>
                </>
              }
            >
              <input
                type="range"
                className="range"
                min={min}
                max={max}
                step={1}
                value={val}
                aria-labelledby={`quo-${k}`}
                style={{ '--pct': `${max === min ? 100 : ((val - min) / (max - min)) * 100}%` }}
                onChange={(e) => act(() => set(Number(e.target.value)))}
              />
            </ControlGroup>
          ))}

          <div className="lk-actions">
            <button type="button" className="btn btn--primary" onClick={() => act(() => sim.write())}>
              <Icon name="upload" />
              Write v{sim.version + 1}
            </button>
            <button type="button" className="btn btn--dark" onClick={() => act(() => sim.read())}>
              <Icon name="eye" />
              Read
            </button>
          </div>

          <ControlGroup label="Replicas" id="quo-nodes" hint="Lagging replicas apply writes about 5 s late. Down replicas get nothing.">
            <div className="quo-nodes">
              {sim.ring().map((n) => (
                <div key={n.id} className="quo-noderow">
                  <span className="quo-noderow__name">{n.name}</span>
                  <div className="segmented" role="group" aria-label={`${n.name} state`}>
                    {STATES.map((s) => (
                      <button key={s.id} type="button" aria-pressed={n.state === s.id} onClick={() => act(() => sim.setNodeState(n.id, s.id))}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ControlGroup>

          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
            <Icon name="reset" />
            Reset simulation
          </button>
        </div>

        <div className="lk-sim__stage quo-stage">
          <div className={`quo-ineq ${overlap ? 'is-ok' : 'is-risk'}`} aria-live="polite">
            <div className="quo-ineq__math tabular">
              <span>R</span>
              <span className="quo-ineq__op">+</span>
              <span>W</span>
              <span className="quo-ineq__op">=</span>
              <motion.strong key={R + W} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                {R + W}
              </motion.strong>
              <span className="quo-ineq__cmp">{overlap ? '>' : '≤'}</span>
              <span>N</span>
              <span className="quo-ineq__op">=</span>
              <strong>{N}</strong>
            </div>
            <p>
              {overlap
                ? `Overlap of ${R + W - N}: every read set shares a replica with every write set. Reads see the latest acknowledged write.`
                : 'No guaranteed overlap: a read can land entirely on replicas that missed the latest write.'}
            </p>
          </div>

          <svg
            className="quo-ring"
            viewBox="0 0 460 460"
            role="img"
            aria-label={`${N} replicas in a ring. W ${W}, R ${R}. ${live} up. ${overlap ? 'Read and write quorums overlap.' : 'Quorums can miss each other.'}`}
          >
            <circle cx={C.x} cy={C.y} r={RING} className="quo-orbit" />
            {/* worst-case quorum arcs */}
            <path d={arcPath(angleOf(0, N) - half, angleOf(W - 1, N) + half, RING + 48)} className="quo-arc quo-arc--w" />
            <path d={arcPath(angleOf(N - R, N) - half, angleOf(N - 1, N) + half, RING + 62)} className="quo-arc quo-arc--r" />
            <text {...polar(angleOf((W - 1) / 2, N), RING + 48)} dy={-8} textAnchor="middle" className="quo-arc__t quo-arc__t--w">
              W {W}
            </text>
            <text {...polar(angleOf(N - R + (R - 1) / 2, N), RING + 62)} dy={16} textAnchor="middle" className="quo-arc__t quo-arc__t--r">
              R {R}
            </text>

            {sim.ring().map((n) => {
              const p = polar(angleOf(n.id, N), RING)
              return <line key={`l${n.id}`} x1={C.x} y1={C.y} x2={p.x} y2={p.y} className={`quo-spoke ${n.state === 'down' ? 'is-down' : ''}`} />
            })}

            <g className="quo-coord">
              <circle cx={C.x} cy={C.y} r={44} />
              <text x={C.x} y={C.y - 3} textAnchor="middle" className="quo-coord__t">
                coordinator
              </text>
              <text x={C.x} y={C.y + 13} textAnchor="middle" className="quo-coord__s">
                latest ack v{sim.latestAcked}
              </text>
            </g>

            {sim.ring().map((n) => {
              const p = polar(angleOf(n.id, N), RING)
              const both = wSet.has(n.id) && rSet.has(n.id)
              const stale = n.version < sim.latestAcked
              return (
                <g key={n.id} transform={`translate(${p.x} ${p.y})`} className={`quo-node is-${n.state} ${stale ? 'is-stale' : ''}`}>
                  {both ? <circle r={38} className="quo-node__overlap" /> : null}
                  {contacted.has(n.id) && lastRead?.state === 'done' ? <circle r={34} className="quo-node__read" /> : null}
                  {ackers.has(n.id) && lastWrite?.state === 'acked' ? <circle r={31} className="quo-node__ack" /> : null}
                  <circle r={27} className="quo-node__body" />
                  <text y={-3} textAnchor="middle" className="quo-node__name">
                    {n.name}
                  </text>
                  <text y={12} textAnchor="middle" className="quo-node__v">
                    {n.state === 'down' ? 'down' : `v${n.version}`}
                  </text>
                </g>
              )
            })}

            {!reduce &&
              sim.msgs.map((m) => {
                const from = m.from === 'coord' ? C : polar(angleOf(m.from, N), RING)
                const to = m.to === 'coord' ? C : polar(angleOf(m.to, N), RING)
                const pos = msgPos(from, to, (sim.t - m.sent) / (m.arrive - m.sent))
                const cls = m.kind === 'w' || m.kind === 'rr' ? 'is-w' : m.kind === 'wa' ? 'is-ack' : 'is-r'
                return <circle key={m.id} cx={pos.x} cy={pos.y} r={m.kind === 'rr' ? 4 : 5.5} className={`quo-pk ${cls}`} />
              })}
          </svg>

          <div className="lk-legend">
            <span>
              <i style={{ background: 'var(--saffron-2)' }} /> write quorum (worst case)
            </span>
            <span>
              <i style={{ background: 'var(--sky)' }} /> read quorum (worst case)
            </span>
            <span>
              <i className="quo-lg-overlap" /> in both
            </span>
            <span>
              <i style={{ background: 'var(--leaf)' }} /> acknowledgement
            </span>
          </div>
        </div>
      </div>

      <div className="lk-row">
        <div className="quo-side">
          <div className="lk-readouts">
            <Readout label="Write latency" value={est.write === null ? 'refused' : fmtMs(est.write)} tone={est.write === null ? 'bad' : est.write > 1000 ? 'warn' : undefined} sub={`waits for the ${W === 1 ? 'fastest' : `${W}th fastest`} replica`} />
            <Readout label="Read latency" value={est.read === null ? 'refused' : fmtMs(est.read)} tone={est.read === null ? 'bad' : undefined} sub={`waits for ${R} replica${R > 1 ? 's' : ''}`} />
            <Readout label="Writes survive" value={`${Math.max(0, est.writeTolerance)} down`} sub={`${live} of ${N} up`} tone={live < W ? 'bad' : undefined} />
            <Readout label="Reads survive" value={`${Math.max(0, est.readTolerance)} down`} tone={live < R ? 'bad' : undefined} />
          </div>
          <div className="quo-results">
            <div className={`quo-result ${lastWrite?.state === 'acked' ? 'is-ok' : lastWrite?.state === 'refused' || lastWrite?.state === 'failed' ? 'is-bad' : ''}`}>
              <span className="kicker kicker--ink">Last write</span>
              <strong>
                {!lastWrite
                  ? 'None yet'
                  : lastWrite.state === 'acked'
                    ? `v${lastWrite.v} acknowledged`
                    : lastWrite.state === 'pending'
                      ? `v${lastWrite.v}: ${lastWrite.acks || 0} of ${lastWrite.needed} acks`
                      : `v${lastWrite.v} ${lastWrite.state}`}
              </strong>
            </div>
            <div className={`quo-result ${lastRead?.state === 'done' ? (lastRead.stale ? 'is-bad' : 'is-ok') : lastRead?.state === 'refused' || lastRead?.state === 'failed' ? 'is-bad' : ''}`}>
              <span className="kicker kicker--ink">Last read</span>
              <strong>
                {!lastRead
                  ? 'None yet'
                  : lastRead.state === 'done'
                    ? `v${lastRead.value}${lastRead.stale ? `, stale (latest v${sim.latestAcked})` : ', fresh'}`
                    : lastRead.state === 'pending'
                      ? 'Waiting for replies…'
                      : `Refused: ${lastRead.reason}`}
              </strong>
            </div>
          </div>
          <p className="hint">Animation is slowed down so you can follow each message; latencies are model estimates.</p>
        </div>
        <EventLog events={sim.events} />
      </div>

      <AnimatePresence>
        {(cps.overlap || cps.stale) && (
          <motion.section
            className="quo-table"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            aria-labelledby="quo-cmp"
          >
            <div className="lk-h">
              <div>
                <span className="kicker">Compare</span>
                <h2 id="quo-cmp">Four ways to spend three replicas</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Setting</th>
                    <th scope="col">R + W &gt; N</th>
                    <th scope="col">Write waits for</th>
                    <th scope="col">Read waits for</th>
                    <th scope="col">Survives for writes / reads</th>
                    <th scope="col">Good for</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['N3 W2 R2', true, '2 replicas', '2 replicas', '1 / 1 down', 'Stock levels at checkout'],
                    ['N3 W1 R3', true, 'fastest replica', 'all 3', '2 / 0 down', 'Write-heavy logs, rare reads'],
                    ['N3 W3 R1', true, 'all 3', 'fastest replica', '0 / 2 down', 'Catalogue read by everyone'],
                    ['N3 W1 R1', false, 'fastest replica', 'fastest replica', '2 / 2 down', 'View counters, likes'],
                  ].map(([s, ok, w, r, f, g]) => (
                    <tr key={s}>
                      <th scope="row">
                        <code>{s}</code>
                      </th>
                      <td>{ok ? <span className="chip chip--done">yes</span> : <span className="chip chip--warn">no</span>}</td>
                      <td>{w}</td>
                      <td>{r}</td>
                      <td>{f}</td>
                      <td>{g}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <Debrief show={Boolean(cps.overlap && (cps.stale || cps.failure))}>
        <p>
          In a leaderless store you choose consistency per request. Reading Tea's stock at checkout with R + W &gt; N means a shop
          never sells a unit that a restock already removed; reading the catalogue with R = 1 is fast and a little stale.
        </p>
        <p>
          Quorums are not free: every extra replica you wait for adds the latency of the slowest one in the set, and fewer
          failures are survivable. Sloppy quorums and hinted handoff weaken the guarantee further, so check what your database
          actually promises.
        </p>
      </Debrief>
    </ActivityFrame>
  )
}
