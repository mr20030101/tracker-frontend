// Vercel Function: saves a Support screenshot to Google Drive (POST) and shows one to the reporter
// or an admin (GET). See src/lib/supportScreenshotGate.ts. Same environment as api/attendance-photo.ts.
// The .js extension is required: see api/apply.ts.
import { handleUploadSupportScreenshot, handleViewSupportScreenshot } from '../src/lib/supportScreenshotGate.js'

export function POST(request: Request): Promise<Response> {
  return handleUploadSupportScreenshot(request, process.env)
}

export function GET(request: Request): Promise<Response> {
  return handleViewSupportScreenshot(request, process.env)
}
