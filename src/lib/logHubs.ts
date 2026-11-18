import { ClipboardList, Hourglass, LineChart, MessageSquareText, type LucideIcon } from 'lucide-react'

export interface HubTab {
  to: string
  label: string
}

export interface LogHub {
  key: 'requests' | 'feedback' | 'tasks' | 'reports'
  label: string
  icon: LucideIcon
  tabs: HubTab[]
}

/**
 * The Logs menu items. Requests and Feedback stand alone; the task pages and the reports are
 * grouped, one menu item each, with their pages as tabs at the top. Every page keeps its own address.
 * Attendance isn't here: it has its own item under Overview.
 */
export function logHubs(isManager: boolean, isAdmin: boolean): LogHub[] {
  const requests: LogHub = { key: 'requests', label: 'Requests', icon: Hourglass, tabs: [{ to: '/requests', label: 'Requests' }] }
  const feedback: LogHub = { key: 'feedback', label: 'Feedback', icon: MessageSquareText, tabs: [{ to: '/feedback', label: 'Feedback' }] }
  if (!isManager) {
    return [{ key: 'tasks', label: 'Task Log', icon: ClipboardList, tabs: [{ to: '/task-log', label: 'Task Log' }] }, requests, feedback]
  }
  return [
    requests,
    feedback,
    {
      key: 'tasks',
      label: 'Tasks',
      icon: ClipboardList,
      tabs: [
        { to: '/task-log', label: 'Task Log' },
        { to: '/audits', label: 'Audits' },
        { to: '/data-quality', label: 'Data Quality' },
      ],
    },
    {
      key: 'reports',
      label: 'Reports',
      icon: LineChart,
      tabs: [{ to: '/team-reports', label: 'Team Reports' }, ...(isAdmin ? [{ to: '/activity-log', label: 'Activity Log' }] : [])],
    },
  ]
}

export function hubFor(hubs: LogHub[], pathname: string): LogHub | undefined {
  return hubs.find((hub) => hub.tabs.some((tab) => tab.to === pathname))
}
