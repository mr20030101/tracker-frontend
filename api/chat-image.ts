// Vercel Function: saves a chat photo to Google Drive (POST) and shows one to the people in that
// chat (GET). See src/lib/chatImageGate.ts. Same environment as api/attendance-photo.ts.
// The .js extension is required: see api/apply.ts.
import { handleUploadChatImage, handleViewChatImage } from '../src/lib/chatImageGate.js'

export function POST(request: Request): Promise<Response> {
  return handleUploadChatImage(request, process.env)
}

export function GET(request: Request): Promise<Response> {
  return handleViewChatImage(request, process.env)
}
