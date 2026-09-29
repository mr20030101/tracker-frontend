import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'
import type { OnboardingStatus, OnboardingStep } from '../types'

export const ONBOARDING_STEPS: { step: OnboardingStep; label: string; hint: string }[] = [
  { step: 'photo', label: 'Add a profile photo', hint: 'So your lead and teammates recognise you.' },
  { step: 'remotasks_id', label: 'Add your Remotasks ID', hint: 'Needed for extension and reclaim requests.' },
  { step: 'shift', label: 'Set your shift', hint: 'Lets your lead know when you work.' },
  { step: 'read_resources', label: 'Read the guides in Resources', hint: 'Project guidelines and how-tos.' },
  { step: 'first_task', label: 'Log your first task', hint: 'From Task Log or "Submit a Task".' },
  { step: 'message_lead', label: 'Say hi to your lead', hint: 'Send them a message.' },
]

// Checklist state for contributors the caller may see (themselves, their team, or anyone for an
// admin); anyone else is left out of the result.
export async function fetchOnboardingStatus(userIds: string[]): Promise<OnboardingStatus[]> {
  if (userIds.length === 0) return []
  const { data, error } = await supabase.rpc('onboarding_status', { p_user_ids: userIds })
  if (error) throw error
  return (data ?? []) as OnboardingStatus[]
}

// Only the two steps the database can't work out for itself.
export async function setOnboardingStep(step: 'read_resources' | 'dismissed', done = true): Promise<void> {
  const { error } = await supabase.rpc('complete_onboarding_step', { p_step: step, p_done: done })
  if (error) throw error
}

// One contributor's checklist, or null when the caller isn't allowed to see it.
export function useOnboardingStatus(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['onboarding', userId],
    queryFn: async () => (await fetchOnboardingStatus([userId!]))[0] ?? null,
    enabled: Boolean(userId),
  })
}
