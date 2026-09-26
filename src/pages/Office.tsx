import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Armchair, Crosshair, Map as MapIcon, Maximize2, MessageCircle, Mic, MicOff, Minimize2, Minus, PhoneOff, Plus, Send, Shirt } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import { fetchDirectory } from '../lib/messages'
import { isOnline } from '../lib/presence'
import { useTheme } from '../lib/theme'
import { VOICE_PAUSED_MESSAGE, fetchRelayUsage, useProximityVoice, type RelayUsage, type VoiceState } from '../lib/voice'
import {
  ALL_FLOOR,
  HEAR_RADIUS,
  NEAR_RADIUS,
  WALK_SPEED,
  buildLayout,
  canHear,
  distance,
  fetchOfficeRoster,
  floorOf,
  fetchFloorPositions,
  floorsIn,
  isFree,
  officeMembers,
  offPagePeople,
  roomAt,
  step,
  useOfficeChannel,
  saveFloorPosition,
  saveOfficeAvatar,
  type Desk,
  type OfficeAvatar,
  type Point,
} from '../lib/office'
import type { CameraApi, CameraMode } from '../components/office/OfficeScene'
import type { DirectoryUser } from '../types'
import { Avatar } from '../components/Avatar'
import { Select } from '../components/Select'

// three.js is heavy; it's only downloaded when someone actually opens the office.
const OfficeScene = lazy(() => import('../components/office/OfficeScene').then((m) => ({ default: m.OfficeScene })))
const AvatarBuilder = lazy(() => import('../components/office/AvatarBuilder').then((m) => ({ default: m.AvatarBuilder })))

const EMOTES = ['👋', '👍', '😂', '🎉', '☕']
// Screen-relative: "up" walks away from the camera, whichever way it's been turned.
const MOVE_KEYS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
}
// Walking broadcasts at most this often; other people's avatars ease between updates.
const MOVE_SEND_MS = 90
// The side panel (who's nearby) only needs your position a few times a second, not every frame.
const POS_UI_MS = 150
// How often your position is written to the shared map while you walk (and always when you stop).
const SAVE_POS_MS = 1_000

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function Office() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const { openChatWith } = useMessaging()
  const { data: directory = [], isLoading } = useQuery({
    queryKey: ['directory'],
    queryFn: fetchDirectory,
    refetchInterval: 30_000,
  })

  // Who's on which floor comes from office_roster(), which is the same for everyone looking at a
  // floor; directory() only adds who's online. (undefined: loading; null: not deployed yet.)
  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ['office-roster'],
    queryFn: fetchOfficeRoster,
    refetchInterval: 5 * 60_000,
  })
  const floors = useMemo(() => (roster ? floorsIn(roster) : []), [roster])
  const meInRoster = roster?.find((u) => u.id === user?.id)
  const homeFloor = roster === null ? ALL_FLOOR : roster && meInRoster ? floorOf(meInRoster, roster) : null
  // Admins can visit any floor; everyone else stays on their own.
  const canSwitchFloor = user?.role === 'admin' && floors.length > 1
  const [pickedFloor, setPickedFloor] = useState<string | null>(null)
  const floor = canSwitchFloor && pickedFloor && floors.some((f) => f.key === pickedFloor) ? pickedFloor : homeFloor
  const floorLabel = floors.find((f) => f.key === floor)?.label ?? null

  const floorPeople = useMemo<DirectoryUser[]>(() => {
    if (roster === null) return officeMembers(directory)
    if (!roster || !floor) return []
    const online = new Map(directory.map((u) => [u.id, u.last_seen_at]))
    return roster
      .filter((u) => floorOf(u, roster) === floor)
      .map((u) => ({ ...u, is_active: true, is_bot: false, email: null, last_seen_at: online.get(u.id) ?? null }))
  }, [roster, floor, directory])
  const members = useMemo(() => officeMembers(floorPeople), [floorPeople])
  // The floor plan only depends on who's on the floor, not on their online status, so the
  // half-minute directory refresh doesn't rebuild every desk.
  const layoutKey = members.map((u) => `${u.id}:${u.role}:${u.name}`).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => buildLayout(members), [layoutKey])
  const usersById = useMemo(() => new Map([...directory, ...floorPeople].map((u) => [u.id, u])), [directory, floorPeople])
  const myDesk = useMemo(() => layout.desks.find((d) => d.ownerId === user?.id) ?? null, [layout, user?.id])

  // Your own position lives in a ref: the 3D scene reads it every frame, and `pos` is a throttled
  // copy for the side panel.
  const posRef = useRef<Point | null>(null)
  const [pos, setPos] = useState<Point | null>(null)
  const targetRef = useRef<Point | null>(null)
  // The shared map: where everyone on this floor last stood, the same rows for every viewer.
  // Re-read every few seconds, so the office stays the same for everyone even when someone's live
  // channel isn't getting through. (Disabled on the no-roster fallback floor, which has no rows.)
  const { data: storedPositions, isLoading: positionsLoading } = useQuery({
    queryKey: ['office-positions', floor],
    queryFn: () => fetchFloorPositions(floor!),
    enabled: Boolean(floor) && floor !== ALL_FLOOR,
    refetchInterval: 3_000,
  })

  const ready = Boolean(floor) && !rosterLoading && !positionsLoading && directory.length > 0
  // On arriving on a floor you're put back where you last stood there on the shared map, or else at
  // your own desk (the lounge, when visiting).
  const placedOnFloor = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!ready || !floor || !user || placedOnFloor.current === floor) return
    placedOnFloor.current = floor
    const stored = storedPositions?.get(user.id)
    const start =
      (stored && isFree(layout, stored) ? { x: stored.x, y: stored.y } : null) ??
      myDesk?.seat ?? { x: layout.lounge.x + layout.lounge.w / 2, y: layout.lounge.y + layout.lounge.h - 20 }
    posRef.current = start
    targetRef.current = null
    setPos(start)
  }, [ready, floor, user, myDesk, layout, storedPositions])

  // Writes your position to the shared map: while walking (throttled in the movement loop), when you
  // stop, and when the tab closes mid-walk.
  const rememberPosition = useRef<(p: Point) => void>(() => {})
  useLayoutEffect(() => {
    rememberPosition.current = (p) => {
      if (floor && floor !== ALL_FLOOR && placedOnFloor.current === floor) void saveFloorPosition(floor, p)
    }
  }, [floor])
  useEffect(() => {
    const onHide = () => {
      if (posRef.current) rememberPosition.current(posRef.current)
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])
  const getMyPos = useCallback(() => posRef.current ?? { x: -9999, y: -9999 }, [])
  const layoutRef = useRef(layout)
  useLayoutEffect(() => {
    layoutRef.current = layout
  }, [layout])
  const getLayout = useCallback(() => layoutRef.current, [])

  // Everyone's saved characters, from the roster. Yours is overridden locally right after a save,
  // until the roster refetch catches up.
  const queryClient = useQueryClient()
  const avatars = useMemo(() => new Map((roster ?? []).map((u) => [u.id, u.office_avatar ?? null])), [roster])
  const [justSaved, setJustSaved] = useState<OfficeAvatar | null>(null)
  const savedAvatar = justSaved ?? (user ? avatars.get(user.id) ?? null : null)
  const savedAvatarKey = JSON.stringify(savedAvatar)

  // The avatar builder: `draft` is non-null while it's open, and previews on your character.
  const [draft, setDraft] = useState<OfficeAvatar | null>(null)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const saveAvatar = async (avatar: OfficeAvatar) => {
    setSavingAvatar(true)
    setAvatarError(null)
    try {
      await saveOfficeAvatar(avatar)
      setJustSaved(avatar)
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ['office-roster'] })
    } catch (err) {
      setAvatarError(errorMessage(err, "Couldn't save your avatar."))
    } finally {
      setSavingAvatar(false)
    }
  }

  // Proximity voice (lib/voice): opt-in, and your mic is only ever sent to people in earshot.
  const [voiceOn, setVoiceOn] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  // This month's relay data. Voice pauses once it nears the free tier (see the turn-credentials
  // edge function), including for anyone already in a call when it does.
  const { data: relayUsage } = useQuery({ queryKey: ['voice-relay-usage'], queryFn: fetchRelayUsage, refetchInterval: 10 * 60_000 })
  const voicePaused = relayUsage?.paused === true
  useEffect(() => {
    if (voicePaused) setVoiceOn(false)
  }, [voicePaused])

  // Joining waits for the starting position so you never appear at 0,0.
  const identity = useMemo(
    () => (user && ready ? { id: user.id, name: user.name, avatar_url: user.avatar_url, avatar: savedAvatar, voice: voiceOn, muted: micMuted } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, ready, savedAvatarKey, voiceOn, micMuted],
  )
  const { players, bubbles, chat, connection, sendMove, syncPresence, say, sendVoiceSignal, onVoiceSignal } = useOfficeChannel(
    identity,
    ready ? floor : null,
    getMyPos,
    getLayout,
  )
  // A newly saved look, or joining/leaving/muting voice, goes out in presence straight away.
  const presenceKey = `${savedAvatarKey}|${voiceOn}|${micMuted}`
  const sentPresenceKey = useRef(presenceKey)
  useEffect(() => {
    if (sentPresenceKey.current === presenceKey) return
    sentPresenceKey.current = presenceKey
    if (posRef.current) syncPresence(posRef.current)
  }, [presenceKey, syncPresence])

  const [mode, setMode] = useState<CameraMode>('follow')
  const [expanded, setExpanded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const yawRef = useRef(0)
  const cameraApi = useRef<CameraApi | null>(null)

  // Movement: keyboard (WASD / arrows) or click-to-walk, driven by one requestAnimationFrame loop.
  const keysRef = useRef(new Set<string>())

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (MOVE_KEYS[key]) {
        e.preventDefault()
        keysRef.current.add(key)
        targetRef.current = null
        setMode('follow')
      }
    }
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
    const clear = () => keysRef.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let lastSent = 0
    let lastUi = 0
    let lastSaved = 0
    let moving = false
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const from = posRef.current
      if (from) {
        let input = { x: 0, y: 0 }
        for (const key of keysRef.current) {
          input = { x: input.x + MOVE_KEYS[key].x, y: input.y + MOVE_KEYS[key].y }
        }
        // Rotate the key input by the camera's heading so "up" is always "away from the camera".
        const yaw = yawRef.current
        let dir = {
          x: Math.cos(yaw) * input.x + Math.sin(yaw) * input.y,
          y: -Math.sin(yaw) * input.x + Math.cos(yaw) * input.y,
        }
        const target = targetRef.current
        if (input.x === 0 && input.y === 0 && target) {
          const d = distance(from, target)
          if (d < 2) targetRef.current = null
          else dir = { x: (target.x - from.x) / d, y: (target.y - from.y) / d }
        }
        const len = Math.hypot(dir.x, dir.y)
        let next = from
        if (len > 1e-6) {
          const dist = Math.min(WALK_SPEED * dt, target && keysRef.current.size === 0 ? distance(from, target) : Infinity)
          next = step(from, (dir.x / len) * dist, (dir.y / len) * dist, layoutRef.current)
          // Walked into furniture on the way to a clicked spot: give up rather than grind against it.
          if (distance(next, from) < 0.01) targetRef.current = null
        }
        if (distance(next, from) > 0.01) {
          posRef.current = next
          moving = true
          if (now - lastSent > MOVE_SEND_MS) {
            lastSent = now
            sendMove(next)
          }
          if (now - lastUi > POS_UI_MS) {
            lastUi = now
            setPos(next)
          }
          if (now - lastSaved > SAVE_POS_MS) {
            lastSaved = now
            rememberPosition.current(next)
          }
        } else if (moving) {
          moving = false
          setPos(from)
          sendMove(from)
          syncPresence(from)
          rememberPosition.current(from)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [sendMove, syncPresence])

  const walkTo = useCallback((p: Point) => {
    targetRef.current = p
    setMode('follow')
  }, [])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTyping(e.target)) setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // Inside a private office, "nearby" is everyone in the room; out on the floor, it's distance.
  const nearby = useMemo(
    () =>
      pos
        ? [...players.values()]
          .filter((p) => canHear(layout, p, pos, NEAR_RADIUS))
          .sort((a, b) => distance(a, pos) - distance(b, pos))
        : [],
    [players, pos, layout],
  )
  const myRoomIndex = pos ? roomAt(layout, pos) : -1
  const myRoom = myRoomIndex >= 0 ? layout.rooms[myRoomIndex] : null
  const nearIds = useMemo(() => new Set(nearby.map((p) => p.id)), [nearby])

  // Who you're talking to: everyone in voice you could hear, louder the closer they are (everyone in
  // your private office at full volume).
  const voiceWanted = useMemo(() => {
    const wanted = new Map<string, number>()
    if (!voiceOn || !pos) return wanted
    const inRoom = roomAt(layout, pos) >= 0
    for (const p of players.values()) {
      if (!p.voice || !canHear(layout, p, pos, HEAR_RADIUS)) continue
      const fade = Math.min(1, Math.max(0, (distance(p, pos) - HEAR_RADIUS / 3) / (HEAR_RADIUS * (2 / 3))))
      wanted.set(p.id, inRoom ? 1 : 1 - fade * 0.8)
    }
    return wanted
  }, [voiceOn, pos, players, layout])
  const voice = useProximityVoice({
    myId: user?.id ?? null,
    enabled: voiceOn,
    muted: micMuted,
    wanted: voiceWanted,
    sendSignal: sendVoiceSignal,
    onSignal: onVoiceSignal,
  })
  // A microphone that couldn't start takes you back out of voice (the panel shows why).
  useEffect(() => {
    if (voice.state === 'error') setVoiceOn(false)
  }, [voice.state])
  const firstName = (id: string) => players.get(id)?.name.split(/\s+/)[0] ?? 'Someone'
  const talkingTo = [...voice.connected].map(firstName)
  // In range and in voice, but not connected (yet): calls are retried every few seconds.
  const connectingTo = voice.state === 'on' ? [...voiceWanted.keys()].filter((id) => !voice.connected.has(id)).map(firstName) : []

  // Who's physically in the office, as a value that only changes when someone arrives or leaves —
  // not on every step — so the memoised desks don't re-render while people walk around.
  const presentKey = [...players.keys()].sort().join(',')
  const presentIds = useMemo(() => new Set(presentKey ? presentKey.split(',') : []), [presentKey])

  // Around but not live on this page: the scene draws them from the shared map.
  const offPageCount = user ? offPagePeople(layout, usersById, presentIds, storedPositions ?? null, user.id).length : 0

  const selectedUser = selectedId ? usersById.get(selectedId) ?? null : null
  const selectedPlayer = selectedId ? players.get(selectedId) ?? null : null
  const selectedDesk = selectedId ? layout.desks.find((d) => d.ownerId === selectedId) ?? null : null

  return (
    <div className={expanded ? 'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gray-50 p-3 sm:p-4' : 'flex h-full flex-col'}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Office
            {floorLabel && <span className="font-medium text-gray-400"> · {floorLabel}</span>}
          </h1>
          <p className="text-sm text-gray-500">
            <span className="hidden sm:inline">Walk with WASD / arrow keys or click the floor. Drag to turn the camera, scroll to zoom.</span>
            <span className="sm:hidden">Tap the floor to walk. Drag to turn the camera, pinch to zoom.</span> Walk up to people to chat.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSwitchFloor && floor && (
            <Select
              value={floor}
              onChange={setPickedFloor}
              options={floors.map((f) => ({ value: f.key, label: f.label }))}
              aria-label="Floor"
            />
          )}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <ToolButton label="Zoom out" onClick={() => cameraApi.current?.zoom(1.25)}>
              <Minus className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Zoom in" onClick={() => cameraApi.current?.zoom(0.8)}>
              <Plus className="h-4 w-4" />
            </ToolButton>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <ToolButton label="Follow me" onClick={() => setMode('follow')} active={mode === 'follow'}>
              <Crosshair className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Whole office view" onClick={() => setMode('overview')} active={mode === 'overview'}>
              <MapIcon className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              label="Customize avatar"
              active={draft !== null}
              onClick={() => {
                setAvatarError(null)
                setDraft((d) => (d ? null : savedAvatar ?? {}))
              }}
            >
              <Shirt className="h-4 w-4" />
            </ToolButton>
            {myDesk && (
              <ToolButton label="Go to my desk" onClick={() => walkTo(myDesk.seat)}>
                <Armchair className="h-4 w-4" />
              </ToolButton>
            )}
            <ToolButton label={expanded ? 'Exit full screen (Esc)' : 'Expand map'} onClick={() => setExpanded((v) => !v)}>
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </ToolButton>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* `isolate` keeps the 3D labels' z-indexes from escaping above the app's menus and modals. */}
        <div className="relative isolate min-h-[60vh] flex-1 touch-none lg:min-h-[520px] overflow-hidden rounded-xl border border-gray-200 bg-gray-100 select-none">
          {(isLoading || !user || !pos) && <div className="absolute inset-0 flex items-center justify-center text-gray-400">Loading office...</div>}
          {user && pos && (
            <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-gray-400">Loading 3D office...</div>}>
              <OfficeScene
                layout={layout}
                dark={theme === 'dark'}
                me={{ id: user.id, name: user.name, avatar_url: user.avatar_url, avatar: draft ?? savedAvatar, voice: voiceOn ? (micMuted ? 'muted' : 'on') : null }}
                posRef={posRef}
                yawRef={yawRef}
                apiRef={cameraApi}
                mode={mode}
                players={players}
                presentIds={presentIds}
                usersById={usersById}
                avatars={avatars}
                positions={storedPositions ?? null}
                bubbles={bubbles}
                nearIds={nearIds}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onWalk={walkTo}
              />
            </Suspense>
          )}

          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
            <span
              className={`h-2 w-2 rounded-full ${connection.state === 'live' ? 'bg-status-success-text' : connection.state === 'error' ? 'bg-status-danger-text' : 'bg-gray-400'}`}
              title={connection.state === 'live' ? 'Live' : connection.state === 'error' ? `Not connected: ${connection.reason}` : 'Connecting...'}
            />
            {connection.state === 'error' && (
              <span className="text-status-danger-text">Not connected ({connection.reason}), others can't see you move ·</span>
            )}
            {players.size + 1} in the office · {offPageCount} online elsewhere · {members.length - layout.rooms.length} {members.length - layout.rooms.length === 1 ? 'desk' : 'desks'} · {layout.rooms.length} {layout.rooms.length === 1 ? 'office' : 'offices'}
          </div>
        </div>

        {draft && user ? (
          <Suspense fallback={<div className="shrink-0 lg:w-72" />}>
            <AvatarBuilder
              userId={user.id}
              draft={draft}
              onChange={setDraft}
              onSave={(avatar) => void saveAvatar(avatar)}
              onCancel={() => setDraft(null)}
              saving={savingAvatar}
              error={avatarError}
            />
          </Suspense>
        ) : (
          <SidePanel
            voice={{
              state: voice.state,
              error: voice.error,
              muted: micMuted,
              talkingTo,
              connectingTo,
              hasRelay: voice.hasRelay,
              paused: voicePaused,
              usage: user?.role === 'admin' ? (relayUsage ?? null) : null,
              onJoin: () => {
                voice.clearError()
                setMicMuted(false)
                setVoiceOn(true)
              },
              onLeave: () => setVoiceOn(false),
              onToggleMute: () => setMicMuted((m) => !m),
            }}
            roomOwner={myRoom ? (myRoom.ownerId === user?.id ? 'your' : `${myRoom.ownerFirstName}'s`) : null}
            nearby={nearby}
            chat={chat}
            myId={user?.id ?? null}
            selected={selectedUser}
            selectedHere={Boolean(selectedPlayer)}
            onSay={(text) => say(text)}
            onEmote={(emoji, to) => say(emoji, 'emote', to)}
            onMessage={(u) => openChatWith(u.id, u.name)}
            onWalkTo={(id) => {
              const target = players.get(id) ?? (layout.desks.find((d) => d.ownerId === id)?.seat ?? null)
              if (target) walkTo(target)
            }}
            onSelect={setSelectedId}
            selectedDesk={selectedDesk}
          />
        )}
      </div>
    </div>
  )
}

function ToolButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md ${active ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  )
}

// Admin-only: how much of this month's call data (TURN relay) has been used.
function RelayUsageMeter({ usage }: { usage: RelayUsage }) {
  if (usage.usedGb === null) {
    return <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-status-warning-text">Call data: {usage.error ?? 'unknown'}</p>
  }
  const share = Math.min(1, usage.usedGb / usage.limitGb)
  const used = usage.usedGb < 10 ? usage.usedGb.toFixed(2) : usage.usedGb.toFixed(1)
  return (
    <div className="mt-3 border-t border-gray-100 pt-2" title="Relay data for voice calls this month. Voice pauses at the limit, before Cloudflare starts charging at 1,000 GB.">
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>Call data this month</span>
        <span className="font-semibold text-gray-700">
          {used} / {usage.limitGb} GB
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${share >= 0.9 ? 'bg-status-danger-text' : share >= 0.7 ? 'bg-status-warning-text' : 'bg-status-success-text'}`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  )
}

function SidePanel({
  voice,
  roomOwner,
  nearby,
  chat,
  myId,
  selected,
  selectedHere,
  selectedDesk,
  onSay,
  onEmote,
  onMessage,
  onWalkTo,
  onSelect,
}: {
  voice: {
    state: VoiceState
    error: string | null
    muted: boolean
    // First names of the people you're connected to right now, and of those in range still connecting.
    talkingTo: string[]
    connectingTo: string[]
    // Whether a TURN relay is available for calls that can't connect directly.
    hasRelay: boolean
    // The monthly call data cap was reached, so nobody can join until next month.
    paused: boolean
    // This month's relay data, shown to admins only.
    usage: RelayUsage | null
    onJoin: () => void
    onLeave: () => void
    onToggleMute: () => void
  }
  // Whose private office you're standing in ("your" or "Ana's"), if any.
  roomOwner: string | null
  nearby: { id: string; name: string; avatar_url: string | null }[]
  chat: { key: string; userId: string; name: string; text: string }[]
  myId: string | null
  selected: DirectoryUser | null
  selectedHere: boolean
  selectedDesk: Desk | null
  onSay: (text: string) => void
  onEmote: (emoji: string, to?: string) => void
  onMessage: (u: { id: string; name: string }) => void
  onWalkTo: (id: string) => void
  onSelect: (id: string | null) => void
}) {
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [chat.length])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSay(text.slice(0, 140))
    setDraft('')
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400">Voice</h2>
          {voice.state === 'on' && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-status-success-text">
              <span className="h-1.5 w-1.5 rounded-full bg-status-success-text" /> On
            </span>
          )}
        </div>
        {voice.state === 'off' || voice.state === 'error' ? (
          <>
            <p className="mt-1 text-xs text-gray-500">Talk to whoever is near you. Your mic is only heard by people in earshot.</p>
            {voice.paused ? (
              <p className="mt-1 text-xs text-status-warning-text">{VOICE_PAUSED_MESSAGE}</p>
            ) : (
              voice.error && <p className="mt-1 text-xs text-status-danger-text">{voice.error}</p>
            )}
            <button
              type="button"
              onClick={voice.onJoin}
              disabled={voice.paused}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              <Mic className="h-4 w-4" /> Join voice
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-500">
              {voice.state === 'starting'
                ? 'Starting your microphone...'
                : voice.talkingTo.length
                  ? `Talking with ${voice.talkingTo.join(', ')}`
                  : voice.connectingTo.length
                    ? null
                    : 'Nobody in voice near you. Walk up to someone who has joined.'}
            </p>
            {voice.connectingTo.length > 0 && (
              <p className="mt-1 text-xs text-status-warning-text">
                Connecting to {voice.connectingTo.join(', ')}...
                {!voice.hasRelay && ' If this never connects, your networks may block direct calls (it needs a TURN relay).'}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={voice.onToggleMute}
                aria-pressed={voice.muted}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-sm font-semibold ${
                  voice.muted ? 'border-status-danger-text text-status-danger-text' : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {voice.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {voice.muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={voice.onLeave}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                <PhoneOff className="h-4 w-4" /> Leave
              </button>
            </div>
          </>
        )}
        {voice.usage && <RelayUsageMeter usage={voice.usage} />}
      </section>

      {selected && selected.id !== myId && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <Avatar name={selected.name} photoUrl={selected.avatar_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900">{selected.name}</div>
              <div className="text-xs text-gray-500">
                <span className="capitalize">{selected.role}</span> ·{' '}
                {selectedHere ? 'In the office' : isOnline(selected.last_seen_at) ? 'Working at their desk' : 'Offline'}
              </div>
            </div>
            <button type="button" onClick={() => onSelect(null)} className="text-xs text-gray-400 hover:text-gray-700" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onMessage(selected)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Message
            </button>
            {(selectedHere || selectedDesk) && (
              <button
                type="button"
                onClick={() => onWalkTo(selected.id)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                {selectedHere ? 'Walk over' : 'Go to desk'}
              </button>
            )}
            {selectedHere && (
              <button
                type="button"
                onClick={() => onEmote('👋', selected.id)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                👋 Wave
              </button>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400">Nearby ({nearby.length})</h2>
        {roomOwner && (
          <p className="mb-2 rounded-lg bg-accent-bg px-2.5 py-1.5 text-xs font-medium text-accent-foreground">
            You're in {roomOwner} office. Only people in this room can hear you.
          </p>
        )}
        {nearby.length === 0 ? (
          <p className="text-xs text-gray-500">{roomOwner ? 'Nobody else is in here.' : 'Nobody close by. Walk up to someone to talk.'}</p>
        ) : (
          <ul className="space-y-1">
            {nearby.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-gray-100"
                >
                  <Avatar name={p.name} photoUrl={p.avatar_url} size={28} />
                  <span className="truncate text-sm font-medium text-gray-800">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex min-h-[220px] flex-1 flex-col rounded-xl border border-gray-200 bg-white">
        <h2 className="px-4 pt-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400">Nearby chat</h2>
        <div ref={logRef} className="flex-1 space-y-1.5 overflow-y-auto px-4 py-2">
          {chat.length === 0 && <p className="text-xs text-gray-500">Only people close to you hear what you say here.</p>}
          {chat.map((line) => (
            <div key={line.key} className="text-xs">
              <span className={`font-semibold ${line.userId === myId ? 'text-accent' : 'text-gray-800'}`}>
                {line.userId === myId ? 'You' : line.name.split(/\s+/)[0]}:
              </span>{' '}
              <span className="break-words text-gray-600">{line.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1 border-t border-gray-200 px-3 pt-2">
          {EMOTES.map((e) => (
            <button key={e} type="button" onClick={() => onEmote(e)} className="rounded-md px-1.5 py-0.5 text-base hover:bg-gray-100" aria-label={`Send ${e}`}>
              {e}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
            maxLength={140}
            placeholder="Say something..."
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg bg-accent p-2 text-accent-foreground disabled:opacity-50" disabled={!draft.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>
    </aside>
  )
}
