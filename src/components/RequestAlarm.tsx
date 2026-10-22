import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, Clock } from 'lucide-react'
import { Avatar } from './Avatar'

export interface RequestAlarmItem {
  id: string
  name: string
  email: string
  type: 'extension' | 'reclaim' | 'bad_video'
}

const WHAT: Record<RequestAlarmItem['type'], string> = {
  extension: 'wants an extension',
  reclaim: 'wants a reclaim',
  bad_video: 'flagged a bad video',
}

// The lead's "a request just came in" alarm (components/NotificationBell rings it): the screen pulses
// red, the card drops in and a bell shakes inside sonar rings while the alert sound repeats. It stays
// until the lead goes to review it or puts it off with Later.
export function RequestAlarm({ requests, onDismiss }: { requests: RequestAlarmItem[]; onDismiss: () => void }) {
  const heading = requests.length === 1 ? 'New request!' : `${requests.length} new requests!`
  return createPortal(
    <div className="request-alarm-backdrop fixed inset-0 z-[70] overflow-y-auto" role="alertdialog" aria-modal="true" aria-labelledby="request-alarm-title">
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div className="call-card-in w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
          <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
            <span className="call-sonar absolute inset-0 rounded-full bg-status-danger-text" aria-hidden />
            <span className="call-sonar absolute inset-0 rounded-full bg-status-danger-text [animation-delay:0.9s]" aria-hidden />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-status-danger-text text-white shadow-lg">
              <BellRing className="call-ring-shake h-10 w-10" />
            </span>
          </div>
          <h2 id="request-alarm-title" className="request-alarm-title text-2xl font-extrabold text-status-danger-text">
            {heading}
          </h2>
          <p className="mt-1 text-sm text-gray-500">It keeps ringing until you look.</p>

          <ul className="mt-4 flex max-h-48 flex-col gap-1 overflow-y-auto text-left">
            {requests.map((request) => (
              <li key={request.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <Avatar name={request.name || request.email} size={28} />
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-gray-900">{request.name}</span> <span className="text-gray-600">{WHAT[request.type]}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <Link
              to="/requests"
              onClick={onDismiss}
              className="call-accept-bounce inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-status-danger-text px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              Review now
            </Link>
            <button type="button" onClick={onDismiss} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Clock className="h-4 w-4" aria-hidden />
              Later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
