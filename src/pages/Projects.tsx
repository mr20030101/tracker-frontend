import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Project, User } from '../types'
import { Modal } from '../components/Modal'
import { Combobox } from '../components/Combobox'
import { ActionsMenu } from '../components/ActionsMenu'

interface ProjectLead {
  project_id: number
  lead_id: string
}

export function Projects() {
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editName, setEditName] = useState('')
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
    mutationFn: async () => api.post('/projects', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setAdding(false)
      setName('')
      setError(null)
    },
    onError: () => setError('Could not create this project. The name may already be in use.'),
  })

  const updateMutation = useMutation({
    mutationFn: async () => api.patch(`/projects/${editTarget!.id}`, { name: editName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditTarget(null)
      setError(null)
    },
    onError: () => setError('Could not rename this project. The name may already be in use.'),
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
    setError(null)
    createMutation.mutate()
  }

  function handleUpdate(e: FormEvent) {
    e.preventDefault()
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500">
            Manage the list of projects contributors can log task submissions against.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Add Project
          </button>
        )}
      </div>

      {leadError && (
        <div className="mb-4 rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{leadError}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              {isAdmin && <th className="px-5 py-3">Leads</th>}
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && data?.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="px-5 py-6 text-center text-gray-400">
                  No projects yet.
                </td>
              </tr>
            )}
            {data?.map((project) => {
              const assignedLeadIds = leadIdsByProject.get(project.id) ?? []
              return (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{project.name}</td>
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
                              ×
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
                          className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                        >
                          + Add lead
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
                              label: 'Rename',
                              onClick: () => {
                                setEditTarget(project)
                                setEditName(project.name)
                                setError(null)
                              },
                            },
                            {
                              label: 'Delete',
                              variant: 'danger',
                              onClick: () => {
                                if (
                                  confirm(
                                    `Delete "${project.name}"? Existing task submissions and resources linked to it will keep their history but lose this project reference.`,
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
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Add Project'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal title="Rename Project" onClose={() => setEditTarget(null)}>
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
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
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
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedLeadId || addProjectLeadMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {addProjectLeadMutation.isPending ? 'Saving...' : 'Add Lead'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
