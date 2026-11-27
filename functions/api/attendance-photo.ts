// Cloudflare Pages Function: same as api/attendance-photo.ts on Vercel; see
// src/lib/attendancePhotoGate.ts. Needs the same secrets (Supabase service role and Google Drive).
import { handleUploadAttendancePhoto, handleViewAttendancePhoto } from '../../src/lib/attendancePhotoGate.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleUploadAttendancePhoto(request, env)
export const onRequestGet = ({ request, env }: PagesContext) => handleViewAttendancePhoto(request, env)
