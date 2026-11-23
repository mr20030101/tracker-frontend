import type { AppSwitches } from './appSettings'
import { ClipboardList, Gauge, Hourglass, LineChart, MessageSquareText, ShieldCheck, type LucideIcon } from 'lucide-react'

export interface HubTab {
  to: string
  label: string
}

export interface LogHub {
  key: 'requests' | 'feedback' | 'tasks' | 'audits' | 'data-quality' | 'reports'
  label: string
  icon: LucideIcon
  tabs: HubTab[]
}

/**
 * The Logs menu items. Requests, Feedback, Task Log, Audits and Data Quality each stand alone
 * (Audits and Data Quality only while App Settings has them on); the reports are grouped into one
 * menu item, with their pages as tabs at the top. Every page keeps its own address.
 * Attendance isn't here: it has its own item under Overview.
 */
export function logHubs(isManager: boolean, isAdmin: boolean, switches: Pick<AppSwitches, 'audits' | 'data_quality'>): LogHub[] {
  const requests: LogHub = { key: 'requests', label: 'Requests', icon: Hourglass, tabs: [{ to: '/requests', label: 'Requests' }] }
  const feedback: LogHub = { key: 'feedback', label: 'Feedback', icon: MessageSquareText, tabs: [{ to: '/feedback', label: 'Feedback' }] }
  if (!isManager) {
    return [{ key: 'tasks', label: 'Task Log', icon: ClipboardList, tabs: [{ to: '/task-log', label: 'Task Log' }] }, requests, feedback]
  }
  return [
    requests,
    feedback,
    { key: 'tasks', label: 'Task Log', icon: ClipboardList, tabs: [{ to: '/task-log', label: 'Task Log' }] },
    ...(switches.audits ? [{ key: 'audits' as const, label: 'Audits', icon: ShieldCheck, tabs: [{ to: '/audits', label: 'Audits' }] }] : []),
    ...(switches.data_quality
      ? [{ key: 'data-quality' as const, label: 'Data Quality', icon: Gauge, tabs: [{ to: '/data-quality', label: 'Data Quality' }] }]
      : []),
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
