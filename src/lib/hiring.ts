import { api, functionErrorMessage, supabase } from './api'
import type { HiringApplication } from '../types'

export interface ApplicationInput {
  remotasks_email: string
  remotasks_id: string
  full_name: string
  active_email: string
  facebook_url: string
  has_robotics_background: boolean
  has_personal_computer: boolean
  has_stable_internet: boolean
  // Optional on the form: null when the applicant left them blank.
  cpu: string | null
  gpu: string | null
  gpu_memory_gb: number | null
}

export interface ReviewResult {
  id: number
  status: 'accepted' | 'denied'
  // Only present on an accept: the login that was created, and its one-time password.
  email?: string
  temporary_password?: string
}

/** The stated requirement for the role: a personal computer, stable internet, Ryzen 3 / Intel i5 and a 4 GB GPU. */
export const MIN_GPU_MEMORY_GB = 4

/**
 * Which hard requirements an applicant's answers fall short of. The CPU is free
 * text so it can't be checked here — the lead reads it. An unanswered (null)
 * question, as on an application from before step 2 existed, is not a shortfall.
 */
export function requirementIssues(answers: {
  has_personal_computer: boolean | null
  has_stable_internet: boolean | null
  gpu_memory_gb: number | null
}): string[] {
  const issues: string[] = []
  if (answers.has_personal_computer === false) issues.push('No personal computer')
  if (answers.has_stable_internet === false) issues.push('No stable internet connection')
  if (answers.gpu_memory_gb !== null && answers.gpu_memory_gb < MIN_GPU_MEMORY_GB) {
    issues.push(`GPU memory under ${MIN_GPU_MEMORY_GB} GB`)
  }
  return issues
}

/** The issues as a sentence fragment ("no personal computer; GPU memory under 4 GB"): an ordinary first word is lowered, an acronym like GPU is left alone. */
export function describeIssues(issues: string[]): string {
  return issues.map((issue) => (/^[A-Z][a-z]/.test(issue) ? issue.charAt(0).toLowerCase() + issue.slice(1) : issue)).join('; ')
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The public URL a lead shares with applicants. */
export function applicationLink(leadId: string): string {
  return `${window.location.origin}/apply/${leadId}`
}

/**
 * Turns what an applicant typed into an http(s) URL, or null if it can't be one
 * (so "N/A", or a bare word, is rejected). The database checks the scheme again.
 */
export function normalizeProfileUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    return url.hostname.includes('.') ? url.toString() : null
  } catch {
    return null
  }
}

/** The link as an href only when it is safe to navigate to; stored URLs are applicant input. */
export function safeExternalHref(url: string): string | null {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Who a public link belongs to and whether they're taking applications; null when it doesn't point at an active lead. */
export async function fetchApplicationLead(leadId: string): Promise<{ name: string; accepting: boolean } | null> {
  if (!UUID_PATTERN.test(leadId)) return null
  const { data, error } = await supabase.rpc('hiring_lead_info', { p_lead_id: leadId })
  if (error) throw error
  return ((data as { name: string; accepting: boolean }[] | null) ?? [])[0] ?? null
}

/** Turns a lead's public form on or off; row-level security lets a lead change only their own, an admin anyone's. */
export async function setAcceptingApplications(leadId: string, accepting: boolean): Promise<void> {
  await api.patch(`/users/${leadId}`, { accepting_applications: accepting })
}

export async function submitApplication(leadId: string, input: ApplicationInput): Promise<void> {
  const { error } = await supabase.rpc('submit_hiring_application', {
    p_lead_id: leadId,
    p_remotasks_email: input.remotasks_email,
    p_remotasks_id: input.remotasks_id,
    p_full_name: input.full_name,
    p_active_email: input.active_email,
    p_facebook_url: input.facebook_url,
    p_has_robotics_background: input.has_robotics_background,
    p_has_personal_computer: input.has_personal_computer,
    p_has_stable_internet: input.has_stable_internet,
    p_cpu: input.cpu,
    p_gpu: input.gpu,
    p_gpu_memory_gb: input.gpu_memory_gb,
  })
  if (error) throw error
}

/** Row-level security scopes this: a lead gets their own applicants, an admin gets everyone's. */
export async function fetchApplications(): Promise<HiringApplication[]> {
  const { data, error } = await supabase
    .from('hiring_applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HiringApplication[]
}

export async function reviewApplication(id: number, decision: 'accept' | 'deny'): Promise<ReviewResult> {
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'review-application', id, decision },
  })
  if (error) throw await functionErrorMessage(error)
  return data as ReviewResult
}

/** The most applicants one send can go to; the function enforces the same limit. */
export const MAX_EMAIL_RECIPIENTS = 50

export interface EmailResult {
  sent: number[]
  failed: { id: number; name: string; error: string }[]
}

/** Emails the chosen accepted applicants (at most 50). One failing address doesn't stop the others; `failed` says who missed out. */
export async function emailApplicants(ids: number[]): Promise<EmailResult> {
  const { data, error } = await supabase.functions.invoke('manage-user', { body: { action: 'email-applicants', ids } })
  if (error) throw await functionErrorMessage(error)
  return data as EmailResult
}
