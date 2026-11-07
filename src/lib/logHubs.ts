import { ClipboardList, Inbox, LineChart, type LucideIcon } from 'lucide-react'

export interface HubTab {
  to: string
  label: string
}

export interface LogHub {
  key: 'todo' | 'tasks' | 'reports'
  label: string
  icon: LucideIcon
  tabs: HubTab[]
}

/**
 * The Logs pages, grouped by job: what's waiting on you, the work itself, and the reports. Each
 * group is one menu item; its pages are tabs at the top, and every page keeps its own address.
 * Attendance isn't here: it has its own item under Overview.
 */
export function logHubs(isManager: boolean, isAdmin: boolean): LogHub[] {
  const todo: LogHub = {
    key: 'todo',
    label: 'To do',
    icon: Inbox,
    tabs: [
      { to: '/requests', label: 'Requests' },
      { to: '/feedback', label: 'Feedback' },
    ],
  }
  if (!isManager) {
    return [{ key: 'tasks', label: 'Task Log', icon: ClipboardList, tabs: [{ to: '/task-log', label: 'Task Log' }] }, todo]
  }
  return [
    todo,
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
