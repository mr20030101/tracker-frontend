// Vercel Function: saves an RST contributor's Hubstaff screenshot to Google Drive (POST) and shows
// one to whoever can see that entry (GET). See src/lib/hubstaffScreenshotGate.ts. Same environment
// as api/attendance-photo.ts. The .js extension is required: see api/apply.ts.
import { handleUploadHubstaffScreenshot, handleViewHubstaffScreenshot } from '../src/lib/hubstaffScreenshotGate.js'

export function POST(request: Request): Promise<Response> {
  return handleUploadHubstaffScreenshot(request, process.env)
}

export function GET(request: Request): Promise<Response> {
  return handleViewHubstaffScreenshot(request, process.env)
}
