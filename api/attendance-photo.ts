// Vercel Function: saves an attendance photo to Google Drive (POST) and shows one to whoever can
// see that attendance entry (GET). See src/lib/attendancePhotoGate.ts.
// Needs SUPABASE_SERVICE_ROLE_KEY, GOOGLE_DRIVE_FOLDER_ID and either GOOGLE_OAUTH_CLIENT_ID +
// GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN, or GOOGLE_SERVICE_ACCOUNT_EMAIL +
// GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, in the Vercel project's environment (see googleDrive.ts).
// The .js extension is required: see api/apply.ts.
import { handleUploadAttendancePhoto, handleViewAttendancePhoto } from '../src/lib/attendancePhotoGate.js'

export function POST(request: Request): Promise<Response> {
  return handleUploadAttendancePhoto(request, process.env)
}

export function GET(request: Request): Promise<Response> {
  return handleViewAttendancePhoto(request, process.env)
}
