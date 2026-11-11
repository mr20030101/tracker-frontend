import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppFooter } from './AppFooter'
import { FoldText } from './FoldText'
import { Logo } from './Logo'

export const LEGAL_CONTACT_EMAIL = 'sheanlouisemargallo@gmail.com'

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  )
}

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:/.test(href)
  if (!external && !href.startsWith('mailto:')) {
    return (
      <Link to={href} className="text-sky-700 underline">
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className="text-sky-700 underline" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  )
}

export function ContactEmail() {
  return <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</LegalLink>
}

/** The public page shell for the Privacy Policy and the Terms: works signed out. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link to="/" className="self-start">
          <Logo />
        </Link>
        <article className="card flex flex-col gap-6 p-6 sm:p-8">
          <header>
            <h1 className="text-3xl font-medium text-gray-900 sm:text-4xl">
              <FoldText text={title} />
            </h1>
            <p className="mt-1 text-sm text-gray-500">Last updated {updated}</p>
          </header>
          {children}
        </article>
        <AppFooter />
      </div>
    </div>
  )
}
