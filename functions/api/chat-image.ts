// Cloudflare Pages Function: same as api/chat-image.ts on Vercel; see src/lib/chatImageGate.ts.
import { handleUploadChatImage, handleViewChatImage } from '../../src/lib/chatImageGate.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleUploadChatImage(request, env)
export const onRequestGet = ({ request, env }: PagesContext) => handleViewChatImage(request, env)
