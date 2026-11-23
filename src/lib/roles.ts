import type { Role } from '../types'

/** Roles that manage contributors: admins, team managers and leads. */
export const MANAGER_ROLES: string[] = ['admin', 'team_manager', 'lead']

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  team_manager: 'Team manager',
  lead: 'Lead',
  contributor: 'Contributor',
}

export const PROGRAM_LABELS = { bootcamp: 'Bootcamp', rst: 'RST' } as const

export function isManagerRole(role: string | undefined | null): boolean {
  return Boolean(role && MANAGER_ROLES.includes(role))
}

/**
 * Sees more than one team: an admin (every team) or a team manager (every team in their program).
 * The database decides which teams; the app shows the team pickers and "every team" views.
 */
export function seesManyTeams(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'team_manager'
}
