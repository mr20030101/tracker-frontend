import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Search } from 'lucide-react'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import { searchTaskSubmissions, STAGE_LABELS, type TaskMatch } from '../lib/taskAudits'
import type { User } from '../types'
import { Avatar } from './Avatar'
import { StatusPill } from './StatusPill'
import { CopyButton } from './SubmissionDetailsModal'

// How many matches to list at once.
const SHOWN = 20

/** One logged task as the picker shows it: the CB, then the task ID with its project, stage and date. */
function TaskSummary({ task, cb }: { task: TaskMatch; cb: User }) {
  return (
    <>
      <Avatar name={cb.name} photoUrl={cb.avatar_url} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm text-gray-900">{task.task_id}</div>
        <div className="truncate text-xs text-gray-500">
          {cb.name} · {[task.project?.name, STAGE_LABELS[task.stage], task.date].filter(Boolean).join(' · ')}
        </div>
      </div>
    </>
  )
}

// Picking the CB's logged task to audit, by searching its task ID or the CB's name or email. The list only shows while the
// search box has focus; with nothing typed it shows the team's latest submitted tasks. Arrow keys
// move through it, Enter picks, Escape hides it. Tasks already audited are listed but can't be picked.
export function TaskPicker({
  value,
  onChange,
  team,
  auditedIds,
}: {
  value: TaskMatch | null
  onChange: (task: TaskMatch | null) => void
  team: User[]
  auditedIds: Set<number>
}) {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Search a moment after typing stops, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const byEmail = useMemo(() => new Map(team.map((u) => [u.email.toLowerCase(), u])), [team])
  // The team's CBs whose name or email matches, so "bryan" lists Bryan's tasks.
  const cbEmails = useMemo(() => {
    const t = term.toLowerCase()
    return t ? team.filter((u) => u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t)).map((u) => u.email) : []
  }, [team, term])
  const { data: found = [], isFetching, error } = useQuery({
    queryKey: ['task-search', term, cbEmails],
    queryFn: () => searchTaskSubmissions(term, cbEmails),
    enabled: open,
    staleTime: 30_000,
  })
  // Only the chosen team's tasks (an admin's search returns everyone's).
  const matches = useMemo(
    () =>
      found
        .map((task) => ({ task, cb: byEmail.get(task.cb_email.toLowerCase()) }))
        .filter((m): m is { task: TaskMatch; cb: User } => Boolean(m.cb))
        .slice(0, SHOWN),
    [found, byEmail],
  )

  function pick(i: number) {
    const m = matches[i]
    if (!m || auditedIds.has(m.task.id)) return
    onChange(m.task)
    setQuery('')
  }

  function move(delta: number) {
    if (matches.length === 0) return
    const next = (active + delta + matches.length) % matches.length
    setActive(next)
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
  }

  const chosenCb = value ? byEmail.get(value.cb_email.toLowerCase()) : undefined
  if (value && chosenCb) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <div className="flex items-center gap-3">
          <TaskSummary task={value} cb={chosenCb} />
          <StatusPill status={value.status} />
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-gray-200 pt-2">
          {/* Opens the CB's work in Remotasks in a new tab, to check it before scoring. */}
          <a
            href={remotasksDiffViewerUrl(value.task_id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-gray-200 hover:bg-sky-50"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open in Remotasks
          </a>
          <CopyButton text={value.task_id} label="Copy ID" />
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setActive(0)
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
            className="ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-white"
          >
            Change task
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 focus-within:border-accent">
      <div className={`relative ${open ? 'border-b border-gray-100' : ''}`}>
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="task-picker-list"
          aria-activedescendant={matches[active] ? `task-option-${matches[active].task.id}` : undefined}
          aria-label="Search by task ID or CB"
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(active)
            }
          }}
          placeholder="Search by task ID, or a CB's name or email"
          className="h-10 w-full bg-white pl-9 pr-3 font-mono text-sm outline-none placeholder:font-sans"
        />
      </div>
      {open && (
        <>
          <div className="px-3 pt-2 text-xs font-medium text-gray-400">{term ? 'Matching tasks' : 'Latest submitted tasks'}</div>
          <div ref={listRef} id="task-picker-list" role="listbox" className="max-h-64 overflow-y-auto py-1">
            {matches.map(({ task, cb }, i) => {
              const audited = auditedIds.has(task.id)
              return (
                <button
                  key={task.id}
                  id={`task-option-${task.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={audited}
                  // Keeps focus in the search box, so the list doesn't close before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left ${i === active && !audited ? 'bg-accent-bg' : ''} ${
                    audited ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                >
                  <TaskSummary task={task} cb={cb} />
                  {audited ? <span className="shrink-0 text-xs text-gray-500">Audited</span> : <StatusPill status={task.status} />}
                </button>
              )
            })}
          </div>
          {matches.length === 0 && (
            <div className="px-3 pb-3 text-sm text-gray-500">
              {error
                ? `Could not search: ${(error as Error).message}`
                : isFetching || query.trim() !== term
                  ? 'Searching...'
                  : term
                    ? `No task ID or CB matches “${term}”.`
                    : 'Your CBs have no submitted tasks yet.'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
