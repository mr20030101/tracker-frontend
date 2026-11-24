import { describe, expect, it } from 'vitest'
import { buildBadVideoRequestFormUrl, buildRstExtensionFormUrl, hasBadVideoForm } from './taskRequests'

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

describe('hasBadVideoForm', () => {
  it('covers the Scale projects', () => {
    expect(hasBadVideoForm({ name: 'Aloha OTS' })).toBe(true)
    expect(hasBadVideoForm({ name: 'Sweet Yam' })).toBe(true)
  })

  it('covers Aloha OTS Tasking (RST), by name or code', () => {
    expect(hasBadVideoForm({ name: 'Aloha OTS Tasking (RST)' })).toBe(true)
    expect(hasBadVideoForm({ name: 'Anything', code: 'Aloha-OTS_Tasking' })).toBe(true)
  })

  it('leaves out Octet Mind and the other RST projects', () => {
    expect(hasBadVideoForm({ name: 'Octet Mind', code: 'octet-mind' })).toBe(false)
    expect(hasBadVideoForm({ name: 'Ego Nexus Group (RST)' })).toBe(false)
  })

  it('files Aloha OTS Tasking (RST) under the form\'s "Aloha" option', () => {
    const url = new URL(
      buildBadVideoRequestFormUrl({ cbEmail: 'cb@x.test', taskId: 'abc', projectName: 'Aloha OTS Tasking (RST)', category: 'Blurry', frame: '12' }),
    )
    expect(url.pathname).toContain('1FAIpQLSf6hU9Vif1-aTiohFR05MFrY2eGL_ssGAZ3AyE9z4Pz_p31hA')
    expect(url.searchParams.get('entry.921456890')).toBe('Aloha')
  })
})
