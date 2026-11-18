import { useLayoutEffect, useRef, type TableHTMLAttributes } from 'react'

const HIDDEN_LABELS = new Set(['', 'actions'])

function labelCells(table: HTMLTableElement) {
  const labels = Array.from(table.tHead?.rows[0]?.cells ?? [], (th) => (th.textContent ?? '').replace(/[▲▼]/g, '').trim())
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      Array.from(row.cells).forEach((cell, i) => {
        const label = labels[i] ?? ''
        if (cell.colSpan > 1 || HIDDEN_LABELS.has(label.toLowerCase())) cell.removeAttribute('data-label')
        else if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label)
      })
    }
  }
}

/** A <table> that becomes a list of labelled cards on phones (see .stack-table in index.css). */
export function StackTable({ className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const ref = useRef<HTMLTableElement>(null)

  useLayoutEffect(() => {
    const table = ref.current
    if (!table) return
    labelCells(table)
    const observer = new MutationObserver(() => labelCells(table))
    observer.observe(table, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return <table ref={ref} className={`stack-table ${className}`} {...props} />
}
