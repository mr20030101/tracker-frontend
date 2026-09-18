const DIFF_VIEWER_BASE_URL = 'https://www.remotasks.com/lidarlite/'

export function remotasksDiffViewerUrl(taskId: string): string {
  const params = new URLSearchParams({ entrypoint: 'diff-viewer', sceneId: taskId })
  return `${DIFF_VIEWER_BASE_URL}?${params.toString()}`
}
