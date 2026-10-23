import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, Eye, EyeOff, Ghost, KeyRound, Lock, Mic, MicOff, Monitor, Moon, Palette, PhoneCall, Save, Sun, Undo2, UserRound, Volume2, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCall } from '../lib/call'
import { canChooseOutput, routeCallAudio, useMediaDevices } from '../lib/callDevices'
import { clearMustChangePassword, removeAvatarFile, updateOwnProfile, uploadAvatar } from '../lib/profile'
import { normalizeRemotasksId, remotasksIdError } from '../lib/remotasks'
import { MESSAGE_NOTIFICATION_SOUND } from '../lib/sound'
import { useSeason } from '../lib/season'
import { useTheme } from '../lib/theme'
import { useAudioLevel } from '../lib/useAudioLevel'
import { usePageTitle } from '../lib/usePageTitle'
import { fetchLeadShift, setLeadShift } from '../lib/taskRequests'
import { minutesToTimeInput, timeInputToMinutes } from '../lib/attendanceWindow'
import { Avatar } from '../components/Avatar'
import { MicMeter, SpeakerModeSwitch } from '../components/CallSettings'
import { RemotasksIdField } from '../components/RemotasksIdField'
import { Reveal } from '../components/Reveal'
import { Select } from '../components/Select'
import { Switch } from '../components/Switch'

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'password', label: 'Password', icon: KeyRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'calls', label: 'Calls', icon: PhoneCall },
]

const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'

const PANELS: Record<string, () => ReactNode> = {
  profile: () => <ProfileSection />,
  password: () => <PasswordSection />,
  appearance: () => <AppearanceSection />,
  calls: () => <CallsSection />,
}

// Your own account in one place: what others see on your profile, your password, how the app
// looks, and which mic and speaker calls use. One tab at a time, each saving on its own. The tab
// is kept in the address (?tab=calls), so a reload or a link lands on it.
export function Settings() {
  usePageTitle('Settings')
  const [params, setParams] = useSearchParams()
  const active = SECTIONS.some((s) => s.id === params.get('tab')) ? params.get('tab')! : SECTIONS[0].id
  const select = (id: string) => setParams(id === SECTIONS[0].id ? {} : { tab: id }, { replace: true })

  // Arrow keys move between tabs, as in any tab list.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const index = (SECTIONS.findIndex((s) => s.id === active) + step + SECTIONS.length) % SECTIONS.length
    select(SECTIONS[index].id)
    document.getElementById(`tab-${SECTIONS[index].id}`)?.focus()
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Your profile, password, and how the tracker looks and sounds for you.</p>
      </div>

      <div
        role="tablist"
        aria-label="Settings"
        onKeyDown={handleKeyDown}
        className="scrollbar-none mb-6 flex gap-1 overflow-x-auto border-b border-gray-200"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const on = active === id
          return (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(id)}
              className={`relative flex shrink-0 items-center gap-2 px-4 pb-3 pt-2 text-sm font-medium transition-colors ${
                on ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className={`h-4 w-4 ${on ? 'text-accent' : ''}`} />
              {label}
              {/* The underline that marks the open tab. */}
              <span
                aria-hidden
                className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent transition-transform duration-300 ${on ? 'scale-x-100' : 'scale-x-0'}`}
              />
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {/* Keyed by tab, so each newly opened tab eases in. */}
        <Reveal key={active} distance={10}>
          {PANELS[active]()}
        </Reveal>
      </div>
    </div>
  )
}

function Section({ id, icon: Icon, title, description, children }: { id: string; icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-xl border border-gray-200 bg-white">
      <header className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-bg text-accent-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

// The save button's row: an error, or a brief "Saved" once it worked.
function SaveRow({ label, icon: Icon = Save, pending, disabled, saved, error }: { label: string; icon?: LucideIcon; pending: boolean; disabled?: boolean; saved: boolean; error: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-4">
      {error && <div className="mr-auto text-sm text-status-danger-text">{error}</div>}
      {saved && !error && (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-status-success-text">
          <Check className="h-4 w-4" />
          Saved
        </span>
      )}
      <button
        type="submit"
        disabled={pending || disabled}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        <Icon className="h-4 w-4" aria-hidden />
        {pending ? 'Saving...' : label}
      </button>
    </div>
  )
}

// Shows "Saved" for a few seconds after a save.
function useSavedFlash() {
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [saved])
  return [saved, setSaved] as const
}

function ProfileSection() {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName] = useState(user?.name ?? '')
  const [remotasksId, setRemotasksId] = useState(user?.remotasks_id ?? '')
  const [shift, setShift] = useState(user?.shift ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  // A lead's shift is a start and end time instead of free text: their contributors can only send
  // requests during it. What's typed, until it's saved.
  const isLead = user?.role === 'lead'
  const { data: leadShift = null, isLoading: leadShiftLoading } = useQuery({
    queryKey: ['lead-shift', user?.id],
    queryFn: () => fetchLeadShift(user!.id),
    enabled: isLead,
  })
  const [shiftDraft, setShiftDraft] = useState<{ starts: string; ends: string } | null>(null)
  const shiftStarts = shiftDraft?.starts ?? (leadShift ? minutesToTimeInput(leadShift.startsMin) : '')
  const shiftEnds = shiftDraft?.ends ?? (leadShift ? minutesToTimeInput(leadShift.endsMin) : '')
  const shiftStartsMin = timeInputToMinutes(shiftStarts)
  const shiftEndsMin = timeInputToMinutes(shiftEnds)
  const leadShiftChanged = shiftDraft !== null && (shiftStartsMin !== (leadShift?.startsMin ?? null) || shiftEndsMin !== (leadShift?.endsMin ?? null))
  // Both times, or neither (no shift: requests can be sent any time).
  const leadShiftError =
    (shiftStartsMin === null) !== (shiftEndsMin === null)
      ? 'Pick when your shift starts and ends.'
      : shiftStartsMin !== null && shiftStartsMin === shiftEndsMin
        ? 'Your shift has to end at a different time than it starts.'
        : null
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useSavedFlash()
  const photoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  const dirty =
    Boolean(photoFile) ||
    name.trim() !== (user?.name ?? '') ||
    remotasksId.trim() !== (user?.remotasks_id ?? '') ||
    (!isLead && shift.trim() !== (user?.shift ?? '')) ||
    leadShiftChanged ||
    bio.trim() !== (user?.bio ?? '')

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Unauthenticated')
      const previousAvatarUrl = user.avatar_url
      let avatarUrl = previousAvatarUrl
      if (photoFile) avatarUrl = await uploadAvatar(user.id, photoFile)
      try {
        await updateOwnProfile(name.trim(), avatarUrl, normalizeRemotasksId(remotasksId)!, shift.trim(), bio.trim())
      } catch (e) {
        if (avatarUrl !== previousAvatarUrl) await removeAvatarFile(avatarUrl)
        throw e
      }
      // The old photo's file is no longer used once the profile points at the new one.
      if (avatarUrl !== previousAvatarUrl) await removeAvatarFile(previousAvatarUrl)
      // Also sets the Shift shown on their profile to match.
      if (leadShiftChanged) {
        await setLeadShift(user.id, shiftStartsMin === null || shiftEndsMin === null ? null : { startsMin: shiftStartsMin, endsMin: shiftEndsMin })
      }
    },
    onSuccess: async () => {
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['directory'] })
      setPhotoFile(null)
      setPhotoPreview(null)
      setShiftDraft(null)
      queryClient.invalidateQueries({ queryKey: ['lead-shift'] })
      setSaved(true)
    },
    onError: (err: Error) => setError(err.message || 'Could not save your profile.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (remotasksIdError(remotasksId)) return
    if (isLead && leadShiftError) return
    setError(null)
    save.mutate()
  }

  if (!user) return null

  return (
    <Section id="profile" icon={UserRound} title="Profile" description="What your lead and team see on your profile.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            aria-label="Change photo"
            className="group relative shrink-0 rounded-full"
          >
            <Avatar name={name || user.name} photoUrl={photoPreview ?? user.avatar_url} size={80} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5" />
            </span>
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              setPhotoFile(file)
              setPhotoPreview(file ? URL.createObjectURL(file) : null)
            }}
          />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-gray-900">{name || user.name}</div>
            <div className="text-xs capitalize text-gray-500">{user.role}</div>
            <div className="mt-1 flex gap-3">
              <button type="button" onClick={() => photoInput.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline">
                <Camera className="h-3.5 w-3.5" aria-hidden />
                {photoFile ? 'Pick another photo' : 'Change photo'}
              </button>
              {photoFile && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null)
                    setPhotoPreview(null)
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:underline"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  Keep current
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Lock className="h-3.5 w-3.5 text-gray-400" />
              Email
            </label>
            <input disabled value={user.email} className={`${fieldClass} bg-gray-50 text-gray-500`} />
          </div>
          <RemotasksIdField
            value={remotasksId}
            onChange={setRemotasksId}
            showError={attempted}
            hint="Prefills the Reclaim / Extend form when your lead approves an extension."
          />
          {isLead ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Shift</label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  aria-label="Shift starts"
                  value={shiftStarts}
                  onChange={(e) => setShiftDraft({ starts: e.target.value, ends: shiftEnds })}
                  disabled={leadShiftLoading}
                  className={fieldClass}
                />
                <span className="text-sm text-gray-500">to</span>
                <input
                  type="time"
                  aria-label="Shift ends"
                  value={shiftEnds}
                  onChange={(e) => setShiftDraft({ starts: shiftStarts, ends: e.target.value })}
                  disabled={leadShiftLoading}
                  className={fieldClass}
                />
              </div>
              <p className={`mt-1 text-xs ${attempted && leadShiftError ? 'text-red-600' : 'text-gray-400'}`}>
                {attempted && leadShiftError
                  ? leadShiftError
                  : 'Singapore time. Shown on your profile, and your team can only send extension and reclaim requests during it. Leave both empty for any time.'}
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Shift</label>
              <input value={shift} onChange={(e) => setShift(e.target.value)} placeholder="e.g. 9 AM – 5 PM PHT" className={fieldClass} />
              <p className="mt-1 text-xs text-gray-400">Shown on your profile so your lead knows when you're online.</p>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Bio</label>
            <span className="text-xs text-gray-400">{bio.length}/240</span>
          </div>
          <textarea
            rows={3}
            maxLength={240}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short line about yourself — shown on your profile."
            className={`${fieldClass} resize-none`}
          />
        </div>

        <SaveRow label="Save profile" pending={save.isPending} disabled={!dirty || !name.trim()} saved={saved} error={error} />
      </form>
    </Section>
  )
}

// 0–4: length, mixed case, a number, a symbol.
function passwordStrength(password: string): number {
  if (password.length < 8) return password ? 1 : 0
  return 1 + [/[a-z]/.test(password) && /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
}
const STRENGTH = [
  { label: '', color: 'bg-gray-200' },
  { label: 'Too short', color: 'bg-status-danger-text' },
  { label: 'Okay', color: 'bg-status-warning-text' },
  { label: 'Good', color: 'bg-accent' },
  { label: 'Strong', color: 'bg-status-success-text' },
]

function PasswordSection() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useSavedFlash()
  const strength = passwordStrength(password)

  const save = useMutation({
    mutationFn: async () => {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      await clearMustChangePassword()
    },
    onSuccess: () => {
      setPassword('')
      setConfirm('')
      setSaved(true)
    },
    onError: (err: Error) => setError(err.message || 'Could not update your password.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('New password must be at least 8 characters.')
    if (password !== confirm) return setError('New password and confirmation do not match.')
    setError(null)
    save.mutate()
  }

  return (
    <Section id="password" icon={KeyRound} title="Password" description="At least 8 characters. You stay signed in on this device.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${fieldClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${strength >= step ? STRENGTH[strength].color : 'bg-gray-200'}`}
                  />
                ))}
              </div>
              <span className="w-16 text-right text-xs text-gray-500">{STRENGTH[strength].label}</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm new password</label>
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={fieldClass}
            />
            {confirm && (
              <p className={`mt-2 text-xs ${confirm === password ? 'text-status-success-text' : 'text-status-danger-text'}`}>
                {confirm === password ? 'Passwords match' : "Passwords don't match yet"}
              </p>
            )}
          </div>
        </div>
        <SaveRow label="Update password" icon={KeyRound} pending={save.isPending} disabled={!password} saved={saved} error={error} />
      </form>
    </Section>
  )
}

// Fixed colours for the theme pictures, so each shows its own theme whatever the page is in now.
const LIGHT_PALETTE = { page: '#f3f4f6', header: '#ffffff', card: '#ffffff', line: '#e5e7eb', text: '#d1d5db' }
const DARK_PALETTE = { page: '#12141a', header: '#1a1d24', card: '#1a1d24', line: '#2b2f39', text: '#3c4150' }
type ThemePalette = typeof LIGHT_PALETTE

// A small picture of the tracker: the black sidebar, the header, a heading and two cards.
function ThemePicture({ palette }: { palette: ThemePalette }) {
  return (
    <div className="flex h-full w-full" style={{ background: palette.page }}>
      <div className="flex w-[18%] flex-col gap-1.5 bg-[#0b0c0f] p-2">
        <div className="h-2 w-3/4 rounded-full bg-[#d4a017]" />
        <div className="h-1.5 w-full rounded-full bg-white/25" />
        <div className="h-1.5 w-full rounded-full bg-white/25" />
        <div className="h-1.5 w-2/3 rounded-full bg-white/25" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="h-4" style={{ background: palette.header, borderBottom: `1px solid ${palette.line}` }} />
        <div className="flex flex-1 flex-col gap-2 p-2.5">
          <div className="h-2 w-1/3 rounded-full" style={{ background: palette.text }} />
          <div className="grid flex-1 grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-md p-1.5" style={{ background: palette.card, border: `1px solid ${palette.line}` }}>
                <div className={`h-1.5 rounded-full bg-[#d4a017] ${i ? 'w-1/3' : 'w-1/2'}`} />
                <div className="h-1.5 w-full rounded-full" style={{ background: palette.line }} />
                <div className="h-1.5 w-3/4 rounded-full" style={{ background: palette.line }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AppearanceSection() {
  const { theme, manual, chooseTheme } = useTheme()
  const { inSeason, halloween, toggleHalloween } = useSeason()
  const choice = manual ? theme : 'system'
  const options = [
    { value: 'system' as const, label: 'System', hint: 'Matches your device', icon: Monitor },
    { value: 'light' as const, label: 'Light', hint: 'Always light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', hint: 'Always dark', icon: Moon },
  ]

  return (
    <Section id="appearance" icon={Palette} title="Appearance" description="How the tracker looks on this device.">
      <div className="flex flex-col gap-6">
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Theme</h3>
            {choice === 'system' && (
              <span className="text-xs text-gray-500">Your device is set to {theme} right now.</span>
            )}
          </div>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {options.map(({ value, label, hint, icon: Icon }) => {
              const on = choice === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => chooseTheme(value)}
                  className={`group overflow-hidden rounded-xl border text-left transition-all duration-200 ${
                    on
                      ? 'border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]'
                      : 'border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  <div className="relative aspect-[16/9] overflow-hidden border-b border-gray-200" aria-hidden>
                    {value === 'system' ? (
                      <>
                        <ThemePicture palette={LIGHT_PALETTE} />
                        {/* The dark half, cut on the diagonal over the light one. */}
                        <div className="absolute inset-0" style={{ clipPath: 'polygon(62% 0, 100% 0, 100% 100%, 38% 100%)' }}>
                          <ThemePicture palette={DARK_PALETTE} />
                        </div>
                      </>
                    ) : (
                      <ThemePicture palette={value === 'light' ? LIGHT_PALETTE : DARK_PALETTE} />
                    )}
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        on ? 'border-accent' : 'border-gray-300'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full bg-accent transition-transform duration-200 ${on ? 'scale-100' : 'scale-0'}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">{label}</div>
                      <div className="text-xs text-gray-500">{hint}</div>
                    </div>
                    <Icon className={`h-4 w-4 shrink-0 transition-colors ${on ? 'text-accent' : 'text-gray-400'}`} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {inSeason && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Seasonal</h3>
            <div
              className={`flex flex-col overflow-hidden rounded-xl border transition-colors sm:flex-row ${
                halloween ? 'border-[#ea580c]' : 'border-gray-200'
              }`}
            >
              {/* A night sky over a pumpkin patch; drained of colour while the theme is off. */}
              <div
                aria-hidden
                className={`relative h-24 shrink-0 overflow-hidden transition-[filter] duration-500 sm:h-auto sm:w-56 ${halloween ? '' : 'grayscale'}`}
                style={{ background: 'linear-gradient(160deg, #1a0f24 0%, #3b1d4a 55%, #ea580c 140%)' }}
              >
                <span className="absolute right-5 top-3 h-6 w-6 rounded-full bg-[#fde68a] shadow-[0_0_18px_#fde68a]" />
                <span className={`absolute left-6 top-4 text-sm ${halloween ? 'nudge-bob' : ''}`}>🦇</span>
                <span className={`absolute left-16 top-8 text-xs ${halloween ? 'nudge-bob' : ''}`} style={{ animationDelay: '0.6s' }}>
                  🦇
                </span>
                <span className="absolute bottom-2 left-5 text-3xl">🎃</span>
                <span className="absolute bottom-2 left-16 text-xl">🎃</span>
              </div>
              <div className={`flex flex-1 items-center gap-4 p-4 ${halloween ? 'bg-[#ea580c]/5' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <Ghost className={`h-4 w-4 ${halloween ? 'text-[#ea580c]' : 'text-gray-400'}`} />
                    Halloween theme
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Orange accents, bats and a spooky scene behind every page, through October. Works with any theme above.
                  </p>
                </div>
                <Switch checked={halloween} onChange={toggleHalloween} label="Halloween theme" />
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// The mic and speaker calls start with. Testing the mic also asks for access, which is what lets
// the browser list your devices by name.
function CallsSection() {
  const { devices, mobile, setMic, setSpeaker, setSpeakerMode } = useCall()
  const [testStream, setTestStream] = useState<MediaStream | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const list = useMediaDevices(true, refresh)
  const meter = useRef<HTMLDivElement>(null)
  useAudioLevel(testStream, meter, '--mic')

  // Stops the test mic on leaving the page.
  useEffect(() => () => testStream?.getTracks().forEach((t) => t.stop()), [testStream])

  async function startTest(micId = devices.micId) {
    testStream?.getTracks().forEach((t) => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true })
      setTestStream(stream)
      setMicError(null)
      setRefresh((n) => n + 1)
    } catch (err) {
      setTestStream(null)
      setMicError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser’s site settings.' : "Couldn't open that microphone.")
    }
  }
  function stopTest() {
    testStream?.getTracks().forEach((t) => t.stop())
    setTestStream(null)
  }

  function playTestSound() {
    const audio = new Audio(MESSAGE_NOTIFICATION_SOUND)
    void routeCallAudio(audio, devices, mobile).then(() => audio.play().catch(() => {}))
  }

  const unnamed = list.mics.length > 0 && list.mics.every((d) => d.label.startsWith('Microphone '))

  return (
    <Section id="calls" icon={PhoneCall} title="Calls" description="The microphone and speaker your calls use. You can still change them during a call.">
      <div className="flex flex-col gap-5">
        {!mobile && (
          <div ref={meter} className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Mic className="h-4 w-4 text-gray-400" />
              Microphone
            </label>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-0 flex-1 basis-64">
                <Select
                  fullWidth
                  value={devices.micId}
                  onChange={(id) => {
                    setMic(id)
                    if (testStream) void startTest(id)
                  }}
                  options={[{ value: '', label: 'System default' }, ...list.mics.map((d) => ({ value: d.deviceId, label: d.label }))]}
                  aria-label="Microphone"
                  className={fieldClass}
                />
              </div>
              <button
                type="button"
                onClick={() => (testStream ? stopTest() : void startTest())}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  testStream ? 'border-status-danger-text text-status-danger-text hover:bg-status-danger-bg' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {testStream ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                {testStream ? 'Stop test' : 'Test microphone'}
              </button>
            </div>
            {testStream ? (
              <div className="flex flex-col gap-1">
                <MicMeter />
                <p className="text-xs text-gray-400">Say something: the bar should move as you talk.</p>
              </div>
            ) : unnamed ? (
              <p className="text-xs text-gray-400">Test your microphone once to see your devices by name.</p>
            ) : null}
            {micError && <p className="text-xs text-status-danger-text">{micError}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Volume2 className="h-4 w-4 text-gray-400" />
            {mobile ? 'Play calls through' : 'Speaker'}
          </label>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-0 flex-1 basis-64">
              {mobile ? (
                <SpeakerModeSwitch mode={devices.speakerMode} onChange={setSpeakerMode} />
              ) : canChooseOutput() ? (
                <Select
                  fullWidth
                  value={devices.speakerId}
                  onChange={setSpeaker}
                  options={[{ value: '', label: 'System default' }, ...list.speakers.map((d) => ({ value: d.deviceId, label: d.label }))]}
                  aria-label="Speaker"
                  className={fieldClass}
                />
              ) : (
                <p className="py-2 text-sm text-gray-500">This browser plays calls through your system's sound output.</p>
              )}
            </div>
            <button type="button" onClick={playTestSound} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Volume2 className="h-4 w-4" aria-hidden />
              Test speaker
            </button>
          </div>
        </div>
      </div>
    </Section>
  )
}
