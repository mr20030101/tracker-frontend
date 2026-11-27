// The Task Log's export for RST teams, in the column order of the RST team's task sheet
// ("Aloha OTS"), so the rows paste straight into it. Project is added at the end, since one export
// can cover several projects and the sheet has one tab per project. Bootcamp keeps the plain export.
import type { Stage, SubmissionStatus, TaskDensity } from '../types'

export interface RstExportTask {
  date: string | null
  cb_email: string
  task_id: string | null
  project_id: number | null
  stage: Stage
  status: SubmissionStatus
  notes: string | null
  density: TaskDensity | null
  task_link: string | null
  progress_pct: number | null
  frames: number | null
  created_at: string
  ended_at: string | null
  submitted_at: string | null
}

const LEVELS: Record<Stage, string> = { attempt: 'Attempt', l0: 'L0', l1: 'L1', l10: 'L10' }

// As the sheet writes them where it has them; the rest as the app names them.
const STATUSES: Record<SubmissionStatus, string> = {
  submitted: 'submitted',
  in_progress: 'in progress',
  expired: 'Expired',
  rejected: 'Rejected/SBQ',
  empty: 'Empty',
  claimed_by_another: 'Claimed by Another Person',
}

/** 11/26/2026, as the sheet writes dates. A plain YYYY-MM-DD date is taken as is. */
export function sheetDate(value: string | null, timeZone?: string): string {
  if (!value) return ''
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (plain) return `${plain[2]}/${plain[3]}/${plain[1]}`
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone })
}

/** 1:10 PM, as the sheet writes times. */
export function sheetTime(value: string | null, timeZone?: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
}

/** The export's rows, one per task, keyed by the sheet's column headers. */
export function rstExportRows(tasks: RstExportTask[], projectName: (id: number) => string | undefined, timeZone?: string) {
  return tasks.map((t) => ({
    'Task Level': LEVELS[t.stage] ?? t.stage,
    'Task ID': t.task_id ?? '',
    Density: t.density ?? '',
    Link: t.task_link ?? '',
    'CB Email': t.cb_email,
    Status: STATUSES[t.status] ?? t.status,
    'Progress %': t.progress_pct == null ? '' : `${t.progress_pct}%`,
    '# of Frames': t.frames ?? '',
    'Task Notes': t.notes ?? '',
    'Date Started': t.date ? sheetDate(t.date) : sheetDate(t.created_at, timeZone),
    'Time Started': sheetTime(t.created_at, timeZone),
    'Time Ended': sheetTime(t.ended_at, timeZone),
    // Finished in the app, or (bulk-imported tasks) the date the import gave.
    'Date Submitted': t.ended_at ? sheetDate(t.ended_at, timeZone) : sheetDate(t.submitted_at?.slice(0, 10) ?? null),
    Project: t.project_id ? (projectName(t.project_id) ?? '') : '',
  }))
}
