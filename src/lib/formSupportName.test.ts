import { describe, expect, it } from 'vitest'
import { buildExtensionRequestFormUrl, formSupportName } from './taskRequests'

describe('formSupportName', () => {
  it('puts the surname first', () => {
    expect(formSupportName('Jay Anne R. Tan')).toBe('Tan, Jay Anne R.')
    expect(formSupportName('  Ina   Garcia ')).toBe('Garcia, Ina')
  })
  it('keeps a name already written surname first, or a single name', () => {
    expect(formSupportName('Garcia, Ina D.')).toBe('Garcia, Ina D.')
    expect(formSupportName('Ina')).toBe('Ina')
    expect(formSupportName(null)).toBeNull()
  })
})

describe('buildExtensionRequestFormUrl', () => {
  const base = { requestType: 'Extend' as const, taskId: 't1', cbEmail: null, remotaskId: null, stage: null, projectName: null, reason: null }
  it("files under the contributor's lead", () => {
    const url = new URL(buildExtensionRequestFormUrl({ ...base, leadName: 'Ina Garcia' }))
    expect(url.searchParams.get('entry.1875363957')).toBe('Garcia, Ina')
  })
  it('leaves the support name blank without a lead', () => {
    const url = new URL(buildExtensionRequestFormUrl({ ...base, leadName: null }))
    expect(url.searchParams.has('entry.1875363957')).toBe(false)
  })
})
