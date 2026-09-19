const LOGO_DIR = '/images/greyowls/svg'

// Two <img>s, swapped by theme in index.css (.logo-on-light / .logo-on-dark):
// the standard lockup is near-invisible on the dark theme, so it needs the
// inverse artwork rather than a CSS filter.
export function Logo({ className = 'h-10' }: { className?: string }) {
  return (
    <>
      <img src={`${LOGO_DIR}/logo-horizontal.svg`} alt="Grey Owls Tracker" className={`logo-on-light w-auto ${className}`} />
      <img
        src={`${LOGO_DIR}/logo-horizontal-inverse.svg`}
        alt="Grey Owls Tracker"
        className={`logo-on-dark w-auto ${className}`}
      />
    </>
  )
}
