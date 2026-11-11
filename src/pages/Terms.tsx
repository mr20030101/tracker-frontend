import { ContactEmail, LegalLink, LegalPage, LegalSection } from '../components/LegalPage'
import { usePageTitle } from '../lib/usePageTitle'

const UPDATED = 'November 11, 2026'

export function Terms() {
  usePageTitle('Terms and Conditions')
  return (
    <LegalPage title="Terms and Conditions" updated={UPDATED}>
      <p className="text-sm leading-relaxed text-gray-600">
        These terms cover using Grey Owls Tracker: the website, the installable app, the browser extension and the job application page. By
        signing in, using the extension or submitting an application, you agree to them. What the Tracker keeps about you is explained in the{' '}
        <LegalLink href="/privacy">Privacy Policy</LegalLink>.
      </p>

      <LegalSection title="What the Tracker is">
        <p>
          Grey Owls Tracker is a private tool the Grey Owls team uses to log annotation tasks, time them, record attendance, send requests and
          report to the team's leads. It is not part of Remotasks, Scale AI or any project's operator, and isn't endorsed by them. Their own
          rules and terms still apply to the work you do on their platforms.
        </p>
        <p>
          The Tracker keeps a record of work. It is not an employment contract and doesn't set your pay; those are agreed separately with the
          team.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <ul className="list-disc pl-5">
          <li>Accounts are given by the team. One account per person; don't share yours or sign in as someone else.</li>
          <li>Keep your password private, and change the temporary one you were sent when you first sign in.</li>
          <li>Keep your profile accurate, including your Remotasks ID, since requests are filed under it.</li>
          <li>Tell your lead or an admin straight away if you think someone else has used your account.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Logging work honestly">
        <ul className="list-disc pl-5">
          <li>Log only tasks you worked on yourself, with the right task ID, project, stage and status.</li>
          <li>Run a task's timer only while you're working on it, and pause it or mark the task done when you stop.</li>
          <li>Your attendance photo must be a current photo of you, taken or uploaded when you file. Don't use someone else's photo or an old one.</li>
          <li>Give real reasons on extension, reclaim and unclaim requests, and on feedback reports.</li>
        </ul>
        <p>
          Leads and admins can review, correct or remove records that are wrong. Hours, tasks and attendance in the Tracker may be used to
          review your work, give rewards and decide on your place in the team.
        </p>
      </LegalSection>

      <LegalSection title="Forms filed for you">
        <p>
          Some of your work is sent to Google Forms the team uses, such as the attendance and Back Up Task Tracker forms, and request forms
          open already filled in. By using those features you agree to that information being sent. Check a filled-in form before you submit
          it; you're responsible for what you submit.
        </p>
      </LegalSection>

      <LegalSection title="The browser extension">
        <p>
          The extension is for your own use with your own account. Load it only from the copy the team shares, and keep it updated when a new
          version is announced. It works with the Tracker only and doesn't automate anything on Remotasks.
        </p>
      </LegalSection>

      <LegalSection title="What you must not do">
        <ul className="list-disc pl-5">
          <li>Try to see or change other people's information, or get around the Tracker's access rules.</li>
          <li>Interfere with the Tracker, overload it, or use scripts or bots against it.</li>
          <li>Upload anything harmful, offensive, or that you don't have the right to share.</li>
          <li>Share other people's information from the Tracker outside the team.</li>
          <li>Copy or reuse the Tracker's code, design or content outside the team without permission.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Job applications">
        <p>
          Applications are open to applicants in the Philippines only. Give true and complete information; an application with false details
          may be declined or, if found later, end your account. Applying doesn't guarantee a place on the team.
        </p>
      </LegalSection>

      <LegalSection title="Suspending or closing accounts">
        <p>
          An admin or your lead can suspend or close your account if you leave the team, break these terms, or to protect other people's
          accounts or information. Records of the work you did are kept as described in the Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          The Tracker is provided as it is. We work to keep it running and accurate, but it can be slow, down or have mistakes, and features
          can change or be removed. Keep your own note of anything you can't afford to lose, such as task IDs you're still working on. To the
          extent the law allows, the team isn't liable for losses caused by the Tracker being unavailable or wrong.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          These terms may be updated as the Tracker changes. The date at the top shows the latest version, and keeping on using the Tracker
          after a change means you accept it. Big changes are announced in the Tracker.
        </p>
      </LegalSection>

      <LegalSection title="Law and contact">
        <p>
          These terms are governed by the laws of the Philippines. Questions about them go to your team lead or <ContactEmail />.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
