import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Monitor, Puzzle, Smartphone, TriangleAlert } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { confirmDialog } from '../lib/dialog'
import { formatActiveStatus } from '../lib/presence'
import { useNow } from '../lib/useNow'
import {
  activePlaces,
  currentSessionId,
  EXTENSION_DEVICE,
  isActiveNow,
  listUserSessions,
  revokeUserSession,
  sessionDevice,
  type UserSession,
} from '../lib/sessionDevices'

function DeviceIcon({ device }: { device: string }) {
  const Icon = device === EXTENSION_DEVICE ? Puzzle : /iPhone|iPad|Android/.test(device) ? Smartphone : Monitor
  return <Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
}

const dateTime = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Admins only: where this account is signed in, flagged when it looks shared, with a way to sign a device out. */
export function SignedInDevices({ userId, name }: { userId: string; name: string }) {
  const queryClient = useQueryClient()
  const now = useNow(60_000)
  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ['user-sessions', userId],
    queryFn: () => listUserSessions(userId),
    refetchInterval: 60_000,
  })
  const { data: thisSession = null } = useQuery({ queryKey: ['current-session-id'], queryFn: currentSessionId, staleTime: 60_000 })
  const revoke = useMutation({
    mutationFn: revokeUserSession,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user-sessions', userId] })
      queryClient.invalidateQueries({ queryKey: ['session-flags'] })
    },
  })

  async function signOut(session: UserSession, device: string) {
    if (revoke.isPending) return
    const ok = await confirmDialog(`Sign ${name} out of ${device}? They'll need to sign in again there.`, {
      title: 'Sign out this device?',
      confirmLabel: 'Sign out',
      danger: true,
    })
    if (ok) revoke.mutate(session.session_id)
  }

  const places = activePlaces(sessions, now)

  return (
    <section className="mt-6 card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">Signed-in devices</h2>
        <span className="text-xs text-gray-400">Admins only</span>
      </div>

      {places >= 2 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Active from {places} places right now (different device or IP). Check with them before signing anything out.
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : error ? (
        <p className="text-sm text-status-danger-text">{errorMessage(error, "Couldn't load the devices.")}</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-400">Not signed in anywhere.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sessions.map((session) => {
            const device = sessionDevice(session)
            const ip = session.last_ip ?? session.sign_in_ip
            const movedIp = session.last_ip && session.sign_in_ip && session.last_ip !== session.sign_in_ip
            const active = isActiveNow(session, now)
            return (
              <li key={session.session_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <DeviceIcon device={device} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{device}</span>
                    {session.session_id === thisSession && (
                      <span className="rounded-full bg-accent-bg px-2 py-0.5 text-xs font-medium text-accent-on-bg">This device</span>
                    )}
                    {session.is_new_device && (
                      <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning-text">New device</span>
                    )}
                    {session.via_link && (
                      <span
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                        title="Signed in from an emailed link or an admin's Log in as, not a password"
                      >
                        Link sign-in
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="font-mono">{ip ?? 'IP unknown'}</span>
                    {movedIp && <span> (signed in from <span className="font-mono">{session.sign_in_ip}</span>)</span>}
                    <span> · Signed in {dateTime.format(new Date(session.signed_in_at))}</span>
                  </div>
                </div>
                <span className={`text-xs tabular-nums ${active ? 'text-status-success-text' : 'text-gray-400'}`}>
                  {formatActiveStatus(session.last_active)}
                </span>
                {session.session_id !== thisSession && (
                <button
                  type="button"
                  onClick={() => signOut(session, device)}
                  aria-busy={revoke.isPending && revoke.variables === session.session_id}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 pointer-coarse:min-h-11"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Sign out
                </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {revoke.error && <p className="mt-2 text-sm text-status-danger-text">{errorMessage(revoke.error, "Couldn't sign that device out.")}</p>}
      <p className="mt-3 text-xs text-gray-400">
        A signed-out device goes to the sign-in screen within a few minutes. The extension is listed but never counted as another place.
      </p>
    </section>
  )
}
