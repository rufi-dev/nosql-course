// Lecture 1.1 · The design problem. Four scenes, each driven by local time t.
import { useFx, At, Words, Draw, ArrowDefs, Packet, Code, Pill, lerp } from './kit.jsx'
import DocTag from '../../components/DocTag.jsx'

const PRODUCTS = [
  { id: 'p1', name: 'Tea', stock: 3, tags: ['drink'] },
  { id: 'p2', name: 'Rice', stock: 12, tags: ['food'] },
  { id: 'p3', name: 'Coffee', stock: 2, tags: ['drink'] },
]

/* ------------------------------------------------------------------ */
/* Scene 1: the corner shop                                             */
/* ------------------------------------------------------------------ */
export function ShopScene({ t }) {
  const fx = useFx()
  const BASE = 470
  const UNIT = 20
  const xs = [170, 310, 450]
  const low = fx.ramp(t, 29, 1)
  const askOut = 1 - fx.ramp(t, 21.3, 0.5)
  const thresholdY = BASE - 5 * UNIT

  return (
    <>
      <At x={64} y={44} k={fx.ramp(t, 0.1)}>
        <span className="lec-kicker">The running case</span>
      </At>
      <At x={64} y={68} k={fx.ramp(t, 0.3, 1.3)} dy={22} blur>
        <h3 className="lec-h1">A corner shop</h3>
      </At>

      <svg className="lec-svg" viewBox="0 0 960 540" aria-hidden="true">
        <Draw d={`M90 ${BASE + 2} H 530`} k={fx.ramp(t, 0.6, 1.6)} color="var(--rack-ink-3)" width={2.5} />
        {low > 0 && (
          <>
            <Draw d={`M90 ${thresholdY} H 530`} k={low} color="var(--coral)" width={1.6} dashed opacity={0.9} />
          </>
        )}
      </svg>

      {low > 0 && (
        <At x={536} y={thresholdY - 11} k={low} dx={-10} dy={0}>
          <span className="lec-mono lec-coral">stock &lt; 5</span>
        </At>
      )}

      {PRODUCTS.map((p, pi) => {
        const isLow = p.stock < 5
        const count = Math.round(p.stock * fx.ramp(t, 6.5 + pi * 0.35, 1.8))
        return (
          <div key={p.id}>
            {Array.from({ length: p.stock }).map((_, i) => {
              const k = fx.ramp(t, 1 + pi * 0.4 + i * 0.07, 0.8)
              return (
                <At
                  key={i}
                  x={xs[pi] - 42}
                  y={BASE - (i + 1) * UNIT}
                  k={k}
                  dy={-46}
                  className={`lec-box ${low && isLow ? 'is-low' : ''} ${low && !isLow ? 'is-dim' : ''}`}
                />
              )
            })}
            <At x={xs[pi]} y={BASE - p.stock * UNIT - 46} k={fx.ramp(t, 6.5 + pi * 0.35)} anchor="x">
              <span className={`lec-count ${low && isLow ? 'lec-coral' : ''}`}>{count}</span>
            </At>
            <At x={xs[pi]} y={BASE + 12} k={fx.ramp(t, 1.4 + pi * 0.3)} anchor="x" className="lec-shelflabel">
              <strong>{p.name}</strong>
              <span className="lec-mono">{p.id}</span>
            </At>
          </div>
        )
      })}

      {/* Right column: ask, then answer */}
      {t < 22.5 && (
        <At x={566} y={150} w={340} k={Math.min(fx.ramp(t, 13), askOut)} dy={0}>
          <span className="lec-kicker lec-kicker--saffron">Ask</span>
          <p className="lec-h2">
            <Words text="Which query or operation matters most to the user?" t={t} start={13.3} per={0.12} />
          </p>
        </At>
      )}
      {t >= 21.5 && (
        <At x={566} y={150} w={340} k={fx.ramp(t, 21.5)} dy={0}>
          <span className="lec-kicker">The answer</span>
          <p className="lec-h2 lec-saffron">
            <Words text="Which products are about to run out?" t={t} start={21.7} per={0.1} />
          </p>
        </At>
      )}
      <At x={566} y={300} k={fx.ramp(t, 31)} dy={10}>
        <Code className="lec-code--sm">{'db.products.find({ stock: { $lt: 5 } })'}</Code>
      </At>
      <At x={566} y={370} k={fx.ramp(t, 37.5)} dy={8}>
        <span className="lec-small">It will shape</span>
      </At>
      {['the data model', 'the index', 'the distribution'].map((label, i) => (
        <At key={label} x={566 + [0, 150, 254][i]} y={398} k={fx.ramp(t, 38.5 + i * 1.4)} dy={10} from={0.9}>
          <Pill tone={i === 2 ? 'mint' : 'saffron'}>{label}</Pill>
        </At>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 2: the same products, four models                              */
/* ------------------------------------------------------------------ */
const ROWS3 = (a, b, c) => [a, b, c]
// Atom anchors per layout: [x, y] for id, name, stock, tags, per product.
const LAYOUTS = {
  table: PRODUCTS.map((_, i) => {
    const y = ROWS3(212, 262, 312)[i]
    return { id: [185, y], name: [300, y], stock: [470, y], tags: [610, y] }
  }),
  kv: PRODUCTS.map((_, i) => {
    const y = ROWS3(196, 276, 356)[i]
    return { id: [258, y], name: [420, y], stock: [548, y], tags: [640, y] }
  }),
  doc: PRODUCTS.map((_, i) => {
    const x = ROWS3(105, 360, 615)[i]
    return { id: [x + 66, 180], name: [x + 96, 236], stock: [x + 96, 272], tags: [x + 96, 308] }
  }),
  cf: PRODUCTS.map((_, i) => {
    const y = ROWS3(206, 290, 374)[i]
    return { id: [140, y], name: [282, y], stock: [654, y], tags: [430, y] }
  }),
}
const ORDER = ['table', 'kv', 'doc', 'cf']
const BOUNDS = [0, 16.5, 34, 51.5, 70]
const MODEL_INFO = {
  table: {
    name: 'Relational',
    desc: 'Fixed columns, one row per product.',
    verdict: 'Index the stock column, filter directly',
    ok: 'yes',
  },
  kv: { name: 'Key-value', desc: 'The store only knows the key.', verdict: 'Must read and decode every value', ok: 'no' },
  doc: {
    name: 'Document',
    desc: 'Self-describing fields, arrays allowed.',
    verdict: 'Query and index stock directly',
    ok: 'yes',
  },
  cf: {
    name: 'Column-family',
    desc: 'Columns grouped in families, read by row key.',
    verdict: 'Cheap per row key; design a table per query',
    ok: 'partly',
  },
}

export function ModelsScene({ t }) {
  const fx = useFx()
  let seg = 0
  for (let i = 1; i < ORDER.length; i++) if (t >= BOUNDS[i] - 0.2) seg = i
  const from = ORDER[Math.max(0, seg - 1)]
  const to = ORDER[seg]
  const mk = seg === 0 ? 1 : fx.ramp(t, BOUNDS[seg] - 0.2, 1.4)
  const vis = (i) => fx.win(t, BOUNDS[i] - (i === 0 ? 0 : 0.3), BOUNDS[i + 1] - 0.4, 0.9, 0.4)
  const segStart = BOUNDS[seg]
  const local = t - segStart
  const hl = local > 8 || (seg === 0 && t > 8)
  const muted = (layout) => (layout === 'kv' ? 1 : 0)
  const mute = lerp(muted(from), muted(to), mk)

  // tab underline
  const tabX = [150, 330, 510, 690]
  const ux = lerp(tabX[ORDER.indexOf(from)], tabX[seg], mk)

  return (
    <>
      <At x={64} y={36} k={fx.ramp(t, 0.1)}>
        <span className="lec-kicker">Model and representation</span>
      </At>
      <div className="lec-tabs" style={{ left: 150, top: 70 }}>
        {ORDER.map((m, i) => (
          <span key={m} className={`lec-tab ${i === seg ? 'is-on' : ''}`} style={{ left: tabX[i] - 150 }}>
            {MODEL_INFO[m].name}
          </span>
        ))}
        <span className="lec-tab__bar" style={{ transform: `translateX(${ux - 150}px)` }} />
      </div>

      {/* Containers */}
      <div className="lec-layer" style={{ opacity: vis(0) }}>
        <div className="lec-table" style={{ left: 150, top: 160 }}>
          <div className="lec-table__name">products</div>
          <div className="lec-table__head">
            <span style={{ left: 35 }}>_id</span>
            <span style={{ left: 150 }}>name</span>
            <span style={{ left: 320 }}>stock</span>
            <span style={{ left: 460 }}>tags</span>
          </div>
          {[0, 1, 2].map((r) => (
            <div key={r} className="lec-table__row" style={{ top: 27 + r * 50 }} />
          ))}
          <div
            className={`lec-table__col ${hl && seg === 0 ? 'is-on' : ''}`}
            style={{ left: 306, opacity: seg === 0 ? fx.ramp(t, 8) : 0 }}
          />
        </div>
      </div>

      <div className="lec-layer" style={{ opacity: vis(1) }}>
        {[196, 276, 356].map((y, i) => (
          <div key={y}>
            <div className="lec-kvkey" style={{ left: 150, top: y - 24 }}>
              <span className="lec-mono lec-faint">product:</span>
            </div>
            <div className="lec-kvarrow" style={{ left: 340, top: y - 1 }} />
            <div className={`lec-kvblob ${hl && seg === 1 ? 'is-hidden' : ''}`} style={{ left: 394, top: y - 26 }}>
              {i === 0 && <span className="lec-kvblob__label">opaque value</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="lec-layer" style={{ opacity: vis(2) }}>
        {[105, 360, 615].map((x) => (
          <div key={x} className="lec-doc" style={{ left: x, top: 150 }}>
            <span className="lec-doc__hole" />
            <span className="lec-doc__idk">_id</span>
            <div className="lec-doc__perf" />
            <span className="lec-doc__k" style={{ top: 74 }}>
              name
            </span>
            <span className={`lec-doc__k ${hl && seg === 2 ? 'lec-saffron' : ''}`} style={{ top: 110 }}>
              stock
            </span>
            <span className="lec-doc__k" style={{ top: 146 }}>
              tags
            </span>
          </div>
        ))}
      </div>

      <div className="lec-layer" style={{ opacity: vis(3) }}>
        <span className="lec-cfhead" style={{ left: 110, top: 148 }}>
          row key
        </span>
        <span className="lec-cfhead" style={{ left: 250, top: 148 }}>
          family: info
        </span>
        <span className={`lec-cfhead ${hl && seg === 3 ? 'lec-saffron' : ''}`} style={{ left: 610, top: 148 }}>
          family: inventory
        </span>
        {[206, 290, 374].map((y) => (
          <div key={y}>
            <div className="lec-cfkey" style={{ left: 110, top: y - 28 }} />
            <div className="lec-cffam" style={{ left: 250, top: y - 34, width: 330 }}>
              <span style={{ left: 32 }}>name</span>
              <span style={{ left: 180 }}>tags</span>
            </div>
            <div className={`lec-cffam ${hl && seg === 3 ? 'is-on' : ''}`} style={{ left: 610, top: y - 34, width: 190 }}>
              <span style={{ left: 44 }}>stock</span>
            </div>
          </div>
        ))}
      </div>

      {/* Morphing atoms: the same values travel between layouts */}
      {PRODUCTS.map((p, pi) =>
        ['id', 'name', 'stock', 'tags'].map((field) => {
          const a = LAYOUTS[from][pi][field]
          const b = LAYOUTS[to][pi][field]
          const x = lerp(a[0], b[0], mk)
          const y = lerp(a[1], b[1], mk)
          const text = field === 'tags' ? `["${p.tags[0]}"]` : field === 'stock' ? String(p.stock) : p[field]
          const isStock = field === 'stock'
          const isId = field === 'id'
          const fieldMute = isId ? 0 : mute
          const stockHl = isStock && hl
          const cls = [
            'lec-atom',
            isId ? 'lec-atom--id' : '',
            isStock ? 'lec-atom--num' : '',
            stockHl && seg !== 1 ? 'is-hl' : '',
            stockHl && seg === 1 ? 'is-lost' : '',
            isId && seg === 2 && mk > 0.6 ? 'lec-atom--big' : '',
          ].join(' ')
          return (
            <span
              key={`${p.id}-${field}`}
              className={cls}
              style={{
                transform: `translate(${x}px, ${y}px) translateY(-50%)`,
                opacity: (1 - fieldMute * 0.5) * fx.ramp(t, 0.6 + pi * 0.15),
                filter: fieldMute > 0.5 ? 'blur(0.6px)' : undefined,
              }}
            >
              {text}
            </span>
          )
        }),
      )}

      {/* Verdict strip */}
      {ORDER.map((m, i) => {
        const info = MODEL_INFO[m]
        const k = fx.win(t, BOUNDS[i] + 1.2, BOUNDS[i + 1] - 0.4, 0.9, 0.35)
        const kv = fx.win(t, BOUNDS[i] + 8, BOUNDS[i + 1] - 0.4, 0.9, 0.35)
        if (k <= 0) return null
        return (
          <div key={m}>
            <At x={64} y={448} k={k} dy={10}>
              <div className="lec-verdict">
                <strong>{info.name}</strong>
                <span>{info.desc}</span>
              </div>
            </At>
            <At x={896} y={452} k={kv} dy={10} anchor="right">
              <span className={`lec-verdict__chip is-${info.ok}`}>
                <span className="lec-mono">stock &lt; 5</span>
                {info.verdict}
              </span>
            </At>
          </div>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 3: model for the workload                                      */
/* ------------------------------------------------------------------ */
const WORKLOAD = [
  { label: 'Show low stock', freq: 'Every page view · about 10,000 a day', w: 1, tone: 'saffron' },
  { label: 'Record a sale', freq: 'About 2,000 a day', w: 0.62, tone: 'mint' },
  { label: 'Monthly report', freq: 'Once a month', w: 0.05, tone: 'sky' },
]

export function WorkloadScene({ t }) {
  const fx = useFx()
  const statement = fx.ramp(t, 18, 1.2)
  return (
    <>
      <At x={64} y={44} k={fx.ramp(t, 0.1)}>
        <span className="lec-kicker">Workload-driven model</span>
      </At>
      <At x={64} y={68} k={fx.ramp(t, 0.4, 1.2)} dy={20} blur>
        <h3 className="lec-h1 lec-h1--md">Which model is right?</h3>
      </At>

      {WORKLOAD.map((w, i) => {
        const k = fx.ramp(t, 8 + i * 1.6, 1.2)
        const bar = fx.ramp(t, 8.5 + i * 1.6, 2.2)
        return (
          <At key={w.label} x={64} y={170 + i * 66} k={k} dy={12} w={500}>
            <div className="lec-load">
              <div className="lec-load__top">
                <strong>{w.label}</strong>
                <span>{w.freq}</span>
              </div>
              <div className="lec-load__track">
                <div className={`lec-load__bar lec-load__bar--${w.tone}`} style={{ transform: `scaleX(${w.w * bar})` }} />
              </div>
            </div>
          </At>
        )
      })}

      <At x={64} y={392} w={820} k={statement} dy={18}>
        <p className="lec-statement">
          <Words text="Model the data for the questions you ask," t={t} start={18.1} per={0.09} />
          <span className="lec-faint">
            <Words text="not for the data you happen to have." t={t} start={19.2} per={0.09} />
          </span>
        </p>
      </At>

      <At x={640} y={150} k={fx.ramp(t, 27, 1.2)} dx={24} dy={0} w={250}>
        <DocTag doc={{ _id: 'p1', name: 'Tea', stock: 3, tags: ['drink'] }} changed={t > 29 && t < 31 ? ['stock'] : []} />
      </At>
      <At x={640} y={318} k={fx.ramp(t, 29.5)} dy={10}>
        <Code>{'createIndex({ stock: 1 })'}</Code>
      </At>
      <svg className="lec-svg" viewBox="0 0 960 540" aria-hidden="true">
        <ArrowDefs id="wl-arrow" color="var(--saffron)" />
        <Draw d="M 572 192 C 600 192, 600 220, 632 220" k={fx.ramp(t, 31, 1.2)} color="var(--saffron)" width={2} arrow="wl-arrow" />
      </svg>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 4: client operation -> logical model -> physical layout -> result */
/* ------------------------------------------------------------------ */
const STATIONS = [
  { x: 130, label: 'Client operation' },
  { x: 360, label: 'Logical model' },
  { x: 600, label: 'Physical layout + index' },
  { x: 840, label: 'Result' },
]

export function PathScene({ t }) {
  const fx = useFx()
  const Y = 128
  // packet hops
  const hops = [
    [8, 0, 1],
    [16, 1, 2],
    [34, 2, 3],
  ]
  let px = STATIONS[0].x
  let moving = false
  for (const [start, a, b] of hops) {
    if (t >= start) {
      const k = fx.travel(t, start, 1.6)
      px = lerp(STATIONS[a].x, STATIONS[b].x, k)
      moving = k > 0 && k < 1
    }
  }
  const stationOn = (i) => (i === 0 ? t >= 0.8 : t >= hops[i - 1][0] + 1.4)
  const recap = (i) => t >= 44 + i * 1.2 && t < 54

  // B-tree walk
  const tree = fx.ramp(t, 17, 1.2)
  const rootHl = t >= 19
  const leafHl = t >= 21
  const e2 = t >= 26
  const e3 = t >= 28
  const stop = t >= 30

  return (
    <>
      <At x={64} y={36} k={fx.ramp(t, 0.1)}>
        <span className="lec-kicker">Identity and structure · the architecture path</span>
      </At>

      <svg className="lec-svg" viewBox="0 0 960 540" aria-hidden="true">
        <ArrowDefs id="path-arrow" color="var(--rack-ink-3)" />
        {STATIONS.slice(0, -1).map((s, i) => (
          <Draw
            key={s.x}
            d={`M ${s.x + 26} ${Y} H ${STATIONS[i + 1].x - 30}`}
            k={fx.ramp(t, 0.6 + i * 0.4, 1.2)}
            arrow="path-arrow"
            width={2}
          />
        ))}
        {/* tree edges */}
        {tree > 0 && (
          <g style={{ opacity: tree }}>
            <path d="M 600 262 L 512 330" className={`lec-edge ${leafHl ? 'is-on' : ''}`} />
            <path d="M 600 262 L 690 330" className="lec-edge" />
            <path d="M 600 168 V 232" className="lec-edge lec-edge--dash" />
          </g>
        )}
        <Packet points={[[px, Y]]} k={0.5} visible={t > 0.8 && t < 37.5} r={moving ? 9 : 8} />
      </svg>

      {STATIONS.map((s, i) => (
        <At key={s.label} x={s.x} y={Y} k={fx.ramp(t, 0.3 + i * 0.35)} anchor="center" from={0.6}>
          <div className={`lec-station ${stationOn(i) ? 'is-on' : ''} ${recap(i) ? 'is-recap' : ''}`}>
            <span className="lec-station__dot" />
          </div>
        </At>
      ))}
      {STATIONS.map((s, i) => (
        <At key={`l-${s.label}`} x={s.x} y={Y + 30} k={fx.ramp(t, 0.5 + i * 0.35)} anchor="x" w={170}>
          <span className={`lec-station__label ${recap(i) ? 'lec-saffron' : ''}`}>{s.label}</span>
        </At>
      ))}

      {/* Station details */}
      <At x={56} y={206} k={fx.win(t, 1.5, 17, 0.9, 0.6)} dy={10}>
        <Code>{'db.products.find({ stock: { $lt: 5 } })'}</Code>
      </At>
      <At x={300} y={262} k={fx.win(t, 9.4, 17, 0.9, 0.6)} dy={10}>
        <div className="lec-spec">
          <div>
            <span>collection</span>
            <strong>products</strong>
          </div>
          <div>
            <span>filter</span>
            <strong className="lec-saffron">stock &lt; 5</strong>
          </div>
          <div>
            <span>plan</span>
            <strong>IXSCAN stock_1</strong>
          </div>
        </div>
      </At>

      {/* B-tree */}
      <At x={600} y={262} k={tree} anchor="center" from={0.85}>
        <div className={`lec-bnode ${rootHl ? 'is-on' : ''}`}>
          <span>5</span>
        </div>
      </At>
      <At x={512} y={350} k={fx.ramp(t, 17.6, 1)} anchor="center">
        <div className={`lec-bleaf ${leafHl ? 'is-on' : ''}`}>
          <span className={e2 ? 'is-hit' : ''}>
            2<small>p3</small>
          </span>
          <span className={e3 ? 'is-hit' : ''}>
            3<small>p1</small>
          </span>
        </div>
      </At>
      <At x={690} y={350} k={fx.ramp(t, 17.9, 1)} anchor="center">
        <div className={`lec-bleaf ${stop ? 'is-skip' : ''}`}>
          <span>
            12<small>p2</small>
          </span>
        </div>
      </At>
      <At x={600} y={404} k={fx.ramp(t, 17.2)} anchor="x" w={260}>
        <span className="lec-small lec-center">B-tree index on {'{ stock: 1 }'}</span>
      </At>
      <At x={690} y={386} k={fx.ramp(t, 31)} anchor="x" dy={6} w={180}>
        <span className="lec-small lec-coral lec-center">never read</span>
      </At>
      <At x={600} y={440} k={fx.ramp(t, 30.5)} anchor="x" dy={8}>
        <span className="lec-pillrow">
          <Pill tone="mint">keys examined: 2</Pill>
          <Pill tone="mint">docs examined: 2</Pill>
        </span>
      </At>

      {/* Result */}
      <At x={772} y={206} k={fx.ramp(t, 37, 1.1)} dy={16} w={150}>
        <DocTag compact doc={{ _id: 'p3', name: 'Coffee', stock: 2 }} state="match" />
      </At>
      <At x={772} y={318} k={fx.ramp(t, 37.5, 1.1)} dy={16} w={150}>
        <DocTag compact doc={{ _id: 'p1', name: 'Tea', stock: 3 }} state="match" />
      </At>

      <At x={64} y={478} k={fx.ramp(t, 46.5)} dy={8}>
        <span className="lec-small">Next lecture: the same request has to cross a network of machines.</span>
      </At>
    </>
  )
}
