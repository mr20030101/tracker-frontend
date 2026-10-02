import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate } from 'animejs'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  MessageCircle,
  ClipboardList,
  ShieldCheck,
  LineChart as LineChartIcon,
  History,
  BookOpen,
  Users as UsersIcon,
  FolderKanban,
  Trophy,
  UserPlus,
  Hourglass,
  Megaphone,
  UserRound,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { prefersReducedMotion } from '../lib/motion'
import { MessagingProvider } from '../lib/messagingContext'
import { CallProvider } from '../lib/call'
import { CallBar } from './CallBar'
import { Avatar } from './Avatar'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { MessagesButton } from './MessagesButton'
import { ThemeToggle } from './ThemeToggle'
import { OnlineUsers } from './OnlineUsers'
import { GlobalSearch } from './GlobalSearch'
import { contributorPath } from '../lib/urlRef'
import { OVERDUE_HOURS, fetchOverdueRequestCount, fetchPendingRequestCount } from '../lib/taskRequests'
import { fetchUnreadAnnouncementCount } from '../lib/announcements'
import { AppFooter } from './AppFooter'
import { OfflineQueueBanner } from './OfflineQueueBanner'

const MANAGER_ROLES = ['admin', 'lead']

function navSections(
  isManager: boolean,
  isAdmin: boolean,
  pendingRequests: number,
  overdueRequests: number,
  unreadAnnouncements: number,
): {
  label: string
  // `urgent`: the badge turns red with `badgeTitle` explaining why (overdue requests).
  items: { to: string; label: string; icon: LucideIcon; badge?: number; urgent?: boolean; badgeTitle?: string }[]
}[] {
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
          {
            to: '/requests',
            label: 'Requests',
            icon: Hourglass,
            badge: pendingRequests,
            urgent: overdueRequests > 0,
            badgeTitle:
              overdueRequests > 0
                ? `${overdueRequests} waiting over ${OVERDUE_HOURS} hours`
                : `${pendingRequests} pending`,
          },
          { to: '/data-quality', label: 'Data Quality', icon: ShieldCheck },
          { to: '/team-reports', label: 'Team Reports', icon: LineChartIcon },
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
          { to: '/announcements', label: 'Announcements', icon: Megaphone, badge: unreadAnnouncements },
          { to: '/users', label: 'Users', icon: UsersIcon },
          { to: '/projects', label: 'Projects', icon: FolderKanban },
          { to: '/hiring', label: 'Hiring', icon: UserPlus },
        ]
        : [
          { to: '/messages', label: 'Messages', icon: MessageCircle },
          { to: '/announcements', label: 'Announcements', icon: Megaphone, badge: unreadAnnouncements },
        ],
    },
  ]
}

const DESKTOP_QUERY = '(min-width: 1024px)'
const NAV_COLLAPSED_KEY = 'nav-collapsed'

function useIsDesktop() {
  const [matches, setMatches] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setMatches(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return matches
}

function readNavCollapsed() {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeNavCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Private browsing etc.: the choice just isn't remembered.
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const isAdmin = user?.role === 'admin'
  const mainRef = useRef<HTMLElement>(null)
  const onMessages = location.pathname.startsWith('/messages')
  // On desktop the sidebar sits beside the page and the menu button hides/shows it (remembered).
  // On smaller screens, and on Messages, it's a slide-out menu, closed again whenever you navigate.
  const isDesktop = useIsDesktop()
  const [collapsed, setCollapsed] = useState(() => readNavCollapsed())
  const docked = isDesktop && !onMessages && !collapsed
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setMenuOpen(false)
  }
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])
  const navOpen = docked || menuOpen
  const setNavOpen = (open: boolean) => {
    if (isDesktop && !onMessages) {
      setCollapsed(!open)
      writeNavCollapsed(!open)
    } else {
      setMenuOpen(open)
    }
  }

  // The number on the Requests link, for the people who decide them. Refreshed after every review
  // on the Requests page (same ['task-requests'] key prefix) and every half minute in between.
  const { data: pendingRequests = 0 } = useQuery({
    queryKey: ['task-requests', 'pending-count'],
    queryFn: fetchPendingRequestCount,
    enabled: isManager,
    refetchInterval: 30_000,
  })
  // Of those, the ones waiting past OVERDUE_HOURS — what turns the badge red as a reminder.
  const { data: overdueRequests = 0 } = useQuery({
    queryKey: ['task-requests', 'overdue-count'],
    queryFn: fetchOverdueRequestCount,
    enabled: isManager,
    refetchInterval: 60_000,
  })

  // New announcements addressed to you. Cleared when the Announcements page marks them seen (it
  // invalidates this key), otherwise checked every minute.
  const { data: unreadAnnouncements = 0 } = useQuery({
    queryKey: ['announcements', 'unread-count'],
    queryFn: fetchUnreadAnnouncementCount,
    enabled: Boolean(user),
    refetchInterval: 60_000,
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
  const sections = navSections(isManager, isAdmin, pendingRequests, overdueRequests, unreadAnnouncements)
  const searchPages = [
    ...sections.flatMap((section) => section.items.map(({ to, label, icon }) => ({ to, label, icon }))),
    { to: ownProfilePath, label: 'My profile', icon: UserRound },
  ]

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
                  : location.pathname === '/team-reports'
                  ? 'Team Reports'
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
                          : location.pathname === '/announcements'
                            ? 'Announcements'
                            : 'Dashboard'

  return (
    <MessagingProvider>
      <CallProvider>
        <CallBar />
        <div className="flex h-screen bg-gray-50">
          {user && !onMessages && <OnlineUsers />}
          {menuOpen && !docked && (
            <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          )}
          <aside
            id="app-menu"
            inert={!navOpen}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setMenuOpen(false)
            }}
            className={`flex w-64 max-w-[85vw] flex-col border-r border-gray-200 bg-white ${
              docked
                ? 'shrink-0'
                : `fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${menuOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`
            }`}
          >
              <div className="flex items-center justify-between px-5 py-5">
                <Logo />
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Hide navigation"
                  title="Hide navigation"
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-3 py-2">
                {sections.map((section) => (
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
                          <span
                            title={item.badgeTitle}
                            // Requests: accent while merely pending, red once any are overdue.
                            className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                              item.to === '/requests' && !item.urgent
                                ? 'bg-accent text-accent-foreground'
                                : 'bg-status-danger-text text-white'
                            }`}
                          >
                            {item.badge > 99 ? '99+' : item.badge}
                            <span className="sr-only">
                              {item.to === '/requests' ? ` pending${item.urgent ? `, ${item.badgeTitle}` : ''}` : ' new'}
                            </span>
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

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2.5 sm:px-6 sm:py-3">
              <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setNavOpen(!navOpen)}
                  aria-label={navOpen ? 'Hide navigation' : 'Show navigation'}
                  title={navOpen ? 'Hide navigation' : 'Show navigation'}
                  aria-expanded={navOpen}
                  aria-controls="app-menu"
                  className="-ml-1 shrink-0 rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
                >
                  <Menu className="h-5 w-5" />
                </button>
                {onMessages && (
                  <NavLink to="/" className="hidden shrink-0 sm:block" aria-label="Home">
                    <Logo className="h-6" />
                  </NavLink>
                )}
                <div className="min-w-0 truncate text-sm text-gray-500">
                  <NavLink to="/" className="hidden font-medium text-gray-700 hover:underline sm:inline">
                    Home
                  </NavLink>
                  <span className="mx-2 hidden sm:inline">/</span>
                  <span className="font-medium text-gray-700 sm:font-normal sm:text-gray-500">{crumb}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                {user && <GlobalSearch pages={searchPages} />}
                <ThemeToggle />
                {user && !onMessages && <MessagesButton />}
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
              className={`flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 ${user && !onMessages ? 'lg:pr-20' : ''}`}
            >
              {/* Tasks saved on this device while offline, until they're sent. */}
              <OfflineQueueBanner />
              {children}
              {/* Under the page's content, not pinned to the window: it scrolls into view at the
                  end. Left off Messages, which fills the screen with the conversation. */}
              {!onMessages && <AppFooter className="mt-10 pb-2" />}
            </main>
          </div>
        </div>
      </CallProvider>
    </MessagingProvider>
  )
}
