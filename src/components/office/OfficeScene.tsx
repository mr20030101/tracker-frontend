import { createContext, memo, useContext, useEffect, useMemo, useRef, type ComponentProps, type MutableRefObject, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html as DreiHtml, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  AVATAR_R,
  BUBBLE_MS,
  NEAR_RADIUS,
  PX_PER_M,
  offPagePeople,
  roomAt,
  type Desk,
  type OfficeAvatar,
  type OfficeBubble,
  type OfficeLayout,
  type OfficePlayer,
  type Point,
  type StoredPosition,
} from '../../lib/office'
import type { DirectoryUser } from '../../types'
import { Avatar } from '../Avatar'
import { avatarOptions, hashSeed, kit } from './kit'
import type { PersonMode } from './officeAssets.js'

// The floor plan is in pixels; the 3D world is in metres (the kit's units), with the plan's
// x → world x and the plan's y → world z.
const S = PX_PER_M
const toWorld = (p: Point) => new THREE.Vector3(p.x / S, 0, p.y / S)

// The camera looks from the north-west, as in the kit's showcase: towards the private offices' doors
// (not their bookshelves) and away from the two full-height walls.
const FOLLOW_OFFSET = new THREE.Vector3(-3.5, 6, -7)
// Standing still within this many plan pixels of a desk's seat sits you down in its chair.
const SIT_RADIUS = 6

export type CameraMode = 'follow' | 'overview'
// Shown on a name tag: in proximity voice, and whether their mic is muted.
type VoiceBadge = 'on' | 'muted' | null

export interface CameraApi {
  zoom: (factor: number) => void
}

interface Palette {
  background: string
  floor: string
  grid: string
  rug: string
  wall: string
  trim: string
  ring: string
}

const LIGHT: Palette = {
  background: '#e8eaed',
  floor: '#f4f5f7',
  grid: '#e3e6ea',
  rug: '#fbefc8',
  wall: '#eceef0',
  trim: '#f2b705',
  ring: '#f2b705',
}

const DARK: Palette = {
  background: '#15171b',
  floor: '#2a2d33',
  grid: '#33373e',
  rug: '#4a4128',
  wall: '#3a3e45',
  trim: '#c99a08',
  ring: '#f2b705',
}

// drei's Html mounts into the canvas's parent until the event layer connects, then moves — which
// remounts every label once. Giving them all one fixed container from the start avoids that.
const LabelLayer = createContext<RefObject<HTMLDivElement | null> | null>(null)
function Html(props: ComponentProps<typeof DreiHtml>) {
  const layer = useContext(LabelLayer)
  return <DreiHtml {...props} portal={layer as RefObject<HTMLElement>} />
}

export interface OfficeSceneProps {
  layout: OfficeLayout
  dark: boolean
  // `avatar` is your saved character, or the builder's unsaved draft while it's open.
  me: { id: string; name: string; avatar_url: string | null; avatar: OfficeAvatar | null; voice: VoiceBadge }
  posRef: MutableRefObject<Point | null>
  // Written every frame with the camera's heading, so keyboard movement can be camera-relative.
  yawRef: MutableRefObject<number>
  apiRef: MutableRefObject<CameraApi | null>
  mode: CameraMode
  players: Map<string, OfficePlayer>
  presentIds: Set<string>
  usersById: Map<string, DirectoryUser>
  // Saved characters of the people on this floor, for those not live on the page.
  avatars: Map<string, OfficeAvatar | null>
  // The shared map: where everyone on this floor last stood (null before the database has it).
  positions: Map<string, StoredPosition> | null
  bubbles: OfficeBubble[]
  nearIds: Set<string>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onWalk: (p: Point) => void
}

export function OfficeScene(props: OfficeSceneProps) {
  const palette = props.dark ? DARK : LIGHT
  const labelLayer = useRef<HTMLDivElement>(null)
  // People who aren't live on this page are drawn from the shared map, where they last stood (see
  // offPagePeople); once they're live on the channel they're in `players` instead.
  const offPage = offPagePeople(props.layout, props.usersById, props.presentIds, props.positions, props.me.id)
  const offPageIds = new Set(offPage.map((o) => o.user.id))
  return (
    <div className="absolute inset-0">
      <div ref={labelLayer} className="pointer-events-none absolute inset-0 z-[1] overflow-hidden [&>*]:pointer-events-auto" />
      <LabelLayer.Provider value={labelLayer}>
        <Canvas shadows camera={{ fov: 40, near: 0.1, far: 300, position: [0, 10, 10] }} dpr={[1, 2]}>
          <color attach="background" args={[palette.background]} />
          <hemisphereLight args={['#ffffff', '#9aa0a6', props.dark ? 0.9 : 1.6]} />
          <Sun layout={props.layout} dark={props.dark} />
          <CameraRig {...props} />
          <Room layout={props.layout} palette={palette} onWalk={props.onWalk} onSelect={props.onSelect} />
          <Furniture layout={props.layout} />
          {props.layout.desks.map((desk, i) => (
            <DeskTag
              key={i}
              desk={desk}
              owner={desk.ownerId ? props.usersById.get(desk.ownerId) ?? null : null}
              occupied={Boolean(desk.ownerId && (props.presentIds.has(desk.ownerId) || desk.ownerId === props.me.id || offPageIds.has(desk.ownerId)))}
              mine={desk.ownerId === props.me.id}
              onSelect={props.onSelect}
            />
          ))}
          <Character
            id={props.me.id}
            name={props.me.name}
            avatarUrl={props.me.avatar_url}
            avatar={props.me.avatar}
            voice={props.me.voice}
            isMe
            getPos={() => props.posRef.current}
            desks={props.layout.desks}
            bubbles={props.bubbles}
            ring={palette.ring}
          />
          <NearRing posRef={props.posRef} layout={props.layout} color={palette.ring} />
          {[...props.players.values()].map((p) => (
            <Character
              key={p.id}
              id={p.id}
              name={p.name}
              avatarUrl={p.avatar_url}
              avatar={p.avatar ?? props.avatars.get(p.id) ?? null}
              voice={p.voice ? (p.muted ? 'muted' : 'on') : null}
              getPos={() => p}
              smooth
              desks={props.layout.desks}
              bubbles={props.bubbles}
              ring={props.selectedId === p.id ? '#38bdf8' : props.nearIds.has(p.id) ? '#34d399' : null}
              onSelect={props.onSelect}
            />
          ))}
          {offPage.map(({ user: owner, at }) => (
            <Character
              key={`map-${owner.id}`}
              id={owner.id}
              name={owner.name}
              avatarUrl={owner.avatar_url}
              avatar={props.avatars.get(owner.id) ?? null}
              getPos={() => at}
              smooth
              desks={props.layout.desks}
              bubbles={props.bubbles}
              ring={props.selectedId === owner.id ? '#38bdf8' : null}
              onSelect={props.onSelect}
            />
          ))}
        </Canvas>
      </LabelLayer.Provider>
    </div>
  )
}

// One shadow-casting light aimed at the middle of the floor, with its shadow area sized to cover the
// whole office however big it has grown.
function Sun({ layout, dark }: { layout: OfficeLayout; dark: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()
  const cx = layout.width / S / 2
  const cz = layout.height / S / 2
  const half = Math.max(layout.width, layout.height) / S / 2 + 3
  useEffect(() => {
    const l = light.current
    if (!l) return
    l.target.position.set(cx, 0, cz)
    scene.add(l.target)
    return () => {
      scene.remove(l.target)
    }
  }, [scene, cx, cz])
  return (
    <directionalLight
      ref={light}
      castShadow
      position={[cx + 8, 16, cz + 10]}
      intensity={dark ? 0.8 : 1.3}
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-half}
      shadow-camera-right={half}
      shadow-camera-top={half}
      shadow-camera-bottom={-half}
      shadow-camera-near={1}
      shadow-camera-far={80}
      shadow-bias={-0.0005}
    />
  )
}

function CameraRig({ layout, posRef, yawRef, apiRef, mode }: OfficeSceneProps) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const center = useMemo(() => new THREE.Vector3(layout.width / S / 2, 0, layout.height / S / 2), [layout.width, layout.height])

  // Snap the camera whenever the mode changes: over your shoulder, or high over the whole floor.
  useEffect(() => {
    const c = controls.current
    if (!c) return
    if (mode === 'follow') {
      const me = toWorld(posRef.current ?? { x: layout.width / 2, y: layout.height / 2 })
      c.target.copy(me).setY(0.9)
      camera.position.copy(me).add(FOLLOW_OFFSET)
    } else {
      const span = Math.max(layout.width, layout.height) / S
      c.target.copy(center)
      camera.position.set(center.x - span * 0.3, span * 0.9, center.z - span * 0.6)
    }
    c.update()
  }, [mode, camera, center, layout.width, layout.height, posRef])

  useEffect(() => {
    apiRef.current = {
      zoom: (factor) => {
        const c = controls.current
        if (!c) return
        const offset = camera.position.clone().sub(c.target)
        const length = Math.min(c.maxDistance, Math.max(c.minDistance, offset.length() * factor))
        camera.position.copy(c.target).add(offset.setLength(length))
        c.update()
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, camera])

  // Following just drags the orbit target (and the camera with it) along with you, so any rotation
  // or zoom you've set is kept while you walk.
  useFrame(() => {
    const c = controls.current
    if (!c) return
    if (mode === 'follow' && posRef.current) {
      const delta = toWorld(posRef.current).setY(0.9).sub(c.target)
      if (delta.lengthSq() > 1e-8) {
        c.target.add(delta)
        camera.position.add(delta)
        c.update()
      }
    }
    yawRef.current = c.getAzimuthalAngle()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={mode === 'overview'}
      enableDamping
      dampingFactor={0.12}
      minDistance={2}
      maxDistance={Math.max(30, (Math.max(layout.width, layout.height) / S) * 1.8)}
      maxPolarAngle={Math.PI * 0.46}
    />
  )
}

function gridTexture(palette: Palette, repeatX: number, repeatY: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = palette.floor
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = palette.grid
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Floor (a 1m grid, also the click target for walking), rug and walls. The two walls far from the
// camera (south and east) are full height with the kit's yellow stripe; the near two are low so they
// never hide anyone.
const Room = memo(function Room({
  layout,
  palette,
  onWalk,
  onSelect,
}: {
  layout: OfficeLayout
  palette: Palette
  onWalk: (p: Point) => void
  onSelect: (id: string | null) => void
}) {
  const w = layout.width / S
  const d = layout.height / S
  const floorTex = useMemo(() => gridTexture(palette, w, d), [palette, w, d])
  useEffect(() => () => floorTex.dispose(), [floorTex])
  const rug = layout.loungeItems.find((i) => i.kind === 'rug')?.rect
  const t = 0.15
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // A drag (orbiting the camera) also ends in a click; only a still click means "walk here".
    if (e.delta > 6) return
    e.stopPropagation()
    onSelect(null)
    onWalk({ x: e.point.x * S, y: e.point.z * S })
  }
  const wall = (size: [number, number, number], pos: [number, number, number]) => (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={palette.wall} roughness={0.9} />
    </mesh>
  )
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow onClick={onClick}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floorTex} roughness={0.9} />
      </mesh>
      {rug && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(rug.x + rug.w / 2) / S, 0.005, (rug.y + rug.h / 2) / S]} receiveShadow>
          <planeGeometry args={[rug.w / S, rug.h / S]} />
          <meshStandardMaterial color={palette.rug} roughness={1} />
        </mesh>
      )}
      {wall([w + t * 2, 0.25, t], [w / 2, 0.125, -t / 2])}
      {wall([t, 0.25, d], [-t / 2, 0.125, d / 2])}
      {wall([w + t * 2, 2.6, t], [w / 2, 1.3, d + t / 2])}
      {wall([t, 2.6, d], [w + t / 2, 1.3, d / 2])}
      <mesh position={[w / 2, 1.1, d - 0.01]}>
        <boxGeometry args={[w, 0.08, 0.02]} />
        <meshStandardMaterial color={palette.trim} />
      </mesh>
      <mesh position={[w - 0.01, 1.1, d / 2]}>
        <boxGeometry args={[0.02, 0.08, d]} />
        <meshStandardMaterial color={palette.trim} />
      </mesh>
    </group>
  )
})

// Builds every desk, chair, sofa and plant from the kit, then merges them into one mesh per
// material. The kit models are detailed (a keyboard alone is ~50 meshes), so drawn one by one a
// full office would be thousands of draw calls; merged, it's a few dozen however many desks there are.
function buildFurniture(layout: OfficeLayout): THREE.Group {
  const source = new THREE.Group()
  layout.desks.forEach((desk, i) => {
    if (desk.kind !== 'desk') return
    const ws = kit.createWorkstation({ seed: i + 1, laptop: i % 5 === 3 })
    ws.position.set((desk.rect.x + desk.rect.w / 2) / S, 0, (desk.rect.y + desk.rect.h / 2) / S)
    // The kit puts the chair on +Z; turn it round for desks whose chair is on the north side.
    ws.rotation.y = desk.facing === 'up' ? 0 : Math.PI
    source.add(ws)
  })
  for (const room of layout.rooms) {
    const office = kit.createPrivateOffice({ title: room.title, variant: room.variant, seed: Math.abs(hashSeed(room.ownerId)) % 1000, width: room.rect.w / S, depth: room.rect.h / S })
    office.position.set((room.rect.x + room.rect.w / 2) / S, 0, (room.rect.y + room.rect.h / 2) / S)
    // Turned round so the door faces north, towards the desks (lib/office mirrors this for walls).
    office.rotation.y = Math.PI
    source.add(office)
  }
  for (const pod of layout.pods) {
    const divider = kit.createDivider({ width: pod.w / S + 0.04 })
    divider.position.set((pod.x + pod.w / 2) / S, 0, (pod.y + pod.h / 2) / S)
    source.add(divider)
  }
  const midX = layout.lounge.x + layout.lounge.w / 2
  layout.loungeItems.forEach((item, i) => {
    const { rect } = item
    const x = (rect.x + rect.w / 2) / S
    const z = (rect.y + rect.h / 2) / S
    let obj: THREE.Object3D | null = null
    if (item.kind === 'couch') {
      const horizontal = rect.w > rect.h
      obj = kit.createSofa({ length: Math.max(rect.w, rect.h) / S })
      // Sofas face the coffee table: the long one faces south, the side ones face inwards.
      obj.rotation.y = horizontal ? 0 : rect.x + rect.w / 2 < midX ? Math.PI / 2 : -Math.PI / 2
    } else if (item.kind === 'table') {
      obj = kit.createCoffeeTable({ radius: rect.w / S / 2 })
    } else if (item.kind === 'pantry') {
      obj = kit.createPantry({ width: rect.w / S })
    } else if (item.kind === 'plant') {
      obj = kit.createPlant({ seed: i + 1, size: 1.1 })
    }
    if (obj) {
      obj.position.set(x, 0, z)
      source.add(obj)
    }
  })

  source.updateMatrixWorld(true)
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  // Meshes with one material per face (the desk nameplates) can't join a bucket; kept as they are.
  const loose: THREE.Mesh[] = []
  source.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (Array.isArray(mesh.material)) {
      const copy = new THREE.Mesh(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), mesh.material)
      loose.push(copy)
      mesh.geometry.dispose()
      return
    }
    const material = mesh.material
    // Kit geometries mix indexed and non-indexed; mergeGeometries needs them all the same.
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    for (const name of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name)
    }
    const list = buckets.get(material) ?? []
    list.push(geometry)
    buckets.set(material, list)
    mesh.geometry.dispose()
  })

  const merged = new THREE.Group()
  loose.forEach((mesh) => merged.add(mesh))
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false)
    geometries.forEach((g) => g.dispose())
    if (!geometry) continue
    const mesh = new THREE.Mesh(geometry, material)
    // Glass stays out of the shadow map, as it does in the kit.
    mesh.castShadow = !material.transparent
    mesh.receiveShadow = true
    merged.add(mesh)
  }
  return merged
}

function disposeGeometries(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.geometry.dispose()
  })
}

const Furniture = memo(function Furniture({ layout }: { layout: OfficeLayout }) {
  const group = useMemo(() => buildFurniture(layout), [layout])
  useEffect(() => () => disposeGeometries(group), [group])
  return <primitive object={group} />
})

// A desk's name tag, plus an invisible click target covering the desk and chair (the merged
// furniture can't tell one desk from another). The tag hangs over the empty chair, so it's only
// shown while nobody's using the desk — online owners are sitting there with their own name tag.
// Your own desk gets a gold marker on the floor instead.
const DeskTag = memo(function DeskTag({
  desk,
  owner,
  occupied,
  mine,
  onSelect,
}: {
  desk: Desk
  owner: DirectoryUser | null
  occupied: boolean
  mine: boolean
  onSelect: (id: string | null) => void
}) {
  const { rect, facing } = desk
  const cx = (rect.x + rect.w / 2) / S
  const cz = (rect.y + rect.h / 2) / S
  const toChair = facing === 'down' ? -1 : 1
  const select = (e: ThreeEvent<MouseEvent>) => {
    if (!owner || e.delta > 6) return
    e.stopPropagation()
    onSelect(owner.id)
  }
  return (
    <group>
      <mesh position={[cx, 0.5, cz + toChair * 0.3]} onClick={select}>
        <boxGeometry args={[rect.w / S, 1, rect.h / S + 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {mine && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[desk.seat.x / S, 0.02, desk.seat.y / S]}>
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial color="#f2b705" />
        </mesh>
      )}
      {!occupied && (
        <ScaledHtml position={[desk.seat.x / S, 1.25, desk.seat.y / S]} zIndex={20}>
          <button
            type="button"
            onClick={() => owner && onSelect(owner.id)}
            className={`flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${
              owner ? 'bg-white/90 text-gray-700' : 'bg-white/60 text-gray-400'
            } ${owner ? 'opacity-60' : ''}`}
          >
            {owner && <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />}
            {owner ? owner.name.split(/\s+/)[0] : 'Free'}
          </button>
        </ScaledHtml>
      )}
    </group>
  )
})

// Labels shrink as the camera pulls back, so a zoomed-out floor isn't a wall of tags, but never grow
// past their normal size when you zoom in close (drei's distanceFactor alone grows without limit).
const LABEL_FULL_SIZE_AT = 11 // metres from the camera
const LABEL_MIN_SCALE = 0.6

function ScaledHtml({ position, zIndex, children }: { position?: [number, number, number]; zIndex: number; children: ReactNode }) {
  const anchor = useRef<THREE.Group>(null)
  const box = useRef<HTMLDivElement>(null)
  const at = useRef(new THREE.Vector3())
  useFrame(({ camera }) => {
    if (!anchor.current || !box.current) return
    anchor.current.getWorldPosition(at.current)
    const scale = Math.min(1, Math.max(LABEL_MIN_SCALE, LABEL_FULL_SIZE_AT / camera.position.distanceTo(at.current)))
    box.current.style.transform = `scale(${scale.toFixed(3)})`
  })
  return (
    <group ref={anchor} position={position}>
      <Html center zIndexRange={[zIndex, 0]}>
        <div ref={box}>{children}</div>
      </Html>
    </group>
  )
}

function Tag({
  name,
  avatarUrl,
  isMe,
  voice,
  say,
  emote,
  onClick,
}: {
  name: string
  avatarUrl: string | null
  isMe?: boolean
  voice: VoiceBadge
  say?: OfficeBubble
  emote?: OfficeBubble
  onClick?: () => void
}) {
  return (
    <ScaledHtml zIndex={30}>
      <div className="relative flex flex-col items-center" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
        {say && <SpeechBubble key={say.key} text={say.text} />}
        {emote && (
          <div key={emote.key} className="absolute bottom-full mb-1 animate-bounce text-2xl" style={{ animationIterationCount: 3 }}>
            {emote.text}
          </div>
        )}
        <div className={`rounded-full shadow-md ring-2 ${isMe ? 'ring-accent' : 'ring-white'}`}>
          <Avatar name={name} photoUrl={avatarUrl} size={20} />
        </div>
        <div className={`mt-0.5 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ${isMe ? 'bg-accent text-accent-foreground' : 'bg-[#1d1f22]/85 text-white'}`}>
          {isMe ? 'You' : name.split(/\s+/)[0]}
          {voice && (
            <span aria-label={voice === 'muted' ? 'In voice, muted' : 'In voice'} title={voice === 'muted' ? 'In voice, muted' : 'In voice'}>
              {voice === 'muted' ? ' 🔇' : ' 🎤'}
            </span>
          )}
        </div>
      </div>
    </ScaledHtml>
  )
}

function SpeechBubble({ text }: { text: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[200px] rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 shadow-md"
      style={{ animation: `office-bubble ${BUBBLE_MS}ms ease-out forwards` }}
    >
      {text}
      <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-white" />
    </div>
  )
}

// The "earshot" circle that follows you around. Hidden inside a private office, where everyone in
// the room can hear you and nobody outside can.
function NearRing({ posRef, layout, color }: { posRef: MutableRefObject<Point | null>; layout: OfficeLayout; color: string }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = group.current
    const p = posRef.current
    if (!g || !p) return
    g.position.set(p.x / S, 0, p.y / S)
    g.visible = roomAt(layout, p) < 0
  })
  const r = NEAR_RADIUS / S
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[r - 0.12, r, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[r, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.09} depthWrite={false} />
      </mesh>
    </group>
  )
}

// One person from the kit, in the look they saved in the avatar builder (or, until they do, one
// picked from their user id), so everyone sees the same character for the same person. They walk while moving, wave on a 👋, and sit down and type when
// standing on a desk's seat.
function Character({
  id,
  name,
  avatarUrl,
  avatar,
  voice,
  isMe,
  getPos,
  smooth,
  desks,
  bubbles,
  ring,
  onSelect,
}: {
  id: string
  name: string
  avatarUrl: string | null
  avatar: OfficeAvatar | null
  voice?: VoiceBadge
  isMe?: boolean
  getPos: () => Point | null
  smooth?: boolean
  desks: Desk[]
  bubbles: OfficeBubble[]
  ring: string | null
  onSelect?: (id: string | null) => void
}) {
  const avatarKey = JSON.stringify(avatar ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const person = useMemo(() => kit.createPerson(avatarOptions(id, avatar)), [id, avatarKey])
  useEffect(() => () => disposeGeometries(person), [person])
  const group = useRef<THREE.Group>(null)
  // Turned to face the way they're walking; a wrapper, so the kit's person object is only ever
  // changed through the kit's own pose/animation functions.
  const body = useRef<THREE.Group>(null)
  const tag = useRef<THREE.Group>(null)
  const placed = useRef(false)
  const sitting = useRef(false)
  // A new look is a new person object, standing; the sit check below re-seats it if needed.
  const posedPerson = useRef(person)
  const plan = useRef<Point>({ x: 0, y: 0 })

  const say = bubbles.find((b) => b.userId === id && b.kind === 'say')
  const emote = bubbles.find((b) => b.userId === id && b.kind === 'emote')
  const waving = emote?.text === '👋'
  const wavingRef = useRef(waving)
  useEffect(() => {
    wavingRef.current = waving
  }, [waving])

  useFrame((state, dt) => {
    const g = group.current
    const b = body.current
    const target = getPos()
    if (!g || !b || !target) return
    const prev = { ...plan.current }
    if (!placed.current || !smooth) {
      plan.current = { ...target }
      placed.current = true
    } else {
      // Broadcasts arrive ~10 times a second; ease towards the latest one so they glide instead of hop.
      const k = 1 - Math.exp(-dt * 12)
      plan.current = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k }
    }
    const dx = plan.current.x - prev.x
    const dy = plan.current.y - prev.y
    const moving = Math.hypot(dx, dy) / Math.max(dt, 1e-3) > 12 // px/s

    const seatDesk = moving ? null : desks.find((d) => Math.hypot(d.seat.x - target.x, d.seat.y - target.y) < SIT_RADIUS) ?? null
    if (posedPerson.current !== person) {
      posedPerson.current = person
      sitting.current = false
    }
    if (Boolean(seatDesk) !== sitting.current) {
      sitting.current = Boolean(seatDesk)
      kit.setPose(person, seatDesk ? 'sit' : 'stand')
    }

    if (seatDesk) {
      g.position.set(seatDesk.seat.x / S, 0, seatDesk.seat.y / S)
      // Face the desk: it's north of a south-side chair and vice versa.
      b.rotation.y = seatDesk.facing === 'up' ? Math.PI : 0
    } else {
      g.position.set(plan.current.x / S, 0, plan.current.y / S)
      if (moving) {
        let diff = Math.atan2(dx, dy) - b.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        b.rotation.y += diff * Math.min(1, dt * 12)
      }
    }

    const mode: PersonMode = wavingRef.current && !seatDesk ? 'wave' : seatDesk ? 'type' : moving ? 'walk' : 'idle'
    kit.animatePerson(person, state.clock.elapsedTime, mode)
    if (tag.current) tag.current.position.y = seatDesk ? 1.8 : 2.25
  })

  const select = (e: ThreeEvent<MouseEvent>) => {
    if (!onSelect || e.delta > 6) return
    e.stopPropagation()
    onSelect(id)
  }

  // Start where they are, not at the origin, in case a label renders before the first frame runs.
  const start = getPos()
  return (
    <group ref={group} position={start ? [start.x / S, 0, start.y / S] : undefined}>
      <group ref={body}>
        <primitive object={person} onClick={select} />
      </group>
      {ring && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[(AVATAR_R + 2) / S, (AVATAR_R + 7) / S, 40]} />
          <meshBasicMaterial color={ring} />
        </mesh>
      )}
      <group ref={tag} position={[0, 2.25, 0]}>
        <Tag name={name} avatarUrl={avatarUrl} isMe={isMe} voice={voice ?? null} say={say} emote={emote} onClick={onSelect ? () => onSelect(id) : undefined} />
      </group>
    </group>
  )
}
