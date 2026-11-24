import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import SiteLayout from './components/Layout.jsx'
import ModuleLayout from './components/ModuleLayout.jsx'
import { RequireAuth, RequireLearner, RequireTeacher, RequireAdmin, GuestOnly, PageLoading } from './components/Guards.jsx'

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
const Login = lazy(() => import('./pages/auth/Login.jsx'))
const Signup = lazy(() => import('./pages/auth/Signup.jsx'))
const Join = lazy(() => import('./pages/auth/Join.jsx'))
const TeacherHome = lazy(() => import('./pages/teacher/TeacherHome.jsx'))
const TeacherClass = lazy(() => import('./pages/teacher/TeacherClass.jsx'))
const TeacherStudent = lazy(() => import('./pages/teacher/TeacherStudent.jsx'))
const TeacherSubmission = lazy(() => import('./pages/teacher/TeacherSubmission.jsx'))
const AdminUsers = lazy(() => import('./pages/teacher/AdminUsers.jsx'))

// Top-level pages get a short entrance; module pages animate inside ModuleLayout.
function Page({ children }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="route-enter">
      {children}
    </div>
  )
}

const learner = (el) => (
  <RequireLearner>
    <Page>{el}</Page>
  </RequireLearner>
)
const teacher = (el) => (
  <RequireTeacher>
    <Page>{el}</Page>
  </RequireTeacher>
)

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Landing />} />

          {/* Accounts */}
          <Route path="login" element={<GuestOnly><Page><Login /></Page></GuestOnly>} />
          <Route path="signup" element={<GuestOnly><Page><Signup /></Page></GuestOnly>} />
          <Route path="join" element={<RequireAuth><Page><Join /></Page></RequireAuth>} />

          {/* Learner */}
          <Route path="course" element={learner(<CourseHome />)} />
          <Route
            path="module/1"
            element={
              <RequireLearner>
                <ModuleLayout />
              </RequireLearner>
            }
          >
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
          <Route path="grades" element={learner(<Grades />)} />
          <Route path="badges" element={learner(<Badges />)} />
          <Route path="certificate" element={learner(<Certificate />)} />
          <Route path="settings" element={<RequireAuth><Page><Settings /></Page></RequireAuth>} />

          {/* Teacher */}
          <Route path="teacher" element={teacher(<TeacherHome />)} />
          <Route path="teacher/classes/:classId" element={teacher(<TeacherClass />)} />
          <Route path="teacher/classes/:classId/students/:userId" element={teacher(<TeacherStudent />)} />
          <Route path="teacher/submissions/:submissionId" element={teacher(<TeacherSubmission />)} />
          <Route
            path="admin/users"
            element={
              <RequireAdmin>
                <Page>
                  <AdminUsers />
                </Page>
              </RequireAdmin>
            }
          />

          {/* Public */}
          <Route path="lesson-plan" element={<Page><LessonPlan /></Page>} />
          <Route path="playground" element={<Page><Playground /></Page>} />
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
