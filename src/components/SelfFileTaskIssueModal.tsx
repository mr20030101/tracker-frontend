import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../lib/api'
import { buildTaskIssuesFormUrl, fileOwnTaskRequest } from '../lib/taskRequests'
import { EmbeddedFormModal } from './EmbeddedFormModal'
import { TimeRequestReasonModal, type TimeRequestMode, type TimeRequestType } from './TimeRequestReasonModal'

// Octet Mind only: a contributor files their own extension or reclaim on the TASK ISSUES form,
// without their lead. The reason first, then the form inside the Tracker with their details
// filled in; once it reports it was submitted, the request is recorded here as already filed
// (file_own_task_request), so their lead sees it without having to act on it.
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
  const [reason, setReason] = useState<string | null>(null)
  const record = useMutation({
    mutationFn: () => fileOwnTaskRequest(submissionId, type, reason ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-requests'] }),
  })

  if (reason === null) {
    return (
      <TimeRequestReasonModal
        type={type}
        taskId={taskId}
        mode={mode}
        initialReason={initialReason}
        isPending={false}
        error={null}
        selfFile
        onSubmit={(next) => setReason(next.trim())}
        onClose={onClose}
      />
    )
  }

  const url = buildTaskIssuesFormUrl({
    requestType: type === 'reclaim' ? 'Reclaim' : 'Extend',
    taskId,
    cbEmail,
    remotaskId: remotasksId,
    reason,
  })

  return (
    <EmbeddedFormModal
      title="TASK ISSUES"
      url={url}
      onClose={onClose}
      onSubmitted={() => record.mutate()}
      status={
        record.isPending ? (
          <span className="text-xs text-gray-500">Saving...</span>
        ) : record.isSuccess ? (
          <span className="text-xs font-medium text-status-success-text">Submitted. Your {type} is recorded.</span>
        ) : record.isError ? (
          <span className="text-xs font-medium text-status-danger-text">
            {errorMessage(record.error, 'The form went in, but the Tracker couldn’t record it.')}{' '}
            <button type="button" onClick={() => record.mutate()} className="underline">
              Try again
            </button>
          </span>
        ) : null
      }
    />
  )
}
