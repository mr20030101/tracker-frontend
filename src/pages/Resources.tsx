import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Project, Resource } from '../types'
import { Modal } from '../components/Modal'
import { ActionsMenu } from '../components/ActionsMenu'
import { Select } from '../components/Select'
import { RobotEmoji } from '../components/RobotEmoji'

const MANAGER_ROLES = ['admin', 'lead']

const emptyForm = { category: '', title: '', url: '', project_id: '' }

// A Canva share link (edit or view) turned into its embeddable form, so it can be shown in an
// iframe here instead of sending people to canva.com. Canva's own embed convention: any
// /design/<id>/<shareId>/... URL becomes /design/<id>/<shareId>/view?embed.
function canvaEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('canva.com')) return null
    const match = parsed.pathname.match(/^\/design\/([^/]+)\/([^/]+)/)
    if (!match) return null
    return `https://www.canva.com/design/${match[1]}/${match[2]}/view?embed`
  } catch {
    return null
  }
}

export function Resources() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const queryClient = useQueryClient()
  const [formTarget, setFormTarget] = useState<'new' | Resource | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewResource, setPreviewResource] = useState<Resource | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: async () => (await api.get<Resource[]>('/resources')).data,
  })

  // Only fetched for the Add/Edit form's project picker — a lead can only file a resource under a
  // project they actually lead (RLS enforces this too; this just keeps the dropdown from offering
  // choices that would be rejected).
  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
    enabled: isManager,
  })
  const { data: projectLeads = [] } = useQuery({
    queryKey: ['project-leads'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('project_leads').select('project_id, lead_id')
      if (error) throw error
      return rows as { project_id: number; lead_id: string }[]
    },
    enabled: isManager && !isAdmin,
  })
  const myProjectIds = useMemo(
    () => new Set(projectLeads.filter((pl) => pl.lead_id === user?.id).map((pl) => pl.project_id)),
    [projectLeads, user?.id],
  )
  const projectOptions = useMemo(() => {
    const projects = isAdmin ? allProjects : allProjects.filter((p) => myProjectIds.has(p.id))
    const options = projects.map((p) => ({ value: String(p.id), label: p.name }))
    // Only an admin can leave a resource general (visible to everyone) — a lead must pick one of
    // their own projects, enforced server-side too.
    return isAdmin ? [{ value: '', label: '— General (visible to everyone) —' }, ...options] : options
  }, [allProjects, isAdmin, myProjectIds])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { category: form.category, title: form.title, url: form.url, project_id: form.project_id ? Number(form.project_id) : null }
      if (formTarget && formTarget !== 'new') {
        await api.patch(`/resources/${formTarget.id}`, payload)
      } else {
        await api.post('/resources', payload)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      closeForm()
    },
    onError: () => setError('Could not save this resource. Check the fields and try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/resources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources'] }),
  })

  function openAdd() {
    setForm(emptyForm)
    setError(null)
    setFormTarget('new')
  }

  function openEdit(resource: Resource) {
    setForm({
      category: resource.category,
      title: resource.title,
      url: resource.url,
      project_id: resource.project_id != null ? String(resource.project_id) : '',
    })
    setError(null)
    setFormTarget(resource)
  }

  function closeForm() {
    setFormTarget(null)
    setForm(emptyForm)
    setError(null)
    setUploading(false)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isAdmin && !form.project_id) {
      setError('Pick a project — as a lead, you can only add resources under one of your own projects.')
      return
    }
    saveMutation.mutate()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const path = `${crypto.randomUUID()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('resources').upload(path, file)
      if (uploadError) throw uploadError
      const { data: publicUrlData } = supabase.storage.from('resources').getPublicUrl(path)
      setForm((prev) => ({ ...prev, url: publicUrlData.publicUrl, title: prev.title || file.name }))
    } catch {
      setError('Could not upload this file. Try again.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const groups = new Map<string, Resource[]>()
  for (const resource of data ?? []) {
    const list = groups.get(resource.category) ?? []
    list.push(resource)
    groups.set(resource.category, list)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            Resources
            <RobotEmoji page="resources" />
          </h1>
          <p className="text-sm text-gray-500">Guidelines, recordings, and reference links.</p>
        </div>
        {isManager && (
          <button
            onClick={openAdd}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Add Resource
          </button>
        )}
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}

      <div className="flex flex-col gap-6">
        {[...groups.entries()].map(([category, items]) => (
          <div key={category} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700">
              {category}
            </div>
            <ul className="divide-y divide-gray-100">
              {items.map((item) => {
                const embeddable = canvaEmbedUrl(item.url) !== null
                return (
                <li key={item.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    {embeddable ? (
                      <button
                        type="button"
                        onClick={() => setPreviewResource(item)}
                        className="text-sm font-medium text-sky-700 hover:underline"
                      >
                        {item.title}
                      </button>
                    ) : (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-sky-700 hover:underline"
                      >
                        {item.title}
                      </a>
                    )}
                    {item.project && <div className="text-xs text-gray-400">{item.project.name}</div>}
                  </div>
                  {isManager && (
                    <div className="flex shrink-0">
                      <ActionsMenu
                        items={[
                          { label: 'Edit', onClick: () => openEdit(item) },
                          {
                            label: 'Delete',
                            variant: 'danger',
                            onClick: () => {
                              if (confirm('Delete this resource?')) {
                                deleteMutation.mutate(item.id)
                              }
                            },
                          },
                        ]}
                      />
                    </div>
                  )}
                </li>
              )})}
            </ul>
          </div>
        ))}
      </div>

      {formTarget && (
        <Modal title={formTarget === 'new' ? 'Add Resource' : 'Edit Resource'} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Project</label>
              {!isAdmin && projectOptions.length === 0 ? (
                <p className="text-sm text-status-danger-text">
                  You don't have any projects assigned yet — ask an admin to assign you to a project first.
                </p>
              ) : (
                <Select
                  value={form.project_id}
                  onChange={(value) => setForm({ ...form, project_id: value })}
                  options={projectOptions}
                  placeholder={isAdmin ? undefined : 'Select a project...'}
                  fullWidth
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              <input
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">URL</label>
              <input
                type="url"
                required
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://... or upload a file below"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Or upload an image/video</label>
              <input
                type="file"
                accept="image/*,video/*"
                disabled={uploading}
                onChange={handleFileChange}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
              />
              {uploading && <div className="mt-1 text-xs text-gray-400">Uploading...</div>}
            </div>
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending || uploading || (!isAdmin && projectOptions.length === 0)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving...' : formTarget === 'new' ? 'Add Resource' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {previewResource && (
        <Modal title={previewResource.title} onClose={() => setPreviewResource(null)} maxWidthClassName="max-w-4xl">
          <div className="flex flex-col gap-3">
            <div className="relative w-full overflow-hidden rounded-lg border border-gray-200" style={{ paddingTop: '56.25%' }}>
              <iframe
                src={canvaEmbedUrl(previewResource.url) ?? undefined}
                loading="lazy"
                allow="fullscreen"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
            <a
              href={previewResource.url}
              target="_blank"
              rel="noreferrer"
              className="self-end text-xs font-medium text-sky-700 hover:underline"
            >
              Open in Canva ↗
            </a>
          </div>
        </Modal>
      )}
    </div>
  )
}
