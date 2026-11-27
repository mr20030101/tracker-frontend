import { sheetDate, sheetTime } from '../lib/rstTaskExport'

/**
 * A task's Time Started (created_at) or Time Ended (ended_at) in the Task Log, for RST teams: the
 * time as their task sheet writes it, with the date under it. A dash when there isn't one yet.
 */
export function TaskTimeCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-gray-400">—</span>
  return (
    <span className="whitespace-nowrap">
      <span className="block text-gray-700 tabular-nums">{sheetTime(value)}</span>
      <span className="block text-xs text-gray-400 tabular-nums">{sheetDate(value)}</span>
    </span>
  )
}
