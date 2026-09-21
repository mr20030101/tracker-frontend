import { useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { Select } from './Select'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    align?: 'left' | 'right'
  }
}

// How many rows a page can show. The table's own default (the pageSize prop) is added if it isn't one of these.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 500]

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  getRowId?: (row: TData) => string
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  isLoading?: boolean
  emptyMessage?: string
  /** The number of rows shown per page to start with. The viewer can change it from the footer. */
  pageSize?: number
  paginate?: boolean
  rowClassName?: (row: TData) => string
  /** Scroll sideways when the columns are wider than the container, instead of clipping them. */
  scrollX?: boolean
  /** Called when a row is clicked anywhere except on a button, link or other control inside it. */
  onRowClick?: (row: TData) => void
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  isLoading,
  emptyMessage = 'No results.',
  pageSize = 10,
  paginate = true,
  rowClassName,
  scrollX = false,
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, ...(paginate ? { pagination } : {}), ...(rowSelection ? { rowSelection } : {}) },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange,
    enableRowSelection: Boolean(onRowSelectionChange),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(paginate ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  })

  const pageSizeOptions = useMemo(
    () => [...new Set([...PAGE_SIZE_OPTIONS, pageSize])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: String(n) })),
    [pageSize],
  )

  const pageCount = table.getPageCount()
  useEffect(() => {
    if (!paginate) return
    if (pagination.pageIndex > 0 && pagination.pageIndex >= pageCount) {
      setPagination((p) => ({ ...p, pageIndex: Math.max(0, pageCount - 1) }))
    }
  }, [paginate, pageCount, pagination.pageIndex])

  const rows = table.getRowModel().rows
  const total = data.length
  const from = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const to = Math.min(total, from + pagination.pageSize - 1)

  return (
    <div className={`${scrollX ? 'overflow-x-auto' : 'overflow-hidden'} rounded-xl border border-gray-200 bg-white`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const align = header.column.columnDef.meta?.align
                const isSelectCol = header.column.id === 'select'
                return (
                  <th
                    key={header.id}
                    className={`${isSelectCol ? 'w-10 px-4' : 'px-5'} py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className={`flex items-center gap-1 font-medium uppercase tracking-wider ${
                          align === 'right' ? 'ml-auto' : ''
                        } ${header.column.getIsSorted() ? 'text-gray-900' : 'text-gray-500'}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-[10px]">
                          {header.column.getIsSorted() === 'asc' ? '▲' : header.column.getIsSorted() === 'desc' ? '▼' : ''}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading && (
            <tr>
              <td colSpan={columns.length} className="px-5 py-6 text-center text-gray-400">
                Loading...
              </td>
            </tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-5 py-6 text-center text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!isLoading &&
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={
                  onRowClick
                    ? (e) => {
                        if (!(e.target as HTMLElement).closest('a, button, input, select, textarea, label')) onRowClick(row.original)
                      }
                    : undefined
                }
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row.original) ?? ''}`}
              >
                {row.getVisibleCells().map((cell) => {
                  const align = cell.column.columnDef.meta?.align
                  const isSelectCol = cell.column.id === 'select'
                  return (
                    <td
                      key={cell.id}
                      className={`${isSelectCol ? 'w-10 px-4' : 'px-5'} py-3 ${align === 'right' ? 'text-right' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
        </tbody>
      </table>
      {!isLoading && paginate && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-200 px-5 py-3 text-xs text-gray-500">
          <span>
            Showing {from}–{to} of {total}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Pointless when everything already fits on the smallest page. */}
            {total > Number(pageSizeOptions[0].value) && (
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <Select
                  value={String(pagination.pageSize)}
                  onChange={(value) => table.setPageSize(Number(value))}
                  options={pageSizeOptions}
                  aria-label="Rows per page"
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 outline-none focus:border-accent"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {pagination.pageIndex + 1} of {Math.max(1, pageCount)}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
