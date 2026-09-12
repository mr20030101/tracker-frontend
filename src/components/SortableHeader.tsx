interface Props {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}

export function SortableHeader({ label, active, dir, onClick, align = 'left' }: Props) {
  return (
    <th className={`px-5 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={onClick}
        className={`flex items-center gap-1 font-medium uppercase tracking-wider ${
          align === 'right' ? 'ml-auto' : ''
        } ${active ? 'text-gray-900' : 'text-gray-500'}`}
      >
        {label}
        <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  )
}
