import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useDocTitle } from '../components/ui.jsx'
import './app-pages.css'

export default function NotFound() {
  useDocTitle('Not found')
  return (
    <div className="page apppage" style={{ paddingBlock: 'clamp(48px, 10vw, 120px)' }}>
      <div className="kicker">Error 404 · document not found</div>
      <h1 className="apphead__title" style={{ marginTop: 12 }}>
        find(&#123; page: this &#125;) returned no documents.
      </h1>
      <p className="apphead__sub">The address may be mistyped, or the page moved. Your progress is safe.</p>
      <div className="cluster" style={{ marginTop: 28 }}>
        <Link to="/course" className="btn btn--dark">
          <Icon name="home" /> My course
        </Link>
        <Link to="/" className="btn">
          Overview
        </Link>
      </div>
    </div>
  )
}
