// Cloudflare Pages Function: same as api/support-screenshot.ts on Vercel; see
// src/lib/supportScreenshotGate.ts.
import { handleUploadSupportScreenshot, handleViewSupportScreenshot } from '../../src/lib/supportScreenshotGate.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleUploadSupportScreenshot(request, env)
export const onRequestGet = ({ request, env }: PagesContext) => handleViewSupportScreenshot(request, env)
