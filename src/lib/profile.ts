import { supabase } from './api'
import type { User } from '../types'

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/avatar.${ext}`
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    cacheControl: '3600',
  })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

export async function updateOwnProfile(name: string, avatarUrl: string | null): Promise<User> {
  const { data, error } = await supabase.rpc('update_own_profile', { new_name: name, new_avatar_url: avatarUrl })
  if (error) throw error
  return data as User
}

export async function clearMustChangePassword(): Promise<void> {
  const { error } = await supabase.rpc('clear_must_change_password')
  if (error) throw error
}
