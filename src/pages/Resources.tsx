import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Resource } from '../types'
import { Modal } from '../components/Modal'

const MANAGER_ROLES = ['admin', 'lead']

const emptyForm = { category: '', title: '', url: '' }

export function Resources() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const queryClient = useQueryClient()
  const [formTarget, setFormTarget] = useState<'new' | Resource | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: async () => (await api.get<Resource[]>('/resources')).data,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (formTarget && formTarget !== 'new') {
        await api.patch(`/resources/${formTarget.id}`, form)
      } else {
        await api.post('/resources', form)
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
    setForm({ category: resource.category, title: resource.title, url: resource.url })
    setError(null)
    setFormTarget(resource)
  }

  function closeForm() {
    setFormTarget(null)
    setForm(emptyForm)
    setError(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    saveMutation.mutate()
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
          <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
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
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-sky-700 hover:underline"
                    >
                      {item.title}
                    </a>
                    {item.project && <div className="text-xs text-gray-400">{item.project.name}</div>}
                  </div>
                  {isManager && (
                    <div className="flex shrink-0 gap-3 text-xs font-medium">
                      <button onClick={() => openEdit(item)} className="text-gray-500 hover:text-gray-900">
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this resource?')) {
                            deleteMutation.mutate(item.id)
                          }
                        }}
                        className="text-status-danger-text hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {formTarget && (
        <Modal title={formTarget === 'new' ? 'Add Resource' : 'Edit Resource'} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
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
                disabled={saveMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving...' : formTarget === 'new' ? 'Add Resource' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
