// The bouncing dots while someone is typing. `label` says who, where that isn't obvious (a group chat).
export function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      {label && <span className="px-2 text-[11px] text-gray-400">{label}</span>}
      <div className="max-w-md rounded-2xl bg-gray-100 px-3 py-2.5">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
        </div>
      </div>
    </div>
  )
}
