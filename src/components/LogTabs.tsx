import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { hubFor, logHubs } from '../lib/logHubs'
import { fetchPendingRequestCount } from '../lib/taskRequests'
import { fetchPendingFeedbackCount } from '../lib/taskFeedback'
import { SegmentedTabs } from './TableToolbar'

const MANAGER_ROLES = ['admin', 'lead']

/**
 * The tabs of the Logs group (To do, Tasks, Reports) the current page belongs to, drawn by the app
 * shell above the page so they stay mounted, and the highlight slides, while you switch tabs.
 */
export function LogTabs() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const hub = hubFor(logHubs(isManager, user?.role === 'admin'), pathname)

  // Same keys as the menu's badges, so these come from the cache.
  const { data: pendingRequests = 0 } = useQuery({
    queryKey: ['task-requests', 'pending-count'],
    queryFn: fetchPendingRequestCount,
    enabled: isManager,
    refetchInterval: 30_000,
  })
  const { data: pendingFeedback = 0 } = useQuery({
    queryKey: ['task-feedback', 'pending-count'],
    queryFn: fetchPendingFeedbackCount,
    enabled: isManager,
    refetchInterval: 30_000,
  })
  const countFor = (to: string) => (!isManager ? undefined : to === '/requests' ? pendingRequests : to === '/feedback' ? pendingFeedback : undefined)

  if (!hub || hub.tabs.length < 2) return null
  return (
    <div className="mb-5 max-w-full overflow-x-auto scrollbar-none">
      <SegmentedTabs
        aria-label={hub.label}
        value={pathname}
        onChange={(to) => navigate(to)}
        options={hub.tabs.map((tab) => {
          const count = countFor(tab.to)
          return { value: tab.to, label: tab.label, count: count ? count : undefined }
        })}
      />
    </div>
  )
}
