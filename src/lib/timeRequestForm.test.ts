import { describe, expect, it } from 'vitest'
import { buildTaskIssuesFormUrl, timeRequestFormFor } from './taskRequests'

describe('timeRequestFormFor', () => {
  it('picks the form from the project code', () => {
    expect(timeRequestFormFor({ name: 'Aloha OTS', code: 'aloha_data_collection_v1' })).toBe('scale')
    expect(timeRequestFormFor({ name: 'Aloha OTS Tasking (RST)', code: 'Aloha-OTS_Tasking' })).toBe('rst')
    expect(timeRequestFormFor({ name: 'Octet Mind', code: 'octet-mind' })).toBe('task_issues')
  })

  it('ignores case, spaces, dashes and underscores in the code', () => {
    expect(timeRequestFormFor({ name: '', code: ' aloha_ots-tasking ' })).toBe('rst')
    expect(timeRequestFormFor({ name: '', code: 'Octet_Mind' })).toBe('task_issues')
  })

  it('falls back to the name when the project has no code', () => {
    expect(timeRequestFormFor({ name: 'Octet Mind', code: null })).toBe('task_issues')
    expect(timeRequestFormFor({ name: 'Aloha OTS Tasking (RST)', code: null })).toBe('rst')
    expect(timeRequestFormFor({ name: 'Aloha OTS', code: null })).toBe('scale')
  })

  it('files Sweet Yam on the same Scale forms as Aloha OTS', () => {
    expect(timeRequestFormFor({ name: 'Sweet Yam', code: 'sweet_yam' })).toBe('scale')
    expect(timeRequestFormFor({ name: 'Sweet Yam', code: null })).toBe('scale')
  })

  it('uses the Scale form for any other project, or none', () => {
    expect(timeRequestFormFor({ name: 'Sweet Yam', code: 'sweet_yam' })).toBe('scale')
    expect(timeRequestFormFor(null)).toBe('scale')
  })
})

describe('buildTaskIssuesFormUrl', () => {
  it('prefills the TASK ISSUES form, with the task ID as its Scene ID', () => {
    const url = new URL(
      buildTaskIssuesFormUrl({ requestType: 'Reclaim', taskId: 'abc123', cbEmail: 'cb@example.com', remotaskId: '632449317405934695', reason: 'Scene too big' }),
    )
    expect(url.pathname).toContain('1FAIpQLSdSToZndSe2yOh2bp2aGT07RByEwWsG-K_7Dih3J6oias5XRA')
    expect(url.searchParams.get('entry.386497914')).toBe('abc123')
    expect(url.searchParams.get('entry.673063933')).toBe('632449317405934695')
    expect(url.searchParams.get('entry.899316383')).toBe('cb@example.com')
    expect(url.searchParams.get('entry.1173139433')).toBe('Reclaim')
    expect(url.searchParams.get('entry.1706519998')).toBe('Scene too big')
    expect(url.searchParams.get('entry.949669351')).toBe('REMOTE - BOOTCAMP')
  })

  it('leaves out what it doesn’t have', () => {
    const url = new URL(buildTaskIssuesFormUrl({ requestType: 'Extend', taskId: null, cbEmail: null, remotaskId: null, reason: null }))
    expect(url.searchParams.has('entry.386497914')).toBe(false)
    expect(url.searchParams.get('entry.1173139433')).toBe('Extend')
  })
})
