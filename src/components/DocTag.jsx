import { forwardRef } from 'react'
import './DocTag.css'

// A document rendered as an inventory tag: punched hole, _id on the stub,
// fields below a perforation. state: 'new' | 'match' | 'updated' | 'dim' | 'stale' | undefined
// changed: array of field names to flash (e.g. ['stock'])

function fmt(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return `"${v}"`
  if (v instanceof Date) return `ISODate("${v.toISOString()}")`
  if (Array.isArray(v)) return `[${v.map(fmt).join(', ')}]`
  if (typeof v === 'object') {
    if (v.$oid) return `ObjectId("${v.$oid}")`
    return `{ ${Object.entries(v)
      .map(([k, x]) => `${k}: ${fmt(x)}`)
      .join(', ')} }`
  }
  return String(v)
}

const DocTag = forwardRef(function DocTag(
  { doc, state, changed = [], compact = false, hideId = false, accent, className = '', style, ...rest },
  ref,
) {
  const { _id, ...fields } = doc
  const idText = typeof _id === 'object' && _id?.$oid ? _id.$oid.slice(-6) : String(_id)
  return (
    <article
      ref={ref}
      className={`doctag ${compact ? 'doctag--compact' : ''} ${state ? `doctag--${state}` : ''} ${className}`}
      style={{ ...(accent ? { '--tag-accent': accent } : null), ...style }}
      {...rest}
    >
      {!hideId && (
        <header className="doctag__stub">
          <span className="doctag__hole" aria-hidden="true" />
          <span className="doctag__idlabel">_id</span>
          <span className="doctag__id">{idText}</span>
        </header>
      )}
      <dl className="doctag__fields">
        {Object.entries(fields).map(([k, v]) => (
          <div key={k} className={`doctag__row ${changed.includes(k) ? 'is-changed' : ''}`}>
            <dt>{k}</dt>
            <dd>
              {Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length <= 4 ? (
                <span className="doctag__chips">
                  {v.map((x) => (
                    <span key={x} className="doctag__chip">
                      {x}
                    </span>
                  ))}
                </span>
              ) : (
                <span className={`doctag__val doctag__val--${typeof v}`}>{fmt(v)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
})

export default DocTag
export { fmt as formatValue }
