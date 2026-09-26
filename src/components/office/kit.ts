import * as THREE from 'three'
import type { OfficeAvatar } from '../../lib/office'
import { createOfficeAssets, type PersonOptions } from './officeAssets.js'

// One kit for the whole app: it caches materials, so every desk and person shares them.
export const kit = createOfficeAssets(THREE)

export function hashSeed(s: string) {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return hash
}

// The createPerson() options someone can pick in the avatar builder, with every allowed value —
// the same fields as the kit's own "Build a person" panel.
export const AVATAR_FIELDS = [
  { key: 'gender', label: 'Body', values: ['man', 'woman'] },
  { key: 'skin', label: 'Skin tone', values: kit.palettes.SKIN, color: true },
  { key: 'hair', label: 'Hair', values: [...new Set([...kit.styles.HAIR_STYLES.woman, ...kit.styles.HAIR_STYLES.man])] },
  { key: 'hairColor', label: 'Hair colour', values: kit.palettes.HAIR, color: true },
  { key: 'eyes', label: 'Eyes', values: kit.styles.EYES },
  { key: 'mouth', label: 'Mouth', values: kit.styles.MOUTHS },
  { key: 'brows', label: 'Brows', values: kit.styles.BROWS },
  { key: 'extras', label: 'Extra', values: kit.styles.EXTRAS },
  { key: 'shirt', label: 'Top', values: kit.palettes.SHIRT, color: true },
  { key: 'pants', label: 'Bottom', values: kit.palettes.PANTS, color: true },
  { key: 'skirt', label: 'Skirt', values: [false, true] },
] as const satisfies readonly { key: keyof PersonOptions; label: string; values: readonly unknown[]; color?: boolean }[]

// Someone's character: their saved look, over the look picked from their id for anything they
// haven't saved. Only values the kit knows are taken, so an old or hand-edited saved look can't
// break the scene.
export function avatarOptions(userId: string, saved: OfficeAvatar | null | undefined): PersonOptions {
  const options: PersonOptions = kit.randomPersonOptions(hashSeed(userId))
  if (!saved) return options
  const picked = options as Record<string, unknown>
  for (const field of AVATAR_FIELDS) {
    const value = saved[field.key]
    if ((field.values as readonly unknown[]).includes(value)) picked[field.key] = value
  }
  return options
}

// Only the builder's fields, as saved to the profile.
export function toSavedAvatar(options: PersonOptions): OfficeAvatar {
  const saved: OfficeAvatar = {}
  for (const field of AVATAR_FIELDS) {
    const value = options[field.key]
    if (value !== undefined && typeof value !== 'object') saved[field.key] = value
  }
  return saved
}
