# Changelog

What changed in each release of Grey Owls Tracker. The newest release is at the top.

Add each change under **Unreleased** as it's made. `npm run release -- patch|minor|major`
then files them under the new version number and today's date (see `scripts/release.mjs`).

- **patch** (1.0.0 → 1.0.1): fixes only.
- **minor** (1.0.0 → 1.1.0): new features, nothing that changes how existing ones work.
- **major** (1.0.0 → 2.0.0): changes people will notice in how existing features work, or a feature removed.

Versions before 2.3.0 were written up afterwards from the project's history, so they group
each stretch of work by the date it shipped.

## Unreleased

## 2.12.2 — 2026-10-07

### Changed

- The Hiring table now shows a red "No Remotasks account yet" note under the email of applicants who applied without a Remotasks account.

## 2.12.1 — 2026-10-07

### Changed

- In an applicant's details on the Hiring page, "No Remotasks account yet" now shows in red so it stands out.

## 2.12.0 — 2026-10-06

### Added

- Each page now has its own browser tab title, like "Task Log | Tracker" or a contributor's name on their profile, so open tabs are easy to tell apart. The Hiring tab shows how many applicants are waiting for a decision and which tab you're on, for example "(3) Hiring · Pending | Tracker".

## 2.11.1 — 2026-10-06

### Fixed

- A task could show as Sent to CTS while still In Progress, if it was changed back to In Progress after being sent. Moving a task back to In Progress now sets its CTS status back to Pending. It shows up in the CTS Form again once it's finished. Tasks already stuck like this are fixed too.

## 2.11.0 — 2026-10-06

### Changed

- No more "Did you finish submitting?" question after the CTS Form. Submitting the form inside the Tracker now marks those tasks as sent to CTS straight away. If you opened the form in a new tab instead, a button under it lets you mark them.

## 2.10.0 — 2026-10-06

### Changed

- The CTS Form and Attendance Form now open inside the Tracker instead of in a new Google Forms tab. They're still filled in for you. If one doesn't load, a link under it opens it in a new tab. The Reclaim/Extend and Bad Video forms leads file still open in a new tab, because they need a Google sign-in, which can't be shown inside another site.

## 2.9.1 — 2026-10-06

### Fixed

- The link in password reset emails now opens https://www.greyowlstracker.space instead of the old Vercel address.

## 2.9.0 — 2026-10-03

### Changed

- Tables are less crowded at the top. Search and filters now sit in a toolbar inside the table card instead of floating above it. Every control is the same height, search has a magnifier icon, and Task Log's two dates are one compact range. This applies to Task Log, Hiring, Users, Requests, Leaderboard and the Activity Log.
- Task Log's Export CSV is now at the right end of the table's toolbar, and Hiring's List/Board switch is next to the page title.

## 2.8.2 — 2026-10-03

### Fixed

- The new-message sound sometimes played when nothing new had arrived, often when coming back to the Tracker tab. It happened after a message was deleted, or when the inbox briefly failed to load. It now plays only for messages sent while the Tracker is open, once each.

## 2.8.1 — 2026-10-03

### Fixed

- Ticking rows in a table on page 2 or later (for example on Hiring or Users) no longer jumps the table back to page 1. Ticks you made on other pages are kept.

## 2.8.0 — 2026-10-02

### Changed

- On public pages (sign-in, the application form and donations) the version number is shown as plain text: the release notes open only for people signed in to the Tracker.

## 2.7.1 — 2026-10-02

### Fixed

- The dashboard's Month view (and busy weeks) showed nobody submitting toward the end of the period, because only the first 1,000 submissions were read. All of them are read now. The same fix applies to Team Reports, Data Quality, the Task Log CSV export and long contributor histories.

## 2.7.0 — 2026-10-02

### Added

- **Edit applicant details**: leads and admins can correct an applicant's name, emails, Remotasks ID, Facebook link and computer answers from **Edit details** in their details. Each change is recorded in the Activity Log.
- **Resend emails to an applicant**: from their details, **Resend bootcamp email**, and for someone whose account is created but who hasn't signed in yet, **Resend account email** (with a new temporary password). Both go to their active email as it is now, so a corrected address gets them.

### Fixed

- On desktop, the menu button now shrinks the sidebar to a row of icons instead of hiding it completely. Hover an icon for its name; click the menu button again to expand it. Phones, tablets and Messages still use the slide-out menu.
- The sidebar no longer shows a scrollbar beside the links; it still scrolls when they don't all fit.

## 2.6.0 — 2026-10-02

### Added

- When a new version of the Tracker is released, a tab that's already open says so, with a **Reload** button to switch to it.
- **Featured badge**: contributors can pin one badge they've earned, shown beside their name on their profile and the Leaderboard. Click an earned badge in your streak & badges card to feature it.
- **Team Reports**: each lead's team compared week by week, on tasks submitted, active contributors and bad-video reports, with a chart, a table showing the change from the week before, and CSV export. Admins see every team; leads see their own.
- **Offline task logging**: a new task submitted while the connection is down is saved on your device and sent automatically when you're back online. A banner shows how many are waiting, and any the server refuses (such as a duplicate task ID) can be retried or discarded.

## 2.5.0 — 2026-10-02

### Added

- **Overdue request reminders**: a request still pending after 4 hours is marked **Overdue**. Leads see it in a red Requests badge, a banner on the Requests page and a pill on the dashboard, and every pending request shows how long it has been waiting.
- **Hiring board**: a Board view on the Hiring page shows every applicant by stage (Applied, Accepted, Account created, Onboarded, Denied). Click a card to open their details.
- Private **notes** on each applicant, for the lead and admins only.
- Applicants whose Remotasks ID appears on more than one application are flagged **Duplicate ID**.

## 2.4.0 — 2026-10-02

### Removed

- The **Most viewed profiles** ("Most famous") table on the Leaderboard. Each profile still shows how many times it has been viewed.

## 2.3.0 — 2026-10-02

### Added

- The app's version is shown in a footer under every page, including sign-in, the application form and the donation page. Clicking it opens **What's new**, these release notes.
- Chat bubbles down the right edge, Messenger-style: hover one for the person's name and your last message, close it with ×, and start a new message from the compose button.

### Changed

- The application form now requires a Remotasks account: applicants without one are sent to create it first, and each missing or invalid field gets its own alert.
- The Remotasks ID is checked (24 characters, numbers 0–9 and letters a–f), with the field highlighted when it's wrong.
- The application form is laid out in two columns on wider screens.

### Fixed

- A call that rings before anyone has clicked the page now starts ringing on the first click instead of staying silent, and the tab title flashes while a call rings in.

## 2.2.0 — 2026-10-01

### Added

- A **Donate** page for supporting the developer, by GCash or PayPal.
- A playful dashboard banner, and a sky on the sign-in page that follows the time of day unless a theme is picked.
- **Most viewed profiles** on the dashboard.

### Changed

- Sign-in and the application form share the new owl design.
- Confirmations and alerts use the app's own dialogs instead of the browser's pop-ups.
- The application form is open to applicants in the Philippines only.

## 2.1.0 — 2026-09-30

### Added

- Project codes.

### Changed

- The CTS form was reworked.
- The chat bot answers more frequently asked questions.

## 2.0.0 — 2026-09-29

### Added

- **Announcements**, an **onboarding checklist** for new team members, **group chats**, **achievements and streaks**, a **global search**, an **audit log** and data exports.

### Removed

- The **Office** page.

## 1.6.1 — 2026-09-28

### Fixed

- Security: sign-up, account management, database access rules and file storage were locked down.
- Resource files are handled more reliably.

## 1.6.0 — 2026-09-26

### Added

- One-to-one **voice calls** in Messages, with ringtones and a call history in the conversation.
- The **Office** page: a shared 3D map with avatars and proximity voice chat.

## 1.5.0 — 2026-09-24

### Added

- A **chat bot** in Messages, with a typing indicator, quick replies and grammar checking.
- A conversation info panel, online status on avatars, and a submission details view.
- A warning in the browser console against pasting code people are told to run.

## 1.4.0 — 2026-09-22

### Added

- **Hiring**: a hiring process for each lead, with a public application form and emails to applicants.
- **Submit a Task**, **bad-video reports** and **extension requests** (linked to the Scale reclaim/extend form).
- The contributor work view moved from the profile to the Task Log.
- Page speed measurement that never records anyone's email or ID.

## 1.3.0 — 2026-09-20

### Added

- **Grey Owls Tracker** branding: logo, favicons and the owl pattern on the sign-in page.
- Animated progress bars, dashboards, modals and page changes.
- A **Lead Team** page.

### Changed

- The business week runs Tuesday to Monday.

## 1.2.0 — 2026-09-18

### Added

- A **Leaderboard** and a dashboard for contributors.
- A **dark theme**.
- The CTS form, bulk import of users, sortable data tables, contributor levels, emoji and notification sounds.
- A daily digest and lead recommendations.
- New users must change their password when they first sign in.

## 1.1.0 — 2026-09-17

### Added

- **Messages**: direct messages between team members, with who's online shown down the side of the screen.
- An **activity log**.

## 1.0.0 — 2026-09-12

The Tracker before messaging was added.

### Added

- The **Task Log**, with CSV export, bulk import, a date range filter and the CTS form action.
- The **Dashboard**, with daily, weekly and monthly views, bar graphs and a daily submission report.
- **Contributor profiles** with charts, weekly targets and self-editing.
- **Users** and **Team** management, with password resets.
- **Data Quality** and resource uploads.
