import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { hubFor, logHubs } from '../lib/logHubs'
import { SegmentedTabs } from './TableToolbar'

const MANAGER_ROLES = ['admin', 'lead']

/**
 * The tabs of the Logs group (Tasks, Reports) the current page belongs to, drawn by the app
 * shell above the page so they stay mounted, and the highlight slides, while you switch tabs.
 */
export function LogTabs() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const hub = hubFor(logHubs(isManager, user?.role === 'admin'), pathname)

  if (!hub || hub.tabs.length < 2) return null
  return (
    <div className="mb-5 max-w-full overflow-x-auto scrollbar-none">
      <SegmentedTabs
        aria-label={hub.label}
        value={pathname}
        onChange={(to) => navigate(to)}
        options={hub.tabs.map((tab) => ({ value: tab.to, label: tab.label }))}
      />
    </div>
  )
}
