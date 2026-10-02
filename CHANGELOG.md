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
