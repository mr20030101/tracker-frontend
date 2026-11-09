import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Download, LogOut, Settings, Share, SquarePlus, UserRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { contributorPath } from '../lib/urlRef'
import { Avatar } from './Avatar'
import { Modal } from './Modal'
import { isIosBrowser, promptInstall, useCanInstall } from '../lib/install'

// Your avatar in the header. Opens who you're signed in as, a link to your profile, and Sign out.
export function AccountMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const canInstall = useCanInstall()
  const showInstall = canInstall || isIosBrowser()
  const root = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Closes on a click outside, Escape, or moving to another page.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  useEffect(() => setOpen(false), [location.pathname])

  if (!user) return null

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        className={`flex h-11 items-center gap-2 rounded-full p-1.5 shadow-card transition-colors duration-100 sm:pr-3.5 ${
          open ? 'bg-accent-bg' : 'bg-white hover:bg-gray-100'
        }`}
      >
        <Avatar name={user.name} photoUrl={user.avatar_url} size={30} />
        <span className="hidden max-w-48 truncate text-sm font-medium text-gray-700 sm:block">{user.name}</span>
        <ChevronDown className={`hidden h-3.5 w-3.5 text-gray-400 transition-transform duration-200 sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            <Avatar name={user.name} photoUrl={user.avatar_url} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">{user.name}</div>
              <div className="truncate text-xs text-gray-500">{user.email}</div>
              <span className="mt-1 inline-block rounded-full bg-accent-bg px-2 py-0.5 text-[10px] font-semibold capitalize text-accent-foreground">
                {user.role}
              </span>
            </div>
          </div>
          <div className="p-1.5">
            <NavLink
              to={contributorPath(user.email)}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <UserRound className="h-4 w-4 text-gray-400" />
              View profile
            </NavLink>
            <NavLink
              to="/settings"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Settings className="h-4 w-4 text-gray-400" />
              Settings
            </NavLink>
            {showInstall && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  if (canInstall) void promptInstall()
                  else setIosHelp(true)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <Download className="h-4 w-4 text-gray-400" />
                Install app
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => logout()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-status-danger-text hover:bg-status-danger-bg"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
      {iosHelp && (
        <Modal title="Install the tracker" onClose={() => setIosHelp(false)}>
          <ol className="flex flex-col gap-3 text-sm text-gray-700">
            <li className="flex items-start gap-3">
              <Share className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              <span>
                In Safari, tap <strong>Share</strong> at the bottom of the screen.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <SquarePlus className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              <span>
                Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
              </span>
            </li>
          </ol>
          <p className="mt-4 text-xs text-gray-500">The tracker then opens from your home screen like an app, without the browser bars.</p>
        </Modal>
      )}
    </div>
  )
}
