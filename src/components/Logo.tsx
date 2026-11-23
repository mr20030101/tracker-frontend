import { useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useTeamFeatures } from '../lib/teamFeatures'

// The RST team has its own logo, a sister brand to Grey Owls (public/images/rst). RST contributors
// and leads (their team's program) and the RST team manager see it; admins, Bootcamp and anyone
// signed out see the owl.
// `lockup`: the full logo's file. RST's uses logo-app, its lockup without the "Robotics Special
// Tasker" line, which is a few pixels tall (unreadable) at the sizes the app shows logos.
const BRANDS = {
  greyowls: { dir: '/images/greyowls/svg', name: 'Grey Owls Tracker', lockup: 'logo-horizontal' },
  rst: { dir: '/images/rst/svg', name: 'RST', lockup: 'logo-app' },
} as const
type Brand = keyof typeof BRANDS

// The last logo shown to each user in this browser, so a reload shows the right one straight away
// instead of the owl until their team's program has loaded.
const storageKey = (userId: string) => `logo-brand:${userId}`

function rememberedBrand(userId: string | undefined): Brand | null {
  if (!userId) return null
  try {
    const saved = localStorage.getItem(storageKey(userId))
    return saved === 'rst' || saved === 'greyowls' ? saved : null
  } catch {
    return null
  }
}

/** The logo to show, or null while a lead's or contributor's program is still unknown. */
function useBrand(): Brand | null {
  const { user } = useAuth()
  const onTeam = user?.role === 'lead' || user?.role === 'contributor'
  const team = useTeamFeatures(onTeam ? user.id : null)
  const known: Brand | null = !user
    ? 'greyowls'
    : user.role === 'team_manager'
      ? user.program === 'rst' ? 'rst' : 'greyowls'
      : !onTeam
        ? 'greyowls'
        : team.loaded
          ? team.program === 'rst' ? 'rst' : 'greyowls'
          : null

  useEffect(() => {
    if (!user || !known) return
    try {
      localStorage.setItem(storageKey(user.id), known)
    } catch {
      // Not remembering only means a brief blank logo on the next load.
    }
  }, [user, known])

  return known ?? rememberedBrand(user?.id)
}

// Two <img>s, swapped by theme in index.css (.logo-on-light / .logo-on-dark):
// the standard lockup is near-invisible on the dark theme, so it needs the
// inverse artwork rather than a CSS filter.
// `mark`: the owl (or RST robot) on its own, for where the full lockup doesn't fit (the collapsed sidebar).
export function Logo({ className = 'h-10', mark = false }: { className?: string; mark?: boolean }) {
  const brand = useBrand()
  // Not known yet (first visit in this browser): hold the space rather than flash the wrong logo.
  if (!brand) return <span aria-hidden className={`block ${mark ? 'aspect-square' : 'aspect-[3/1]'} ${className}`} />
  const { dir, name, lockup } = BRANDS[brand]
  const artwork = mark ? 'mark' : lockup
  return (
    <>
      <img src={`${dir}/${artwork}.svg`} alt={name} className={`logo-on-light w-auto ${className}`} />
      <img src={`${dir}/${artwork}-inverse.svg`} alt={name} className={`logo-on-dark w-auto ${className}`} />
    </>
  )
}
