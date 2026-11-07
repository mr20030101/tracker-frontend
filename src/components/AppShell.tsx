import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate } from 'animejs'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  MessageCircle,
  ClipboardList,
  ShieldCheck,
  ClipboardCheck,
  LineChart as LineChartIcon,
  History,
  BookOpen,
  Users as UsersIcon,
  FolderKanban,
  Trophy,
  Gift,
  UserPlus,
  Hourglass,
  MessageSquareText,
  CalendarCheck,
  Megaphone,
  UserRound,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { prefersReducedMotion } from '../lib/motion'
import { useStretchyPill } from '../lib/useStretchyPill'
import { MessagingProvider } from '../lib/messagingContext'
import { CallProvider } from '../lib/call'
import { CallBar } from './CallBar'
import { AccountMenu } from './AccountMenu'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { MessagesButton } from './MessagesButton'
import { OnlineUsers } from './OnlineUsers'
import { AttendanceBomb } from './AttendanceBomb'
import { GlobalSearch } from './GlobalSearch'
import { contributorPath } from '../lib/urlRef'
import { OVERDUE_HOURS, fetchOverdueRequestCount, fetchPendingRequestCount } from '../lib/taskRequests'
import { fetchUnreadAnnouncementCount } from '../lib/announcements'
import { fetchPendingFeedbackCount } from '../lib/taskFeedback'
import { AppFooter } from './AppFooter'
import { OfflineQueueBanner } from './OfflineQueueBanner'
import { useTeamFeatures } from '../lib/teamFeatures'

const MANAGER_ROLES = ['admin', 'lead']

function navSections(
  isManager: boolean,
  isAdmin: boolean,
  // Off when the person's team doesn't take attendance in the Tracker (never for an admin).
  attendanceEnabled: boolean,
  pendingRequests: number,
  overdueRequests: number,
  pendingFeedback: number,
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
        { to: '/rewards', label: 'Rewards', icon: Gift },
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
          { to: '/feedback', label: 'Feedback', icon: MessageSquareText, badge: pendingFeedback, badgeTitle: `${pendingFeedback} to check` },
          ...(attendanceEnabled ? [{ to: '/attendance', label: 'Attendance', icon: CalendarCheck }] : []),
          { to: '/audits', label: 'Audits', icon: ClipboardCheck },
          { to: '/data-quality', label: 'Data Quality', icon: ShieldCheck },
          { to: '/team-reports', label: 'Team Reports', icon: LineChartIcon },
          ...(isAdmin ? [{ to: '/activity-log', label: 'Activity Log', icon: History }] : []),
        ]
        : [
          { to: '/task-log', label: 'Task Log', icon: ClipboardList },
          { to: '/requests', label: 'Requests', icon: Hourglass },
          { to: '/feedback', label: 'Feedback', icon: MessageSquareText },
          ...(attendanceEnabled ? [{ to: '/attendance', label: 'Attendance', icon: CalendarCheck }] : []),
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
  const { user } = useAuth()
  const location = useLocation()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const isAdmin = user?.role === 'admin'
  const mainRef = useRef<HTMLElement>(null)
  const onMessages = location.pathname.startsWith('/messages')
  // On desktop the sidebar sits beside the page, and the menu button switches it between full width
  // and a narrow rail of icons (remembered). On smaller screens, and on Messages, it's a slide-out
  // menu, closed again whenever you navigate.
  const isDesktop = useIsDesktop()
  const [collapsed, setCollapsed] = useState(() => readNavCollapsed())
  const docked = isDesktop && !onMessages && !collapsed
  const rail = isDesktop && !onMessages && collapsed
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
  // The collapsed rail's name popup. Drawn outside the nav, which scrolls and would clip it.
  const [railTip, setRailTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const showRailTip = (el: HTMLElement, label: string) => {
    const box = el.getBoundingClientRect()
    setRailTip({ label, top: box.top + box.height / 2, left: box.right + 12 })
  }
  const tipHandlers = (label: string) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => e.pointerType === 'mouse' && showRailTip(e.currentTarget, label),
    onPointerLeave: () => setRailTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showRailTip(e.currentTarget, label),
    onBlur: () => setRailTip(null),
  })
  const edgeTipProps = (label: string) => (docked || rail ? tipHandlers(label) : {})
  const railTipProps = (label: string) =>
    rail
      ? {
          onPointerEnter: (e: React.PointerEvent<HTMLElement>) => e.pointerType === 'mouse' && showRailTip(e.currentTarget, label),
          onPointerLeave: () => setRailTip(null),
          onFocus: (e: React.FocusEvent<HTMLElement>) => showRailTip(e.currentTarget, label),
          onBlur: () => setRailTip(null),
        }
      : {}
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

  // Feedback reports waiting for a lead to check them. Refreshed after every check on the Feedback
  // page (same ['task-feedback'] key prefix) and every half minute in between.
  const { data: pendingFeedback = 0 } = useQuery({
    queryKey: ['task-feedback', 'pending-count'],
    queryFn: fetchPendingFeedbackCount,
    enabled: isManager,
    refetchInterval: 30_000,
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

  const navListRef = useRef<HTMLDivElement>(null)
  const activePill = useStretchyPill(navListRef, 'a[aria-current="page"]', 'y', [location.pathname, rail, docked, menuOpen])

  const ownProfilePath = user ? contributorPath(user.email) : '/'
  const { attendanceEnabled } = useTeamFeatures(user?.id)
  const sections = navSections(isManager, isAdmin, attendanceEnabled, pendingRequests, overdueRequests, pendingFeedback, unreadAnnouncements)
  const searchPages = [
    ...sections.flatMap((section) => section.items.map(({ to, label, icon }) => ({ to, label, icon }))),
    { to: ownProfilePath, label: 'My profile', icon: UserRound },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ]

  const crumb =
    location.pathname === '/settings'
      ? 'Settings'
      : location.pathname === '/leaderboard'
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
                            : location.pathname === '/requests'
                              ? 'Requests'
                              : location.pathname === '/feedback'
                                ? 'Feedback'
                                : location.pathname === '/attendance'
                                  ? 'Attendance'
                                  : 'Dashboard'

  return (
    <MessagingProvider>
      <CallProvider>
        <CallBar />
        <div className="relative isolate flex h-screen overflow-hidden">
          {user && !onMessages && <OnlineUsers />}
          {/* Contributors: the countdown to today's attendance closing, until they've filed. */}
          {user && <AttendanceBomb />}
          {menuOpen && !docked && (
            <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          )}
          <aside
            id="app-menu"
            inert={!navOpen && !rail}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setMenuOpen(false)
            }}
            className={`nav-dark flex flex-col bg-white ${
              docked || rail
                ? `relative my-3 ml-3 shrink-0 rounded-3xl transition-[width] duration-200 ease-soft ${docked ? 'w-64' : 'w-18'}`
                : `fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] rounded-r-3xl transition-transform duration-200 ease-soft ${menuOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`
            }`}
          >
            {rail ? (
              <div className="flex justify-center px-2 py-5">
                <Logo mark className="h-9" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 py-5 pl-5 pr-3">
                <Logo />
                {!docked && (
                  <button
                    type="button"
                    onClick={() => setNavOpen(false)}
                    aria-label="Close menu"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors duration-100 hover:bg-gray-200 hover:text-gray-900"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                )}
              </div>
            )}

            {/* The tab on the panel's edge that retracts it to icons and back. */}
            {(docked || rail) && (
              <button
                type="button"
                onClick={() => {
                  setRailTip(null)
                  setNavOpen(rail)
                }}
                aria-label={rail ? 'Expand menu' : 'Collapse menu'}
                aria-expanded={docked}
                aria-controls="app-menu"
                {...edgeTipProps(rail ? 'Expand menu' : 'Collapse menu')}
                className="absolute -right-3.5 top-7 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-card ring-4 ring-gray-50 transition-colors duration-100 after:absolute after:-inset-2 hover:bg-accent-bg"
              >
                {rail ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronLeft className="h-4 w-4" aria-hidden />}
              </button>
            )}

              {/* Still scrolls when the links don't fit, just without a scrollbar alongside them. */}
              <nav
                onScroll={() => setRailTip(null)}
                className={`flex-1 overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${rail ? 'px-2' : 'px-3'}`}
              >
                <div ref={navListRef} className="relative">
                <span aria-hidden className="pointer-events-none rounded-full bg-accent" style={activePill} />
                {sections.map((section) => (
                  <div key={section.label} className={rail ? 'mb-2 border-b border-gray-100 pb-2 last:border-0' : 'mb-4'}>
                    {/* On the rail a thin divider stands in for the section's name. */}
                    <div
                      className={
                        rail ? 'sr-only' : 'px-2 pb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400'
                      }
                    >
                      {section.label}
                    </div>
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end
                        // On the rail the icon is all that shows, so its name pops up beside it on hover or focus.
                        {...railTipProps(item.badge ? `${item.label} · ${item.badge > 99 ? '99+' : item.badge}` : item.label)}
                        className={({ isActive }) =>
                          `relative flex items-center rounded-full text-sm font-medium transition-colors duration-300 ${
                            rail ? 'mx-auto h-11 w-11 justify-center' : 'gap-2.5 px-3.5 py-2.5'
                          } ${isActive ? 'text-accent-foreground' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
                        }
                      >
                        <item.icon className={`${rail ? 'h-5 w-5' : 'h-4 w-4'} shrink-0`} strokeWidth={2} />
                        <span className={rail ? 'sr-only' : undefined}>{item.label}</span>
                        {item.badge ? (
                          <span
                            title={item.badgeTitle}
                            // Requests: accent while merely pending, red once any are overdue. On the rail
                            // it sits on the icon's corner.
                            className={`flex items-center justify-center rounded-full font-bold ${
                              rail ? 'absolute right-1 top-0.5 h-4 min-w-4 px-1 text-[10px]' : 'ml-auto h-5 min-w-5 px-1.5 text-[11px]'
                            } ${
                              item.urgent
                                ? 'bg-status-danger-text text-white'
                                : 'bg-gray-900 text-gray-50'
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
                </div>
              </nav>

          </aside>

          {railTip && (
            <div
              role="tooltip"
              style={{ top: railTip.top, left: railTip.left }}
              className="nav-tip pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-ink-foreground shadow-card"
            >
              {railTip.label}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-1 sm:px-6 sm:pt-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                {!(isDesktop && !onMessages) && (
                <button
                  type="button"
                  onClick={() => setNavOpen(!navOpen)}
                  aria-label={rail ? 'Expand navigation' : navOpen ? (docked ? 'Collapse navigation' : 'Hide navigation') : 'Show navigation'}
                  title={rail ? 'Expand navigation' : navOpen ? (docked ? 'Collapse navigation' : 'Hide navigation') : 'Show navigation'}
                  aria-expanded={navOpen}
                  aria-controls="app-menu"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-card transition-colors duration-100 hover:bg-gray-100"
                >
                  <Menu className="h-5 w-5" />
                </button>
                )}
                {onMessages && (
                  <NavLink to="/" className="hidden shrink-0 sm:block" aria-label="Home">
                    <Logo className="h-6" />
                  </NavLink>
                )}
                <div className="hidden min-w-0 truncate rounded-full bg-white/60 px-4 py-2.5 text-sm text-gray-500 sm:block">
                  <NavLink to="/" className="hidden font-medium text-gray-700 hover:underline sm:inline">
                    Home
                  </NavLink>
                  <span className="mx-2 hidden sm:inline">/</span>
                  <span className="font-medium text-gray-700 sm:font-normal sm:text-gray-500">{crumb}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                {user && <GlobalSearch pages={searchPages} />}
                {user && !onMessages && <MessagesButton />}
                {user && <NotificationBell />}
                {user && <AccountMenu />}
              </div>
            </header>

            <main
              ref={mainRef}
              className={`relative flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] sm:px-6 sm:py-6 [&::-webkit-scrollbar]:hidden ${user && !onMessages ? 'lg:pr-20' : ''}`}
            >
              {/* Tasks saved on this device while offline, until they're sent. */}
              <OfflineQueueBanner />
              {children}
              {/* Under the page's content, not pinned to the window: it scrolls into view at the
                  end. Left off Messages, which fills the screen with the conversation. */}
              {!onMessages && <AppFooter className="mt-10 pb-2" releaseNotes />}
            </main>
          </div>
        </div>
      </CallProvider>
    </MessagingProvider>
  )
}
