import { ChevronLeft, ChevronRight } from 'lucide-react'

export const PAGE_SIZE = 25

/** "Showing 1–25 of 140" with Previous / Next, for a list paged on the server. */
export function PageFooter({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-200 px-5 py-3 text-xs text-gray-500">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Previous
        </button>
        <span>
          Page {page} of {lastPage}
        </span>
        <button
          type="button"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
