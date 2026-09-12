import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Project } from '../types'
import { Modal } from '../components/Modal'

export function Projects() {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500">
            Manage the list of projects contributors can log task submissions against.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          + Add Project
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={2} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && data?.length === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-6 text-center text-gray-400">
                  No projects yet.
                </td>
              </tr>
            )}
            {data?.map((project) => (
              <tr key={project.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{project.name}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-3 text-xs font-medium">
                    <button
                      onClick={() => {
                        setEditTarget(project)
                        setEditName(project.name)
                        setError(null)
                      }}
                      className="text-sky-700 hover:underline"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${project.name}"? Existing task submissions, resources, and house rules linked to it will keep their history but lose this project reference.`,
                          )
                        ) {
                          deleteMutation.mutate(project.id)
                        }
                      }}
                      className="text-status-danger-text hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
    </div>
  )
}
