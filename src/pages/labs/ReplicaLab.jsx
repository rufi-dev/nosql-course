import { useReducer, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import ActivityFrame from '../../components/ActivityFrame.jsx'
import Icon from '../../components/Icon.jsx'
import { EASE_OUT } from '../../components/ui.jsx'
import { useStore } from '../../store.js'
import { Mission, PredictGate, EventLog, Debrief, ControlGroup, Readout } from './LabKit.jsx'
import { ReplicaSim, NODES, CITY, ELECTION_MS } from './replica-sim.js'
import { checkpoint, useFrame, msgPos, fmtMs } from './sim-utils.js'
import './ReplicaLab.css'

const onFlag = (flag) => checkpoint('replicas', flag)

const POS = {
  tallinn: { x: 352, y: 92 },
  riga: { x: 232, y: 232 },
  vilnius: { x: 374, y: 350 },
  'app-riga': { x: 74, y: 232 },
  'app-tallinn': { x: 494, y: 92 },
}
const LINKS = [
  ['riga', 'tallinn'],
  ['riga', 'vilnius'],
  ['tallinn', 'vilnius'],
  ['app-riga', 'riga'],
  ['app-tallinn', 'tallinn'],
]
const MSG_STYLE = {
  write: { r: 6.5, cls: 'rep-pk--write' },
  oplog: { r: 5, cls: 'rep-pk--oplog' },
  progress: { r: 3.5, cls: 'rep-pk--ack' },
  ack: { r: 5.5, cls: 'rep-pk--ack' },
  read: { r: 5.5, cls: 'rep-pk--read' },
  reply: { r: 5.5, cls: 'rep-pk--read' },
}
const WRITE_STATE = {
  sending: { text: 'sending', tone: '' },
  applied: { text: 'applied on primary', tone: 'chip--accent' },
  waiting: { text: 'waiting for majority', tone: 'chip--accent' },
  majority: { text: 'majority reached', tone: 'chip--info' },
  acked: { text: 'acknowledged', tone: 'chip--done' },
  timeout: { text: 'wtimeout', tone: 'chip--warn' },
  failed: { text: 'failed', tone: 'chip--warn' },
  unknown: { text: 'outcome unknown', tone: 'chip--warn' },
  rolledback: { text: 'rolled back', tone: 'chip--warn' },
}

export default function ReplicaLab() {
  const reduce = useReducedMotion()
  const cps = useStore((s) => s.labs.replicas?.checkpoints || {})
  const [sim, setSim] = useState(() => new ReplicaSim({ onFlag }))
  const [, force] = useReducer((x) => x + 1, 0)
  const [client, setClient] = useState('app-riga')
  const [wc, setWc] = useState(1)
  const [pref, setPref] = useState('secondary')
  const [rc, setRc] = useState('local')
  const [lag, setLag] = useState(1200)
  const [round, setRound] = useState(0)

  useFrame((dt) => {
    sim.tick(dt)
    if (sim.takeDirty()) force()
  })

  const act = (fn) => {
    fn()
    force()
  }
  const reset = () => {
    const s = new ReplicaSim({ onFlag })
    s.setLag(lag)
    setSim(s)
    setRound((r) => r + 1)
  }

  const t = sim.t
  const stepdown = sim.pendingTimer('stepdown')
  const primary = sim.primary()
  const truth = sim.truthOp()
  const lastRead = sim.lastRead
  const writes = [...sim.writes].reverse().slice(0, 4)
  const summary = NODES.map((n) => `${CITY[n].name} ${sim.nodes[n].role.toLowerCase()} with Tea stock ${sim.valueOf(n)}`).join(', ')

  return (
    <ActivityFrame id="lab-replicas">
      <div className="lk-intro">
        <Mission
          lab="replicas"
          hints={{
            'stale-read': 'Set lag to 2 s or more, write, then quickly read with readPreference "secondary".',
            majority: 'Choose w: "majority" and write. Watch the shop wait for a second member.',
            partition: 'With Riga as primary, press Cut network and wait about 4 s.',
            rollback: 'During the cut, write with w: 1 from the Riga shop, wait for the election, then Heal.',
          }}
        />
        <PredictGate
          key={round}
          prompt="You cut the network around Riga while it is the primary. What happens to writes from the Riga shop?"
          options={[
            { id: 'a', label: 'Riga keeps accepting every write until the network heals' },
            { id: 'b', label: 'Riga accepts w: 1 writes for a few seconds, then steps down; Tallinn or Vilnius becomes primary' },
            { id: 'c', label: 'All three members refuse writes until the network heals' },
            { id: 'd', label: 'Both sides accept writes and merge them automatically later' },
          ]}
          correct="b"
          verified={sim.flags.stepDown && sim.flags.elected}
          runHint="Press Cut network, try a w: 1 write from the Riga shop, and watch Riga for the next few seconds."
          explain="A primary that cannot see a majority steps down after the election timeout, and the side holding 2 of 3 votes elects a new primary. Until then, the isolated primary still takes w: 1 writes, which is exactly how writes get rolled back later."
        />
      </div>

      <div className="lk-sim rep-sim">
        <div className="lk-sim__controls">
          <ControlGroup label="Client" id="rep-client">
            <div className="segmented" role="group" aria-labelledby="rep-client">
              {[
                ['app-riga', 'Riga shop'],
                ['app-tallinn', 'Tallinn shop'],
              ].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={client === v} onClick={() => setClient(v)}>
                  {l}
                </button>
              ))}
            </div>
          </ControlGroup>

          <ControlGroup label="Write concern" id="rep-wc">
            <div className="segmented" role="group" aria-labelledby="rep-wc">
              <button type="button" aria-pressed={wc === 1} onClick={() => setWc(1)}>
                <code>w: 1</code>
              </button>
              <button type="button" aria-pressed={wc === 'majority'} onClick={() => setWc('majority')}>
                <code>w: "majority"</code>
              </button>
            </div>
            <button type="button" className="btn btn--primary" onClick={() => act(() => sim.write(client, wc))}>
              <Icon name="upload" />
              Write Tea stock = {sim.nextValue}
            </button>
          </ControlGroup>

          <ControlGroup label="Read preference" id="rep-rp">
            <div className="segmented" role="group" aria-labelledby="rep-rp">
              {['primary', 'secondary', 'nearest'].map((p) => (
                <button key={p} type="button" aria-pressed={pref === p} onClick={() => setPref(p)}>
                  {p}
                </button>
              ))}
            </div>
            <label className="switch">
              <input type="checkbox" checked={rc === 'majority'} onChange={(e) => setRc(e.target.checked ? 'majority' : 'local')} />
              <span>
                readConcern <code>"majority"</code>
              </span>
            </label>
            <button type="button" className="btn btn--dark" onClick={() => act(() => sim.read(client, pref, rc))}>
              <Icon name="eye" />
              Read Tea stock
            </button>
          </ControlGroup>

          <ControlGroup
            label={
              <>
                Replication lag <output className="lk-val">{fmtMs(lag)}</output>
              </>
            }
            id="rep-lag"
            hint="Vilnius lags 40% more than Tallinn."
          >
            <input
              type="range"
              className="range"
              min={0}
              max={3000}
              step={100}
              value={lag}
              aria-labelledby="rep-lag"
              style={{ '--pct': `${(lag / 3000) * 100}%` }}
              onChange={(e) => {
                const v = Number(e.target.value)
                setLag(v)
                sim.setLag(v)
              }}
            />
          </ControlGroup>

          <ControlGroup label="Network" id="rep-net">
            {sim.partition ? (
              <button type="button" className="btn btn--dark" onClick={() => act(() => sim.heal())}>
                <Icon name="link" />
                Heal network
              </button>
            ) : (
              <button type="button" className="btn btn--danger" onClick={() => act(() => sim.cut())}>
                <Icon name="scissors" />
                Cut network around Riga
              </button>
            )}
          </ControlGroup>

          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
            <Icon name="reset" />
            Reset simulation
          </button>
        </div>

        <div className="lk-sim__stage">
          <div className="rep-status">
            <span className={`chip ${sim.partition ? 'chip--warn' : 'chip--done'}`}>
              <Icon name={sim.partition ? 'wifi-off' : 'check'} />
              {sim.partition ? 'Partitioned' : 'Network healthy'}
            </span>
            <span className="chip chip--outline">term {sim.term}</span>
            <span className="chip chip--outline">
              primary: {primary ? CITY[primary].name : 'none'}
            </span>
            {truth ? (
              <span className="chip chip--outline">
                last acknowledged: <strong className="tabular">&nbsp;{truth.value}</strong>
              </span>
            ) : null}
          </div>

          <svg className="rep-map" viewBox="0 0 560 440" role="img" aria-label={`Replica set. ${summary}. ${sim.partition ? 'Riga is cut off.' : 'All links up.'}`}>
            <path
              className="rep-sea"
              d="M0 0 H200 C 178 56, 140 104, 152 168 C 162 214, 124 250, 104 306 C 86 360, 46 404, 0 440 Z"
            />
            <text x="22" y="128" className="rep-sea__t">
              Baltic Sea
            </text>

            {LINKS.map(([a, b]) => {
              const cut = sim.partition && sim.side(a) !== sim.side(b)
              const isClient = a.startsWith('app')
              return (
                <line
                  key={`${a}-${b}`}
                  x1={POS[a].x}
                  y1={POS[a].y}
                  x2={POS[b].x}
                  y2={POS[b].y}
                  className={`rep-link ${cut ? 'is-cut' : ''} ${isClient ? 'is-client' : ''}`}
                />
              )
            })}

            <AnimatePresence>
              {sim.partition ? (
                <motion.g key="cut" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <motion.path
                    className="rep-cut"
                    d="M 300 8 C 280 120, 322 196, 300 262 C 286 318, 306 384, 292 436"
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, ease: EASE_OUT }}
                  />
                  <text x="310" y="300" className="rep-cut__t">
                    partition
                  </text>
                </motion.g>
              ) : null}
            </AnimatePresence>

            {/* clients */}
            {['app-riga', 'app-tallinn'].map((c) => (
              <g key={c} transform={`translate(${POS[c].x} ${POS[c].y})`} className={`rep-client ${client === c ? 'is-active' : ''}`}>
                <rect x={-46} y={-19} width={92} height={38} rx={10} />
                <text y={-2} textAnchor="middle" className="rep-client__t">
                  {c === 'app-riga' ? 'Riga shop' : 'Tallinn shop'}
                </text>
                <text y={11} textAnchor="middle" className="rep-client__s">
                  app + driver
                </text>
              </g>
            ))}

            {/* nodes */}
            {NODES.map((n) => {
              const node = sim.nodes[n]
              const p = POS[n]
              const ops = node.ops.slice(-5)
              const rolled = n === 'riga' ? sim.rolled : []
              const fraction = n === 'riga' && stepdown ? Math.max(0, (stepdown.at - t) / ELECTION_MS) : null
              return (
                <g key={n} transform={`translate(${p.x} ${p.y})`} className={`rep-node rep-node--${node.role.toLowerCase()}`}>
                  {fraction !== null ? (
                    <circle
                      r={41}
                      className="rep-countdown"
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - fraction}
                      transform="rotate(-90)"
                    />
                  ) : null}
                  <circle r={33} className="rep-node__body" />
                  <text y={-3} textAnchor="middle" className="rep-node__code">
                    {CITY[n].code}
                  </text>
                  <text y={12} textAnchor="middle" className="rep-node__val">
                    stock {sim.valueOf(n)}
                  </text>
                  <text y={-46} textAnchor="middle" className="rep-node__role">
                    {CITY[n].name} · {node.role}
                  </text>
                  {fraction !== null ? (
                    <text y={60} textAnchor="middle" className="rep-node__warn">
                      steps down in {((stepdown.at - t) / 1000).toFixed(1)} s
                    </text>
                  ) : null}
                  <g transform={`translate(${-(5 * 21) / 2} ${fraction !== null ? 70 : 46})`}>
                    {ops.map((o, i) => {
                      const committed = sim.majorityCommitted(o)
                      return (
                        <g key={o.id} transform={`translate(${i * 21} 0)`} className={`rep-op ${committed ? 'is-committed' : 'is-local'}`}>
                          <rect width={18} height={18} rx={4} />
                          <text x={9} y={12.5} textAnchor="middle">
                            {o.value}
                          </text>
                        </g>
                      )
                    })}
                    {rolled.map((r) => {
                      const k = Math.max(0, Math.min(1, (t - r.at) / 2400))
                      return (
                        <g
                          key={`rb-${r.op.id}`}
                          transform={`translate(${(ops.length + r.index) * 21} ${reduce ? 0 : -k * 46})`}
                          className="rep-op is-rolled"
                          opacity={1 - k}
                        >
                          <rect width={18} height={18} rx={4} />
                          <text x={9} y={12.5} textAnchor="middle">
                            {r.op.value}
                          </text>
                        </g>
                      )
                    })}
                  </g>
                </g>
              )
            })}

            {/* messages */}
            {!reduce &&
              sim.msgs.map((m) => {
                const pos = msgPos(POS[m.from], POS[m.to], (t - m.sent) / (m.arrive - m.sent))
                const st = MSG_STYLE[m.kind]
                return <circle key={m.id} cx={pos.x} cy={pos.y} r={st.r} className={`rep-pk ${st.cls}`} />
              })}
            {!reduce &&
              sim.lostMsgs.map((l) => {
                const pos = msgPos(POS[l.msg.from], POS[l.msg.to], l.progress)
                const k = (t - l.at) / 900
                return (
                  <g key={`lost-${l.msg.id}`} transform={`translate(${pos.x} ${pos.y}) scale(${1 + k * 0.6})`} opacity={1 - k} className="rep-lost">
                    <path d="M-5 -5 L5 5 M5 -5 L-5 5" />
                  </g>
                )
              })}
          </svg>

          <div className="lk-legend rep-legend">
            <span>
              <i style={{ background: 'var(--saffron-2)' }} /> write / oplog
            </span>
            <span>
              <i style={{ background: 'var(--leaf)' }} /> acknowledgement
            </span>
            <span>
              <i style={{ background: 'var(--sky)' }} /> read
            </span>
            <span>
              <i className="rep-lg-box rep-lg-box--c" /> on a majority
            </span>
            <span>
              <i className="rep-lg-box rep-lg-box--l" /> on one member only
            </span>
          </div>

          <div className="rep-cards">
            <div className="rep-card">
              <span className="kicker kicker--ink">Recent writes</span>
              {writes.length === 0 ? (
                <p className="faint rep-card__empty">No writes yet.</p>
              ) : (
                <ul className="rep-writes">
                  {writes.map((w) => {
                    const st = WRITE_STATE[w.state] || WRITE_STATE.sending
                    const count = w.opId ? sim.replicaCount(w.opId) : 0
                    return (
                      <li key={w.id}>
                        <span className="rep-writes__v tabular">{w.value}</span>
                        <code>{w.wc === 'majority' ? 'w: "majority"' : 'w: 1'}</code>
                        <span className={`chip ${st.tone}`}>
                          {st.text}
                          {w.state === 'waiting' ? ` ${count}/2` : ''}
                          {w.state === 'acked' && w.ackAt ? ` in ${Math.round(w.ackAt - w.start)} ms` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className={`rep-card ${lastRead?.state === 'done' ? (lastRead.stale ? 'is-stale' : lastRead.uncommitted ? 'is-dirty' : 'is-fresh') : ''}`}>
              <span className="kicker kicker--ink">Last read</span>
              {!lastRead ? (
                <p className="faint rep-card__empty">No reads yet.</p>
              ) : lastRead.state !== 'done' ? (
                <p className="rep-read__wait">Asking {CITY[lastRead.node].name}…</p>
              ) : (
                <div className="rep-read">
                  <span className="rep-read__v tabular">{lastRead.value}</span>
                  <span className="rep-read__meta">
                    from {CITY[lastRead.node].name} ({(lastRead.role || '').toLowerCase()})
                    <strong>
                      {lastRead.stale
                        ? `Stale: latest acknowledged is ${lastRead.truth}`
                        : lastRead.uncommitted
                          ? 'Not majority-committed yet'
                          : 'Up to date'}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="lk-row">
        <EventLog events={sim.events} />
        <div className="rep-members">
          <span className="kicker kicker--ink">Members</span>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="num">
                    Tea stock
                  </th>
                  <th scope="col" className="num">
                    Behind
                  </th>
                </tr>
              </thead>
              <tbody>
                {NODES.map((n) => (
                  <tr key={n}>
                    <th scope="row">{CITY[n].name}</th>
                    <td>
                      <span className={`rep-role rep-role--${sim.nodes[n].role.toLowerCase()}`}>{sim.nodes[n].role.toLowerCase()}</span>
                    </td>
                    <td className="num">{sim.valueOf(n)}</td>
                    <td className="num">{sim.behind(n) ? `${sim.behind(n)} op${sim.behind(n) > 1 ? 's' : ''}` : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lk-readouts">
            <Readout label="Lag to Tallinn" value={fmtMs(lag)} />
            <Readout label="Lag to Vilnius" value={fmtMs(Math.round(lag * 1.4))} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {cps.partition ? (
          <motion.section
            className="rep-cap"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE_OUT }}
            aria-labelledby="rep-cap-title"
          >
            <div className="lk-h">
              <div>
                <span className="kicker">CAP, as you just saw it</span>
                <h2 id="rep-cap-title">During a partition, MongoDB keeps consistency and gives up availability on the minority side</h2>
              </div>
            </div>
            <div className="rep-cap__grid">
              <div className="rep-cap__side rep-cap__side--minority">
                <h3>Riga side · 1 of 3 votes</h3>
                <ul>
                  <li>Primary steps down after the election timeout.</li>
                  <li>Writes are refused: not available.</li>
                  <li>Reads only with a secondary read preference, and they can be stale.</li>
                  <li>w: 1 writes taken before the step-down are rolled back on heal.</li>
                </ul>
              </div>
              <div className="rep-cap__side rep-cap__side--majority">
                <h3>Tallinn and Vilnius · 2 of 3 votes</h3>
                <ul>
                  <li>Elect a new primary in a few seconds.</li>
                  <li>Accept writes again: available.</li>
                  <li>Every w: "majority" write survives, because a majority must hold it.</li>
                  <li>Their history wins when Riga rejoins.</li>
                </ul>
              </div>
            </div>
            <p className="rep-cap__note">
              CAP only bites while the network is partitioned: you cannot have every member both accept writes and agree. For
              majority writes MongoDB picks consistency (CP). <code>w: 1</code> lowers latency, but it trades away the guarantee that an
              acknowledged write survives.
            </p>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <Debrief show={Boolean(cps.rollback || cps['stale-read'])}>
        <p>
          A restock confirmed with <code>w: 1</code> can disappear after a failover, and a shop reading from a lagging secondary can
          sell Tea it no longer has. Use <code>w: "majority"</code> for stock changes and read the stock count from the primary (or
          with <code>readConcern: "majority"</code>) at checkout.
        </p>
        <p>Secondary reads are fine for catalogue pages, where a few seconds of staleness costs nothing.</p>
      </Debrief>
    </ActivityFrame>
  )
}
