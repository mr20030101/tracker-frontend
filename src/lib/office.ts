import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './api'
import { isOnline } from './presence'
import type { VoiceSignalMessage } from './voice'
import type { DirectoryUser } from '../types'

// The floor plan is laid out in pixels. The 3D kit (components/office/officeAssets) works in metres,
// and the plan is sized to match it: an 80px desk is the kit's 1.2m desk.
export const PX_PER_M = 200 / 3
const m = (metres: number) => metres * PX_PER_M

export const AVATAR_R = 16
// Anyone inside NEAR_RADIUS shows up in the "Nearby" list; chat carries a little further so a
// conversation doesn't cut out the moment someone takes a step back.
export const NEAR_RADIUS = 160
export const HEAR_RADIUS = 240
export const WALK_SPEED = 200 // px per second
export const BUBBLE_MS = 5000
// Overridable so local previews and tests can use their own room instead of the real office.
const CHANNEL = import.meta.env.VITE_OFFICE_CHANNEL || 'virtual-office'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Desk {
  // A CB's workstation in a pod, or the executive desk in an admin's or lead's private office.
  kind: 'desk' | 'office'
  rect: Rect
  seat: Point
  // Which side of the desk the chair is on, so the monitor can be drawn on the opposite edge.
  facing: 'up' | 'down'
  ownerId: string | null
}

// An admin's or lead's glass-walled office (the kit's createPrivateOffice), door facing the desks.
export interface PrivateOffice {
  rect: Rect
  ownerId: string
  ownerFirstName: string
  // Shown on the door sign and the desk nameplate, e.g. "Ana · Lead".
  title: string
  variant: 'admin' | 'lead'
}

// Everything that isn't a desk. Pieces are named for the kit model they're drawn with.
export type LoungeItemKind = 'couch' | 'table' | 'plant' | 'pantry' | 'rug'

export interface LoungeItem {
  kind: LoungeItemKind
  rect: Rect
}

export interface OfficeLayout {
  width: number
  height: number
  lounge: Rect
  loungeItems: LoungeItem[]
  deskArea: Rect
  // Each 2x2 cluster of desks, for drawing the privacy divider down its middle.
  pods: Rect[]
  rooms: PrivateOffice[]
  desks: Desk[]
  obstacles: Rect[]
}

const MARGIN = 60
const MIN_WIDTH = 960
const LOUNGE_H = m(5)
const DESK_W = 80
const DESK_H = 46
// How far a seat is from the desk edge: where the kit puts its chair (0.27m out), so someone
// standing on their seat is sitting in the chair.
const SEAT_GAP = 19
// A pod is 2x2 desks pushed together, chairs on the outside. Pods are spaced wide enough that
// two people sitting back to back in neighbouring rows still leave a walkable aisle between them.
const POD_W = DESK_W * 2
const POD_H = DESK_H * 2
const POD_GAP_X = 120
const POD_GAP_Y = 170

// The kit's private office, in metres: 4.4 × 5.6 with a 1.05m door. Rooms are placed turned
// round (door to the north, facing the desks), so the kit's positions are mirrored here.
const ROOM_W = 4.4
const ROOM_D = 5.6
const ROOM_GAP = 0.8
const DOOR_W = 1.05
const WALL = 0.1

// Everyone who gets a desk: real, enabled accounts, ordered by name so desks are predictable.
export function officeMembers(directory: DirectoryUser[]): DirectoryUser[] {
  return directory.filter((u) => u.is_active && !u.is_bot).sort((a, b) => a.name.localeCompare(b.name))
}

// One row of office_roster(): the people on the caller's floor(s), the same list for everyone
// looking at a floor (see supabase/schema.sql).
export interface RosterUser {
  id: string
  name: string
  role: DirectoryUser['role']
  avatar_url: string | null
  lead_id: string | null
  // Older databases' office_roster() doesn't return it yet.
  office_avatar?: OfficeAvatar | null
}

// null when the database doesn't have office_roster() yet; the page then falls back to one
// floor built from directory(), which only lines up for people who see the whole directory.
export async function fetchOfficeRoster(): Promise<RosterUser[] | null> {
  const { data, error } = await supabase.rpc('office_roster')
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null
    throw error
  }
  return (data ?? []) as RosterUser[]
}

// Saves your own Office character; null goes back to the automatic look.
export async function saveOfficeAvatar(avatar: OfficeAvatar | null): Promise<void> {
  const { error } = await supabase.rpc('set_office_avatar', { new_avatar: avatar })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error("Avatars can't be saved yet: the database needs the latest supabase/schema.sql.")
    }
    throw error
  }
}

// Floors: one per lead's team (keyed by the lead's id), 'none' for contributors without a lead,
// and 'admin' for admins who don't lead a team. An admin whom contributors report to leads that
// team's floor instead.
export const NO_LEAD_FLOOR = 'none'
export const ADMIN_FLOOR = 'admin'
// The single floor used while office_roster() isn't in the database yet.
export const ALL_FLOOR = 'all'

export function floorOf(user: RosterUser, roster: RosterUser[]): string {
  if (user.role === 'contributor') return user.lead_id ?? NO_LEAD_FLOOR
  if (user.role === 'lead') return user.id
  return roster.some((u) => u.role === 'contributor' && u.lead_id === user.id) ? user.id : ADMIN_FLOOR
}

export interface Floor {
  key: string
  label: string
}

export function floorsIn(roster: RosterUser[]): Floor[] {
  const keys = [...new Set(roster.map((u) => floorOf(u, roster)))]
  const byId = new Map(roster.map((u) => [u.id, u]))
  const label = (key: string) =>
    key === ADMIN_FLOOR ? 'Admin floor' : key === NO_LEAD_FLOOR ? 'No lead' : `${byId.get(key)?.name ?? 'Former lead'}'s team`
  return keys.map((key) => ({ key, label: label(key) })).sort((a, b) => a.label.localeCompare(b.label))
}

const isExec = (u: DirectoryUser) => u.role === 'admin' || u.role === 'lead'

// Walls (with the door gap) and the furniture inside one private office, as floor-plan rectangles.
// Positions follow createPrivateOffice in the kit, turned 180°: its local (x, z) is (-x, -z) here.
function roomParts(room: PrivateOffice): { obstacles: Rect[]; desk: Desk } {
  const cx = room.rect.x + room.rect.w / 2
  const cy = room.rect.y + room.rect.h / 2
  // A rectangle centred at (x, z) metres from the room's centre.
  const at = (x: number, z: number, w: number, d: number): Rect => ({ x: cx + m(x - w / 2), y: cy + m(z - d / 2), w: m(w), h: m(d) })
  const hw = ROOM_W / 2
  const hd = ROOM_D / 2
  const doorX = -1 // the kit's doorAt (1.0), mirrored
  const northLeft = doorX - DOOR_W / 2 + hw
  const northRight = hw - (doorX + DOOR_W / 2)
  const obstacles = [
    at(-hw + northLeft / 2, -hd, northLeft, WALL),
    at(hw - northRight / 2, -hd, northRight, WALL),
    at(0, hd, ROOM_W, WALL),
    at(-hw, 0, WALL, ROOM_D),
    at(hw, 0, WALL, ROOM_D),
    at(0.2, hd - 0.22, 2.2, 0.34), // bookshelf
    at(-(hw - 0.4), hd - 0.4, 0.5, 0.5), // plant
    ...(room.variant === 'admin'
      ? [at(hw - 0.35, hd - 0.95, 0.55, 0.95), at(hw - 0.5, -(hd - 1.3), 0.8, 1.6)] // filing cabinets, sofa
      : [at(hw - 1.1, -(hd - 1.2), 0.9, 0.9)]), // meeting table
  ]
  const deskRect = at(0.2, hd - 1.55, 1.8, 0.85)
  obstacles.push(deskRect)
  return {
    obstacles,
    // The executive chair is south of the desk; sitting there faces north, towards the door.
    desk: { kind: 'office', rect: deskRect, seat: { x: cx + m(0.2), y: cy + m(hd - 0.86) }, facing: 'up', ownerId: room.ownerId },
  }
}

// The floor plan grows with headcount: more CBs means more pods, laid out in a roughly landscape
// grid, and every admin and lead gets a private office in a row along the south side. The lounge
// stretches to match the width.
export function buildLayout(members: DirectoryUser[]): OfficeLayout {
  const execs = members.filter(isExec).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1))
  const cbs = members.filter((u) => !isExec(u))
  // The admin floor has offices only; a team floor always has at least one pod.
  const podCount = cbs.length ? Math.ceil(cbs.length / 4) : execs.length ? 0 : 1
  const cols = podCount ? Math.min(podCount, Math.max(2, Math.ceil(Math.sqrt(podCount * 1.6)))) : 0
  const rows = cols ? Math.ceil(podCount / cols) : 0

  const podsWidth = cols ? cols * POD_W + (cols - 1) * POD_GAP_X : 0
  const roomPitch = m(ROOM_W + ROOM_GAP)
  const width = Math.max(MIN_WIDTH, podsWidth + MARGIN * 2 + 80, Math.min(execs.length, 4) * roomPitch - m(ROOM_GAP) + MARGIN * 2 + m(1))
  const deskTop = MARGIN + LOUNGE_H + 60 + SEAT_GAP + AVATAR_R
  const podsHeight = rows ? rows * POD_H + (rows - 1) * POD_GAP_Y : 0
  const podsBottom = deskTop + podsHeight + SEAT_GAP + AVATAR_R
  const podsLeft = (width - podsWidth) / 2

  // Private offices: as many per row as fit, rows centred, a wide aisle between them and the desks.
  const perRow = Math.max(1, Math.floor((width - MARGIN * 2 - m(1) + m(ROOM_GAP)) / roomPitch))
  const roomsTop = podsBottom + m(1.8)
  const rooms: PrivateOffice[] = execs.map((u, i) => {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, execs.length - row * perRow)
    const rowLeft = (width - (inRow * roomPitch - m(ROOM_GAP))) / 2
    const role = u.role === 'admin' ? 'Admin' : 'Lead'
    return {
      rect: { x: rowLeft + (i % perRow) * roomPitch, y: roomsTop + row * m(ROOM_D + ROOM_GAP), w: m(ROOM_W), h: m(ROOM_D) },
      ownerId: u.id,
      ownerFirstName: u.name.split(/\s+/)[0],
      title: `${u.name.split(/\s+/)[0]} · ${role}`,
      variant: u.role === 'admin' ? 'admin' : 'lead',
    }
  })
  const roomRows = Math.ceil(rooms.length / perRow)
  const height = rooms.length ? roomsTop + roomRows * m(ROOM_D + ROOM_GAP) - m(ROOM_GAP) + m(1.2) + MARGIN : podsBottom + 60 + MARGIN
  const parts = rooms.map(roomParts)

  const desks: Desk[] = []
  const pods: Rect[] = []
  for (let p = 0; p < podCount; p++) {
    const px = podsLeft + (p % cols) * (POD_W + POD_GAP_X)
    const py = deskTop + Math.floor(p / cols) * (POD_H + POD_GAP_Y)
    pods.push({ x: px, y: py, w: POD_W, h: POD_H })
    for (let d = 0; d < 4; d++) {
      const top = d < 2
      const rect = { x: px + (d % 2) * DESK_W, y: py + (top ? 0 : DESK_H), w: DESK_W, h: DESK_H }
      desks.push({
        kind: 'desk',
        rect,
        seat: { x: rect.x + DESK_W / 2, y: top ? rect.y - SEAT_GAP : rect.y + DESK_H + SEAT_GAP },
        facing: top ? 'down' : 'up',
        ownerId: cbs[p * 4 + d]?.id ?? null,
      })
    }
  }

  const lounge = { x: MARGIN, y: MARGIN, w: width - MARGIN * 2, h: LOUNGE_H }
  const cx = lounge.x + lounge.w / 2
  const plant = (x: number, y: number): LoungeItem => ({ kind: 'plant', rect: { x: x - m(0.25), y: y - m(0.25), w: m(0.5), h: m(0.5) } })
  // A 3m sofa facing a round coffee table, a 2m sofa either side, and the pantry in the corner —
  // the same arrangement as the kit's showcase office.
  const loungeItems: LoungeItem[] = [
    { kind: 'rug', rect: { x: lounge.x + m(0.3), y: lounge.y + m(0.3), w: lounge.w - m(0.6), h: lounge.h - m(0.6) } },
    { kind: 'couch', rect: { x: cx - m(1.5), y: lounge.y + m(0.5), w: m(3), h: m(0.8) } },
    { kind: 'couch', rect: { x: cx - m(2.7), y: lounge.y + m(1.6), w: m(0.8), h: m(2) } },
    { kind: 'couch', rect: { x: cx + m(1.9), y: lounge.y + m(1.6), w: m(0.8), h: m(2) } },
    { kind: 'table', rect: { x: cx - m(0.6), y: lounge.y + m(2), w: m(1.2), h: m(1.2) } },
    { kind: 'pantry', rect: { x: lounge.x + m(0.4), y: lounge.y + m(0.3), w: m(2.2), h: m(0.65) } },
    plant(lounge.x + lounge.w - m(0.5), lounge.y + m(0.5)),
    plant(lounge.x + lounge.w - m(0.5), lounge.y + lounge.h - m(0.5)),
    plant(lounge.x + m(0.5), lounge.y + lounge.h - m(0.5)),
    plant(MARGIN + m(0.5), (rooms.length ? roomsTop - m(0.9) : height - MARGIN - m(0.5))),
    plant(width - MARGIN - m(0.5), (rooms.length ? roomsTop - m(0.9) : height - MARGIN - m(0.5))),
  ]

  return {
    width,
    height,
    lounge,
    loungeItems,
    deskArea: { x: MARGIN, y: MARGIN + LOUNGE_H + 30, w: width - MARGIN * 2, h: height - (MARGIN + LOUNGE_H + 30) - MARGIN },
    pods,
    rooms,
    desks: [...desks, ...parts.map((p) => p.desk)],
    obstacles: [
      ...desks.map((d) => d.rect),
      ...loungeItems.filter((i) => i.kind !== 'rug').map((i) => i.rect),
      ...parts.flatMap((p) => p.obstacles),
    ],
  }
}

// Which private office a point is inside, or -1 for the open floor.
export function roomAt(layout: OfficeLayout, p: Point): number {
  return layout.rooms.findIndex((r) => p.x > r.rect.x && p.x < r.rect.x + r.rect.w && p.y > r.rect.y && p.y < r.rect.y + r.rect.h)
}

// Whether two people can hear each other: everyone in the same private office can, nobody through
// its walls, and on the open floor it's down to distance.
export function canHear(layout: OfficeLayout, a: Point, b: Point, radius: number): boolean {
  const room = roomAt(layout, a)
  if (room !== roomAt(layout, b)) return false
  return room >= 0 || distance(a, b) <= radius
}

function hitsRect(p: Point, r: Rect): boolean {
  const nx = Math.max(r.x, Math.min(p.x, r.x + r.w))
  const ny = Math.max(r.y, Math.min(p.y, r.y + r.h))
  return (p.x - nx) ** 2 + (p.y - ny) ** 2 < AVATAR_R ** 2
}

function blocked(p: Point, layout: OfficeLayout): boolean {
  if (p.x < AVATAR_R || p.y < AVATAR_R || p.x > layout.width - AVATAR_R || p.y > layout.height - AVATAR_R) return true
  return layout.obstacles.some((r) => hitsRect(p, r))
}

// Whether someone could stand at this spot: inside the floor, clear of furniture and walls.
export function isFree(layout: OfficeLayout, p: Point): boolean {
  return !blocked(p, layout)
}

// The shared map: where everyone last stood on a floor (office_positions in the database). Every
// viewer reads the same rows, so the office looks the same to everyone, whether or not the live
// channel is getting through. null when the database doesn't have it yet.
export interface StoredPosition extends Point {
  updatedAt: number
}

const missingFunction = (code?: string) => code === 'PGRST202' || code === '42883'

export async function fetchFloorPositions(floor: string): Promise<Map<string, StoredPosition> | null> {
  const { data, error } = await supabase.rpc('office_floor_positions', { target_floor: floor })
  if (error) {
    if (missingFunction(error.code)) return null
    throw error
  }
  const rows = (data ?? []) as { user_id: string; x: number; y: number; updated_at: string }[]
  return new Map(rows.map((r) => [r.user_id, { x: r.x, y: r.y, updatedAt: new Date(r.updated_at).getTime() }]))
}

// Someone's spot on the shared map counts as current for this long after they last moved: long
// enough to cover people whose live channel isn't getting through, short enough that someone who
// closed the tab without going offline doesn't linger.
const FRESH_MS = 60_000

export interface OffPagePerson {
  user: DirectoryUser
  at: Point
}

// Everyone to draw on the floor who isn't live on this page right now (live people come from the
// channel instead), from the shared map: floor members who are online in the tracker or moved in
// the last minute, at the spot they last stood — or at their desk if they've never moved or that
// spot is no longer free — plus visitors from other floors who moved in the last minute.
export function offPagePeople(
  layout: OfficeLayout,
  usersById: Map<string, DirectoryUser>,
  presentIds: Set<string>,
  positions: Map<string, StoredPosition> | null,
  meId: string,
): OffPagePerson[] {
  const now = Date.now()
  const fresh = (p: StoredPosition | undefined): p is StoredPosition => Boolean(p && now - p.updatedAt < FRESH_MS)
  const people: OffPagePerson[] = []
  const members = new Set<string>()
  for (const desk of layout.desks) {
    const user = desk.ownerId ? usersById.get(desk.ownerId) : undefined
    if (!user) continue
    members.add(user.id)
    if (user.id === meId || presentIds.has(user.id)) continue
    const stored = positions?.get(user.id)
    if (!isOnline(user.last_seen_at) && !fresh(stored)) continue
    people.push({ user, at: stored && isFree(layout, stored) ? { x: stored.x, y: stored.y } : desk.seat })
  }
  for (const [id, stored] of positions ?? []) {
    const user = usersById.get(id)
    if (!user || members.has(id) || id === meId || presentIds.has(id) || !fresh(stored) || !isFree(layout, stored)) continue
    people.push({ user, at: { x: stored.x, y: stored.y } })
  }
  return people
}

export async function saveFloorPosition(floor: string, p: Point): Promise<void> {
  const { error } = await supabase.rpc('set_office_position', { target_floor: floor, new_x: Math.round(p.x), new_y: Math.round(p.y) })
  if (error && !missingFunction(error.code)) console.error('Office: could not save your position', error)
}

// One movement step with wall sliding: each axis is tried on its own, so walking diagonally into
// a desk keeps you moving along its edge instead of stopping dead.
export function step(from: Point, dx: number, dy: number, layout: OfficeLayout): Point {
  let next = from
  const tryX = { x: next.x + dx, y: next.y }
  if (!blocked(tryX, layout)) next = tryX
  const tryY = { x: next.x, y: next.y + dy }
  if (!blocked(tryY, layout)) next = tryY
  return next
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// A saved Office character: the avatar builder's picks (see components/office/kit.ts), as stored
// in profiles.office_avatar.
export type OfficeAvatar = Record<string, string | number | boolean>

export interface OfficePlayer extends Point {
  id: string
  name: string
  avatar_url: string | null
  // Their character, carried in presence so it shows even for visitors from another floor.
  avatar?: OfficeAvatar | null
  // In proximity voice (see lib/voice), and whether their mic is muted.
  voice?: boolean
  muted?: boolean
  // Sender's clock at the time of this position; stale updates (a late presence sync arriving
  // after newer broadcasts) are dropped by comparing it.
  t: number
}

export interface OfficeBubble {
  key: string
  userId: string
  text: string
  kind: 'say' | 'emote'
  at: number
}

export interface OfficeChatLine {
  key: string
  userId: string
  name: string
  text: string
  at: number
}

interface SayPayload {
  id: string
  name: string
  text: string
  x: number
  y: number
  kind: 'say' | 'emote'
  to?: string
}

// Channels still closing, by topic. The Supabase client hands back an existing channel when one with
// the same topic is still in its list, so re-joining a floor before the old channel has finished
// closing (React StrictMode's mount/unmount/mount in dev, or leaving and coming straight back)
// would get the dying channel, and you'd never show up for anyone. Joining waits for these.
const closingChannels = new Map<string, Promise<unknown>>()

// One shared Realtime channel for the whole office. Presence answers "who's here and where did they
// last stop"; broadcast carries the high-frequency stuff (walking, chat, emotes) without touching
// the database. Chat is filtered on the receiving end (by distance, and by private-office walls —
// see canHear), so it's "nearby only" by convention, not a private channel.
export function useOfficeChannel(
  identity: { id: string; name: string; avatar_url: string | null; avatar: OfficeAvatar | null; voice: boolean; muted: boolean } | null,
  floor: string | null,
  getMyPos: () => Point,
  getLayout: () => OfficeLayout,
) {
  // Voice set-up messages addressed to you are handed to whoever registers here (lib/voice).
  const voiceListener = useRef<((msg: VoiceSignalMessage) => void) | null>(null)
  const [players, setPlayers] = useState<Map<string, OfficePlayer>>(new Map())
  const [bubbles, setBubbles] = useState<OfficeBubble[]>([])
  const [chat, setChat] = useState<OfficeChatLine[]>([])
  // Whether you're actually connected to the floor, and if not, why — so "nobody can see me move"
  // shows up on the page instead of failing silently.
  const [connection, setConnection] = useState<{ state: 'connecting' | 'live' | 'error'; reason?: string }>({ state: 'connecting' })
  const channelRef = useRef<RealtimeChannel | null>(null)
  const getMyPosRef = useRef(getMyPos)
  const getLayoutRef = useRef(getLayout)
  const identityRef = useRef(identity)
  useLayoutEffect(() => {
    getMyPosRef.current = getMyPos
    getLayoutRef.current = getLayout
    identityRef.current = identity
  })

  const addBubble = useCallback((userId: string, text: string, kind: OfficeBubble['kind']) => {
    const at = Date.now()
    setBubbles((prev) => [...prev.filter((b) => b.userId !== userId || b.kind !== kind), { key: `${userId}-${at}`, userId, text, kind, at }])
  }, [])

  const addChat = useCallback((userId: string, name: string, text: string) => {
    const at = Date.now()
    setChat((prev) => [...prev.slice(-49), { key: `${userId}-${at}-${Math.random()}`, userId, name, text, at }])
  }, [])

  const id = identity?.id
  useEffect(() => {
    if (!id || !floor) return
    // A channel per floor: people only get the positions and chat of the floor they're on.
    const topic = `${CHANNEL}:${floor}`
    let left = false
    let channel: RealtimeChannel | null = null

    const listen = (channel: RealtimeChannel) => channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<OfficePlayer>()
        setPlayers((prev) => {
          const next = new Map<string, OfficePlayer>()
          for (const [key, metas] of Object.entries(state)) {
            if (key === id || metas.length === 0) continue
            // Someone with the office open in more than one place has one entry per tab; use the
            // one they've moved or updated most recently, not an old tab left sitting at the desk.
            const meta = metas.reduce((a, b) => (b.t > a.t ? b : a))
            const known = prev.get(key)
            // Position from whichever is newer; name and character always from presence, which is
            // re-sent when someone saves a new look.
            const where = known && known.t > meta.t ? known : meta
            next.set(key, {
              id: meta.id,
              name: meta.name,
              avatar_url: meta.avatar_url,
              avatar: meta.avatar ?? null,
              voice: Boolean(meta.voice),
              muted: Boolean(meta.muted),
              x: where.x,
              y: where.y,
              t: where.t,
            })
          }
          return next
        })
      })
      .on('broadcast', { event: 'move' }, ({ payload }: { payload: Pick<OfficePlayer, 'id' | 'x' | 'y' | 't'> }) => {
        setPlayers((prev) => {
          const known = prev.get(payload.id)
          if (!known || payload.t < known.t) return prev
          const next = new Map(prev)
          next.set(payload.id, { ...known, x: payload.x, y: payload.y, t: payload.t })
          return next
        })
      })
      .on('broadcast', { event: 'voice' }, ({ payload }: { payload: VoiceSignalMessage }) => {
        if (payload.to === id) voiceListener.current?.(payload)
      })
      .on('broadcast', { event: 'say' }, ({ payload }: { payload: SayPayload }) => {
        const inEarshot = canHear(getLayoutRef.current(), payload, getMyPosRef.current(), HEAR_RADIUS)
        const aimedAtMe = payload.to === id
        if (!inEarshot && !aimedAtMe) return
        addBubble(payload.id, payload.text, payload.kind)
        addChat(payload.id, payload.name, payload.kind === 'emote' && aimedAtMe ? `${payload.text} (to you)` : payload.text)
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setConnection({ state: 'live' })
          const me = identityRef.current
          if (me) {
            void channel.track({ ...me, ...getMyPosRef.current(), t: Date.now() }).then((result) => {
              if (result !== 'ok') setConnection({ state: 'error', reason: `presence ${result}` })
            })
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Office: couldn't join ${topic}`, status, err)
          setConnection({ state: 'error', reason: err?.message ?? status.toLowerCase().replace('_', ' ') })
        }
      })

    const join = () => {
      if (left) return
      const ch = supabase.channel(topic, {
        config: { presence: { key: id }, broadcast: { self: false } },
      })
      channel = ch
      channelRef.current = ch
      listen(ch)
    }

    const closing = closingChannels.get(topic)
    if (closing) void closing.then(join)
    else join()

    return () => {
      left = true
      channelRef.current = null
      if (channel) {
        const removal: Promise<unknown> = supabase.removeChannel(channel).finally(() => {
          if (closingChannels.get(topic) === removal) closingChannels.delete(topic)
        })
        closingChannels.set(topic, removal)
      }
      // Leaving the floor: its people and conversation stay behind.
      setConnection({ state: 'connecting' })
      setPlayers(new Map())
      setBubbles([])
      setChat([])
    }
  }, [id, floor, addBubble, addChat])

  // Bubbles fade out on their own; one sweep a second is plenty.
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - BUBBLE_MS
      setBubbles((prev) => (prev.some((b) => b.at < cutoff) ? prev.filter((b) => b.at >= cutoff) : prev))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const sendMove = useCallback((p: Point) => {
    const me = identityRef.current
    if (!me) return
    void channelRef.current?.send({ type: 'broadcast', event: 'move', payload: { id: me.id, x: p.x, y: p.y, t: Date.now() } })
  }, [])

  // Saved into presence when you stop walking, so anyone who joins later sees you where you are.
  const syncPresence = useCallback((p: Point) => {
    const me = identityRef.current
    if (!me) return
    void channelRef.current?.track({ ...me, x: p.x, y: p.y, t: Date.now() })
  }, [])

  const say = useCallback(
    (text: string, kind: 'say' | 'emote' = 'say', to?: string) => {
      const me = identityRef.current
      if (!me) return
      const pos = getMyPosRef.current()
      const payload: SayPayload = { id: me.id, name: me.name, text, x: pos.x, y: pos.y, kind, to }
      void channelRef.current?.send({ type: 'broadcast', event: 'say', payload })
      addBubble(me.id, text, kind)
      addChat(me.id, me.name, text)
    },
    [addBubble, addChat],
  )

  const sendVoiceSignal = useCallback((msg: VoiceSignalMessage) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'voice', payload: msg })
  }, [])
  const onVoiceSignal = useCallback((listener: ((msg: VoiceSignalMessage) => void) | null) => {
    voiceListener.current = listener
  }, [])

  return { players, bubbles, chat, connection, sendMove, syncPresence, say, sendVoiceSignal, onVoiceSignal }
}
