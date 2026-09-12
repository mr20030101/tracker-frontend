import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import type { Project, Stage, SubmissionStatus } from '../types'

interface Props {
  projects: Project[]
  onClose: () => void
}

interface ParsedRow {
  raw: string[]
  task_id: string | null
  cb_email: string
  status: SubmissionStatus
  stage: Stage
  notes: string | null
  date: string | null
  submitted_at: string | null
  dateInvalid: boolean
  project_id: number | null
  project_name_raw: string
  project_unmatched: boolean
}

const STATUS_MAP: Record<string, SubmissionStatus> = {
  submitted: 'submitted',
  'in progress': 'in_progress',
  in_progress: 'in_progress',
  empty: 'empty',
  expired: 'expired',
  'claimed by another person': 'claimed_by_another',
  claimed_by_another: 'claimed_by_another',
}

const STAGE_MAP: Record<string, Stage> = {
  attempt: 'attempt',
  l0: 'l0',
  l1: 'l1',
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s || s.toUpperCase() === 'NONE') return null
  const normalized = s.replace(/-/g, '/')
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!match) return null
  let [, month, day, year] = match
  if (year.length === 2) year = `20${year}`
  const m = Number(month)
  const d = Number(day)
  const y = Number(year)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  // Validate with the numeric Date constructor + local getters only — never round-trip
  // through a parsed date *string*, since a string without an explicit offset is parsed
  // as local time while getUTC* reads it back in UTC, silently shifting the day for any
  // timezone ahead of UTC (this team is UTC+8).
  const check = new Date(y, m - 1, d)
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function normalizeProjectName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

function parseRows(text: string, projects: Project[]): ParsedRow[] {
  const projectByName = new Map(projects.map((p) => [normalizeProjectName(p.name), p.id]))
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())

  return lines.map((line) => {
    const fields = line.split('\t')
    while (fields.length < 8) fields.push('')
    const [dateRaw, taskIdRaw, emailRaw, statusRaw, stageRaw, notesRaw, dateSubRaw, projectRaw] = fields

    const cleanTaskId = taskIdRaw.trim().replace(/^sub id:\s*/i, '').trim()
    const cb_email = emailRaw.trim().toUpperCase() === 'NONE' ? '' : emailRaw.trim()
    const notes = notesRaw.trim() && notesRaw.trim().toUpperCase() !== 'NONE' ? notesRaw.trim() : null

    const date = parseDate(dateRaw)
    const submitted_at = parseDate(dateSubRaw)
    const dateInvalid = Boolean(dateRaw.trim()) && dateRaw.trim().toUpperCase() !== 'NONE' && date === null

    const status = STATUS_MAP[statusRaw.trim().toLowerCase()] ?? 'in_progress'
    const stage = STAGE_MAP[stageRaw.trim().toLowerCase()] ?? 'attempt'

    const projectNormalized = normalizeProjectName(projectRaw)
    const project_id = projectNormalized ? (projectByName.get(projectNormalized) ?? null) : null
    const project_unmatched = Boolean(projectNormalized) && project_id === null

    return {
      raw: fields,
      task_id: cleanTaskId && cleanTaskId.toUpperCase() !== 'NONE' ? cleanTaskId : null,
      cb_email,
      status,
      stage,
      notes,
      date,
      submitted_at,
      dateInvalid,
      project_id,
      project_name_raw: projectRaw.trim(),
      project_unmatched,
    }
  })
}

export function BulkImportModal({ projects, onClose }: Props) {
  const queryClient = useQueryClient()
  const [rawText, setRawText] = useState('')
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [overrides, setOverrides] = useState<Record<number, number | null>>({})
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; duplicates: number; skipped: number } | null>(null)

  const includedRows = useMemo(() => rows.map((r, i) => ({ row: r, index: i })).filter((x) => x.row.cb_email), [rows])
  const skippedCount = rows.length - includedRows.length

  function handleParse() {
    setError(null)
    const parsed = parseRows(rawText, projects)
    if (parsed.length === 0) {
      setError('No rows found. Paste tab-separated data (Date, Task ID, CB Email, Status, Stage, Notes, Date Submitted, Project).')
      return
    }
    setRows(parsed)
    setOverrides({})
    setStep('preview')
  }

  function effectiveProjectId(row: ParsedRow, index: number): number | null {
    return index in overrides ? overrides[index] : row.project_id
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    try {
      const candidateTaskIds = includedRows.map(({ row }) => row.task_id).filter((id): id is string => Boolean(id))

      let existingIds = new Set<string>()
      if (candidateTaskIds.length > 0) {
        const { data: existing, error: existingErr } = await supabase
          .from('task_submissions')
          .select('task_id')
          .in('task_id', candidateTaskIds)
        if (existingErr) throw existingErr
        existingIds = new Set((existing ?? []).map((r) => r.task_id as string))
      }

      const { data: profiles, error: profilesErr } = await supabase.from('profiles').select('id, email')
      if (profilesErr) throw profilesErr
      const userIdByEmail = new Map((profiles ?? []).map((p) => [p.email.toLowerCase(), p.id as string]))

      let duplicates = 0
      const toInsert = []
      for (const { row, index } of includedRows) {
        if (row.task_id && existingIds.has(row.task_id)) {
          duplicates += 1
          continue
        }
        toInsert.push({
          task_id: row.task_id,
          cb_email: row.cb_email,
          user_id: userIdByEmail.get(row.cb_email.toLowerCase()) ?? null,
          project_id: effectiveProjectId(row, index),
          stage: row.stage,
          status: row.status,
          notes: row.notes,
          date: row.date,
          submitted_at: row.submitted_at,
        })
      }

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from('task_submissions').insert(toInsert)
        if (insertErr) throw insertErr
      }

      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      setResult({ inserted: toInsert.length, duplicates, skipped: skippedCount })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Check the data and try again.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Bulk Import Task Log</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
            ✕
          </button>
        </div>

        {step === 'input' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-500">
              Paste tab-separated rows: Date, Task ID, CB Email, Status, Stage, Notes, Date Submitted, Project — one
              per line (this matches a direct copy-paste from the tracking spreadsheet).
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={14}
              placeholder="09/12/2026&#9;6aa0a04f...&#9;name@email.com&#9;submitted&#9;Attempt&#9;&#9;09/12/2026&#9;Project Name"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
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
              <span>{includedRows.length} rows ready to import</span>
              {skippedCount > 0 && (
                <span className="text-status-danger-text">{skippedCount} skipped (no CB email)</span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Task ID</th>
                    <th className="px-3 py-2">CB Email</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, index) => {
                    const excluded = !row.cb_email
                    return (
                      <tr key={index} className={excluded ? 'bg-gray-50 opacity-50' : ''}>
                        <td className="max-w-32 truncate px-3 py-2 font-mono text-gray-500">{row.task_id ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.cb_email || <span className="text-status-danger-text">missing</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{row.status}</td>
                        <td className="px-3 py-2 uppercase text-gray-600">{row.stage}</td>
                        <td className="px-3 py-2">
                          {row.dateInvalid ? (
                            <span className="text-status-danger-text">invalid</span>
                          ) : (
                            <span className="text-gray-600">{row.date ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{row.submitted_at ?? '—'}</td>
                        <td className="px-3 py-2">
                          {row.project_name_raw ? (
                            <select
                              value={effectiveProjectId(row, index) ?? ''}
                              onChange={(e) =>
                                setOverrides((prev) => ({
                                  ...prev,
                                  [index]: e.target.value ? Number(e.target.value) : null,
                                }))
                              }
                              className={`rounded border px-1 py-0.5 text-xs outline-none ${
                                row.project_unmatched && !(index in overrides)
                                  ? 'border-status-danger-text text-status-danger-text'
                                  : 'border-gray-200 text-gray-600'
                              }`}
                            >
                              <option value="">— None —</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="max-w-32 truncate px-3 py-2 text-gray-500">{row.notes ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setStep('input')}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing || includedRows.length === 0}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${includedRows.length} Rows`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-status-success-text/30 bg-status-success-bg px-4 py-3 text-sm text-status-success-text">
              Imported {result.inserted} new submissions.
            </div>
            {result.duplicates > 0 && (
              <div className="text-sm text-gray-500">{result.duplicates} rows skipped — task ID already exists.</div>
            )}
            {result.skipped > 0 && (
              <div className="text-sm text-gray-500">{result.skipped} rows skipped — no CB email.</div>
            )}
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
