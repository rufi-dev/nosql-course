// Lecture 1.2 · Partitions, replicas and CAP.
import { useFx, At, Draw, ArrowDefs, Packet, Code, Pill, NodeCard, Glyph, lerp, clamp01 } from './kit.jsx'

/* ------------------------------------------------------------------ */
/* Scene 1: one shop, three cities -> sharding                          */
/* ------------------------------------------------------------------ */
const CITY_A = [
  { name: 'Tallinn', x: 330, y: 132 },
  { name: 'Riga', x: 300, y: 270 },
  { name: 'Vilnius', x: 352, y: 408 },
]
const CITY_B = [
  { x: 112, y: 160 },
  { x: 92, y: 270 },
  { x: 118, y: 380 },
]
const SHARDS = [
  { id: 'A', y: 130, color: 'var(--shard-a)' },
  { id: 'B', y: 270, color: 'var(--shard-b)' },
  { id: 'C', y: 410, color: 'var(--shard-c)' },
]
const SERVER = { x: 700, y: 270 }
const ROUTER = { x: 430, y: 270 }
const DOCS = [
  { id: 'p1', name: 'Tea', shard: 0 },
  { id: 'p2', name: 'Rice', shard: 1 },
  { id: 'p3', name: 'Coffee', shard: 2 },
]
const STREAM = [1, 0, 2, 2, 1, 0]

export function CitiesScene({ t }) {
  const fx = useFx()
  const split = fx.ramp(t, 16, 1.6)
  const serverK = 1 - fx.ramp(t, 16.3, 0.9)
  const routerK = fx.ramp(t, 17.4, 1)
  const cities = CITY_A.map((c, i) => ({ ...c, x: lerp(c.x, CITY_B[i].x, split), y: lerp(c.y, CITY_B[i].y, split) }))
  const load = clamp01((t - 8) / 6)
  const queue = t > 9 && t < 16.5 ? Math.min(9, Math.floor((t - 9) * 1.4)) : 0
  const shardPos = SHARDS.map((s, i) => {
    const k = fx.ramp(t, 18 + i * 0.35, 1.3)
    return { ...s, k, x: lerp(SERVER.x, 790, k), y: lerp(SERVER.y, s.y, k) }
  })

  // documents placed so far
  const arrived = DOCS.map((d, i) => t >= 34 + i * 2 + 2.1)
  const streamArrived = STREAM.map((_, j) => t >= 40 + j * 0.6 + 1)
  const shardCount = SHARDS.map((_, si) => arrived.filter((a, i) => a && DOCS[i].shard === si).length + streamArrived.filter((a, j) => a && STREAM[j] === si).length)

  const pulses = []
  if (t > 1 && t < 16.4) {
    cities.forEach((c, i) => {
      const rate = t > 8 ? 0.9 : 0.45
      for (let n = 0; n < (t > 8 ? 3 : 2); n++) {
        const ph = (t * rate + i * 0.31 + n * 0.37) % 1
        pulses.push({ key: `${i}-${n}`, points: [[c.x + 18, c.y], [SERVER.x - 70, SERVER.y]], k: ph })
      }
    })
  }

  return (
    <>
      <At x={64} y={36} k={fx.ramp(t, 0.1)}>
        <span className="lec-kicker">Partitioning and replication</span>
      </At>
      <At x={64} y={60} k={fx.win(t, 0.3, 15.6, 1.2, 0.6)} dy={18} blur>
        <h3 className="lec-h1 lec-h1--md">Three cities, one inventory</h3>
      </At>
      <At x={64} y={60} k={fx.ramp(t, 16.6, 1.2)} dy={18} blur>
        <h3 className="lec-h1 lec-h1--md">Split the data: sharding</h3>
      </At>

      <svg className="lec-svg" viewBox="0 0 960 540" aria-hidden="true">
        <ArrowDefs id="c-arrow" />
        {serverK > 0 &&
          cities.map((c, i) => (
            <g key={c.name} style={{ opacity: serverK }}>
              <Draw d={`M ${c.x + 18} ${c.y} L ${SERVER.x - 70} ${SERVER.y}`} k={fx.ramp(t, 0.8 + i * 0.3, 1.2)} width={1.5} />
            </g>
          ))}
        {routerK > 0 &&
          cities.map((c) => (
            <Draw key={`r-${c.name}`} d={`M ${c.x + 18} ${c.y} L ${ROUTER.x - 58} ${ROUTER.y}`} k={routerK} width={1.5} />
          ))}
        {shardPos.map((s) =>
          s.k > 0.05 ? (
            <Draw key={`s-${s.id}`} d={`M ${ROUTER.x + 58} ${ROUTER.y} L ${s.x - 100} ${s.y}`} k={fx.ramp(t, 19 + SHARDS.indexOf(s) * 0.3, 1)} width={1.5} />
          ) : null,
        )}
        {pulses.map((p) => (
          <Packet key={p.key} points={p.points} k={p.k} r={4} color={t > 8 ? 'var(--coral)' : 'var(--mint)'} />
        ))}

        {/* documents travelling router -> shard */}
        {DOCS.map((d, i) => {
          const s0 = 34 + i * 2
          if (t < s0 || t > s0 + 2.2) return null
          const k1 = fx.travel(t, s0, 0.9)
          const k2 = fx.travel(t, s0 + 0.95, 1.15)
          const sp = shardPos[d.shard]
          const pts = k2 > 0 ? [[ROUTER.x, ROUTER.y], [sp.x - 96, sp.y]] : [[250, 270], [ROUTER.x, ROUTER.y]]
          return <Packet key={d.id} points={pts} k={k2 > 0 ? k2 : k1} color={SHARDS[d.shard].color} r={7} label={d.name} />
        })}
        {STREAM.map((si, j) => {
          const s0 = 40 + j * 0.6
          if (t < s0 || t > s0 + 1) return null
          const sp = shardPos[si]
          return <Packet key={`st-${j}`} points={[[ROUTER.x + 50, ROUTER.y], [sp.x - 96, sp.y]]} k={fx.travel(t, s0, 1)} r={4} color={SHARDS[si].color} />
        })}

        {/* queries */}
        {(() => {
          const out = []
          const a = shardPos[0]
          if (t >= 45 && t < 47.5) {
            const k = t < 46.3 ? fx.travel(t, 45, 1.2) : 1 - fx.travel(t, 46.4, 1)
            out.push(<Packet key="q1" points={[[ROUTER.x + 50, ROUTER.y], [a.x - 96, a.y]]} k={Math.max(0.001, k)} color="var(--mint)" r={6} />)
          }
          if (t >= 49.6 && t < 52.4) {
            shardPos.forEach((s, i) => {
              const k = t < 50.9 ? fx.travel(t, 49.6, 1.2) : 1 - fx.travel(t, 51, 1.2)
              out.push(<Packet key={`q2-${i}`} points={[[ROUTER.x + 50, ROUTER.y], [s.x - 96, s.y]]} k={Math.max(0.001, k)} color="var(--saffron)" r={6} />)
            })
          }
          return out
        })()}
      </svg>

      {cities.map((c, i) => (
        <At key={c.name} x={c.x} y={c.y} k={fx.ramp(t, 0.4 + i * 0.35)} anchor="center" from={0.5}>
          <div className="lec-city">
            <span className="lec-city__pin" />
            <span className="lec-city__name">{c.name}</span>
          </div>
        </At>
      ))}

      {/* single server */}
      {serverK > 0 && (
        <At x={SERVER.x} y={SERVER.y} k={Math.min(fx.ramp(t, 1.2), serverK)} anchor="center" from={0.85}>
          <div className={`lec-server ${load > 0.6 ? 'is-hot' : ''}`}>
            <div className="lec-server__title">inventory DB</div>
            {['CPU', 'Memory', 'Disk'].map((m, i) => {
              const v = 0.28 + i * 0.06 + load * (0.66 - i * 0.04)
              return (
                <div key={m} className="lec-meter">
                  <span>{m}</span>
                  <div className="lec-meter__track">
                    <div className={`lec-meter__fill ${v > 0.8 ? 'is-hot' : ''}`} style={{ transform: `scaleX(${v})` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </At>
      )}
      {queue > 0 &&
        Array.from({ length: queue }).map((_, i) => (
          <span key={i} className="lec-qdot" style={{ left: 604 - (i % 3) * 13, top: 300 + Math.floor(i / 3) * 13 - 30 }} />
        ))}
      {serverK > 0 && t > 11 && (
        <At x={SERVER.x} y={SERVER.y + 92} k={Math.min(fx.ramp(t, 11), serverK)} anchor="x">
          <span className="lec-small lec-coral">bottleneck</span>
        </At>
      )}

      {/* router */}
      <At x={ROUTER.x} y={ROUTER.y} k={routerK} anchor="center" from={0.7}>
        <div className="lec-router">
          <span className="lec-router__name">mongos</span>
          <span className="lec-mono lec-faint">hash(_id)</span>
        </div>
      </At>
      <At x={ROUTER.x - 96} y={ROUTER.y + 52} k={fx.ramp(t, 25.5)} dy={10}>
        <Code className="lec-code--sm">{'shardKey: { _id: "hashed" }'}</Code>
      </At>
      {DOCS.map((d, i) => (
        <At key={`map-${d.id}`} x={ROUTER.x - 88} y={ROUTER.y + 100 + i * 22} k={fx.ramp(t, 34.9 + i * 2)} dy={6}>
          <span className="lec-mono lec-small">
            hash(&quot;{d.id}&quot;) <span className="lec-faint">→</span>{' '}
            <span style={{ color: SHARDS[d.shard].color }}>shard {SHARDS[d.shard].id}</span>
          </span>
        </At>
      ))}

      {/* shards */}
      {shardPos.map((s, si) => (
        <At key={s.id} x={s.x} y={s.y} k={s.k} anchor="center" from={0.6}>
          <div className="lec-shard" style={{ '--c': s.color }}>
            <div className="lec-shard__head">
              <span className="lec-shard__dot" />
              Shard {s.id}
              <span className="lec-shard__count lec-mono">
                {shardCount[si]} {shardCount[si] === 1 ? 'doc' : 'docs'}
              </span>
            </div>
            <div className="lec-shard__docs">
              {DOCS.map((d, i) =>
                d.shard === si && arrived[i] ? (
                  <span key={d.id} className="lec-docchip">
                    {d.id} · {d.name}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </At>
      ))}

      {/* query labels */}
      <At x={64} y={470} k={fx.win(t, 44, 48.6, 0.7, 0.4)} dy={8}>
        <span className="lec-pillrow">
          <Code>{'find({ _id: "p1" })'}</Code>
          <Pill tone="mint">targeted · 1 shard</Pill>
        </span>
      </At>
      <At x={64} y={470} k={fx.ramp(t, 49, 0.7)} dy={8}>
        <span className="lec-pillrow">
          <Code>{'find({ stock: { $lt: 5 } })'}</Code>
          <Pill tone="saffron">scatter-gather · 3 shards, then merge</Pill>
        </span>
      </At>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Shared replica-set geometry for scenes 2 and 3                       */
/* ------------------------------------------------------------------ */
const P = { x: 240, y: 210 }
const T = { x: 720, y: 120 }
const V = { x: 720, y: 345 }
const linkPT = `M ${P.x + 108} ${P.y - 10} L ${T.x - 108} ${T.y + 8}`
const linkPV = `M ${P.x + 108} ${P.y + 14} L ${V.x - 108} ${V.y - 8}`
const ptsPT = [
  [P.x + 108, P.y - 10],
  [T.x - 108, T.y + 8],
]
const ptsPV = [
  [P.x + 108, P.y + 14],
  [V.x - 108, V.y - 8],
]

/* ------------------------------------------------------------------ */
/* Scene 2: replication and lag                                          */
/* ------------------------------------------------------------------ */
export function ReplicationScene({ t }) {
  const fx = useFx()
  const grow = fx.ramp(t, 9, 1.4)
  const px = lerp(480, P.x, grow)
  const py = lerp(250, P.y, grow)
  const roles = t >= 9.6
  const pVal = t >= 19.6 ? 13 : 3
  const tVal = t >= 29.2 ? 13 : 3
  const vVal = t >= 50.2 ? 13 : 3
  const vLag = t >= 30 && t < 50.2
  const stale = fx.win(t, 43.6, 49.6, 0.6, 0.4)

  const oplog = [
    { text: "{ op: 'i', _id: 'p2' }", on: true },
    { text: "{ op: 'i', _id: 'p3' }", on: true },
    { text: "{ op: 'u', _id: 'p1', stock: 13 }", on: t >= 20.4, fresh: t >= 20.4 && t < 27 },
  ]

  return (
    <>
      <At x={64} y={36} k={fx.ramp(t, 0.1)}>
        <span className="lec-kicker">Replication</span>
      </At>
      <At x={40} y={96} k={fx.ramp(t, 18, 0.8)} dy={10}>
        <Code>{"updateOne({ _id: 'p1' }, { $inc: { stock: 10 } })"}</Code>
      </At>

      <svg className="lec-svg" viewBox="0 0 960 540" aria-hidden="true">
        <ArrowDefs id="r-arrow" />
        <Draw d={linkPT} k={fx.ramp(t, 10.2, 1.2)} width={2} arrow="r-arrow" />
        <Draw d={linkPV} k={fx.ramp(t, 10.5, 1.2)} width={2} arrow="r-arrow" />
        {/* client write */}
        <Packet points={[[70, 210], [P.x - 108, P.y]]} k={fx.travel(t, 18.4, 1.2)} visible={t >= 18.4 && t < 19.7} color="var(--saffron)" r={6} />
        {/* oplog replication */}
        <Packet points={ptsPT} k={fx.travel(t, 27, 2.2)} visible={t >= 27 && t < 29.2} color="var(--saffron)" r={6} label="oplog" />
        <Packet
          points={ptsPV}
          k={clamp01((t - 27) / 23.2)}
          visible={t >= 27 && t < 50.2}
          color="var(--saffron)"
          r={6}
          label={vLag ? 'lag' : undefined}
        />
        {/* shopper read */}
        <Packet points={[[880, V.y], [V.x + 108, V.y]]} k={fx.travel(t, 41.5, 1)} visible={t >= 41.5 && t < 42.6} color="var(--sky)" r={6} />
        <Packet points={[[V.x + 108, V.y], [880, V.y]]} k={fx.travel(t, 42.7, 1)} visible={t >= 42.7 && t < 43.8} color="var(--coral)" r={6} label="3" />
      </svg>

      {t >= 18 && (
        <At x={56} y={210} k={fx.ramp(t, 18)} anchor="center">
          <span className="lec-glyph">
            <Glyph name="person" size={26} />
          </span>
        </At>
      )}

      <At x={px} y={py} k={fx.ramp(t, 0.4, 1)} anchor="center" from={0.85}>
        <NodeCard
          role={roles ? 'PRIMARY' : 'SHARD A'}
          tone={roles ? 'saffron' : 'plain'}
          city={roles ? 'Riga' : 'one machine'}
          rows={[{ k: 'Tea stock', v: pVal, flash: t >= 19.6 && t < 21.5 }]}
          badge={!roles && t > 3.5 ? <span className="lec-node__warn">single point of failure</span> : null}
        />
      </At>
      <At x={T.x} y={T.y} k={fx.ramp(t, 9.8, 1.1)} anchor="center" dx={-60} dy={0}>
        <NodeCard role="SECONDARY" tone="mint" city="Tallinn" rows={[{ k: 'Tea stock', v: tVal, flash: t >= 29.2 && t < 31 }]} />
      </At>
      <At x={V.x} y={V.y} k={fx.ramp(t, 10.1, 1.1)} anchor="center" dx={-60} dy={0}>
        <NodeCard
          role="SECONDARY"
          tone="mint"
          city="Vilnius"
          rows={[{ k: 'Tea stock', v: vVal, flash: t >= 50.2 && t < 52, tone: stale > 0 ? 'stale' : undefined }]}
          badge={vLag ? <span className="lec-node__warn">lag 2.0 s</span> : null}
        />
      </At>

      <At x={P.x - 110} y={P.y + 76} k={fx.ramp(t, 19.8)} dy={10} w={290}>
        <div className="lec-oplog">
          <div className="lec-oplog__title">oplog</div>
          {oplog.map((e) => (
            <div key={e.text} className={`lec-oplog__row ${e.fresh ? 'is-fresh' : ''}`} style={{ opacity: e.on ? 1 : 0 }}>
              {e.text}
            </div>
          ))}
        </div>
      </At>

      {t >= 41 && (
        <At x={900} y={V.y} k={fx.ramp(t, 41)} anchor="center">
          <span className="lec-glyph">
            <Glyph name="person" size={26} />
          </span>
        </At>
      )}
      <At x={900} y={V.y + 34} k={stale} anchor="x" dy={6}>
        <span className="lec-pill lec-pill--coral">stale read</span>
      </At>

      <At x={64} y={470} k={fx.ramp(t, 49)} dy={8}>
        <span className="lec-pillrow">
          <Code>{"readPreference: 'primary'"}</Code>
          <span style={{ opacity: fx.ramp(t, 50.5) }}>
            <Code>{"writeConcern: { w: 'majority' }"}</Code>
          </span>
          <span className="lec-small lec-faint" style={{ opacity: fx.ramp(t, 52) }}>
            fresher data, more latency
          </span>
        </span>
      </At>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 3: the partition, CAP and eventual consistency                  */
/* ------------------------------------------------------------------ */
const CUT = 'M 480 46 L 468 104 L 492 162 L 466 222 L 490 284 L 470 344 L 484 400'

export function PartitionScene({ t }) {
  const fx = useFx()
  const cut = fx.ramp(t, 2, 2) * (1 - fx.ramp(t, 41, 0.8)) + (t >= 49 ? fx.ramp(t, 49, 1.4) * 0.55 : 0)
  const severed = (t >= 3 && t < 41.3) || t >= 49.5
  const cPick = (t >= 23 && t < 32) || t >= 49
  const aPick = t >= 32 && t < 49
  const refused = fx.win(t, 25.2, 31.4, 0.5, 0.4)
  const pVal = t >= 33.5 ? 0 : 1
  const vVal = t >= 35 ? 0 : 1
  const tVal = t >= 43.6 ? 0 : 1
  const newPrimary = t >= 51
  const stepped = t >= 52.5

  const customerPulses = []
  if (t > 9 && t < 23) {
    ;[
      [[86, 150], [P.x - 108, P.y - 10]],
      [[86, 280], [P.x - 108, P.y + 14]],
      [[874, 120], [T.x + 108, T.y]],
      [[874, 345], [V.x + 108, V.y]],
    ].forEach((pts, i) => customerPulses.push({ key: i, pts, k: (t * 0.55 + i * 0.27) % 1 }))
  }

  return (
    <>
      <At x={64} y={36} k={fx.ramp(t, 0.1)}>
        <span className="lec-kicker lec-kicker--coral">When the network fails</span>
      </At>

      <svg className="lec-svg" viewBox="0 0 960 540" aria-hidden="true">
        <ArrowDefs id="p-arrow" />
        {severed ? (
          <>
            <path d={linkPT} className="lec-link lec-link--cut" />
            <path d={linkPV} className="lec-link lec-link--cut" />
          </>
        ) : (
          <>
            <path d={linkPT} className="lec-link" />
            <path d={linkPV} className="lec-link" />
          </>
        )}
        {cut > 0 && <path d={CUT} className="lec-cut" pathLength="1" strokeDasharray="1" strokeDashoffset={(1 - Math.min(1, cut)).toFixed(3)} style={{ opacity: Math.min(1, cut + 0.2) }} />}
        {customerPulses.map((p) => (
          <Packet key={p.key} points={p.pts} k={p.k} r={4} color="var(--sky)" />
        ))}
        {/* consistency path: Riga refuses */}
        <Packet points={[[86, 150], [P.x - 108, P.y - 10]]} k={fx.travel(t, 24, 1)} visible={t >= 24 && t < 25.1} color="var(--saffron)" r={6} />
        <Packet points={[[P.x - 108, P.y - 10], [86, 150]]} k={fx.travel(t, 25.2, 1)} visible={t >= 25.2 && t < 26.3} color="var(--coral)" r={6} label="error" />
        {/* availability: both sides sell */}
        <Packet points={[[86, 150], [P.x - 108, P.y - 10]]} k={fx.travel(t, 32.4, 1)} visible={t >= 32.4 && t < 33.5} color="var(--saffron)" r={6} label="buy" />
        <Packet points={[[874, 345], [V.x + 108, V.y]]} k={fx.travel(t, 33.9, 1)} visible={t >= 33.9 && t < 35} color="var(--saffron)" r={6} label="buy" />
        {/* heal: exchange */}
        <Packet points={ptsPV} k={fx.travel(t, 41.6, 1.4)} visible={t >= 41.6 && t < 43.1} color="var(--mint)" r={6} />
        <Packet points={[...ptsPV].reverse()} k={fx.travel(t, 41.8, 1.4)} visible={t >= 41.8 && t < 43.3} color="var(--mint)" r={6} />
        <Packet points={ptsPT} k={fx.travel(t, 42.2, 1.4)} visible={t >= 42.2 && t < 43.7} color="var(--mint)" r={6} />
      </svg>

      <At x={500} y={42} k={fx.win(t, 3.2, 41, 0.8, 0.5)} dx={-10} dy={0}>
        <span className="lec-pill lec-pill--coral">network partition</span>
      </At>

      {t > 8 &&
        [
          [70, 150],
          [70, 280],
          [890, 120],
          [890, 345],
        ].map(([x, y], i) => (
          <At key={i} x={x} y={y} k={fx.ramp(t, 8 + i * 0.3)} anchor="center" from={0.6}>
            <span className="lec-glyph">
              <Glyph name="person" size={24} />
            </span>
          </At>
        ))}

      <At x={P.x} y={P.y} k={fx.ramp(t, 0.2)} anchor="center">
        <NodeCard
          role={stepped ? 'SECONDARY · stepped down' : 'PRIMARY'}
          tone={stepped ? 'plain' : refused > 0 ? 'coral' : 'saffron'}
          city="Riga"
          rows={[{ k: 'Coffee stock', v: pVal, flash: t >= 33.5 && t < 35.5 }]}
        />
      </At>
      <At x={T.x} y={T.y} k={fx.ramp(t, 0.3)} anchor="center">
        <NodeCard
          role={newPrimary ? 'PRIMARY · elected' : 'SECONDARY'}
          tone={newPrimary ? 'saffron' : 'mint'}
          city="Tallinn"
          rows={[{ k: 'Coffee stock', v: tVal, flash: t >= 43.6 && t < 45.5 }]}
          badge={newPrimary ? <span className="lec-node__crown"><Glyph name="crown" size={15} /></span> : null}
        />
      </At>
      <At x={V.x} y={V.y} k={fx.ramp(t, 0.4)} anchor="center">
        <NodeCard role="SECONDARY" tone="mint" city="Vilnius" rows={[{ k: 'Coffee stock', v: vVal, flash: t >= 35 && t < 37 }]} />
      </At>

      <At x={P.x} y={P.y - 92} k={refused} anchor="x" dy={8}>
        <span className="lec-pill lec-pill--coral">write refused: no majority</span>
      </At>
      <At x={P.x} y={P.y + 70} k={fx.win(t, 33.6, 41, 0.6, 0.4)} anchor="x" dy={6}>
        <span className="lec-pill lec-pill--saffron">sold in Riga</span>
      </At>
      <At x={V.x} y={V.y - 96} k={fx.win(t, 35.1, 41, 0.6, 0.4)} anchor="x" dy={6}>
        <span className="lec-pill lec-pill--saffron">sold in Vilnius</span>
      </At>
      <At x={480} y={406} k={fx.win(t, 36.5, 41.2, 0.7, 0.4)} anchor="x" dy={8}>
        <span className="lec-pill lec-pill--coral">two sales, one Coffee: conflicting histories</span>
      </At>
      <At x={480} y={406} k={fx.win(t, 43.6, 49, 0.7, 0.4)} anchor="x" dy={8}>
        <span className="lec-pillrow">
          <span className="lec-pill lec-pill--plain">reconcile: keep one sale, back-order the other</span>
          <span className="lec-pill lec-pill--mint" style={{ opacity: fx.ramp(t, 45) }}>
            eventually consistent
          </span>
        </span>
      </At>
      <At x={480} y={406} k={fx.ramp(t, 50, 0.8)} anchor="x" dy={8}>
        <span className="lec-pill lec-pill--saffron">MongoDB: the majority side elects a new primary</span>
      </At>

      {/* C or A */}
      <At x={64} y={448} k={fx.ramp(t, 16, 1)} dy={14} w={400}>
        <div className={`lec-choice ${cPick ? 'is-on' : ''} ${aPick ? 'is-off' : ''}`}>
          <span className="lec-choice__letter">C</span>
          <div>
            <strong>Consistency</strong>
            <span>Refuse writes that cannot reach a majority</span>
          </div>
        </div>
      </At>
      <At x={496} y={448} k={fx.ramp(t, 16.5, 1)} dy={14} w={400}>
        <div className={`lec-choice ${aPick ? 'is-on' : ''} ${cPick ? 'is-off' : ''}`}>
          <span className="lec-choice__letter">A</span>
          <div>
            <strong>Availability</strong>
            <span>Accept writes on both sides, reconcile later</span>
          </div>
        </div>
      </At>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 4: two-phase commit and NewSQL                                  */
/* ------------------------------------------------------------------ */
const C = { x: 480, y: 150 }
const A = { x: 230, y: 360 }
const B = { x: 730, y: 360 }
const toA = [
  [C.x - 60, C.y + 52],
  [A.x + 40, A.y - 56],
]
const toB = [
  [C.x + 60, C.y + 52],
  [B.x - 40, B.y - 56],
]
const back = (pts) => [...pts].reverse()

function Msg({ t, start, pts, label, color }) {
  const fx = useFx()
  return <Packet points={pts} k={fx.travel(t, start, 1.4)} visible={t >= start && t < start + 1.45} color={color} r={6} label={label} />
}

export function TwoPCScene({ t }) {
  const fx = useFx()
  const closing = fx.ramp(t, 46, 1.2)
  const dim = 1 - closing * 0.85
  const failRun = t >= 26
  const locked = (t >= 10.5 && t < 21.5) || (t >= 28 && t < 41.5)
  const committed = (t >= 21.5 && t < 26) || t >= 41.5
  const crashed = t >= 30.5 && t < 39.5
  const blocked = t >= 30.5 && t < 41.5
  const waiting = Math.max(0, Math.min(t, 41.5) - 30.5)
  let rt = 0
  if (!failRun) rt = t >= 21.5 ? 2 : t >= 13.5 ? 1 : 0
  else rt = t >= 41.5 ? 2 : t >= 30 ? 1 : 0
  const raft = fx.ramp(t, 36.5, 1)

  return (
    <>
      <div className="lec-layer" style={{ opacity: dim }}>
        <At x={64} y={36} k={fx.ramp(t, 0.1)}>
          <span className={`lec-kicker ${failRun && t < 35 ? 'lec-kicker--coral' : ''}`}>
            {t < 26 ? 'Two-phase commit' : t < 35 ? 'Failure: the coordinator crashes' : 'NewSQL'}
          </span>
        </At>
        <At x={896} y={34} k={fx.ramp(t, 9)} anchor="right">
          <span className="lec-rt">
            round trips <strong className="lec-mono">{rt}</strong>
          </span>
        </At>

        <At x={64} y={74} k={fx.win(t, 0.5, 26, 0.9, 0.5)} dy={10} w={230}>
          <div className="lec-order">
            <span className="lec-order__no">Order #1042</span>
            <strong>1 × Coffee</strong>
          </div>
        </At>

        {['SQL', 'ACID transactions', 'Horizontal scale'].map((p, i) => (
          <At key={p} x={[330, 400, 560][i]} y={32} k={fx.ramp(t, 35.5 + i * 0.5)} dy={8}>
            <Pill tone={i === 2 ? 'mint' : 'saffron'}>{p}</Pill>
          </At>
        ))}

        <svg className="lec-svg" viewBox="0 0 960 540" aria-hidden="true">
          <path d={`M ${toA[0][0]} ${toA[0][1]} L ${toA[1][0]} ${toA[1][1]}`} className="lec-link" style={{ opacity: fx.ramp(t, 1) }} />
          <path d={`M ${toB[0][0]} ${toB[0][1]} L ${toB[1][0]} ${toB[1][1]}`} className="lec-link" style={{ opacity: fx.ramp(t, 1.2) }} />
          {/* happy path */}
          <Msg t={t} start={9} pts={toA} label="PREPARE" color="var(--saffron)" />
          <Msg t={t} start={9} pts={toB} label="PREPARE" color="var(--saffron)" />
          <Msg t={t} start={12} pts={back(toA)} label="YES" color="var(--mint)" />
          <Msg t={t} start={12.2} pts={back(toB)} label="YES" color="var(--mint)" />
          <Msg t={t} start={18} pts={toA} label="COMMIT" color="var(--saffron)" />
          <Msg t={t} start={18} pts={toB} label="COMMIT" color="var(--saffron)" />
          <Msg t={t} start={20} pts={back(toA)} label="ACK" color="var(--mint)" />
          <Msg t={t} start={20.1} pts={back(toB)} label="ACK" color="var(--mint)" />
          {/* failure run */}
          <Msg t={t} start={26.5} pts={toA} label="PREPARE" color="var(--saffron)" />
          <Msg t={t} start={26.5} pts={toB} label="PREPARE" color="var(--saffron)" />
          <Msg t={t} start={28.5} pts={back(toA)} label="YES" color="var(--mint)" />
          <Msg t={t} start={28.6} pts={back(toB)} label="YES" color="var(--mint)" />
          {/* new leader resumes */}
          <Msg t={t} start={40} pts={toA} label="COMMIT" color="var(--saffron)" />
          <Msg t={t} start={40} pts={toB} label="COMMIT" color="var(--saffron)" />
        </svg>

        <At x={C.x} y={C.y} k={fx.ramp(t, 0.6)} anchor="center" from={0.85}>
          <NodeCard
            role={crashed ? 'COORDINATOR · crashed' : 'COORDINATOR'}
            tone={crashed ? 'coral' : 'saffron'}
            rows={[{ k: 'phase', v: t < 9 ? 'idle' : committed ? 'done' : t >= 18 && t < 26 ? 'commit' : crashed ? 'unknown' : 'prepare' }]}
          >
            {raft > 0 && <Raft k={raft} crashed={t >= 38} leader={t >= 39.5 ? 1 : 0} />}
          </NodeCard>
        </At>
        <At x={A.x} y={A.y} k={fx.ramp(t, 0.9)} anchor="center" from={0.85}>
          <NodeCard
            role="SHARD A · stock"
            tone={blocked ? 'coral' : committed ? 'mint' : 'plain'}
            rows={[{ k: 'Coffee stock', v: committed ? 0 : 1, flash: (t >= 21.5 && t < 23) || (t >= 41.5 && t < 43) }]}
            badge={locked ? <span className="lec-node__lock"><Glyph name="lock" size={14} /></span> : committed ? <span className="lec-node__ok"><Glyph name="check" size={14} /></span> : null}
          >
            {raft > 0 && <Raft k={raft} leader={0} />}
          </NodeCard>
        </At>
        <At x={B.x} y={B.y} k={fx.ramp(t, 1.1)} anchor="center" from={0.85}>
          <NodeCard
            role="SHARD B · orders"
            tone={blocked ? 'coral' : committed ? 'mint' : 'plain'}
            rows={[{ k: 'orders', v: committed ? '#1042' : 'none', flash: (t >= 21.5 && t < 23) || (t >= 41.5 && t < 43) }]}
            badge={locked ? <span className="lec-node__lock"><Glyph name="lock" size={14} /></span> : committed ? <span className="lec-node__ok"><Glyph name="check" size={14} /></span> : null}
          >
            {raft > 0 && <Raft k={raft} leader={0} />}
          </NodeCard>
        </At>

        <At x={A.x} y={A.y + 74} k={fx.win(t, 3, 9, 0.8, 0.4)} anchor="x" dy={6}>
          <span className="lec-mono lec-small">Coffee stock −1</span>
        </At>
        <At x={B.x} y={B.y + 74} k={fx.win(t, 4.5, 9, 0.8, 0.4)} anchor="x" dy={6}>
          <span className="lec-mono lec-small">insert order #1042</span>
        </At>
        <At x={480} y={436} k={fx.win(t, 30.6, 39.5, 0.6, 0.4)} anchor="x" dy={6}>
          <span className="lec-pill lec-pill--coral">
            participants blocked, locks held · waiting <span className="lec-mono">{waiting.toFixed(1)} s</span>
          </span>
        </At>
        <At x={480} y={436} k={fx.win(t, 39.6, 46, 0.6, 0.4)} anchor="x" dy={6}>
          <span className="lec-pill lec-pill--mint">consensus: a new coordinator leader resumes the commit</span>
        </At>
      </div>

      {/* Phase strip */}
      <div className="lec-layer" style={{ opacity: dim * fx.win(t, 6, 35, 0.9, 0.6) }}>
        <PhaseStrip t={t} />
      </div>

      {/* Closing: the trade-off words */}
      {closing > 0 && (
        <div className="lec-closing">
          <p className="lec-closing__words">
            {['Consistency', 'Availability', 'Latency', 'Coordination'].map((w, i) => {
              const k = fx.ramp(t, 46.4 + i * 0.5, 1)
              return (
                <span key={w} style={{ opacity: k, transform: fx.m ? `translateY(${(1 - k) * 18}px)` : undefined }} className={i === 3 ? 'lec-saffron' : ''}>
                  {w}
                </span>
              )
            })}
          </p>
          <span className="lec-pill lec-pill--saffron" style={{ opacity: fx.ramp(t, 50.5) }}>
            Your turn: the labs
          </span>
        </div>
      )}
    </>
  )
}

function PhaseStrip({ t }) {
  const p1Active = (t >= 9 && t < 13.5) || (t >= 26.5 && t < 30)
  const p1Done = (t >= 13.5 && t < 26) || t >= 30
  const p2Active = (t >= 18 && t < 21.5) || (t >= 40 && t < 41.5)
  const p2Done = (t >= 21.5 && t < 26) || t >= 41.5
  const p2Blocked = t >= 30.5 && t < 40
  const cls = (active, done, blocked) => `lec-phase ${active ? 'is-active' : ''} ${done ? 'is-done' : ''} ${blocked ? 'is-blocked' : ''}`
  return (
    <div className="lec-phases" style={{ left: 64, top: 488, width: 832 }}>
      <div className={cls(p1Active, p1Done)}>
        <span className="lec-phase__n">1</span>
        <strong>Prepare</strong>
        <span>participants lock rows and vote</span>
      </div>
      <div className={cls(p2Active, p2Done, p2Blocked)}>
        <span className="lec-phase__n">2</span>
        <strong>{p2Blocked ? 'Waiting for a decision' : 'Commit'}</strong>
        <span>{p2Blocked ? 'locks held until the coordinator returns' : 'apply, release locks, acknowledge'}</span>
      </div>
    </div>
  )
}

function Raft({ k, crashed = false, leader = 0 }) {
  return (
    <div className="lec-raft" style={{ opacity: k }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`lec-raft__dot ${crashed && i === 0 ? 'is-down' : ''} ${(!crashed && i === leader) || (crashed && i === leader && leader !== 0) ? 'is-leader' : ''}`}
        />
      ))}
      <span className="lec-raft__label">Raft group</span>
    </div>
  )
}

