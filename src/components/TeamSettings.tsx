import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { errorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  ALL_FEATURES_ON,
  fetchTeamFeaturesList,
  setTeamBackupForm,
  setTeamCtsTrainer,
  setTeamFeatures,
  setTeamMessaging,
  setTeamProgram,
  type TeamFeatures,
  type TeamProgram,
} from '../lib/teamFeatures'
import type { User } from '../types'
import { Select } from './Select'
import { Switch } from './Switch'

// Leads and admins: what each team uses (a lead's own; every lead's for an admin), one row per team
// with what each switch does explained once above. Each switch saves straight away.
type TeamToggleKey = 'ctsEnabled' | 'attendanceEnabled' | 'attendancePublic' | 'backupFormEnabled' | 'messagingEnabled'

const TEAM_TOGGLES: { key: TeamToggleKey; label: string }[] = [
  { key: 'ctsEnabled', label: 'CTS Form' },
  { key: 'attendanceEnabled', label: 'Attendance' },
  { key: 'attendancePublic', label: 'Public' },
  { key: 'backupFormEnabled', label: 'Backup form' },
  { key: 'messagingEnabled', label: 'Messaging' },
]

const PROGRAM_OPTIONS: { value: TeamProgram; label: string }[] = [
  { value: 'bootcamp', label: 'Bootcamp' },
  { value: 'rst', label: 'RST' },
]

const TEAM_LEGEND: { term: string; text: string }[] = [
  { term: 'Program', text: 'Bootcamp or RST. RST teams file extensions on the RST Task Extension Form instead of the Scale form. Set by an admin.' },
  { term: 'CTS Form', text: 'The CTS Form button and CTS column on the Dashboard, Task Log and profile.' },
  { term: 'Attendance', text: 'The Attendance page, form and countdown. Off, contributors can’t file it themselves.' },
  {
    term: 'Public',
    text: 'Contributors see who on the team filed today, with each person’s photo. Emails, Task IDs and screenshots stay private. Needs Attendance on.',
  },
  {
    term: 'Backup form',
    text: 'Each task marked Submitted, Rejected/SBQ or Expired goes to the Back Up Task Tracker Remote Google Form once. Tasks finished while it’s off aren’t sent later. Needs a CTS trainer.',
  },
  {
    term: 'Messaging',
    text: 'Messages, the chat button and group chats for the lead and their contributors. Off, they can’t send or receive messages. Set by an admin.',
  },
  {
    term: 'CTS trainer',
    text: 'Exactly as it reads in the Google Forms, e.g. “garcia, ina dimaano”. Fills the CTS Form’s “Under Trainer Team” and the backup form’s “Support / Trainer”.',
  },
]

/** `bare` drops the card and heading, for use inside a modal that has its own title. */
export function TeamSettings({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { data: leads = [] } = useQuery({
    queryKey: ['settings-team-leads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name').eq('role', 'lead').eq('is_active', true).order('name')
      if (error) throw error
      return data as Pick<User, 'id' | 'name'>[]
    },
    enabled: isAdmin,
  })
  const { data: features, isLoading } = useQuery({ queryKey: ['team-features-list'], queryFn: fetchTeamFeaturesList })
  const teams = isAdmin ? leads : user ? [{ id: user.id, name: user.name }] : []

  return (
    <section className={bare ? '' : 'card px-5 py-4'}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {!bare && <h2 className="text-base font-semibold text-gray-900">Team settings</h2>}
        <p className="text-sm text-gray-500">
          {isAdmin
            ? "What each lead's team uses in the Tracker. Switching something off hides it from that team's contributors."
            : 'What your team uses in the Tracker. Switching something off hides it from your contributors.'}
        </p>
      </div>
      <details className="mb-4 rounded-md bg-gray-50 px-4 py-2 text-xs">
        <summary className="cursor-pointer py-1 font-medium text-gray-700 pointer-coarse:min-h-11">What each setting does</summary>
      <dl className="grid gap-x-8 gap-y-2 pb-2 pt-1 sm:grid-cols-2">
        {TEAM_LEGEND.map(({ term, text }) => (
          <div key={term} className="text-xs leading-5">
            <dt className="inline font-semibold text-gray-800">{term}</dt>
            <dd className="inline text-gray-500"> — {text}</dd>
          </div>
        ))}
      </dl>
      </details>

      {teams.length === 0 ? (
        <p className="text-sm text-gray-500">{isLoading ? 'Loading...' : 'No leads yet.'}</p>
      ) : (
        <div role="table" aria-label="Team features">
          <div role="row" className="hidden border-b border-gray-200 pb-2 text-xs font-medium text-gray-500 md:grid md:grid-cols-12 md:gap-4">
            <span role="columnheader" className="md:col-span-2">
              Team
            </span>
            <span role="columnheader" className="md:col-span-2">
              Program
            </span>
            {TEAM_TOGGLES.map(({ key, label }) => (
              <span key={key} role="columnheader" className="md:col-span-1">
                {label}
              </span>
            ))}
            <span role="columnheader" className="md:col-span-3">
              CTS trainer
            </span>
          </div>
          <div role="rowgroup" className="divide-y divide-gray-100">
            {teams.map((team) => (
              <TeamFeatureRow
                key={team.id}
                leadId={team.id}
                title={isAdmin ? `${team.name.trim()}’s team` : 'Your team'}
                features={features?.get(team.id) ?? ALL_FEATURES_ON}
                isAdmin={isAdmin}
                disabled={isLoading}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function TeamFeatureRow({
  leadId,
  title,
  features,
  isAdmin,
  disabled,
}: {
  leadId: string
  title: string
  features: TeamFeatures
  isAdmin: boolean
  disabled: boolean
}) {
  const queryClient = useQueryClient()
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: ['team-features-list'] })
    queryClient.invalidateQueries({ queryKey: ['team-features'] })
  }
  const save = useMutation({ mutationFn: (next: TeamFeatures) => setTeamFeatures(leadId, next), onSettled })
  const saveBackup = useMutation({ mutationFn: (next: boolean) => setTeamBackupForm(leadId, next), onSettled })
  const saveProgram = useMutation({ mutationFn: (next: TeamProgram) => setTeamProgram(leadId, next), onSettled })
  const saveMessaging = useMutation({ mutationFn: (next: boolean) => setTeamMessaging(leadId, next), onSettled })
  const program = saveProgram.isPending && saveProgram.variables ? saveProgram.variables : features.program

  const shown: TeamFeatures = {
    ...(save.isPending && save.variables ? save.variables : features),
    backupFormEnabled: saveBackup.isPending && saveBackup.variables !== undefined ? saveBackup.variables : features.backupFormEnabled,
    messagingEnabled: saveMessaging.isPending && saveMessaging.variables !== undefined ? saveMessaging.variables : features.messagingEnabled,
  }
  const error = save.error ?? saveBackup.error ?? saveProgram.error ?? saveMessaging.error

  const change = (key: TeamToggleKey, next: boolean) => {
    if (key === 'backupFormEnabled') saveBackup.mutate(next)
    else if (key === 'messagingEnabled') saveMessaging.mutate(next)
    else save.mutate({ ...shown, [key]: next })
  }

  return (
    <div role="row" className="grid grid-cols-1 gap-3 py-4 md:grid-cols-12 md:items-center md:gap-4 md:py-3">
      <div role="rowheader" className="min-w-0 md:col-span-2">
        <h3 className="truncate text-sm font-semibold text-gray-900">{title}</h3>
        {error && <div className="text-xs text-status-danger-text">{errorMessage(error, "Couldn't save.")}</div>}
      </div>
      <div role="cell" className="flex items-center justify-between gap-4 md:col-span-2 md:justify-start">
        <span aria-hidden className="text-sm text-gray-700 md:hidden">
          Program
        </span>
        {isAdmin ? (
          <Select
            value={program}
            onChange={(value) => saveProgram.mutate(value as TeamProgram)}
            options={PROGRAM_OPTIONS}
            disabled={disabled || saveProgram.isPending}
            aria-label={`Program for ${title}`}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-800 pointer-coarse:h-11"
          />
        ) : (
          <span className="text-sm text-gray-800">{program === 'rst' ? 'RST' : 'Bootcamp'}</span>
        )}
      </div>
      {TEAM_TOGGLES.map(({ key, label }) => (
        <div key={key} role="cell" className="flex items-center justify-between gap-4 md:col-span-1 md:justify-start">
          <span aria-hidden className="text-sm text-gray-700 md:hidden">
            {label}
          </span>
          <Switch
            checked={shown[key]}
            onChange={(next) => change(key, next)}
            disabled={
              disabled ||
              save.isPending ||
              saveBackup.isPending ||
              saveMessaging.isPending ||
              (key === 'attendancePublic' && !shown.attendanceEnabled) ||
              // Admins only: a lead sees their team's setting but can't change it.
              (key === 'messagingEnabled' && !isAdmin)
            }
            label={`${label} for ${title}`}
          />
        </div>
      ))}
      <div role="cell" className="md:col-span-3">
        <CtsTrainerField leadId={leadId} title={title} trainer={features.ctsTrainer} disabled={disabled} />
        {shown.backupFormEnabled && !features.ctsTrainer && (
          <div className="mt-1 text-xs font-medium text-status-danger-text">Needed for the backup form, or its tasks can{'’'}t be sent.</div>
        )}
      </div>
    </div>
  )
}

/** The trainer, as it reads in the Google Forms: CTS "Under Trainer Team" and backup form "Support / Trainer". */
function CtsTrainerField({ leadId, title, trainer, disabled }: { leadId: string; title: string; trainer: string | null; disabled: boolean }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (next: string) => setTeamCtsTrainer(leadId, next),
    onSuccess: () => setDraft(null),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['team-features-list'] })
      queryClient.invalidateQueries({ queryKey: ['team-features'] })
    },
  })
  const value = draft ?? trainer ?? ''
  const changed = draft !== null && draft.trim().toLowerCase() !== (trainer ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (changed && !save.isPending) save.mutate(draft!)
      }}
    >
      <label htmlFor={`cts-trainer-${leadId}`} className="mb-1 block text-sm text-gray-700 md:hidden">
        CTS trainer
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`cts-trainer-${leadId}`}
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder="last, first middle"
          disabled={disabled || save.isPending}
          aria-label={`CTS trainer for ${title}`}
          className="h-9 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800 pointer-coarse:h-11"
        />
        {changed && (
          <>
            <button
              type="submit"
              aria-busy={save.isPending}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground pointer-coarse:h-11"
            >
              <Save className="h-4 w-4" aria-hidden />
              {save.isPending ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="shrink-0 text-xs text-gray-500 hover:underline pointer-coarse:min-h-11">
              Cancel
            </button>
          </>
        )}
      </div>
      {save.error && <div className="mt-1 text-xs text-status-danger-text">{errorMessage(save.error, "Couldn't save the trainer.")}</div>}
    </form>
  )
}
