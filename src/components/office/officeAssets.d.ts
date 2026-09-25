import type * as THREE from 'three'

export type PersonMode = 'idle' | 'walk' | 'type' | 'wave'

export interface PersonOptions {
  gender?: 'man' | 'woman'
  skin?: number
  hairColor?: number
  shirt?: number
  pants?: number
  hair?: string
  eyes?: string
  mouth?: string
  brows?: string
  extras?: string | string[]
  skirt?: boolean
  pose?: 'stand' | 'sit'
  name?: string | null
  you?: boolean
  lashes?: boolean
}

export interface OfficeAssets {
  colors: Record<string, number>
  createDesk(opts?: { width?: number; depth?: number; height?: number; top?: number; frame?: number }): THREE.Group
  createChair(opts?: { color?: number; accent?: number; executive?: boolean }): THREE.Group
  createMonitor(opts?: { seed?: number }): THREE.Group
  createLaptop(opts?: { seed?: number }): THREE.Group
  createKeyboard(): THREE.Group
  createMug(opts?: { color?: number }): THREE.Group
  createPlant(opts?: { size?: number; seed?: number }): THREE.Group
  createSofa(opts?: { length?: number; color?: number; cushion?: number }): THREE.Group
  createCoffeeTable(opts?: { radius?: number }): THREE.Group
  createPantry(opts?: { width?: number }): THREE.Group
  createDivider(opts?: { width?: number; color?: number }): THREE.Group
  /** Desk + computer + chair; the chair is on +Z, facing the desk at -Z. */
  createWorkstation(opts?: { seed?: number; laptop?: boolean; mug?: boolean; chairColor?: number }): THREE.Group
  createDeskPod(opts?: { seed?: number }): THREE.Group
  createExecDesk(opts?: { width?: number; depth?: number; seed?: number; nameplate?: string | null }): THREE.Group
  createBookshelf(opts?: { width?: number; height?: number; seed?: number }): THREE.Group
  createFilingCabinet(opts?: { drawers?: number }): THREE.Group
  createWhiteboard(opts?: { width?: number; height?: number }): THREE.Group
  createGlassWall(opts?: { length?: number; height?: number; door?: { at: number; width: number } | null }): THREE.Group
  /**
   * A closed glass office, 4.4 × 5.6m by default, door on the +Z wall at x = doorAt (1.05m wide).
   * The occupant sits at (-0.2, -depth/2 + 0.86) facing +Z, towards the door.
   */
  createPrivateOffice(opts?: {
    width?: number
    depth?: number
    height?: number
    title?: string
    variant?: 'admin' | 'lead'
    seed?: number
    doorAt?: number
    rug?: number | null
  }): THREE.Group
  /** Faces +Z, origin on the floor, about 1.9 units (metres) tall. */
  createPerson(opts?: PersonOptions): THREE.Group
  setPose(person: THREE.Group, pose: 'stand' | 'sit'): void
  animatePerson(person: THREE.Group, time: number, mode?: PersonMode): void
  randomPersonOptions(seed?: number, overrides?: PersonOptions): PersonOptions
}

export function createOfficeAssets(three: typeof THREE): OfficeAssets
