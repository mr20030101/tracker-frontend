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

### Fixed

- Searching for a term containing `(` or `)` in the Task Log, Global Search, or Bad Video Report modal no longer breaks the PostgREST filter and leaves the page stuck on Loading.

- Editing a weekly target from a device east of Singapore time (e.g. Australia, Japan) saved it to the previous week, and the date pickers on the dashboard and leaderboard jumped to the day before.
- A contributor's own dashboard, task log and profile now count tasks logged under their email in different capitals (e.g. `Jane.Doe@…`), as the leaderboard and rewards already did.

### Security

- Leads can no longer change hidden profile fields (bot flag, badge, email, password flags) directly; those only change through the app's own actions.
- General resources can only be listed by signed-in, active users.
- Each lead's application link accepts at most 30 applications an hour, so the form can't be flooded.

## 4.0.0 — 2026-10-14

### Removed

- The **Donate** page and the "Buy me a cup of coffee" button on the dashboard.

## 3.16.0 — 2026-10-13

### Added

- **Rewards.** Leads can offer their team a prize for a goal over any dates, e.g. "next week, ₱1,000 for whoever submits the most tasks". Admins can offer one to any team or to everyone. The rules:
  - **Most tasks submitted**, with prizes for 1st, 2nd, 3rd and so on (up to the top 10), and an optional minimum to qualify. A tie goes to whoever got there first.
  - **Everyone who reaches a number of tasks** (e.g. 60), each winning the prize.
  - **On target every week**, for everyone who hits their weekly target in every week of the range.
  - **Custom**: describe any rule, and pick the winners yourself when it ends.

  Each can count every project or just one. Creating a reward can post it as an announcement. While it runs, everyone sees the live standings and how close they are ("3 more tasks to reach 1st place"). Once it ends, the lead awards it (the winners can be announced too), and marks each prize paid. A **Rewards** page lists what's running, coming up and past, and contributors see live rewards on their dashboard.

Needs the `20261014_rewards` database migration.

## 3.15.0 — 2026-10-13

### Added

- **Your rank on the dashboard.** A card shows where you stand on your team's board this week, and exactly how many tasks it takes to pass the person above you (or how far ahead you are).
- **Team goal.** Everyone's weekly targets added up into one shared bar, on the dashboard and the Leaderboard's This Week tab.
- **Celebrations.** Confetti and a pop-up when you reach your day goal, hit your weekly target, set a new personal best, or unlock a badge.
- **Next badge progress.** Your badges card shows the badge you're closest to ("Next up: 100 Club, 82 / 100"), and locked badges show how far along you are.
- **Streak at risk.** From Friday, if you haven't hit this week's target yet, the dashboard tells you how many more tasks keep your streak alive, and about how many a day.
- **Most Improved.** A new Leaderboard tab ranks who stepped up most: last week against their own average of the four weeks before.
- **Weekly recap.** On your first visit of a new week: last week's tasks, your rank and streak, and this week's target.
- **New badges.** *Personal Best*, for beating your own best week, and the limited-time *Spooky Season*, for hitting your target every week of October (only listed in October unless you've earned it).

### Changed

- The no-submissions pop-up is skipped when the weekly recap shows, since the recap covers it.

Needs the `20261013_motivation` database migration. Until it's applied, the rank, team goal, recap and Most Improved stay hidden, and the two new badges can't be earned.

## 3.14.1 — 2026-10-13

### Changed

- The no-submissions card now pops up in the middle of the screen and stays until you close it (×, Escape or clicking outside it) or hit **Submit a Task**. It no longer closes on its own.

## 3.14.0 — 2026-10-13

### Changed

- The red "No submissions logged yet this week" warning on your dashboard is now a friendlier card: a rocket in a spinning ring, "You have no submissions yet." with a word of encouragement, and a **Submit a Task** button right there. It stays up a little longer (15 seconds), with a bar showing when it'll close.

## 3.13.0 — 2026-10-13

### Added

- On the Halloween theme, skeleton silhouettes now roam the far hills behind the page: two shambling along with their arms out, and one waving.

## 3.12.0 — 2026-10-13

### Added

- On the Halloween theme, the skeleton hand now claws its way up out of its grave, waves about, and sinks back under the dirt, over and over. It stays still if your device is set to reduce motion.

## 3.11.2 — 2026-10-13

### Fixed

- The Halloween dashboard banner no longer puts gravestones, the skeleton hand and pumpkins behind the greeting and buttons: the hill runs low along the bottom, and the props sit in the bottom-right corner beside the owl (on wide screens only).

## 3.11.1 — 2026-10-13

### Fixed

- Typing now shows from the very first keystroke, even when you start typing right after opening a chat.

## 3.11.0 — 2026-10-13

### Added

- When someone is writing you a direct message, their name in the chat header and their row in the conversation list say **Typing…** (in place of "Active now" and the last message), on the Messages page and in the chat panel.

### Changed

- The typing dots now sit at the bottom of the chat, just above the message box, instead of right after the last message.

## 3.10.0 — 2026-10-13

### Added

- **Typing** in Messages. While someone is writing to you, their chat shows the bouncing dots, in the Messages page and in the chat panel. Group chats also say who, e.g. **Ana is typing** or **Ana and Ben are typing**. The dots go away when they send, clear the box or stop for a few seconds.

## 3.9.0 — 2026-10-13

### Added

- **Seen** in Messages. Under your latest message, a direct chat shows **Sent** until the other person opens it, then **Seen** with the time. It changes the moment they read it. A group chat shows who has read it, e.g. **Seen by Ana, Ben and 2 others**, or **Seen by everyone**. Chats with Meera don't show it.

## 3.8.0 — 2026-10-13

### Added

- The **Halloween theme** (3.2.0–3.5.0) and the **Bad Video form** fixes (3.1.1–3.1.2) were built on their own and are now part of the app, together with everything since 3.6.0.

## 3.7.3 — 2026-10-13

### Changed

- A **reason** is now required on extension and reclaim requests: **Send request** stays disabled until one is written.

## 3.7.2 — 2026-10-13

### Changed

- The **Request extension** and **Request reclaim** forms no longer show a Remotask ID field. The request uses the Remotask ID from your profile, which you can change in Edit Profile.

## 3.7.1 — 2026-10-13

### Fixed

- When saving a Remotask ID fails, the Remotask ID modal now shows the actual reason instead of a general "Could not save your Remotask ID."

## 3.7.0 — 2026-10-13

### Added

- Everyone without a **Remotask ID** on file now gets a modal they can't skip until they add one. It also comes up when the ID on file isn't a valid one. A Remotask ID has to be 24 characters of 0-9 and a-f (like `60e818c8f76af4001e9901d6`), and that format is checked everywhere it can be entered.
- The **Request extension** and **Request reclaim** forms now ask for your Remotask ID, filled in from your profile. The ID is saved with the request, prefilled on the Scale Reclaim / Extend form your lead files, and shown in the request's details. Changing it on the form also updates your profile.

## 3.6.1 — 2026-10-09

### Fixed

- The breadcrumb at the top of the Requests and Feedback pages now names the page instead of showing "Dashboard".

## 3.6.0 — 2026-10-09

### Added

- A **Feedback** page (under Logs) replaces the FEEDBACK sheet. Contributors report the feedback they got on a task with **Report feedback**: the Task ID, a link to the screenshot of the feedback and their own remarks. Their lead opens each report, adds **Lead remarks** and marks it **Valid** or **Invalid**; contributors see the verdict and the lead's remarks on their own reports. Tabs split reports into Pending, Valid, Invalid and All, and leads get a badge on the Feedback link for reports waiting to be checked, plus an Export to CSV.

## 3.5.0 — 2026-10-07

### Added

- The Halloween scene has a skeleton hand clawing its way out of a fresh mound of dirt in front of a headstone.

## 3.4.0 — 2026-10-07

### Changed

- The Halloween scene is more detailed:
  - Weathered headstones with carved "RIP" panels and cracks, and leaning Celtic stone crosses on stepped bases.
  - A Victorian haunted house with a spired tower, chimney, porch, shutters, paned and boarded-up windows, and an iron fence.
  - Ribbed pumpkins and glowing jack-o'-lanterns with stems, vines and leaves.
  - Gnarled bare trees, with smaller ones in the distance.
  - The rooftops are no longer cut off on wide screens.

## 3.3.0 — 2026-10-07

### Changed

- The Halloween look now replaces the whole page background with a Halloween scene instead of flying bats: hills, a crooked tree, tombstones, a haunted house and jack-o'-lanterns under a big moon. It's a dusky lavender sky on the light theme and a starry purple night on the dark one. The same scene takes over the login page and the dashboard banner. The bats, the cobweb and the pumpkin by the logo are gone.

## 3.2.0 — 2026-10-07

### Added

- A Halloween look for October: a pumpkin-orange accent (and a deep purple night on the dark theme), bats that fly across the screen now and then, a cobweb in the corner and a pumpkin beside the logo. The ghost button next to the light/dark toggle turns it off or back on, remembered on that device. It switches itself off after October 31, and the bats stay still for anyone who has reduced motion turned on.

## 3.1.2 — 2026-10-08

### Changed

- The Bad Video Validation/Removal form now always opens with **Support Name** "Tan, Jay-anne R.", **Workforce** REMOTE and **Workforce Name** "Greyowls", whoever opens it. New bad video reports record their workforce name as "Greyowls" too.

## 3.1.1 — 2026-10-08

### Changed

- The Bad Video Validation/Removal form now opens with **Project Name** filled in (Aloha, Ursa Majoris or Sweet Yam, from the task's project).

## 3.1.0 — 2026-10-07

### Changed

- The Reclaim / Extend form now opens with its new questions filled in: **Project Name** (Aloha, Sweet Yam or Ursa Majoris, from the task's project) and **Task Level** (Attempt, L0 or L1, from the task's stage). **Support Name** is always filled in as "Tan, Jay-Anne R.", whoever opens the form.

## 3.0.2 — 2026-10-07

### Changed

- The Users and Requests pages now show their status (and request type) tabs above the table, like Hiring, instead of inside the table's toolbar.

## 3.0.1 — 2026-10-07

### Changed

- The Hiring step tabs now sit above the applicants table instead of inside it. The table's toolbar keeps the search, lead filter and Export all on one line.

## 3.0.0 — 2026-10-07

### Changed

- The Hiring page now has a tab for each step of the hiring process instead of Pending / Accepted / Denied / All: **Pending → To email → Needs account → Onboarding → Onboarded**, plus Denied and All. Each tab shows only that step's action: accept or deny, send the bootcamp email, create the account, then mark onboarded. People move to the next tab on their own as each step is done. The All tab shows which step everyone is on, and the Board view uses the same steps as its columns. Old links to the Accepted tab now open To email.

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
