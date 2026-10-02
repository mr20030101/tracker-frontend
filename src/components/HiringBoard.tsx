import { AlertTriangle, Mail, StickyNote } from 'lucide-react'
import {
  PIPELINE_STAGES,
  describeIssues,
  hasDuplicateRemotasksId,
  pipelineStage,
  requirementIssues,
} from '../lib/hiring'
import type { HiringApplication } from '../types'

// The Hiring page's board view: one column per pipeline stage (lib/hiring's PIPELINE_STAGES),
// worked out from what already happened to each application. Clicking a card opens the same
// details as a row in the list, where every action lives — the board is for seeing where
// everyone is, not a second set of buttons.

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

function Card({
  application,
  duplicate,
  leadName,
  onOpen,
}: {
  application: HiringApplication
  duplicate: boolean
  leadName: string | null
  onOpen: () => void
}) {
  const issues = requirementIssues(application)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-accent"
    >
      <p className="truncate text-sm font-semibold text-gray-900">{application.full_name}</p>
      <p className="truncate text-xs text-gray-500">{application.active_email}</p>
      <p className="mt-1 text-xs text-gray-400">
        Applied {daysAgo(application.created_at)}
        {leadName && ` · ${leadName}`}
      </p>

      {(duplicate || issues.length > 0 || application.emailed_at || application.notes) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {duplicate && (
            <span
              title="This Remotasks ID is on more than one application."
              className="inline-flex items-center gap-1 rounded-full bg-status-danger-bg px-2 py-0.5 text-[11px] font-semibold text-status-danger-text"
            >
              <AlertTriangle className="h-3 w-3" />
              Duplicate ID
            </span>
          )}
          {issues.length > 0 && (
            <span
              title={`Below requirements: ${describeIssues(issues)}.`}
              className="rounded-full bg-status-warning-bg px-2 py-0.5 text-[11px] font-semibold text-status-warning-text"
            >
              Below requirements
            </span>
          )}
          {application.emailed_at && application.status === 'accepted' && (
            <span
              title={`Emailed ${new Date(application.emailed_at).toLocaleString()}`}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600"
            >
              <Mail className="h-3 w-3" />
              Emailed
            </span>
          )}
          {application.notes && (
            <span
              title={application.notes}
              className="inline-flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-[11px] font-semibold text-accent-foreground"
            >
              <StickyNote className="h-3 w-3" />
              Notes
            </span>
          )}
        </div>
      )}
    </button>
  )
}

export function HiringBoard({
  applications,
  duplicates,
  leadNameById,
  onOpen,
}: {
  applications: HiringApplication[]
  duplicates: Set<string>
  leadNameById: Map<string, string> | null
  onOpen: (application: HiringApplication) => void
}) {
  return (
    // Scrolls sideways on a narrow screen rather than squeezing five columns into it.
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="grid min-w-[60rem] grid-cols-5 gap-3">
        {PIPELINE_STAGES.map(({ stage, label, hint }) => {
          const cards = applications.filter((application) => pipelineStage(application) === stage)

          return (
            <section
              key={stage}
              aria-label={label}
              className={`flex max-h-[70vh] flex-col rounded-xl bg-gray-50 p-2 ${stage === 'denied' ? 'opacity-70' : ''}`}
            >
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
                  <span className="text-xs font-semibold text-gray-400">{cards.length}</span>
                </div>
                {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {cards.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-gray-400">Nobody here.</p>
                ) : (
                  cards.map((application) => (
                    <Card
                      key={application.id}
                      application={application}
                      duplicate={hasDuplicateRemotasksId(application, duplicates)}
                      leadName={leadNameById?.get(application.lead_id) ?? null}
                      onOpen={() => onOpen(application)}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
