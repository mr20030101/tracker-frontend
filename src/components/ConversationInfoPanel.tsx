import { Link } from 'react-router-dom'
import { CheckSquare, Trash2, User as UserIcon, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { formatActiveStatus } from '../lib/presence'
import type { DirectoryUser } from '../types'
import { contributorPathById } from '../lib/urlRef'

export function ConversationInfoPanel({
  user,
  onSelectMessages,
  selectDisabled,
  onDeleteConversation,
  onClose,
}: {
  user: DirectoryUser
  onSelectMessages: () => void
  selectDisabled?: boolean
  onDeleteConversation: () => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white lg:static lg:w-80 lg:shrink-0 lg:border-l lg:border-gray-200">
      <div className="flex justify-end px-3 pt-3">
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-1 px-4 pb-6 pt-1">
        <Avatar name={user.name} photoUrl={user.avatar_url} size={80} />
        <span className="mt-2 text-base font-semibold text-gray-900">{user.name}</span>
        {(user.is_bot || user.last_seen_at) && (
          <span className="text-xs text-gray-400">{user.is_bot ? 'Always active' : formatActiveStatus(user.last_seen_at)}</span>
        )}
      </div>

      <div className="flex justify-center gap-8 border-b border-gray-100 px-4 pb-6">
        {!user.is_bot && (
          <Link
            to={contributorPathById(user.id)}
            className="flex flex-col items-center gap-1.5 text-gray-600 hover:text-gray-900"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <UserIcon className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium">Profile</span>
          </Link>
        )}
        <button
          type="button"
          onClick={onSelectMessages}
          disabled={selectDisabled}
          className="flex flex-col items-center gap-1.5 text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <CheckSquare className="h-5 w-5" />
          </span>
          <span className="text-[11px] font-medium">Select</span>
        </button>
      </div>

      <div className="px-2 py-2">
        <button
          type="button"
          onClick={onDeleteConversation}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-status-danger-text hover:bg-status-danger-bg"
        >
          <Trash2 className="h-4 w-4" />
          Delete conversation
        </button>
      </div>
    </div>
  )
}
