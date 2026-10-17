import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppFooter } from '../components/AppFooter'
import { Logo } from '../components/Logo'
import { usePageTitle } from '../lib/usePageTitle'

// Public, so it works signed out: Google's OAuth consent screen links here (the app's Google Drive
// access stores attendance photos, see src/lib/googleDrive.ts). Keep it in step with what the app
// actually collects and where it goes.
const CONTACT_EMAIL = 'sheanlouisemargallo@gmail.com'
const UPDATED = 'October 17, 2026'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  )
}

export function Privacy() {
  usePageTitle('Privacy Policy')
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link to="/" className="self-start">
          <Logo />
        </Link>
        <article className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <header>
            <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
            <p className="mt-1 text-sm text-gray-500">Last updated {UPDATED}</p>
          </header>

          <p className="text-sm leading-relaxed text-gray-600">
            Grey Owls Tracker is a private tool the Grey Owls team uses to log and track annotation work. Only people the team gives an
            account can sign in. This page explains what the Tracker keeps about you and who can see it.
          </p>

          <Section title="What we keep">
            <ul className="list-disc pl-5">
              <li>Your account: name, email, role, team lead, profile photo and Remotasks ID.</li>
              <li>Your work: the tasks you log, requests, feedback reports, and the messages and announcements you send.</li>
              <li>
                Your daily attendance: the hours you expect to work, your tasking status, any Task ID and screenshot link you give, and
                a photo you take with your camera when you file it.
              </li>
              <li>Sign-in activity, such as when you last signed in, to keep accounts secure.</li>
            </ul>
          </Section>

          <Section title="Attendance photos and Google Drive">
            <p>
              When you file your attendance, the photo you take is uploaded to a private folder in the team's Google Drive. It is not
              stored in the Tracker's database, which only keeps a reference to the file. The photo can be opened from the Tracker by
              you, your team lead and the Tracker's admins, and by no one else.
            </p>
            <p>
              The Tracker uses Google Drive only to save these photos in that one folder and to show them to the people above. It
              doesn't read or change any other files.
            </p>
            <p>
              Grey Owls Tracker's use and transfer of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </Section>

          <Section title="Who sees your information">
            <p>
              Your team lead and the Tracker's admins can see your work and attendance. Other contributors see only what's shown on
              leaderboards and profiles. Your attendance answers (not your photo) are also sent to the team's attendance Google Form,
              which the team's coordinators use.
            </p>
            <p>We don't sell your information, use it for advertising, or share it with anyone outside the team except the services that run the Tracker.</p>
          </Section>

          <Section title="Services that run the Tracker">
            <ul className="list-disc pl-5">
              <li>Supabase, which hosts the Tracker's database and sign-in.</li>
              <li>Vercel, which hosts the website.</li>
              <li>Google, for attendance photos (Google Drive) and the attendance Google Form.</li>
            </ul>
          </Section>

          <Section title="Keeping or removing your information">
            <p>
              Your information is kept while you're part of the team. To ask what we hold about you, or to have it corrected or removed,
              contact your team lead or email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-700 underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </article>
        <AppFooter />
      </div>
    </div>
  )
}
