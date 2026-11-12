import { lazy, Suspense, type ComponentType } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { AppShell } from './components/AppShell'
import { RemotasksIdGate } from './components/RemotasksIdGate'
import { isValidRemotasksId } from './lib/remotasks'

// Each page is its own download, fetched the first time it's opened.
function page<K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const NotFound = page(() => import('./pages/NotFound'), 'NotFound')
const Login = page(() => import('./pages/Login'), 'Login')
const Privacy = page(() => import('./pages/Privacy'), 'Privacy')
const Terms = page(() => import('./pages/Terms'), 'Terms')
const ForcePasswordChange = page(() => import('./pages/ForcePasswordChange'), 'ForcePasswordChange')
const Dashboard = page(() => import('./pages/Dashboard'), 'Dashboard')
const ContributorDashboard = page(() => import('./pages/ContributorDashboard'), 'ContributorDashboard')
const Leaderboard = page(() => import('./pages/Leaderboard'), 'Leaderboard')
const Rewards = page(() => import('./pages/Rewards'), 'Rewards')
const TaskLog = page(() => import('./pages/TaskLog'), 'TaskLog')
const Resources = page(() => import('./pages/Resources'), 'Resources')
const Messages = page(() => import('./pages/Messages'), 'Messages')
const CbProfile = page(() => import('./pages/CbProfile'), 'CbProfile')
const Users = page(() => import('./pages/Users'), 'Users')
const LeadTeam = page(() => import('./pages/LeadTeam'), 'LeadTeam')
const Projects = page(() => import('./pages/Projects'), 'Projects')
const DataQuality = page(() => import('./pages/DataQuality'), 'DataQuality')
const Audits = page(() => import('./pages/Audits'), 'Audits')
const TeamReports = page(() => import('./pages/TeamReports'), 'TeamReports')
const ActivityLog = page(() => import('./pages/ActivityLog'), 'ActivityLog')
const Billing = page(() => import('./pages/Billing'), 'Billing')
const MyBilling = page(() => import('./pages/MyBilling'), 'MyBilling')
const Apply = page(() => import('./pages/Apply'), 'Apply')
const Hiring = page(() => import('./pages/Hiring'), 'Hiring')
const Requests = page(() => import('./pages/Requests'), 'Requests')
const Feedback = page(() => import('./pages/Feedback'), 'Feedback')
const Support = page(() => import('./pages/Support'), 'Support')
const Attendance = page(() => import('./pages/Attendance'), 'Attendance')
const Announcements = page(() => import('./pages/Announcements'), 'Announcements')
const Settings = page(() => import('./pages/Settings'), 'Settings')

const pageFallback = <div className="flex h-64 items-center justify-center text-gray-400">Loading...</div>

const MANAGER_ROLES = ['admin', 'lead']

function ProtectedLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-400">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.must_change_password) {
    return <ForcePasswordChange />
  }

  const isManager = MANAGER_ROLES.includes(user.role)
  const isAdmin = user.role === 'admin'

  return (
    <AppShell>
      <Suspense fallback={pageFallback}>
      <Routes>
        <Route path="/" element={isManager ? <Dashboard /> : <ContributorDashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/task-log" element={<TaskLog />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/support" element={<Support />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/group/:groupId" element={<Messages />} />
        <Route path="/messages/:userId" element={<Messages />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/contributors/:email" element={<CbProfile />} />
        {isManager && <Route path="/users" element={<Users />} />}
        {isManager && <Route path="/leads" element={<Users view="leads" />} />}
        {isManager && <Route path="/projects" element={<Projects />} />}
        {isManager && <Route path="/hiring" element={<Hiring />} />}
        {isManager && <Route path="/data-quality" element={<DataQuality />} />}
        {isManager && <Route path="/audits" element={<Audits />} />}
        {isManager && <Route path="/team-reports" element={<TeamReports />} />}
        {isAdmin && <Route path="/activity-log" element={<ActivityLog />} />}
        {isManager && <Route path="/billing" element={isAdmin ? <Billing /> : <MyBilling />} />}
        {isAdmin && <Route path="/leads/:leadId" element={<LeadTeam />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      {/* Everyone needs a valid Remotask ID on file; this blocks the app until they've saved one. */}
      {!isValidRemotasksId(user.remotasks_id) && <RemotasksIdGate />}
    </AppShell>
  )
}

export default function App() {
  const { recovering } = useAuth()

  // The reset-email session is a real login, so without this the dashboard would open and the
  // person would never be asked for a new password.
  if (recovering) return <Suspense fallback={null}><Login /></Suspense>

  return (
    <Suspense fallback={null}>
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public: Google's sign-in consent screen links here. */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      {/* Public: applicants aren't signed in. */}
      <Route path="/apply/:leadId" element={<Apply />} />
      {/* Public: donors don't need an account. */}
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
    </Suspense>
  )
}
