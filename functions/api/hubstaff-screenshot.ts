// Cloudflare Pages Function: same as api/hubstaff-screenshot.ts on Vercel; see
// src/lib/hubstaffScreenshotGate.ts.
import { handleUploadHubstaffScreenshot, handleViewHubstaffScreenshot } from '../../src/lib/hubstaffScreenshotGate.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleUploadHubstaffScreenshot(request, env)
export const onRequestGet = ({ request, env }: PagesContext) => handleViewHubstaffScreenshot(request, env)
