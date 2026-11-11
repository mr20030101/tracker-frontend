import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LayoutDashboard } from 'lucide-react'
import { FoldText } from '../components/FoldText'
import FuzzyText from '../components/FuzzyText'
import { usePageTitle } from '../lib/usePageTitle'

/** Any address the app doesn't have (or one this account can't open). */
export function NotFound() {
  usePageTitle('Page not found')
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Opened straight from a link or bookmark there's nothing in the app to go back to.
  const canGoBack = window.history.state?.idx > 0

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start py-10 sm:py-16">
      <div className="-ml-12 max-w-full overflow-hidden text-gray-300" aria-hidden>
        <FuzzyText fontSize="clamp(6rem, 22vw, 10rem)" fontWeight={300} fontFamily="Outfit, Inter, sans-serif" intro baseIntensity={0.15} hoverIntensity={0.45}>
          404
        </FuzzyText>
      </div>
      <h1 className="mt-6 text-4xl font-normal text-gray-900 sm:text-5xl">
        <FoldText text="This page flew the nest" />
      </h1>
      <p className="mt-4 text-base text-gray-600">
        There's nothing at <span className="break-all rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-800">{pathname}</span>.
        The link may be old or mistyped, or the page may be one your account can't open.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors duration-100 hover:bg-accent-hover"
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden />
          Go to the dashboard
        </Link>
        {canGoBack && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-gray-800 shadow-card transition-colors duration-100 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Go back
          </button>
        )}
      </div>
    </section>
  )
}
