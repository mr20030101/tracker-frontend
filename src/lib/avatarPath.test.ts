import { describe, expect, it } from 'vitest'
import { avatarPathFromUrl, newAvatarPath } from './avatarPath'

const base = 'https://abc.supabase.co/storage/v1/object/public/avatars'

describe('newAvatarPath', () => {
  it('puts the photo in the user folder under a name that changes every upload', () => {
    expect(newAvatarPath('u1', 'webp', 1000)).toBe('u1/avatar-1000.webp')
    expect(newAvatarPath('u1', 'webp', 1001)).not.toBe(newAvatarPath('u1', 'webp', 1000))
  })

  it('makes a URL that update_own_profile accepts', () => {
    const url = `${base}/${newAvatarPath('u1', 'jpg', 5)}`
    expect(url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\/u1\/[^/?#]+(\?v=[0-9]+)?$/)
  })
})

describe('avatarPathFromUrl', () => {
  it('returns the bucket path of a new-style photo', () => {
    expect(avatarPathFromUrl(`${base}/u1/avatar-1000.webp`)).toBe('u1/avatar-1000.webp')
  })

  it('drops the ?v= cache buster of an old-style photo', () => {
    expect(avatarPathFromUrl(`${base}/u1/avatar.jpg?v=1760000000000`)).toBe('u1/avatar.jpg')
  })

  it('ignores URLs outside the avatars bucket', () => {
    expect(avatarPathFromUrl('https://example.com/u1/avatar.jpg')).toBeNull()
    expect(avatarPathFromUrl('https://abc.supabase.co/storage/v1/object/public/resources/x.png')).toBeNull()
  })
})
