import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { User } from '../types'

/**
 * The leads whose teams a team manager runs: their program's (the database only returns those).
 * Empty for anyone else. Same ['users'] key as the Users page, so it's usually already cached.
 */
export function useManagedLeadIds(role: string | undefined): Set<string> {
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
    enabled: role === 'team_manager',
  })
  return useMemo(() => new Set(role === 'team_manager' ? (data ?? []).filter((u) => u.role === 'lead').map((u) => u.id) : []), [data, role])
}
