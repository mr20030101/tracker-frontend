import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ClipboardCheck, FileUp, ShieldCheck, UserPlus, type LucideIcon } from 'lucide-react'
import { FoldText } from '../components/FoldText'
import { Switch } from '../components/Switch'
import { errorMessage } from '../lib/api'
import { APP_SWITCHES_KEY, fetchAppSwitches, setAppSwitch, type AppSwitch } from '../lib/appSettings'
import { fetchAttendancePhotoRequired, setAttendancePhotoRequired } from '../lib/attendancePhoto'
import { usePageTitle } from '../lib/usePageTitle'

const PHOTO_REQUIRED_KEY = ['attendance-photo-required']

const SWITCHES: { name: AppSwitch; icon: LucideIcon; title: string; description: string }[] = [
  { name: 'bulk_import', icon: FileUp, title: 'Bulk import tasks', description: "Shows the Bulk Import button on the Task Log and on contributors' own profiles." },
  {
    name: 'hiring',
    icon: UserPlus,
    title: 'Hiring',
    description: 'When off, the Hiring page is hidden, every apply link says applications are closed, and new applications are refused.',
  },
  { name: 'audits', icon: ClipboardCheck, title: 'Audits', description: 'The Audits page and its tab under Tasks.' },
  { name: 'data_quality', icon: ShieldCheck, title: 'Data Quality', description: 'The Data Quality page and its tab under Tasks.' },
]

/** Admins: settings that apply to everyone on the tracker. Each change goes in the Activity Log. */
export function AppSettings() {
  usePageTitle('App Settings')
  const queryClient = useQueryClient()
  const switches = useQuery({ queryKey: APP_SWITCHES_KEY, queryFn: fetchAppSwitches, retry: false })
  const saveSwitch = useMutation({
    mutationFn: ({ name, enabled }: { name: AppSwitch; enabled: boolean }) => setAppSwitch(name, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APP_SWITCHES_KEY }),
  })
  const photo = useQuery({ queryKey: PHOTO_REQUIRED_KEY, queryFn: fetchAttendancePhotoRequired })
  const savePhoto = useMutation({
    mutationFn: setAttendancePhotoRequired,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PHOTO_REQUIRED_KEY }),
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-medium text-gray-900 sm:text-4xl">
          <FoldText text="App Settings" />
        </h1>
        <p className="text-sm text-gray-500">Settings for everyone on the tracker. Only admins can see or change them.</p>
      </div>

      <div className="card divide-y divide-gray-100">
        {SWITCHES.map(({ name, ...row }) => {
          const saving = saveSwitch.isPending && saveSwitch.variables?.name === name
          const failed = saveSwitch.isError && saveSwitch.variables?.name === name
          return (
            <SettingRow
              key={name}
              {...row}
              checked={saving ? Boolean(saveSwitch.variables?.enabled) : Boolean(switches.data?.[name])}
              disabled={switches.isLoading || !switches.data || saving}
              error={
                failed
                  ? errorMessage(saveSwitch.error, "Couldn't save the setting.")
                  : switches.error
                    ? errorMessage(switches.error, "Couldn't load the setting.")
                    : null
              }
              onChange={(enabled) => saveSwitch.mutate({ name, enabled })}
            />
          )
        })}
        <SettingRow
          icon={Camera}
          title="Require attendance photo"
          description="Contributors must take a photo with their camera to file attendance."
          checked={savePhoto.isPending ? Boolean(savePhoto.variables) : Boolean(photo.data)}
          disabled={photo.isLoading || savePhoto.isPending}
          error={savePhoto.error ? errorMessage(savePhoto.error, "Couldn't save the setting.") : null}
          onChange={(required) => savePhoto.mutate(required)}
        />
      </div>
    </div>
  )
}

function SettingRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  error,
  onChange,
}: {
  icon: LucideIcon
  title: string
  description: string
  checked: boolean
  disabled: boolean
  error: string | null
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-bg text-accent-on-bg">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="block text-sm text-gray-500">{description}</span>
        {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
      </span>
      <span className="flex min-h-9 items-center">
        <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
      </span>
    </label>
  )
}
