import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { toISODate } from '../lib/week'
import type { ContributorProjectLevel, Project, ProjectLevel, Stage, TaskSubmission } from '../types'
import { EmbeddedFormModal } from './EmbeddedFormModal'
import { Modal } from './Modal'
import { StatusPill } from './StatusPill'

const CTS_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfXDNf6MntiYIlJHWBlEz2uKFe7I5aNzcPQHm007bUs2qBe9w/viewform'

// Every CB here is under the same trainer, so it's always preselected in "Under Trainer Team".
const CTS_TRAINER = 'tan, jay-anne ratunil'

// The CTS form's "Tasker Level" options for each of our project levels / task stages.
const TASKER_LEVEL_BY_PROJECT_LEVEL: Record<ProjectLevel, string> = {
  contributor: 'Attempter',
  l0: 'L0',
  l1: 'L1',
  l10: 'L10',
}
const TASKER_LEVEL_BY_STAGE: Record<Stage, string> = { attempt: 'Attempter', l0: 'L0', l1: 'L1' }
const STAGE_RANK: Record<Stage, number> = { attempt: 0, l0: 1, l1: 2 }

interface CtsFormFields {
  email: string
  projectCode: string | null
  taskerLevel: string | null
  taskIds: string[]
  snipboardUrls: string[]
}

function buildCtsFormUrl({ email, projectCode, taskerLevel, taskIds, snipboardUrls }: CtsFormFields) {
  const params = new URLSearchParams()
  if (email) params.set('entry.544080514', email)
  if (projectCode) params.set('entry.525573583', projectCode)
  if (taskIds.length) params.set('entry.1598956863', taskIds.join(', '))
  if (taskerLevel) params.set('entry.520410062', taskerLevel)
  if (snipboardUrls.length) params.set('entry.354206748', snipboardUrls.join(','))
  params.set('entry.1877212952', CTS_TRAINER)
  return `${CTS_FORM_URL}?${params.toString()}`
}

interface ProjectGroup {
  key: string
  project: Project | null
  rows: TaskSubmission[]
}

// The CTS tracker takes one entry per project, so tasks are grouped by project (in the order
// they first appear, i.e. most recent first) and each group goes to the form on its own.
function groupByProject(submissions: TaskSubmission[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>()
  for (const row of submissions) {
    const key = String(row.project_id ?? 'none')
    const group = groups.get(key) ?? { key, project: row.project, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return [...groups.values()]
}

interface Props {
  email: string
  submissions: TaskSubmission[]
  onClose: () => void
}

export function CtsFormModal({ email, submissions, onClose }: Props) {
  const queryClient = useQueryClient()
  const todayIso = toISODate(new Date())
  // Today's tasks are the common case and come pre-selected; anything from an earlier day is
  // still here to catch up on, but the CB has to opt into including it explicitly.
  const [selected, setSelected] = useState<Set<number>>(
    new Set(submissions.filter((s) => s.date?.slice(0, 10) === todayIso).map((s) => s.id)),
  )
  // The prefilled CTS form open inside the Tracker, and the tasks it's for. They're marked as sent
  // to CTS as soon as the form reports it was submitted (see EmbeddedFormModal).
  const [openForm, setOpenForm] = useState<{ url: string; ids: number[] } | null>(null)
  // Every task here has gone to CTS, so closing the form closes this too.
  const [allSubmitted, setAllSubmitted] = useState(false)
  const groups = groupByProject(submissions)

  const userId = submissions.find((s) => s.user_id)?.user_id ?? null
  const { data: projectLevels = [] } = useQuery({
    queryKey: ['contributor-project-levels', userId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('contributor_project_levels').select('*').eq('user_id', userId!)
      if (error) throw error
      return rows as ContributorProjectLevel[]
    },
    enabled: Boolean(userId),
  })
  const levelByProjectId = new Map(projectLevels.map((row) => [row.project_id, row.level]))

  // The CB's level on the project if one is set, otherwise the highest stage they tasked at.
  function taskerLevelFor(group: ProjectGroup, chosen: TaskSubmission[]) {
    const projectLevel = group.project ? levelByProjectId.get(group.project.id) : undefined
    if (projectLevel) return TASKER_LEVEL_BY_PROJECT_LEVEL[projectLevel]
    const rows = chosen.length ? chosen : group.rows
    const topStage = rows.reduce<Stage>((top, row) => (STAGE_RANK[row.stage] > STAGE_RANK[top] ? row.stage : top), rows[0].stage)
    return TASKER_LEVEL_BY_STAGE[topStage]
  }

  const markSubmittedMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase
        .from('task_submissions')
        .update({ cts_submitted_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      // Close once every project's tasks have gone to CTS; otherwise stay for the next project.
      if (submissions.every((s) => ids.includes(s.id))) setAllSubmitted(true)
    },
  })

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(group: ProjectGroup) {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = group.rows.every((row) => next.has(row.id))
      for (const row of group.rows) {
        if (allSelected) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })
  }

  function openCtsForm(group: ProjectGroup) {
    const chosen = group.rows.filter((row) => selected.has(row.id))
    const url = buildCtsFormUrl({
      email,
      projectCode: group.project?.code ?? null,
      taskerLevel: taskerLevelFor(group, chosen),
      taskIds: chosen.map((s) => s.task_id ?? ''),
      snipboardUrls: chosen.map((s) => s.snipboard_url ?? ''),
    })
    setOpenForm({ url, ids: chosen.map((s) => s.id) })
    markSubmittedMutation.reset()
  }

  return (
    <Modal title="Tasks Ready for CTS" onClose={onClose} maxWidthClassName="max-w-4xl">
      <p className="mb-3 text-sm text-gray-500">
        The CTS Tracker takes one entry per project, so submit each project below separately. Its Task IDs, screenshot
        links, project code, tasker level and trainer will be prefilled for you. Today's tasks are selected by default —
        check any earlier ones you'd also like to include.
      </p>

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
          No tasks ready for CTS yet.
        </div>
      ) : (
        <div className="flex max-h-[28rem] flex-col gap-4 overflow-auto">
          {groups.map((group) => {
            const chosen = group.rows.filter((row) => selected.has(row.id))
            return (
              <div key={group.key} className="rounded-lg border border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{group.project?.name ?? 'No project'}</div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                      {group.project?.code ? (
                        <span className="font-mono">{group.project.code}</span>
                      ) : (
                        <span className="text-status-warning-text">No project code — pick the project in the form</span>
                      )}
                      <span>Tasker level: {taskerLevelFor(group, chosen)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCtsForm(group)}
                    disabled={chosen.length === 0}
                    className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
                  >
                    Open CTS Form ({chosen.length})
                  </button>
                </div>

                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="w-10 px-4 py-2">
                        <input
                          type="checkbox"
                          checked={chosen.length === group.rows.length}
                          onChange={() => toggleGroup(group)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Task ID</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Screenshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.rows.map((row) => {
                      const rowDate = row.date?.slice(0, 10)
                      return (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(row.id)}
                              onChange={() => toggle(row.id)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">
                            {rowDate === todayIso ? (
                              <span className="font-semibold text-accent">Today</span>
                            ) : (
                              <span className="text-gray-500">{rowDate ?? '—'}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">{row.task_id ?? '—'}</td>
                          <td className="px-3 py-2 uppercase text-gray-600">{row.stage}</td>
                          <td className="px-3 py-2">
                            <StatusPill status={row.status} />
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {row.snipboard_url ? (
                              <span className="text-status-success-text">Attached</span>
                            ) : (
                              <span className="text-gray-400">Missing</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {selected.size} of {submissions.length} selected across {groups.length} project{groups.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
        >
          Close
        </button>
      </div>

      {openForm && (
        <EmbeddedFormModal
          title="CTS Form"
          url={openForm.url}
          onSubmitted={() => markSubmittedMutation.mutate(openForm.ids)}
          onClose={() => {
            setOpenForm(null)
            if (allSubmitted) onClose()
          }}
          status={
            markSubmittedMutation.isPending ? (
              <span className="text-xs text-gray-500">Saving...</span>
            ) : markSubmittedMutation.isSuccess ? (
              <span className="text-xs text-status-success-text">
                Marked {openForm.ids.length} task{openForm.ids.length === 1 ? '' : 's'} as sent to CTS
              </span>
            ) : markSubmittedMutation.isError ? (
              <span className="flex items-center gap-2 text-xs text-status-danger-text">
                Submitted, but the Tracker couldn't save it.
                <button type="button" onClick={() => markSubmittedMutation.mutate(openForm.ids)} className="font-semibold underline">
                  Retry
                </button>
              </span>
            ) : null
          }
        />
      )}
    </Modal>
  )
}
