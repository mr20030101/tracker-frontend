const LOGO_DIR = '/images/greyowls/svg'

// Two <img>s, swapped by theme in index.css (.logo-on-light / .logo-on-dark):
// the standard lockup is near-invisible on the dark theme, so it needs the
// inverse artwork rather than a CSS filter.
// `mark`: the owl on its own, for where the full lockup doesn't fit (the collapsed sidebar).
export function Logo({ className = 'h-10', mark = false }: { className?: string; mark?: boolean }) {
  const artwork = mark ? 'mark' : 'logo-horizontal'
  return (
    <>
      <img src={`${LOGO_DIR}/${artwork}.svg`} alt="Grey Owls Tracker" className={`logo-on-light w-auto ${className}`} />
      <img
        src={`${LOGO_DIR}/${artwork}-inverse.svg`}
        alt="Grey Owls Tracker"
        className={`logo-on-dark w-auto ${className}`}
      />
    </>
  )
}
