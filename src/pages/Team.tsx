import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { HouseRule } from '../types'
import { Modal } from '../components/Modal'

const MANAGER_ROLES = ['admin', 'lead']

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function Team() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', body: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['house-rules'],
    queryFn: async () => (await api.get<HouseRule[]>('/house-rules')).data,
  })

  const createMutation = useMutation({
    mutationFn: async () => api.post('/house-rules', { ...form, type: 'rule' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['house-rules'] })
      setAdding(false)
      setForm({ title: '', body: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/house-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['house-rules'] }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  const info = data?.filter((r) => r.type === 'info' && r.title !== 'Closing Note') ?? []
  const rules = data?.filter((r) => r.type === 'rule') ?? []
  const closingNote = data?.find((r) => r.title === 'Closing Note')

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Handbook</h1>
          <p className="text-sm text-gray-500">
            Everything a new teammate needs to know: who leads the team, when we work, and how we conduct
            ourselves day to day.
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Add Rule
          </button>
        )}
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}

      <article className="rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-sm">
        {info.length > 0 && (
          <dl className="mb-8 grid grid-cols-1 gap-4 border-b border-gray-100 pb-8 sm:grid-cols-2">
            {info.map((item) => (
              <div key={item.id}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">{item.title}</dt>
                <dd className="mt-1 text-sm text-gray-800">
                  {isUrl(item.body) ? (
                    <a href={item.body} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                      {item.body}
                    </a>
                  ) : (
                    item.body
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <h2 className="mb-2 text-lg font-bold text-gray-900">House Rules</h2>
        <p className="mb-6 text-sm text-gray-500">
          These guidelines keep the team running smoothly. Please read them carefully and keep them in mind
          throughout your work with us.
        </p>

        <ol className="flex flex-col gap-5">
          {rules.map((rule, index) => (
            <li key={rule.id} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-bg text-sm font-semibold text-accent-foreground">
                {index + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">{rule.title}</h3>
                  {isManager && (
                    <button
                      onClick={() => {
                        if (confirm('Delete this rule?')) {
                          deleteMutation.mutate(rule.id)
                        }
                      }}
                      className="shrink-0 text-xs font-medium text-status-danger-text hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {closingNote && (
          <p className="mt-8 border-t border-gray-100 pt-6 text-sm italic text-gray-500">{closingNote.body}</p>
        )}
      </article>

      {adding && (
        <Modal title="Add House Rule" onClose={() => setAdding(false)}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Rule Title</label>
              <input
                required
                placeholder="e.g. Respond within 24 hours"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Explanation</label>
              <textarea
                required
                rows={3}
                placeholder="Explain why this rule matters and how to follow it."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
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
                {createMutation.isPending ? 'Saving...' : 'Add Rule'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
