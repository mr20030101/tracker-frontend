import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'

// Photos in chat go to Google Drive through api/chat-image (see chatImageGate.ts).
const ENDPOINT = '/api/chat-image'
const MAX_EDGE = 1600
const MAX_BYTES = 1500 * 1024
export const MAX_CHAT_IMAGES = 4

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again to send a photo.')
  return token
}

/** Any picked or pasted image, shrunk to fit MAX_EDGE and re-encoded as a JPEG under MAX_BYTES. */
export async function chatImageToJpeg(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That image could not be read. Try another one.')
  })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('That image could not be read. Try another one.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new Error('That photo is too large. Try a smaller one.')
}

/** Uploads a JPEG, reporting progress (0–1), and returns the ref the message carries. */
export async function uploadChatImage(jpeg: Blob, onProgress: (fraction: number) => void): Promise<string> {
  const token = await accessToken()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', ENDPOINT)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'image/jpeg')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => reject(new Error("Your photo couldn't be sent. Check your connection and try again."))
    xhr.onload = () => {
      let body: { ref?: string; message?: string } | null = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.ref) resolve(body.ref)
      else reject(new Error(body?.message || "Your photo couldn't be saved. Please try again."))
    }
    xhr.send(jpeg)
  })
}

async function fetchChatImage(ref: string): Promise<Blob> {
  const response = await fetch(`${ENDPOINT}?ref=${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || "This photo couldn't be loaded.")
  }
  return response.blob()
}

/** A chat photo as an object URL (the endpoint needs the session token, so <img src> can't fetch it). */
export function useChatImage(ref: string) {
  return useQuery({
    queryKey: ['chat-image', ref],
    queryFn: async () => URL.createObjectURL(await fetchChatImage(ref)),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  })
}
