import { ContactEmail, LegalLink, LegalPage, LegalSection } from '../components/LegalPage'
import { usePageTitle } from '../lib/usePageTitle'

// Public, so it works signed out: Google's OAuth consent screen links here (the app's Google Drive
// access stores attendance photos, see src/lib/googleDrive.ts). Keep it in step with what the app
// actually collects and where it goes.
const UPDATED = 'November 11, 2026'

export function Privacy() {
  usePageTitle('Privacy Policy')
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <p className="text-sm leading-relaxed text-gray-600">
        Grey Owls Tracker is a private tool the Grey Owls team uses to log and track annotation work. Only people the team gives an account
        can sign in; the one public page is the job application. This page explains what the Tracker keeps about you, why, and who can see
        it. Using the Tracker is also covered by the <LegalLink href="/terms">Terms and Conditions</LegalLink>.
      </p>

      <LegalSection title="What we keep">
        <ul className="list-disc pl-5">
          <li>Your account: name, email, role, team lead, profile photo, Remotasks ID and the projects you're assigned, with your level on each.</li>
          <li>
            Your work: the tasks you log (task ID, project, stage, status, screenshot link and how long each task's timer ran), extension,
            reclaim and unclaim requests, bad video reports, feedback reports, rewards and badges.
          </li>
          <li>
            Your daily attendance: the hours you expect to work, your tasking status, any task ID and screenshot link you give, and a photo
            you take with your camera or upload when you file it.
          </li>
          <li>Messages, calls and announcements, for teams that have messaging on (see below).</li>
          <li>Sign-in activity, such as when you last signed in and whether you're online, to keep accounts secure and show your lead who is working.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Job applications">
        <p>
          If you apply through an application link, we keep what you enter: full name, email, Facebook profile link, Remotasks email and ID,
          your computer's processor, graphics card and its memory, and your answers about robotics experience, owning a personal computer and
          having a stable internet connection. Your lead and the Tracker's admins use it to review your application and move it through
          hiring.
        </p>
        <p>
          Applications are open to applicants in the Philippines only. To check, the country is read from your IP address when the page loads
          and when you submit. Cloudflare Turnstile checks that a person, not a bot, is submitting, and is given your IP address for that check.
          The Tracker doesn't store your IP address. We email you about your application, and if you're accepted, your sign-in details.
        </p>
      </LegalSection>

      <LegalSection title="Attendance photos and Google Drive">
        <p>
          Before an attendance photo is saved, your browser checks that it shows a face (and a person rather than an animal or a baby). This
          check runs only on your device: no face data, measurements or scores are sent or kept. The saved photo carries the label drawn on it.
        </p>
        <p>
          The photo is uploaded to a private folder in the team's Google Drive, in a sub-folder for that day. It is not stored in the Tracker's
          database, which only keeps a reference to the file. The photo can be opened from the Tracker by you, your team lead and the Tracker's
          admins, and by no one else.
        </p>
        <p>
          The Tracker uses Google Drive only to save these photos in that one folder and to show them to the people above. It doesn't read or
          change any other files.
        </p>
        <p>
          Grey Owls Tracker's use and transfer of information received from Google APIs adheres to the{' '}
          <LegalLink href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</LegalLink>,
          including the Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection title="Google Forms the team files work on">
        <p>The team's work is also recorded on Google Forms that the team's coordinators and the project's operators use:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong className="font-medium text-gray-700">Attendance form:</strong> your attendance answers (not your photo) are sent
            automatically, unless your team has it turned off.
          </li>
          <li>
            <strong className="font-medium text-gray-700">Back Up Task Tracker form:</strong> when a task is marked Submitted, Rejected/SBQ
            or Expired, its task ID, project, stage, status, your email and your team's trainer are sent automatically, for teams that have it
            on.
          </li>
          <li>
            <strong className="font-medium text-gray-700">Request and report forms</strong> (CTS, Reclaim / Extend, RST extension, Bad Video
            and TASK ISSUES): the Tracker opens them already filled in with the details they ask for, such as your email, Remotasks ID, task ID
            and reason. Nothing is sent until you or your lead submit the form.
          </li>
        </ul>
        <p>What happens to a form's answers after that is up to whoever runs that form.</p>
      </LegalSection>

      <LegalSection title="The browser extension">
        <p>
          The Grey Owls Tracker extension signs in with your Tracker account and logs, times and requests your tasks in the Tracker, under the
          same rules as the website. When you open it on a Remotasks task page, it reads that page's address to fill in the task ID. It doesn't
          read the page's content, your other tabs or your browsing history, and it sends nothing to Remotasks. Your sign-in and your current
          task are kept in the browser's own storage for the extension until you sign out.
        </p>
      </LegalSection>

      <LegalSection title="Signed-in devices">
        <p>
          While you're signed in, the Tracker keeps a record of each sign-in: the browser and system it's on (such as Chrome on Windows),
          its IP address, when you signed in and when it was last active. Only admins can see it, to spot an account being used from more
          than one place, and they can sign a device out. The record stays after you sign out, so a new device can be told apart.
        </p>
      </LegalSection>

      <LegalSection title="Messages and calls">
        <p>
          When messaging is on for your team, the messages you send, when they were read and a log of voice calls (who called whom, when and
          how long) are kept. Voice calls connect the two browsers directly, or through Cloudflare's relay when a direct connection isn't
          possible, and aren't recorded. Messaging is currently off for every team.
        </p>
      </LegalSection>

      <LegalSection title="Stored on your device">
        <p>
          The website keeps a few things in your browser so it works the way you left it: your theme and sidebar layout, which notifications
          and celebrations you've already seen, your chosen microphone and speaker, and tasks you logged while offline until they reach the
          Tracker. Clearing your browser's site data
          removes them.
        </p>
      </LegalSection>

      <LegalSection title="Who sees your information">
        <p>
          Your team lead and the Tracker's admins can see your work, attendance and profile. When your team has public attendance on, your
          teammates can see whether you've filed attendance today. Other contributors see only what's shown on leaderboards and profiles.
        </p>
        <p>
          We don't sell your information, use it for advertising, or share it with anyone outside the team except the services that run the
          Tracker and the Google Forms above.
        </p>
      </LegalSection>

      <LegalSection title="Services that run the Tracker">
        <ul className="list-disc pl-5">
          <li>Supabase, which hosts the Tracker's database, sign-in and uploaded files such as profile photos.</li>
          <li>Vercel, which hosts the website, and whose Speed Insights measures how fast pages load (without your name or task details).</li>
          <li>Google, for attendance photos (Google Drive) and the Google Forms above.</li>
          <li>Cloudflare, for Turnstile (bot checks on job applications) and the relay for voice calls.</li>
          <li>Resend, which sends the Tracker's emails.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Keeping or removing your information">
        <p>
          Your information is kept while you're part of the team, and the team keeps work and attendance records afterwards as a record of the
          work done. An application is kept while it's being considered. To ask what we hold about you, or to have it corrected or removed,
          contact your team lead or email <ContactEmail />.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>When the Tracker starts keeping something new or sharing it somewhere new, this page is updated and the date at the top changes.</p>
      </LegalSection>
    </LegalPage>
  )
}
