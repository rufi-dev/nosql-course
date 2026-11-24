import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import SiteLayout from './components/Layout.jsx'
import ModuleLayout from './components/ModuleLayout.jsx'

const Landing = lazy(() => import('./pages/Landing.jsx'))
const CourseHome = lazy(() => import('./pages/CourseHome.jsx'))
const ModuleOverview = lazy(() => import('./pages/ModuleOverview.jsx'))
const ModulePreview = lazy(() => import('./pages/ModulePreview.jsx'))
const Start = lazy(() => import('./pages/Start.jsx'))
const Lecture = lazy(() => import('./pages/Lecture.jsx'))
const Reading = lazy(() => import('./pages/Reading.jsx'))
const Explore = lazy(() => import('./pages/Explore.jsx'))
const ShellLab = lazy(() => import('./pages/labs/ShellLab.jsx'))
const ShardLab = lazy(() => import('./pages/labs/ShardLab.jsx'))
const ReplicaLab = lazy(() => import('./pages/labs/ReplicaLab.jsx'))
const QuorumLab = lazy(() => import('./pages/labs/QuorumLab.jsx'))
const TxLab = lazy(() => import('./pages/labs/TxLab.jsx'))
const Quiz = lazy(() => import('./pages/Quiz.jsx'))
const Assignment = lazy(() => import('./pages/Assignment.jsx'))
const Workshop = lazy(() => import('./pages/Workshop.jsx'))
const Discussion = lazy(() => import('./pages/Discussion.jsx'))
const WrapUp = lazy(() => import('./pages/WrapUp.jsx'))
const Grades = lazy(() => import('./pages/Grades.jsx'))
const Badges = lazy(() => import('./pages/Badges.jsx'))
const Certificate = lazy(() => import('./pages/Certificate.jsx'))
const LessonPlan = lazy(() => import('./pages/LessonPlan.jsx'))
const Playground = lazy(() => import('./pages/Playground.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

function Loading() {
  return (
    <div className="page route-loading" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 14, width: 140 }} />
      <div className="skeleton" style={{ height: 44, width: 'min(560px, 90%)' }} />
      <div className="skeleton" style={{ height: 18, width: 'min(420px, 70%)' }} />
      <div className="skeleton" style={{ height: 280, marginTop: 16 }} />
    </div>
  )
}

// Top-level pages get a short entrance; module pages animate inside ModuleLayout.
function Page({ children }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="route-enter">
      {children}
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Landing />} />
          <Route path="course" element={<Page><CourseHome /></Page>} />
          <Route path="module/1" element={<ModuleLayout />}>
            <Route index element={<ModuleOverview />} />
            <Route path="start" element={<Start />} />
            <Route path="lecture/:lectureId" element={<Lecture />} />
            <Route path="reading" element={<Reading />} />
            <Route path="reading/:chapterId" element={<Reading />} />
            <Route path="explore" element={<Explore />} />
            <Route path="lab/shell" element={<ShellLab />} />
            <Route path="lab/shard" element={<ShardLab />} />
            <Route path="lab/replicas" element={<ReplicaLab />} />
            <Route path="lab/quorum" element={<QuorumLab />} />
            <Route path="lab/transactions" element={<TxLab />} />
            <Route path="quiz" element={<Quiz />} />
            <Route path="assignment" element={<Assignment />} />
            <Route path="workshop" element={<Workshop />} />
            <Route path="discussion" element={<Discussion />} />
            <Route path="wrap-up" element={<WrapUp />} />
          </Route>
          <Route path="module/:n" element={<Page><ModulePreview /></Page>} />
          <Route path="grades" element={<Page><Grades /></Page>} />
          <Route path="badges" element={<Page><Badges /></Page>} />
          <Route path="certificate" element={<Page><Certificate /></Page>} />
          <Route path="lesson-plan" element={<Page><LessonPlan /></Page>} />
          <Route path="playground" element={<Page><Playground /></Page>} />
          <Route path="settings" element={<Page><Settings /></Page>} />
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
