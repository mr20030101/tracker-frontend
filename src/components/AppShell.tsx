import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { Avatar } from './Avatar'

const MANAGER_ROLES = ['admin', 'lead']

function navSections(isManager: boolean, ownProfilePath: string) {
  return [
    {
      label: 'Overview',
      items: [isManager ? { to: '/', label: 'Dashboard' } : { to: ownProfilePath, label: 'My Profile' }],
    },
    {
      label: 'Logs',
      items: [{ to: '/task-log', label: 'Task Log' }],
    },
    {
      label: 'Library',
      items: [{ to: '/resources', label: 'Resources' }],
    },
    {
      label: 'Team',
      items: isManager
        ? [
            { to: '/team', label: 'Team' },
            { to: '/users', label: 'Users' },
            { to: '/projects', label: 'Projects' },
          ]
        : [{ to: '/team', label: 'Team' }],
    },
  ]
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const ownProfilePath = user ? `/contributors/${encodeURIComponent(user.email)}` : '/'

  const crumb =
    location.pathname === '/task-log'
      ? 'Task Log'
      : location.pathname === '/resources'
        ? 'Resources'
        : location.pathname === '/team'
          ? 'Team'
          : location.pathname === '/users'
            ? 'Users'
            : location.pathname === '/projects'
              ? 'Projects'
              : location.pathname.startsWith('/contributors/')
              ? isManager
                ? 'CB Profile'
                : 'My Profile'
              : 'Dashboard'

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold">
            T
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Tracker</div>
            <div className="text-xs text-gray-400 leading-tight">Ops Console</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {navSections(isManager, ownProfilePath).map((section) => (
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
                    `block rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {user && (
          <div className="border-t border-gray-200 p-3">
            <div className="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-100">
              <Avatar name={user.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <div className="truncate text-xs text-gray-400 capitalize">{user.role}</div>
              </div>
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
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">Home</span>
            <span className="mx-2">/</span>
            <span>{crumb}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="search"
              placeholder="Search..."
              className="w-64 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            {user && <Avatar name={user.name} size={32} />}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
