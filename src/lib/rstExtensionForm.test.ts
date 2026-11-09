import { describe, expect, it } from 'vitest'
import { buildRstExtensionFormUrl } from './taskRequests'

describe('buildRstExtensionFormUrl', () => {
  it('prefills the RST form and matches the project on its key word', () => {
    const url = new URL(buildRstExtensionFormUrl({ taskId: 'abc123', cbEmail: 'cb@example.com', projectName: 'Ego Nexus Group', reason: 'Video stuck' }))
    expect(url.pathname).toContain('1FAIpQLSeURxoFjNqHdPiG5z1AkNfAcFJL5oSOuQqBdvYh-xBEA8zbsQ')
    expect(url.searchParams.get('entry.459544622')).toBe('cb@example.com')
    expect(url.searchParams.get('entry.1934029394')).toBe('abc123')
    expect(url.searchParams.get('entry.2131209052')).toBe('Video stuck')
    expect(url.searchParams.get('entry.1473472423')).toBe('Ego-OTS_Tasking')
  })

  it('leaves out a project the form does not list', () => {
    const url = new URL(buildRstExtensionFormUrl({ taskId: 'x', cbEmail: null, projectName: 'Sweet Yam', reason: null }))
    expect(url.searchParams.has('entry.1473472423')).toBe(false)
    expect(url.searchParams.has('entry.459544622')).toBe(false)
  })
})
