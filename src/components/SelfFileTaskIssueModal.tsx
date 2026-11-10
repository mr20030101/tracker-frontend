import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, RotateCw } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { buildTaskIssuesFormUrl, fileOwnTaskRequest } from '../lib/taskRequests'
import { Modal } from './Modal'
import { TimeRequestReasonModal, type TimeRequestMode, type TimeRequestType } from './TimeRequestReasonModal'

// Octet Mind only: a contributor files their own extension or reclaim on the TASK ISSUES form,
// without their lead. After the reason, the form opens in a new tab with their details filled in
// and the request is recorded as filed (file_own_task_request), so their lead sees it without
// having to act on it.
export function SelfFileTaskIssueModal({
  submissionId,
  taskId,
  cbEmail,
  remotasksId,
  type,
  mode,
  initialReason = '',
  onClose,
}: {
  submissionId: number
  taskId: string | null
  cbEmail: string | null
  remotasksId: string | null
  type: TimeRequestType
  mode: TimeRequestMode
  initialReason?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [opened, setOpened] = useState<{ url: string; reason: string } | null>(null)
  const record = useMutation({
    mutationFn: (reason: string) => fileOwnTaskRequest(submissionId, type, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-requests'] }),
  })

  if (!opened) {
    return (
      <TimeRequestReasonModal
        type={type}
        taskId={taskId}
        mode={mode}
        initialReason={initialReason}
        isPending={false}
        error={null}
        selfFile
        onSubmit={(next) => {
          const reason = next.trim()
          const url = buildTaskIssuesFormUrl({ requestType: type === 'reclaim' ? 'Reclaim' : 'Extend', taskId, cbEmail, remotaskId: remotasksId, reason })
          // Opened straight from the click, so pop-up blockers let it through.
          window.open(url, '_blank', 'noopener,noreferrer')
          setOpened({ url, reason })
          record.mutate(reason)
        }}
        onClose={onClose}
      />
    )
  }

  return (
    <Modal title="TASK ISSUES form opened" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm text-gray-600">
        <p>The form opened in a new tab with your details filled in. Pick the reason category there and submit it.</p>
        {record.isPending && <p className="text-gray-500">Recording your {type}...</p>}
        {record.isSuccess && <p className="font-medium text-status-success-text">Your {type} is recorded in the Tracker.</p>}
        {record.isError && (
          <p className="text-status-danger-text">
            {errorMessage(record.error, 'The Tracker couldn’t record it.')}{' '}
            <button type="button" onClick={() => record.mutate(opened.reason)} className="inline-flex items-center gap-1 font-semibold underline">
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href={opened.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-gray-500 underline hover:text-gray-700">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Tab didn’t open? Open the form
          </a>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <Check className="h-4 w-4" aria-hidden />
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
