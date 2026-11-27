import { describe, expect, it } from 'vitest'
import { rstExportRows, sheetDate, sheetTime, type RstExportTask } from './rstTaskExport'

const task: RstExportTask = {
  date: '2026-11-26',
  cb_email: 'cb@example.com',
  task_id: '6af640325c89ed9e49a97891',
  project_id: 7,
  stage: 'l0',
  status: 'submitted',
  notes: 'Aloha OTS',
  density: 'medium',
  progress_pct: 100,
  frames: 2770,
  created_at: '2026-11-26T05:10:00Z',
  ended_at: '2026-11-26T06:56:00Z',
  submitted_at: null,
}

describe('rstExportRows', () => {
  it('lays a task out in the sheet’s columns and order', () => {
    const [row] = rstExportRows([task], (id) => (id === 7 ? 'Aloha OTS Tasking (RST)' : undefined), 'Asia/Manila')
    expect(Object.keys(row)).toEqual([
      'Task Level', 'Task ID', 'Density', 'Link', 'CB Email', 'Status', 'Progress %', '# of Frames',
      'Task Notes', 'Date Started', 'Time Started', 'Time Ended', 'Date Submitted', 'Project',
    ])
    expect(row).toMatchObject({
      'Task Level': 'L0',
      Link: 'https://www.remotasks.com/lidarlite/?entrypoint=diff-viewer&sceneId=6af640325c89ed9e49a97891',
      Density: 'medium',
      Status: 'submitted',
      'Progress %': '100%',
      '# of Frames': 2770,
      'Date Started': '11/26/2026',
      'Time Started': '1:10 PM',
      'Time Ended': '2:56 PM',
      'Date Submitted': '11/26/2026',
      Project: 'Aloha OTS Tasking (RST)',
    })
  })

  it('leaves the RST fields blank on a task without them', () => {
    const [row] = rstExportRows(
      [{ ...task, task_id: null, status: 'in_progress', density: null, progress_pct: null, frames: null, ended_at: null, project_id: null }],
      () => undefined,
      'Asia/Manila',
    )
    expect(row).toMatchObject({ Status: 'in progress', Density: '', Link: '', 'Progress %': '', '# of Frames': '', 'Time Ended': '', 'Date Submitted': '', Project: '' })
  })

  it('uses a bulk-imported task’s submitted date when it has no finish time', () => {
    const [row] = rstExportRows([{ ...task, ended_at: null, submitted_at: '2026-11-25' }], () => undefined, 'Asia/Manila')
    expect(row['Date Submitted']).toBe('11/25/2026')
  })
})

describe('sheetDate / sheetTime', () => {
  it('keeps a plain date as written and formats timestamps in the given zone', () => {
    expect(sheetDate('2026-01-05')).toBe('01/05/2026')
    expect(sheetDate('2026-11-26T18:30:00Z', 'Asia/Manila')).toBe('11/27/2026')
    expect(sheetTime('2026-11-26T18:30:00Z', 'Asia/Manila')).toBe('2:30 AM')
    expect(sheetTime(null)).toBe('')
  })
})
