import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Project, ProjectLevel, User } from '../types'
import { Modal } from '../components/Modal'
import { Combobox } from '../components/Combobox'
import { Pencil, Plus, Save, Trash2, UserPlus, X } from 'lucide-react'
import { ActionsMenu } from '../components/ActionsMenu'
import { confirmDialog } from '../lib/dialog'
import { usePageTitle } from '../lib/usePageTitle'
import { LEVEL_TIERS } from '../components/LevelPill'
import { QUOTA_LEVELS, projectQuota } from '../lib/quotas'

type QuotaInputs = Record<ProjectLevel, string>

const NO_QUOTAS: QuotaInputs = { contributor: '', l0: '', l1: '', l10: '' }

function quotaInputs(project: Project): QuotaInputs {
  return Object.fromEntries(QUOTA_LEVELS.map((level) => [level, String(projectQuota(project, level) ?? '')])) as QuotaInputs
}

const QUOTA_ERROR = 'Each daily quota must be a whole number of tasks (0 or more), or blank.'

function quotasValid(inputs: QuotaInputs) {
  return QUOTA_LEVELS.every((level) => inputs[level].trim() === '' || /^\d+$/.test(inputs[level].trim()))
}

// The daily_quota_* columns to save; a blank field clears that level's quota.
function quotaColumns(inputs: QuotaInputs) {
  return Object.fromEntries(QUOTA_LEVELS.map((level) => [`daily_quota_${level}`, inputs[level].trim() === '' ? null : Number(inputs[level])]))
}

// A daily quota for each CB level: how many tasks a day the project expects at that level.
function QuotaFields({ value, onChange }: { value: QuotaInputs; onChange: (next: QuotaInputs) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Daily Quota by Level</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUOTA_LEVELS.map((level) => (
          <label key={level} className="text-xs font-medium text-gray-500">
            {LEVEL_TIERS[level].label}
            <input
              type="number"
              min={0}
              step={1}
              value={value[level]}
              onChange={(e) => onChange({ ...value, [level]: e.target.value })}
              placeholder="—"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Tasks a day for a contributor at that level on this project. Their weekly target is the quotas on their projects times 5 working days. Leave a level blank for no quota.
      </p>
    </div>
  )
}

function QuotaSummary({ project }: { project: Project }) {
  const set = QUOTA_LEVELS.filter((level) => projectQuota(project, level) !== null)
  if (set.length === 0) return <span className="text-gray-400">Not set</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {set.map((level) => (
        <span key={level} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          <span className="font-semibold">{LEVEL_TIERS[level].label}</span> {projectQuota(project, level)}/day
        </span>
      ))}
    </div>
  )
}

interface ProjectLead {
  project_id: number
  lead_id: string
}

export function Projects() {
  usePageTitle('Projects')
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [quotas, setQuotas] = useState<QuotaInputs>(NO_QUOTAS)
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editQuotas, setEditQuotas] = useState<QuotaInputs>(NO_QUOTAS)
  const [assignTarget, setAssignTarget] = useState<Project | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [leadError, setLeadError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  const { data: leads = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
    enabled: isAdmin,
  })

  const { data: projectLeads = [] } = useQuery({
    queryKey: ['project-leads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_leads').select('project_id, lead_id')
      if (error) throw error
      return data as ProjectLead[]
    },
  })

  const leadIdsByProject = new Map<number, string[]>()
  for (const row of projectLeads) {
    const list = leadIdsByProject.get(row.project_id) ?? []
    list.push(row.lead_id)
    leadIdsByProject.set(row.project_id, list)
  }
  const leadNameById = new Map(leads.map((lead) => [lead.id, lead.name]))

  const createMutation = useMutation({
    mutationFn: async () => api.post('/projects', { name, code: code.trim() || null, ...quotaColumns(quotas) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setAdding(false)
      setName('')
      setCode('')
      setQuotas(NO_QUOTAS)
      setError(null)
    },
    onError: () => setError('Could not create this project. The name may already be in use.'),
  })

  const updateMutation = useMutation({
    mutationFn: async () => api.patch(`/projects/${editTarget!.id}`, { name: editName, code: editCode.trim() || null, ...quotaColumns(editQuotas) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      // Targets come from the quotas, so everything showing one is out of date.
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['daily-quotas'] })
      setEditTarget(null)
      setError(null)
    },
    onError: () => setError('Could not update this project. The name may already be in use.'),
  })

  const addProjectLeadMutation = useMutation({
    mutationFn: async ({ projectId, leadId }: { projectId: number; leadId: string }) => {
      const { error } = await supabase.from('project_leads').insert({ project_id: projectId, lead_id: leadId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-leads'] })
      setLeadError(null)
      setAssignTarget(null)
      setSelectedLeadId('')
    },
    onError: (mutationError: Error) => setLeadError(mutationError.message || 'Could not assign this lead.'),
  })

  const removeProjectLeadMutation = useMutation({
    mutationFn: async ({ projectId, leadId }: { projectId: number; leadId: string }) => {
      const { error } = await supabase
        .from('project_leads')
        .delete()
        .eq('project_id', projectId)
        .eq('lead_id', leadId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-leads'] })
      setLeadError(null)
    },
    onError: (mutationError: Error) => setLeadError(mutationError.message || 'Could not remove this lead.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!quotasValid(quotas)) return setError(QUOTA_ERROR)
    setError(null)
    createMutation.mutate()
  }

  function handleUpdate(e: FormEvent) {
    e.preventDefault()
    if (!quotasValid(editQuotas)) return setError(QUOTA_ERROR)
    setError(null)
    updateMutation.mutate()
  }

  function handleAssignLead(e: FormEvent) {
    e.preventDefault()
    if (!assignTarget || !selectedLeadId) return
    addProjectLeadMutation.mutate({ projectId: assignTarget.id, leadId: selectedLeadId })
  }

  function canManage(project: Project) {
    return isAdmin || (leadIdsByProject.get(project.id) ?? []).includes(currentUser?.id ?? '')
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            Projects
          </h1>
          <p className="text-sm text-gray-500">
            Manage the list of projects contributors can log task submissions against.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add Project
          </button>
        )}
      </div>

      {leadError && (
        <div className="mb-4 rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{leadError}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Project Code</th>
              <th className="px-5 py-3">Daily Quota</th>
              {isAdmin && <th className="px-5 py-3">Leads</th>}
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && data?.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-5 py-6 text-center text-gray-400">
                  No projects yet.
                </td>
              </tr>
            )}
            {data?.map((project) => {
              const assignedLeadIds = leadIdsByProject.get(project.id) ?? []
              return (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{project.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">{project.code ?? '—'}</td>
                  <td className="px-5 py-3">
                    <QuotaSummary project={project} />
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      {assignedLeadIds.length > 0 && (
                        <div className="mb-1 text-xs text-gray-400">
                          {assignedLeadIds.length} {assignedLeadIds.length === 1 ? 'lead' : 'leads'} assigned
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {assignedLeadIds.map((leadId) => (
                          <span
                            key={leadId}
                            className="flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-xs font-medium text-accent-foreground"
                          >
                            {leadNameById.get(leadId) ?? 'Unknown'}
                            <button
                              onClick={() => removeProjectLeadMutation.mutate({ projectId: project.id, leadId })}
                              className="text-accent-foreground/60 hover:text-accent-foreground"
                              aria-label="Remove lead"
                            >
                              <X className="h-3 w-3" aria-hidden />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setAssignTarget(project)
                            setSelectedLeadId('')
                            setLeadError(null)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                        >
                          <UserPlus className="h-3.5 w-3.5" aria-hidden />
                          Add lead
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="px-5 py-3 text-right">
                    {canManage(project) && (
                      <div className="flex justify-end">
                        <ActionsMenu
                          items={[
                            {
                              label: 'Edit',
                              icon: Pencil,
                              onClick: () => {
                                setEditTarget(project)
                                setEditName(project.name)
                                setEditCode(project.code ?? '')
                                setEditQuotas(quotaInputs(project))
                                setError(null)
                              },
                            },
                            {
                              label: 'Delete',
                              icon: Trash2,
                              variant: 'danger',
                              onClick: async () => {
                                if (
                                  await confirmDialog(
                                    `Delete "${project.name}"? Existing task submissions and resources linked to it will keep their history but lose this project reference.`,
                                    { confirmLabel: 'Delete', danger: true },
                                  )
                                ) {
                                  deleteMutation.mutate(project.id)
                                }
                              },
                            },
                          ]}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title="Add Project" onClose={() => setAdding(false)}>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Project Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Project Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. aloha_data_collection_v1"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-gray-400">Exactly as it's listed under Tracking Project in the CTS Tracker.</p>
            </div>
            <QuotaFields value={quotas} onChange={setQuotas} />
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                <X className="h-4 w-4" aria-hidden />
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {createMutation.isPending ? 'Saving...' : 'Add Project'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal title="Edit Project" onClose={() => setEditTarget(null)}>
          <form onSubmit={handleUpdate} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Project Name</label>
              <input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Project Code</label>
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                placeholder="e.g. aloha_data_collection_v1"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-gray-400">Exactly as it's listed under Tracking Project in the CTS Tracker.</p>
            </div>
            <QuotaFields value={editQuotas} onChange={setEditQuotas} />
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                <X className="h-4 w-4" aria-hidden />
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {assignTarget && (
        <Modal title={`Assign Lead — ${assignTarget.name}`} onClose={() => setAssignTarget(null)}>
          <form onSubmit={handleAssignLead} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Lead</label>
              <Combobox
                value={selectedLeadId}
                onChange={setSelectedLeadId}
                options={leads
                  .filter((lead) => lead.role === 'lead' && !(leadIdsByProject.get(assignTarget.id) ?? []).includes(lead.id))
                  .map((lead) => ({ value: lead.id, label: lead.name }))}
                placeholder="Search leads..."
                className="w-full"
              />
            </div>
            {leadError && <div className="text-sm text-status-danger-text">{leadError}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignTarget(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                <X className="h-4 w-4" aria-hidden />
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedLeadId || addProjectLeadMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                {addProjectLeadMutation.isPending ? 'Saving...' : 'Add Lead'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
