import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import {
  assignedProjectIds,
  fetchAssignments,
  fetchProjectLeads,
  planBulkAssignment,
  setProjectAssignment,
  setProjectAssignments,
  type BulkAssignMode,
  type BulkAssignPlan,
} from '../lib/cbProjects'
import type { Project, User } from '../types'
import { Modal } from './Modal'
import { SegmentedTabs } from './TableToolbar'

const MAX_SHOWN = 3

function invalidateAssignments(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['cb-project-assignments'] })
  queryClient.invalidateQueries({ queryKey: ['contributor-project-levels'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
  queryClient.invalidateQueries({ queryKey: ['contributor'] })
}

function useProjectData() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<Project[]>('/projects')).data })
  const projectLeads = useQuery({ queryKey: ['project-leads', 'all'], queryFn: fetchProjectLeads })
  const assignments = useQuery({ queryKey: ['cb-project-assignments'], queryFn: () => fetchAssignments() })
  return { projects: projects.data ?? [], projectLeads: projectLeads.data ?? [], assignments: assignments.data ?? [], loaded: projects.isSuccess && projectLeads.isSuccess && assignments.isSuccess }
}

/** A contributor's projects as chips, from their lead's; a lead or admin can tick and untick them. */
export function ProjectTags({ user, canEdit }: { user: Pick<User, 'id' | 'name' | 'lead_id'>; canEdit: boolean }) {
  const { projects, projectLeads, assignments, loaded } = useProjectData()
  const [editing, setEditing] = useState(false)
  if (!loaded) return <span className="text-xs text-gray-300">…</span>
  if (!user.lead_id) return <span className="text-xs text-gray-400">No lead</span>

  const leadProjectIds = projectLeads.filter((row) => row.lead_id === user.lead_id).map((row) => row.project_id)
  if (leadProjectIds.length === 0) return <span className="text-xs text-gray-400">Lead has no projects</span>
  const ids = assignedProjectIds(user.id, user.lead_id, projectLeads, assignments)
  const names = ids.map((id) => projects.find((p) => p.id === id)?.name).filter((name): name is string => Boolean(name))

  return (
    <div className="flex max-w-64 flex-wrap items-center gap-1">
      {names.slice(0, MAX_SHOWN).map((name) => (
        <span key={name} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          {name}
        </span>
      ))}
      {names.length > MAX_SHOWN && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500" title={names.slice(MAX_SHOWN).join(', ')}>
          +{names.length - MAX_SHOWN}
        </span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${user.name}'s projects`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      {editing && (
        <AssignProjectsModal
          user={user}
          leadProjects={leadProjectIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => Boolean(p))}
          assigned={new Set(ids)}
          explicit={assignments.some((row) => row.user_id === user.id && leadProjectIds.includes(row.project_id))}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function AssignProjectsModal({
  user,
  leadProjects,
  assigned,
  explicit,
  onClose,
}: {
  user: Pick<User, 'id' | 'name'>
  leadProjects: Project[]
  assigned: Set<number>
  /** Whether they have assignments yet; without any they count as on every one of their lead's projects. */
  explicit: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async ({ projectId, on }: { projectId: number; on: boolean }) => {
      // The first change for someone with no assignments yet writes down the ones they had by default.
      if (!explicit) {
        for (const project of leadProjects) {
          if (project.id !== projectId) await setProjectAssignment(user.id, project.id, true)
        }
      }
      await setProjectAssignment(user.id, projectId, on)
    },
    onSettled: () => invalidateAssignments(queryClient),
  })

  return (
    <Modal title={`${user.name}'s projects`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">Pick from their lead’s projects. They log tasks, and their hours target comes, from the ones ticked.</p>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {leadProjects.map((project) => {
            const on = save.isPending && save.variables?.projectId === project.id ? save.variables.on : assigned.has(project.id)
            const lastOne = on && assigned.size === 1
            return (
              <li key={project.id}>
                <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${lastOne ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={save.isPending}
                    onChange={(e) => {
                      if (lastOne) return
                      save.mutate({ projectId: project.id, on: e.target.checked })
                    }}
                  />
                  <span className="flex-1 font-medium text-gray-800">{project.name}</span>
                  {project.code && <span className="font-mono text-xs text-gray-400">{project.code}</span>}
                </label>
              </li>
            )
          })}
        </ul>
        {assigned.size === 1 && <p className="text-xs text-gray-500">A contributor needs at least one project, so the last one can’t be unticked.</p>}
        {save.isError && <p className="text-sm text-status-danger-text">{errorMessage(save.error, 'Couldn’t save that.')}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <Check className="h-4 w-4" aria-hidden />
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

const MODE_OPTIONS: { value: BulkAssignMode; label: string }[] = [
  { value: 'add', label: 'Add' },
  { value: 'remove', label: 'Remove' },
  { value: 'replace', label: 'Replace' },
]

const MODE_HINTS: Record<BulkAssignMode, string> = {
  add: 'The ticked projects are added to what each of them already has.',
  remove: 'The ticked projects are taken off each of them. Anyone it would leave with none is skipped.',
  replace: 'Each of them ends up on just the ticked projects.',
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export type BulkAssignResult = { tone: 'success' | 'error'; text: string; failedIds: string[] }

/**
 * Assigns projects to many contributors at once. Projects are grouped by the lead who runs them, and
 * each contributor only gets the ticked ones their own lead runs.
 */
export function BulkAssignProjectsModal({
  users,
  leadNameById,
  onClose,
  onDone,
}: {
  users: Pick<User, 'id' | 'name' | 'lead_id'>[]
  leadNameById: Map<string, string>
  onClose: () => void
  onDone: (result: BulkAssignResult) => void
}) {
  const queryClient = useQueryClient()
  const { projects, projectLeads, assignments, loaded } = useProjectData()
  const [mode, setMode] = useState<BulkAssignMode>('add')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const leadIds = [...new Set(users.map((u) => u.lead_id).filter((id): id is string => Boolean(id)))]
  const groups = leadIds
    .map((leadId) => ({
      leadId,
      projects: projectLeads
        .filter((row) => row.lead_id === leadId)
        .map((row) => projects.find((p) => p.id === row.project_id))
        .filter((p): p is Project => Boolean(p)),
      count: users.filter((u) => u.lead_id === leadId).length,
    }))
    .filter((group) => group.projects.length > 0)
    .sort((a, b) => (leadNameById.get(a.leadId) ?? '').localeCompare(leadNameById.get(b.leadId) ?? ''))
  const noLead = users.filter((u) => !u.lead_id).length

  const save = useMutation({
    mutationFn: async () => {
      const plans = planBulkAssignment(users, [...picked], mode, projectLeads, assignments)
      const toWrite = plans.filter((plan): plan is Extract<BulkAssignPlan, { target: number[] }> => 'target' in plan)
      const results = await Promise.allSettled(toWrite.map((plan) => setProjectAssignments(plan.userId, plan.leadProjectIds, plan.target)))
      const failedIds = toWrite.filter((_, i) => results[i].status === 'rejected').map((plan) => plan.userId)
      const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      return { written: toWrite.length, skipped: plans.length - toWrite.length, failedIds, reason: firstFailure ? errorMessage(firstFailure.reason, '') : '' }
    },
    onSuccess: ({ written, skipped, failedIds, reason }) => {
      const done = written - failedIds.length
      const skippedText = skipped > 0 ? ` Skipped ${plural(skipped, 'contributor')} it didn’t apply to${mode === 'remove' ? ' or would have left with no projects' : ''}.` : ''
      onDone(
        failedIds.length === 0
          ? { tone: 'success', text: `Updated projects for ${plural(done, 'contributor')}.${skippedText}`, failedIds }
          : {
              tone: 'error',
              text: `Updated projects for ${done} of ${plural(written, 'contributor')}. ${failedIds.length} failed${reason ? `: ${reason}` : ''}. They’re still selected so you can retry.${skippedText}`,
              failedIds,
            },
      )
    },
    onSettled: () => invalidateAssignments(queryClient),
  })

  function toggle(projectId: number, on: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(projectId)
      else next.delete(projectId)
      return next
    })
  }

  return (
    <Modal title={`Projects for ${plural(users.length, 'contributor')}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SegmentedTabs aria-label="How to apply the projects" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        <p className="text-sm text-gray-600">{MODE_HINTS[mode]} Each contributor only gets their own lead’s projects.</p>
        {!loaded ? (
          <p className="text-sm text-gray-400">Loading projects…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-500">None of their leads run any projects yet.</p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.leadId}>
                {groups.length > 1 && (
                  <p className="mb-1 text-xs font-medium text-gray-500">
                    {leadNameById.get(group.leadId) ?? 'Lead'}’s projects · {plural(group.count, 'contributor')}
                  </p>
                )}
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {group.projects.map((project) => (
                    <li key={project.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50">
                        <input type="checkbox" checked={picked.has(project.id)} disabled={save.isPending} onChange={(e) => toggle(project.id, e.target.checked)} />
                        <span className="flex-1 font-medium text-gray-800">{project.name}</span>
                        {project.code && <span className="font-mono text-xs text-gray-400">{project.code}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {noLead > 0 && <p className="text-xs text-gray-500">{plural(noLead, 'selected contributor')} without a lead will be skipped.</p>}
        {save.isError && <p className="text-sm text-status-danger-text">{errorMessage(save.error, 'Couldn’t save that.')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!loaded || save.isPending || picked.size === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden />
            {save.isPending ? 'Saving…' : picked.size === 0 ? 'Tick a project' : `${MODE_OPTIONS.find((o) => o.value === mode)!.label} ${plural(picked.size, 'project')}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
