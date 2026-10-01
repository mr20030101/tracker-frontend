import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, ClipboardList, CornerDownLeft, Megaphone, Search, type LucideIcon } from 'lucide-react'
import { api, errorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fetchAnnouncements } from '../lib/announcements'
import { groupPath } from '../lib/groupChats'
import { useMessaging } from '../lib/messagingContext'
import { openResourceFile, resourceFilePath } from '../lib/resourceFiles'
import { contributorPath, contributorPathById, messagePath } from '../lib/urlRef'
import type { Project, Resource, TaskSubmission } from '../types'
import { Avatar } from './Avatar'
import { GroupIcon } from './GroupChat'
import { StatusPill } from './StatusPill'
import { SubmissionDetailsModal } from './SubmissionDetailsModal'
import { alertDialog } from '../lib/dialog'

export interface SearchPage {
  to: string
  label: string
  icon: LucideIcon
}

interface Result {
  key: string
  group: string
  label: string
  sublabel?: string
  icon: ReactNode
  trailing?: ReactNode
  run: () => void
}

const PER_GROUP = 5
const TASK_LIMIT = 6

function matches(term: string, ...fields: (string | null | undefined)[]) {
  return fields.some((f) => f?.toLowerCase().includes(term))
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

// The header's search button plus the Cmd/Ctrl-K palette: pages, people, group chats, tasks,
// resources and announcements in one place. Everything is searched with the viewer's own access, so
// nobody finds anything they couldn't already open.
export function GlobalSearch({ pages }: { pages: SearchPage[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        title={`Search (${IS_MAC ? '⌘' : 'Ctrl+'}K)`}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-sm text-gray-400 hover:bg-gray-100 sm:w-56 sm:px-3"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">Search...</span>
        <kbd className="hidden rounded border border-gray-200 bg-white px-1.5 text-[10px] font-medium text-gray-400 sm:inline">
          {IS_MAC ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {open && createPortal(<Palette pages={pages} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function Palette({ pages, onClose }: { pages: SearchPage[]; onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { usersById, myId, groups } = useMessaging()
  const isManager = user?.role === 'admin' || user?.role === 'lead'
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [viewingTask, setViewingTask] = useState<TaskSubmission | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const term = query.trim().toLowerCase()
  const taskTerm = useDebounced(term.replace(/[%,()]/g, ''), 200)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })
  const { data: resources = [] } = useQuery({
    queryKey: ['resources'],
    queryFn: async () => (await api.get<Resource[]>('/resources')).data,
    staleTime: 60_000,
  })
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    staleTime: 60_000,
  })
  // Row-level security decides whose tasks come back: a contributor's own, a lead's team, anyone for an admin.
  const { data: tasks = [], isFetching: tasksLoading } = useQuery({
    queryKey: ['global-search', 'tasks', taskTerm],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_submissions')
        .select('*')
        .or(`task_id.ilike.%${taskTerm}%,cb_email.ilike.%${taskTerm}%`)
        .order('date', { ascending: false })
        .limit(TASK_LIMIT)
      if (error) throw error
      return (data ?? []) as TaskSubmission[]
    },
    enabled: taskTerm.length >= 2,
    staleTime: 30_000,
  })

  const go = useCallback(
    (to: string) => {
      onClose()
      navigate(to)
    },
    [onClose, navigate],
  )

  const results = useMemo<Result[]>(() => {
    const out: Result[] = []
    const pageIcon = (Icon: LucideIcon) => <Icon className="h-4 w-4 text-gray-500" />

    for (const page of pages.filter((p) => !term || matches(term, p.label)).slice(0, term ? PER_GROUP : pages.length)) {
      out.push({ key: `page-${page.to}`, group: 'Pages', label: page.label, icon: pageIcon(page.icon), run: () => go(page.to) })
    }
    if (!term) return out

    const people = [...usersById.values()]
      .filter((u) => u.id !== myId && matches(term, u.name, u.email))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, PER_GROUP)
    for (const person of people) {
      // A contributor's profile is the useful page; leads, admins and the bot have none to show, so chat.
      const toProfile = person.role === 'contributor'
      out.push({
        key: `person-${person.id}`,
        group: 'People',
        label: person.name,
        sublabel: [person.is_bot ? 'Bot' : person.role, person.email].filter(Boolean).join(' · '),
        icon: <Avatar name={person.name} photoUrl={person.avatar_url} size={24} />,
        trailing: <span className="text-[11px] text-gray-400">{toProfile ? 'Profile' : 'Message'}</span>,
        run: () =>
          go(toProfile ? (person.email ? contributorPath(person.email) : contributorPathById(person.id)) : messagePath(person.id)),
      })
    }

    for (const g of groups.filter((g) => matches(term, g.name)).slice(0, PER_GROUP)) {
      out.push({
        key: `group-${g.id}`,
        group: 'Group chats',
        label: g.name,
        sublabel: `${g.members.length} members`,
        icon: <GroupIcon size={24} />,
        run: () => go(groupPath(g.id)),
      })
    }

    for (const t of tasks) {
      out.push({
        key: `task-${t.id}`,
        group: 'Tasks',
        label: t.task_id ?? '(no task ID)',
        sublabel: [isManager ? t.cb_email : null, t.date, projects.find((p) => p.id === t.project_id)?.name].filter(Boolean).join(' · '),
        icon: <ClipboardList className="h-4 w-4 text-gray-500" />,
        trailing: <StatusPill status={t.status} />,
        run: () => setViewingTask({ ...t, project: projects.find((p) => p.id === t.project_id) ?? null }),
      })
    }

    for (const r of resources.filter((r) => matches(term, r.title, r.category)).slice(0, PER_GROUP)) {
      out.push({
        key: `resource-${r.id}`,
        group: 'Resources',
        label: r.title,
        sublabel: [r.category, projects.find((p) => p.id === r.project_id)?.name].filter(Boolean).join(' · '),
        icon: <BookOpen className="h-4 w-4 text-gray-500" />,
        run: () => {
          onClose()
          const path = resourceFilePath(r.url)
          if (path) openResourceFile(path).catch((err) => alertDialog(errorMessage(err, 'Could not open this file.')))
          else window.open(r.url, '_blank', 'noopener,noreferrer')
        },
      })
    }

    for (const a of announcements.filter((a) => matches(term, a.title, a.body)).slice(0, PER_GROUP)) {
      out.push({
        key: `announcement-${a.id}`,
        group: 'Announcements',
        label: a.title,
        sublabel: `${a.author?.name ?? 'Unknown'} · ${new Date(a.created_at).toLocaleDateString()}`,
        icon: <Megaphone className="h-4 w-4 text-gray-500" />,
        run: () => go('/announcements'),
      })
    }
    return out
  }, [term, pages, usersById, myId, groups, tasks, resources, announcements, projects, isManager, go, onClose])

  // Keep the highlight on a real row as the list changes.
  const activeIndex = Math.min(active, Math.max(0, results.length - 1))
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[activeIndex]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (viewingTask) {
    return <SubmissionDetailsModal submission={viewingTask} onClose={onClose} />
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-50 bg-black/30" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
        className="mx-auto mt-[10vh] flex max-h-[70vh] w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search people, tasks, resources, pages..."
            aria-label="Search"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <kbd className="rounded border border-gray-200 px-1.5 text-[10px] text-gray-400">Esc</kbd>
        </div>

        <ul ref={listRef} className="flex-1 overflow-y-auto py-2" role="listbox">
          {results.map((r, index) => {
            const header = r.group !== lastGroup ? r.group : null
            lastGroup = r.group
            return (
              <li key={r.key}>
                {header && (
                  <div className="px-4 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400">{header}</div>
                )}
                <button
                  type="button"
                  data-index={index}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseMove={() => setActive(index)}
                  onClick={r.run}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${index === activeIndex ? 'bg-accent-bg' : ''}`}
                >
                  <span className="flex w-6 shrink-0 justify-center">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{r.label}</span>
                    {r.sublabel && <span className="block truncate text-xs text-gray-400">{r.sublabel}</span>}
                  </span>
                  {r.trailing}
                  {index === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                </button>
              </li>
            )
          })}
          {term && results.length === 0 && !tasksLoading && (
            <li className="px-4 py-8 text-center text-sm text-gray-400">Nothing matches "{query.trim()}".</li>
          )}
          {term && taskTerm.length >= 2 && tasksLoading && (
            <li className="px-4 py-2 text-xs text-gray-400">Searching tasks...</li>
          )}
          {term.length === 1 && <li className="px-4 py-2 text-xs text-gray-400">Type another letter to search tasks too.</li>}
        </ul>
      </div>
    </div>
  )
}
