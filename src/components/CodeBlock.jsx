import { useState } from 'react'
import { tokenize } from '../lib/highlight.js'
import Icon from './Icon.jsx'
import './CodeBlock.css'

export function Highlight({ code, lang = 'js' }) {
  return tokenize(code, lang).map((tok, i) =>
    tok.t ? (
      <span key={i} className={`tk-${tok.t}`}>
        {tok.v}
      </span>
    ) : (
      tok.v
    ),
  )
}

// Dark code block with optional title bar and copy button.
export default function CodeBlock({ code, lang = 'js', title, copy = true, actions, className = '' }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <figure className={`codeblock ${className}`}>
      {(title || copy || actions) && (
        <figcaption className="codeblock__bar">
          <span className="codeblock__title">{title || lang.toUpperCase()}</span>
          <span className="codeblock__actions">
            {actions}
            {copy && (
              <button type="button" className="codeblock__btn" onClick={onCopy} aria-label="Copy code">
                <Icon name={copied ? 'check' : 'copy'} />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </span>
        </figcaption>
      )}
      <pre className="code">
        <code>
          <Highlight code={code} lang={lang} />
        </code>
      </pre>
    </figure>
  )
}
