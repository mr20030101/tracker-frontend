import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { AppShell } from './components/AppShell'
import { Login } from './pages/Login'
import { ForcePasswordChange } from './pages/ForcePasswordChange'
import { Dashboard } from './pages/Dashboard'
import { ContributorDashboard } from './pages/ContributorDashboard'
import { Leaderboard } from './pages/Leaderboard'
import { TaskLog } from './pages/TaskLog'
import { Resources } from './pages/Resources'
import { Messages } from './pages/Messages'
import { CbProfile } from './pages/CbProfile'
import { Users } from './pages/Users'
import { LeadTeam } from './pages/LeadTeam'
import { Projects } from './pages/Projects'
import { DataQuality } from './pages/DataQuality'
import { ActivityLog } from './pages/ActivityLog'
import { Apply } from './pages/Apply'
import { Hiring } from './pages/Hiring'
import { Requests } from './pages/Requests'

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
      <Routes>
        <Route path="/" element={isManager ? <Dashboard /> : <ContributorDashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/task-log" element={<TaskLog />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:userId" element={<Messages />} />
        <Route path="/contributors/:email" element={<CbProfile />} />
        {isManager && <Route path="/users" element={<Users />} />}
        {isManager && <Route path="/projects" element={<Projects />} />}
        {isManager && <Route path="/hiring" element={<Hiring />} />}
        {isManager && <Route path="/data-quality" element={<DataQuality />} />}
        {isAdmin && <Route path="/activity-log" element={<ActivityLog />} />}
        {isAdmin && <Route path="/leads/:leadId" element={<LeadTeam />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public: applicants aren't signed in. */}
      <Route path="/apply/:leadId" element={<Apply />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  )
}
