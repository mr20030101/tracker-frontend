import { NavLink, useLocation } from 'react-router-dom'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { animate } from 'animejs'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  MessageCircle,
  ClipboardList,
  ShieldCheck,
  History,
  BookOpen,
  Users as UsersIcon,
  FolderKanban,
  Trophy,
  UserPlus,
  Hourglass,
  Building2,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { prefersReducedMotion } from '../lib/motion'
import { MessagingProvider } from '../lib/messagingContext'
import { Avatar } from './Avatar'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { MessagesButton } from './MessagesButton'
import { ThemeToggle } from './ThemeToggle'
import { OnlineUsers } from './OnlineUsers'
import { contributorPath } from '../lib/urlRef'
import { fetchPendingRequestCount } from '../lib/taskRequests'

const MANAGER_ROLES = ['admin', 'lead']

function navSections(
  isManager: boolean,
  isAdmin: boolean,
  pendingRequests: number,
): { label: string; items: { to: string; label: string; icon: LucideIcon; badge?: number }[] }[] {
  return [
    {
      label: 'Overview',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      ],
    },
    {
      label: 'Logs',
      items: isManager
        ? [
          { to: '/task-log', label: 'Task Log', icon: ClipboardList },
          { to: '/requests', label: 'Requests', icon: Hourglass, badge: pendingRequests },
          { to: '/data-quality', label: 'Data Quality', icon: ShieldCheck },
          ...(isAdmin ? [{ to: '/activity-log', label: 'Activity Log', icon: History }] : []),
        ]
        : [
          { to: '/task-log', label: 'Task Log', icon: ClipboardList },
          { to: '/requests', label: 'Requests', icon: Hourglass },
        ],
    },
    {
      label: 'Library',
      items: [{ to: '/resources', label: 'Resources', icon: BookOpen }],
    },
    {
      label: 'Team',
      items: isManager
        ? [
          { to: '/messages', label: 'Messages', icon: MessageCircle },
          { to: '/office', label: 'Office', icon: Building2 },
          { to: '/users', label: 'Users', icon: UsersIcon },
          { to: '/projects', label: 'Projects', icon: FolderKanban },
          { to: '/hiring', label: 'Hiring', icon: UserPlus },
        ]
        : [
          { to: '/messages', label: 'Messages', icon: MessageCircle },
          { to: '/office', label: 'Office', icon: Building2 },
        ],
    },
  ]
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const isAdmin = user?.role === 'admin'
  const mainRef = useRef<HTMLElement>(null)

  // The number on the Requests link, for the people who decide them. Refreshed after every review
  // on the Requests page (same ['task-requests'] key prefix) and every half minute in between.
  const { data: pendingRequests = 0 } = useQuery({
    queryKey: ['task-requests', 'pending-count'],
    queryFn: fetchPendingRequestCount,
    enabled: isManager,
    refetchInterval: 30_000,
  })

  // Fade the page area in on each route change. Opacity only: a transform here
  // would become the containing block for the page's position: fixed modals.
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main || prefersReducedMotion()) return
    const animation = animate(main, { opacity: [0, 1], duration: 220, ease: 'outQuad', onComplete: (a) => a.revert() })
    return () => {
      animation.revert()
    }
  }, [location.pathname])

  const ownProfilePath = user ? contributorPath(user.email) : '/'

  const crumb =
    location.pathname === '/leaderboard'
      ? 'Leaderboard'
      : location.pathname === '/task-log'
        ? 'Task Log'
        : location.pathname === '/resources'
          ? 'Resources'
          : location.pathname.startsWith('/messages')
            ? 'Messages'
            : location.pathname === '/users'
              ? 'Users'
              : location.pathname === '/projects'
                ? 'Projects'
                : location.pathname === '/data-quality'
                  ? 'Data Quality'
                  : location.pathname === '/activity-log'
                    ? 'Activity Log'
                    : location.pathname.startsWith('/leads/')
                      ? 'Lead Team'
                      : location.pathname.startsWith('/contributors/')
                        ? isManager
                          ? 'CB Profile'
                          : 'My Profile'
                        : location.pathname === '/hiring'
                          ? 'Hiring'
                          : location.pathname === '/office'
                            ? 'Office'
                            : 'Dashboard'

  return (
    <MessagingProvider>
      <div className="flex h-screen bg-gray-50">
        {user && !location.pathname.startsWith('/messages') && <OnlineUsers />}
        {!location.pathname.startsWith('/messages') && (
          <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
            <div className="px-5 py-5">
              <Logo />
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2">
              {navSections(isManager, isAdmin, pendingRequests).map((section) => (
                <div key={section.label} className="mb-4">
                  <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400">
                    {section.label}
                  </div>
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                      {item.label}
                      {item.badge ? (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger-text px-1.5 text-[11px] font-bold text-white">
                          {item.badge > 99 ? '99+' : item.badge}
                          <span className="sr-only"> pending</span>
                        </span>
                      ) : null}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>

            {user && (
              <div className="border-t border-gray-200 p-3">
                <div className="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-100">
                  <NavLink
                    to={ownProfilePath}
                    className="flex min-w-0 flex-1 items-center gap-2"
                    aria-label="Open your profile"
                  >
                    <Avatar name={user.name} photoUrl={user.avatar_url} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{user.name}</div>
                      <div className="truncate text-xs text-gray-400 capitalize">{user.role}</div>
                    </div>
                  </NavLink>
                  <button
                    onClick={() => logout()}
                    className="text-xs font-medium text-gray-400 hover:text-gray-700"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
            <div className="flex items-center gap-4">
              {location.pathname.startsWith('/messages') && (
                <NavLink to="/" className="shrink-0" aria-label="Home">
                  <Logo className="h-6" />
                </NavLink>
              )}
              <div className="text-sm text-gray-500">
                <NavLink to="/" className="font-medium text-gray-700 hover:underline">
                  Home
                </NavLink>
                <span className="mx-2">/</span>
                <span>{crumb}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {user && !location.pathname.startsWith('/messages') && <MessagesButton />}
              {user && <NotificationBell />}
              {user && (
                <NavLink to={ownProfilePath} aria-label="Open your profile" className="shrink-0 rounded-full">
                  <Avatar name={user.name} photoUrl={user.avatar_url} size={32} />
                </NavLink>
              )}
            </div>
          </header>

          <main
            ref={mainRef}
            className={`flex-1 overflow-y-auto pl-6 py-6 ${
              user && !location.pathname.startsWith('/messages') ? 'pr-20' : 'pr-6'
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </MessagingProvider>
  )
}
