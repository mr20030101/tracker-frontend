import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { User } from '../types'
import { Select } from './Select'

interface Props {
  existingEmails: Set<string>
  /** Only admins can hand out non-contributor roles; the server forces everyone else's imports to contributor. */
  canSetRole?: boolean
  onClose: () => void
}

interface ParsedRow {
  email: string
  name: string
  role: User['role']
  alreadyExists: boolean
}

const ROLES: User['role'][] = ['contributor', 'lead', 'admin']
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))
const DEFAULT_PASSWORD = 'password'

function deriveName(email: string): string {
  return email.split('@')[0]
}

function parseEmails(text: string, existingEmails: Set<string>): ParsedRow[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const rows: ParsedRow[] = []
  for (const line of lines) {
    const email = line.split(/[\t,]/)[0].trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    rows.push({
      email,
      name: deriveName(email),
      role: 'contributor',
      alreadyExists: existingEmails.has(email),
    })
  }
  return rows
}

export function BulkImportUsersModal({ existingEmails, canSetRole = true, onClose }: Props) {
  const queryClient = useQueryClient()
  const [rawText, setRawText] = useState('')
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number; failed: { email: string; message: string }[] } | null>(null)

  const includedRows = useMemo(() => rows.filter((r) => !r.alreadyExists), [rows])
  const skippedCount = rows.length - includedRows.length

  function handleParse() {
    setError(null)
    const parsed = parseEmails(rawText, existingEmails)
    if (parsed.length === 0) {
      setError('No emails found. Paste one email per line.')
      return
    }
    setRows(parsed)
    setStep('preview')
  }

  function updateRow(index: number, patch: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    const failed: { email: string; message: string }[] = []
    let created = 0
    for (const row of includedRows) {
      try {
        await api.post('/users', { name: row.name.trim() || row.email, email: row.email, password: DEFAULT_PASSWORD, role: row.role, shift: '' })
        created += 1
      } catch (err) {
        failed.push({ email: row.email, message: err instanceof Error ? err.message : 'Failed to create login.' })
      }
    }
    queryClient.invalidateQueries({ queryKey: ['users'] })
    setResult({ created, skipped: skippedCount, failed })
    setStep('done')
    setImporting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Bulk Import Users</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
            ✕
          </button>
        </div>

        {step === 'input' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-500">
              Paste one email per line. New logins default to the "{DEFAULT_PASSWORD}" password and the Contributor
              role{canSetRole ? ' — both editable per row before importing' : ''}.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              placeholder="name@email.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
                Cancel
              </button>
              <button
                onClick={handleParse}
                disabled={!rawText.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                Preview
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>{includedRows.length} new logins ready to import</span>
              {skippedCount > 0 && <span className="text-status-danger-text">{skippedCount} already exist — skipped</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Name</th>
                    {canSetRole && <th className="px-3 py-2">Role</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, index) => (
                    <tr key={row.email} className={row.alreadyExists ? 'bg-gray-50 opacity-50' : ''}>
                      <td className="px-3 py-2 text-gray-700">
                        {row.email} {row.alreadyExists && <span className="text-status-danger-text">(exists)</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.name}
                          disabled={row.alreadyExists}
                          onChange={(e) => updateRow(index, { name: e.target.value })}
                          className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-accent disabled:bg-gray-100"
                        />
                      </td>
                      {canSetRole && (
                        <td className="px-3 py-2">
                          <Select
                            value={row.role}
                            disabled={row.alreadyExists}
                            onChange={(value) => updateRow(index, { role: value as User['role'] })}
                            options={ROLE_OPTIONS}
                            className="rounded border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-accent disabled:bg-gray-100"
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setStep('input')} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing || includedRows.length === 0}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${includedRows.length} Logins`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-status-success-text/30 bg-status-success-bg px-4 py-3 text-sm text-status-success-text">
              Created {result.created} new login{result.created === 1 ? '' : 's'}.
            </div>
            {result.skipped > 0 && <div className="text-sm text-gray-500">{result.skipped} skipped — already existed.</div>}
            {result.failed.length > 0 && (
              <div className="text-sm text-status-danger-text">
                {result.failed.length} failed:
                <ul className="mt-1 list-disc pl-5">
                  {result.failed.map((f) => (
                    <li key={f.email}>
                      {f.email} — {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
