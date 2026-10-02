import { supabase } from './api'
import type { AuditLog } from '../types'

// The audit trail's action codes, grouped for the Activity Log's filter. Codes not listed here
// (added later on the database side) still show, under "Other".
export const AUDIT_CATEGORIES: { value: string; label: string; actions: string[] }[] = [
  {
    value: 'accounts',
    label: 'Accounts',
    actions: [
      'account_created',
      'account_updated',
      'account_deleted',
      'account_enabled',
      'account_disabled',
      'password_reset',
      'role_changed',
      'lead_changed',
      'profile_renamed',
    ],
  },
  { value: 'requests', label: 'Requests', actions: ['request_approved', 'request_denied'] },
  { value: 'work', label: 'Levels, targets & tasks', actions: ['level_changed', 'target_changed', 'submission_deleted'] },
  {
    value: 'projects',
    label: 'Projects',
    actions: ['project_created', 'project_renamed', 'project_deleted', 'project_lead_added', 'project_lead_removed'],
  },
  {
    value: 'hiring',
    label: 'Hiring',
    actions: [
      'application_accepted',
      'application_edited',
      'application_denied',
      'application_deleted',
      'applicant_onboarded',
      'applicant_not_onboarded',
      'applicants_emailed',
      'hiring_cleared',
    ],
  },
  { value: 'announcements', label: 'Announcements', actions: ['announcement_posted'] },
]

export function auditCategory(action: string): string {
  return AUDIT_CATEGORIES.find((c) => c.actions.includes(action))?.value ?? 'other'
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, actor:profiles!audit_logs_actor_id_fkey(id, name, email, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as AuditLog[]
}
