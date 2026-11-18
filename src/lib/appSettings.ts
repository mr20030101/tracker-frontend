import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'

// App-wide switches an admin flips on the App Settings page (20261118_app_settings.sql).
export type AppSwitch = 'bulk_import' | 'hiring' | 'audits' | 'data_quality'
export type AppSwitches = Record<AppSwitch, boolean>

export const APP_SWITCHES_KEY = ['app-switches']

// What the app assumes until the switches load, or if they can't be read: Bulk Import stays
// hidden and nothing else disappears on a hiccup.
export const DEFAULT_APP_SWITCHES: AppSwitches = { bulk_import: false, hiring: true, audits: true, data_quality: true }

export async function fetchAppSwitches(): Promise<AppSwitches> {
  const { data, error } = await supabase.rpc('app_switches')
  if (error) throw error
  return { ...DEFAULT_APP_SWITCHES, ...((data ?? {}) as Partial<AppSwitches>) }
}

/** Admins only; the database refuses anyone else. */
export async function setAppSwitch(key: AppSwitch, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_app_switch', { p_key: key, p_enabled: enabled })
  if (error) throw error
}

/** `enabled`: false while signed out, as only signed-in people can read the switches. */
export function useAppSwitches(enabled = true): AppSwitches {
  const { data } = useQuery({ queryKey: APP_SWITCHES_KEY, queryFn: fetchAppSwitches, staleTime: 5 * 60_000, retry: false, enabled })
  return data ?? DEFAULT_APP_SWITCHES
}
