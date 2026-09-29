import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ListChecks } from 'lucide-react'
import { ONBOARDING_STEPS, setOnboardingStep, useOnboardingStatus } from '../lib/onboarding'
import type { OnboardingStatus, OnboardingStep } from '../types'
import { GrowBar } from './GrowBar'

function visibleSteps(hasLead: boolean) {
  return ONBOARDING_STEPS.filter((s) => hasLead || s.step !== 'message_lead')
}

// The new contributor's own checklist, on their Dashboard. Hidden once everything is done or they
// hide it. `actions` lets the page wire the steps it can do in place (submit a task, message the lead).
export function OnboardingChecklist({
  userId,
  hasLead,
  profilePath,
  actions,
}: {
  userId: string
  hasLead: boolean
  profilePath: string
  actions: Partial<Record<OnboardingStep, { label: string; onClick: () => void }>>
}) {
  const queryClient = useQueryClient()
  const { data: status } = useOnboardingStatus(userId)

  const stepMutation = useMutation({
    mutationFn: ({ step, done }: { step: 'read_resources' | 'dismissed'; done: boolean }) => setOnboardingStep(step, done),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding', userId] }),
  })

  if (!status || status.dismissed || status.done >= status.total) return null

  const links: Partial<Record<OnboardingStep, { to: string; label: string }>> = {
    photo: { to: profilePath, label: 'Edit profile' },
    remotasks_id: { to: profilePath, label: 'Edit profile' },
    shift: { to: profilePath, label: 'Edit profile' },
    read_resources: { to: '/resources', label: 'Open Resources' },
  }

  return (
    <div className="mb-6 rounded-xl border border-accent bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-accent" />
        <h2 className="text-sm font-semibold text-gray-900">Getting started</h2>
        <span className="text-xs text-gray-400">
          {status.done} of {status.total} done
        </span>
        <button
          type="button"
          onClick={() => stepMutation.mutate({ step: 'dismissed', done: true })}
          className="ml-auto text-xs font-medium text-gray-400 hover:text-gray-700"
        >
          Hide
        </button>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <GrowBar className="h-full rounded-full bg-accent" pct={(status.done / status.total) * 100} />
      </div>
      <ul className="flex flex-col gap-2">
        {visibleSteps(hasLead).map(({ step, label, hint }) => {
          const done = status.steps[step]
          const link = links[step]
          const action = actions[step]
          return (
            <li key={step} className="flex flex-wrap items-center gap-3 text-sm">
              {step === 'read_resources' ? (
                <button
                  type="button"
                  onClick={() => stepMutation.mutate({ step: 'read_resources', done: !done })}
                  aria-label={done ? 'Mark as not done' : 'Mark as done'}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-status-success-text bg-status-success-text text-white' : 'border-gray-300 text-transparent hover:border-gray-500'}`}
                >
                  <Check className="h-3 w-3" />
                </button>
              ) : (
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-status-success-text bg-status-success-text text-white' : 'border-gray-300 text-transparent'}`}
                >
                  <Check className="h-3 w-3" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className={done ? 'text-gray-400 line-through' : 'font-medium text-gray-800'}>{label}</div>
                {!done && <div className="text-xs text-gray-400">{hint}</div>}
              </div>
              {!done && link && (
                <Link to={link.to} className="text-xs font-semibold text-sky-700 hover:underline">
                  {link.label}
                </Link>
              )}
              {!done && action && (
                <button type="button" onClick={action.onClick} className="text-xs font-semibold text-sky-700 hover:underline">
                  {action.label}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Read-only progress for a lead or admin looking at a contributor.
export function OnboardingProgress({ status, hasLead }: { status: OnboardingStatus; hasLead: boolean }) {
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <ListChecks className="h-4 w-4 text-accent" />
        Onboarding checklist
        <span className="font-normal text-gray-400">
          {status.done} of {status.total} done{status.dismissed && status.done < status.total ? ' · hidden by them' : ''}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleSteps(hasLead).map(({ step, label }) => (
          <li key={step} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${status.steps[step] ? 'border-status-success-text bg-status-success-text text-white' : 'border-gray-300 text-transparent'}`}
            >
              <Check className="h-2.5 w-2.5" />
            </span>
            <span className={status.steps[step] ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
