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

## 8.43.0 — 2026-11-14

### Added

- **Update button in the browser extension (v1.10.0).** When a newer version is on the site, the popup shows "Update available" with both version numbers. Update downloads the new zip and opens the extensions page; after unzipping it over the old folder, Reload now finishes the update. Extensions older than 1.10.0 need one last update by hand.

## 8.42.0 — 2026-11-14

### Added

- **Shared task IDs are tagged.** A task whose ID another CB has also logged shows "Also logged by another CB" next to its task ID on the Task Log, a contributor's submissions and the submission details.

### Changed

- **Admins are told about cross-team task IDs too.** The notification that goes to both teams' leads now also reaches every admin's bell.

## 8.41.0 — 2026-11-14

### Changed

- **A task ID can be logged by more than one person.** Each person can still log a task ID only once; logging it again for the same person says "This Task ID is already logged for this person." Bulk import skips only rows that person already has. Browser extension 1.9.1 no longer says "Someone else already logged this task ID": download it again from Resources.

### Added

- **Leads are told when a task ID crosses teams.** When someone logs a task ID that a person on another team already logged, the lead of each team gets it in the notification bell: who logged it, their team, and the task ID. Dismiss one, or Clear all.

## 8.40.1 — 2026-11-13

### Changed

- **CTS Form takes finished work only.** Empty, Rejected/SBQ and Expired tasks no longer appear in Tasks Ready for CTS (In Progress already didn't). Their CTS column reads "Not for CTS" instead of Pending.

## 8.40.0 — 2026-11-13

### Added

- **Edit a task's time.** The pencil next to a task's timer opens Edit time. Leads (for their own team) and admins can set any time up to 24 hours; a contributor can lower their own, for when they forgot to pause. A running timer keeps running from the new time.
- **Expired and Rejected/SBQ in the browser extension.** Next to Submitted, an in-progress task can now be marked Expired or Rejected/SBQ. Browser extension 1.9.0: download it again from Resources.
- **Signed-in devices, for admins.** Each person's profile (a lead's on their team page) lists where they're signed in: the browser and system, IP address, when they signed in and when they were last active. An account active from 2 places at once (a different device or IP) or on a new device this week is flagged there and on the Contributors and Leads lists. An admin can sign a device out; it goes to the sign-in screen within a few minutes. The extension is listed but never counted as another place. Your own devices are on your profile.

### Changed

- **Task time can only be changed through Edit time.** The time on a task can no longer be written directly, so it always follows the rules above.
- **Privacy:** a new section says what's kept about signed-in devices and who can see it.

## 8.39.1 — 2026-11-12

### Fixed

- **Photos in chat and Support screenshots were refused when sent.** The database couldn't confirm the photo was yours, so the message showed "Messaging is turned off". Both now send. The error shown when a photo can't be attached now says so.

## 8.39.0 — 2026-11-12

### Added

- **Photos in chat.** Direct messages and group chats can now carry up to 4 photos, with or without text. Use the photo button, paste a screenshot, or drop a picture onto the message box. Each photo shows its upload progress and can be retried or removed before sending. Tap a photo in the chat to see it full size. Photos are kept in Google Drive, and only the people in that chat can open them. Photos can't be sent to the bot.
- **@mentions.** Type **@** in a chat to pick someone (group members, or the person you're messaging). Mentions are highlighted in the message, and stand out more when they're you.

### Changed

- **Enter sends, Shift+Enter starts a new line.** The message box grows as you type and clears as soon as you press Enter. If a send fails, your message comes back.

## 8.38.0 — 2026-11-12

### Added

- **Unclaim in the task list (Octet Mind).** An Octet Mind task's Actions menu now has **Request unclaim** next to the extension and reclaim. It opens the TASK ISSUES form with **Other: Unclaim** and your details filled in, and records it in the Tracker. The Requests column (was "Extension / Reclaim") shows it as Unclaim Approved.

### Changed

- **The browser extension shows Unclaim as soon as you sign in** if you're tagged with Octet Mind, instead of waiting until a task is looked up. Once a task is looked up, its own project decides. Already signed in? It updates the next time the popup opens. Browser extension 1.8.0; download it again from Resources.

## 8.37.2 — 2026-11-12

### Changed

- **One less font to download on every page.** Numbers and codes shown in monospace now use your device's built-in monospace font instead of Roboto Mono. Announcements written in the Monospace font still show Roboto Mono.

## 8.37.1 — 2026-11-12

### Changed

- **The tracker opens faster.** Each page now downloads the first time it's opened instead of all at once, so the sign-in page, the application form and dashboards load about 45% less code up front (455 KB → 251 KB). A tab left open across a release reloads itself once if it can't find the old page files.

## 8.37.0 — 2026-11-12

### Changed

- **The browser extension no longer shows an expiry countdown.** The "Expires in" bar on the task card is gone, since tasks no longer have a time limit in the tracker. Browser extension 1.7.0; download it again from Resources.

### Fixed

- **Segmented filters no longer spill over the filter beside them.** When the options (such as Measure on Team Reports) don't fit their space, they turn into a dropdown, and back into buttons once there's room. This applies on every page with these buttons.

## 8.36.0 — 2026-11-12

### Added

- **Support**, under Library: anyone can report a bug or request a feature, with up to three screenshots (pick, drop or paste them). Each screenshot shows its upload progress, and a failed one can be retried without picking it again.
- "Report a problem" in the account menu opens a bug report from any page, and the report notes which page you were on, the app version and your browser.
- Admins see every ticket, set it to New, In progress, Done or Won't do, and reply. Reporters see only their own tickets and the replies on them; a dot on Support marks a ticket with a reply or status change they haven't opened.
- A reporter can withdraw a ticket while it's still New.

## 8.35.1 — 2026-11-12

### Fixed

- A contributor's profile no longer crashes on the hours-per-day chart.

## 8.35.0 — 2026-11-12

### Added

- Team Reports has an **Hours rendered** measure: each team's task-timer hours, week by week, in the chart, the table and the CSV export.
- A contributor's profile Report shows a bar chart of hours rendered per day for the week or month, with a dashed line at their daily-hours goal (their lead or an admin).

### Changed

- A profile's shift and Meet link are small chips in the header, next to the profile views, instead of a full-width card. A blank shift isn't shown.
- Buttons in confirm pop-ups keep their label on one line ("Log in as them" no longer wraps).

## 8.34.0 — 2026-11-12

### Changed

- Filters look the same on every page: their own card above the table, each with its label above it, four to a row, with Export and Reset on a header row. Past the first four, the rest fold behind "More filters", which opens by itself while one of them is set. Covers the Task Log, Leaderboard, Requests, Hiring, Audits, Contributors, Attendance, Activity Log, Feedback and Team Reports; the status and step tabs on Requests, Hiring, Contributors and Attendance moved into the card too.
- The Leaderboard's Day / Week / Month, date range and date picker now sit in the filter card, and Reset takes it back to the current period.
- The Task Log table no longer has a Date column (the Date filter covers it), and its rows stay on one line, so the table fits without running off the right edge.
- The Leads page's CBs column keeps "30 CBs" and "4 online" on one line each.
- Team Reports: each lead's name in the table opens their team page (admins).
- The Details button on the Task Log and Requests is now just the eye icon.
- The CTS Form offers every task not yet sent to CTS, not only those from the last 3 days.

## 8.33.0 — 2026-11-11

### Added

- **Log in as (admins).** On the Contributors and Leads pages, an admin can pick **Log in as** in a
  person's actions menu to see the Tracker exactly as they do. A bar at the bottom of every page
  says who you're logged in as, with **Return to my account**; Log out does the same, and never
  signs the person out on their own devices. Every use is recorded in the Activity Log (Accounts).
  Admins can't be logged in as, nor can disabled accounts or ones still on a temporary password.

### Changed

- **Contributors' Leaderboard shows the top 10 and your place.** CBs now see the top 10 on their
  team, and, if they're further down, a "Your place" row under it with their own rank. The same
  goes for the Most Improved tab. Leads and admins still see the full board.

## 8.32.0 — 2026-11-11

### Changed

- **New light theme colours: Bone White, Charcoal Black and Barber Red.** The light theme's yellow
  is now barber red (#B3261E) for buttons, the selected menu item, links, highlights and chart
  lines; pages are bone white (#EDE6D8) and text and the sidebar are charcoal (#1C1C1C). Dark,
  Black and Neon themes are unchanged.
- **The sidebar slides in and out around Messages.** On a computer, going to Messages slides the
  sidebar off the left edge, and leaving Messages slides it back in, instead of it popping in and
  out. It keeps its size while it moves, and the page fades in at its new width as on any page
  change, so nothing squeezes or re-wraps mid-way.

## 8.31.1 — 2026-11-11

### Fixed

- **A task could reach the Back Up Task Tracker form twice.** When two sends for the same task
  overlapped (editing a task whose last send failed while the 5-minute retry was already sending
  it, or a status change mid-send), both posted to the Google Form before either had marked the
  task sent. The tracker now claims the task first, so only one send posts it and the other stops.

## 8.31.0 — 2026-11-11

### Removed

- **Running tasks card on the leads' and admins' Dashboard.** Tasks in progress are still in the
  Task Log (Status: In Progress), with their timers.
- **Daily submission report table on the Dashboard.** The same numbers are still in the charts
  above it and in Export → Daily report.
- **Chat heads down the right edge** (the online people's bubbles, the "..." menu and the compose
  button). Messages are still under Team → Messages and the chat button at the top. Pages no
  longer re-download everyone's profile every two minutes for them, which keeps the Tracker lighter
  on the database.
- **"X submitted a task" pop-ups in leads' notifications.** Submissions are in the Task Log and on
  the Dashboard. New requests still ring straight away.

### Changed

- **The Tracker asks the server for much less in the background:**
  - The "online" check-in is every 3 minutes instead of every minute, so someone shows as online for
    up to 6 minutes after they last had the Tracker open.
  - Menu badges (Requests, Feedback, Announcements) stop refreshing while the tab is hidden or idle
    and catch up when you come back.
  - Team settings and the attendance closing time are re-read every 30 minutes instead of 5, and
    the messages inbox every 15 (new messages still arrive instantly).

## 8.30.0 — 2026-11-11

### Added

- **"I've paid" on the leads' Billing page:** after paying through PayPal, a lead reports it with
  PayPal's transaction ID and the share shows **Awaiting confirmation** (it no longer turns
  Overdue). Admins see the payments to confirm at the top of Billing and as a number on the Billing
  link, check the ID in PayPal, and click **Confirm paid**, or **Not received** to clear the report.

## 8.29.0 — 2026-11-11

### Added

- **Billing page for leads** (Team → Billing): your share of each month's Supabase bill, what you
  still owe and when it's due (by the 7th), and the months already marked paid. The Billing link
  shows how many bills are unpaid, and turns red once one is overdue. Leads only see their own
  shares, never the other leads'.
- **Pay with PayPal:** an admin sets their PayPal.Me name (and an optional note) under How leads
  pay on the Billing page. Leads get a Pay with PayPal button with what they owe filled in; the
  admin still marks the share paid once it arrives.

## 8.28.0 — 2026-11-11

### Added

- **Billing page for admins** (Team → Billing): start each month with what Supabase charged and it's
  split equally across the leads who pay. Each lead's share shows Paid, Unpaid, or Overdue after the
  7th. Mark a share paid with an optional note (e.g. a GCash reference), change a share, or add or
  remove a lead for the month. Shares still unpaid from earlier months are listed at the top, and
  "Who pays" sets which leads are billed. "Open the bill in Supabase" goes straight to the
  organization's billing page. Every change is recorded in the Activity Log.
- **Upload the Supabase invoice PDF** when starting a month (or later, from Edit): the amount due,
  currency, invoice number and billing period are read from it and filled in, and the PDF is kept
  with the month (admins only) so it can be opened again from the bill.

## 8.27.0 — 2026-11-11

### Added

- **Terms and Conditions page** at /terms, linked from the footer next to Privacy: accounts, logging
  work honestly, forms filed for you, the browser extension, job applications and availability.
- **The Apply form links the Terms and Privacy Policy** under Submit application.

### Changed

- **No more red "No submissions logged yet this week" banner on a contributor's profile.** Leads and
  admins see a small grey "No tasks this week" tag next to the contributor's name instead.
- **The Privacy Policy is up to date with the Tracker.** It now covers job applications (and the
  Philippines-only and Turnstile checks), the on-device face check on attendance photos, the Google
  Forms the team files work on (attendance, Back Up Task Tracker, request and report forms), the
  browser extension, messages and voice calls, what's kept in your browser, and Cloudflare, Resend and
  Vercel Speed Insights among the services.

## 8.26.1 — 2026-11-11

### Fixed

- **Browser extension:** the task card shows the task's own project. Before, changing the project
  under Start a task relabelled the task already running (only the label changed; the task in
  the tracker kept its project). Extension v1.6.1.

## 8.26.0 — 2026-11-11

### Added

- **Unclaim in the browser extension (Octet Mind):** the Requests tab offers Unclaim next to
  Extension and Reclaim when the task is an Octet Mind one. Send records it and opens the TASK
  ISSUES form with **Other: Unclaim** picked as the issue and your details filled in. Leads see it
  in Requests as Unclaim, already filed. Extension v1.6.0. Needs
  `20261111_unclaim_request.sql`.

## 8.25.0 — 2026-11-11

### Added

- **A report on each contributor's profile, for leads and admins.** Pick Today, This week, Last week or This month to see three plain numbers: Attendance (days present of days so far), Submitted (tasks, with any rejected or expired) and Hours rendered (against the goal for the days present), then one line per day with attendance, tasks submitted and hours. Export CSV downloads the same per-day lines.
- **Leads see a focused contributor profile.** On a contributor's profile, leads and admins no longer see the onboarding checklist or the achievements and badges, only the report, tasking and attendance. The All-time / This week / Streak / Best day numbers, goal ring, submission trend and stage and project charts are gone from it too.
- **Project levels sit under the contributor's name.** On a profile, each project and the contributor's level on it show as a small row in the header (a lead or admin changes a level from there), instead of a separate Project Levels card. The old daily-quota note is gone.
- **Leads keep only the CTS Form on a contributor's task list.** Bulk Import and Add Submission are no longer shown there for leads and admins; they're still on the Task Log.

### Changed

- **Requests and Feedback load a page at a time.** Each shows 25 at a time with Previous / Next, filtered and searched on the server; the tab counts and the overdue count are counted there without downloading the rows. Before, every request and report ever made was downloaded, and past 1,000 the oldest silently dropped off.
- **A contributor's task list loads only the period shown.** The chosen day, week or month, plus the last 30 days for the trend and CTS form, instead of their whole history; the all-time totals are counted on the server.

## 8.24.4 — 2026-11-11

### Changed

- **Contributors no longer have the Attendance page.** It's gone from their menu, and the address takes them to their Dashboard. They file attendance as before, from the Dashboard button and the attendance countdown. Leads and admins keep the page.
- **A leaner contributor Dashboard.** It now shows the top bar (attendance, add a task, CTS form), the day's goal (hours and tasks submitted) and the onboarding checklist for new contributors. The streak warning, team pulse, rewards spotlight, badges, submission trend, stage and project breakdowns and project levels are gone from it; badges and history are still on their profile.
- **Four simple tiles on the contributor Dashboard.** Hours today, the day's goal (with how much of it is done), tasks submitted today, and hours this week against the week's goal, in place of the goal ring.
- **Task Log opens on today, with more filters.** It loads only today's tasks by default (pick other dates, or empty both, to see more). Next to search, Stage and dates there are now Status and Project filters, and for admins a Team filter; Clear filters goes back to today. The CSV export follows the filters.
- **The Leaderboard is cached for contributors.** What it loaded (the board, the team's weekly history, streaks and badges) is reused for 10 minutes and isn't fetched again on switching tabs or coming back to the page, so it barely touches the server for them. Leads and admins still see it live.
- **The contributor Dashboard asks the server for less.** It loads only this week's tasks instead of the contributor's whole history (one small request instead of several large ones), and no longer loads the whole team's weekly history; the weekly recap pop-up that used it is gone.

## 8.24.3 — 2026-11-11

### Changed

- **Live submission and request alerts are for leads only.** Admins no longer get the live feeds behind the bell's pop-up alerts; leads still do. The badges on Requests and the other pages still update for everyone.
- **Attendance lists the newest first.** Whoever filed most recently is at the top; people who haven't filed yet come after, in the team's usual order.
- **Task Log shows more of each task.** Each row now has the contributor's name and photo above their email, the Task ID (linking to the task on Remotasks, with the screenshot icon when there's one), the Project and the Stage.

## 8.24.2 — 2026-11-11

### Changed

- **The Leads page shows each lead's team.** The Lead column, empty for leads, is replaced by CBs (how many contributors are on their team, how many are online now and any disabled, linking to that team on the Contributors page) and Projects (the projects the lead runs).

## 8.24.1 — 2026-11-11

### Added

- **Task Log shows each task's time.** A Time column shows how long is on each task's timer, ticking while it runs.

## 8.24.0 — 2026-11-11

### Added

- **A team can keep its attendance off the Google Form.** Settings → Team has an "Attend. form" switch per lead's team, on by default. Off, that team's filed attendance stays in the Tracker only and isn't sent to the attendance Google Form, and the Attendance page doesn't show it as "Not sent". The lead or an admin can change it, and changes go in the Activity Log.
- **The attendance camera tells babies apart.** A face it estimates to be under 4 years old is labelled "Baby" (with a baby icon) instead of "Human", on the live camera and on the saved photo. It's still accepted.


### Removed

- **The browser extension no longer rings.** The alarms at 30 minutes, 1 hour and 10 minutes before a task expires are gone, with their notifications and sound, and so is the text about them in the extension and on Resources. The extension also no longer asks for the alarms and notifications permissions. Its task card still shows how long is left. Browser extension 1.5.0; download it again from Resources.

### Changed

- **The attendance camera labels a face "Human".** The label over the face box, on the live camera and on the saved photo, reads Human with a person icon instead of Ghost.
- **The attendance camera's buttons.** Take photo is a round shutter button on the camera picture, Retake sits on the photo once it's taken, and "Upload a photo instead" is a link under it.
- **Uploaded attendance photos are cropped like camera photos.** An upload is cut to the camera's 4:3 shape, centred on the face, before it's checked and saved.
- **The browser extension picks your project for you.** There's no "Choose a project" step any more: it lists the projects you're assigned (or your lead's, until you're assigned any) with your first one already picked, and remembers it if you choose another. Start no longer stops with "Pick your project first".
- **The browser extension fills in the task ID for you.** Open it while you're on a Remotasks task page and the task ID from that page is already in the Start box and on the Requests tab, so there's nothing to paste. Pasting still works anywhere else.

## 8.23.2 — 2026-11-10

### Fixed

- **Notifications come in live again without a reload.** Since idle tabs were paused, a tab left alone for 10 minutes stopped hearing about new submissions and requests, and its badges stopped counting, until you moved the mouse or reloaded. The live feeds behind the bell and the Requests, Feedback and Announcements badges now keep running whether the tab is idle or not, and a new request updates the Requests badge and list straight away. Idle tabs still skip the online ping and the page refreshes.
- **Pages use the full width when messaging is off.** Room was kept on the right for the chat bubbles, which only show when messaging is on, so pages had a wider gap on the right than the left.

## 8.23.1 — 2026-11-10

### Fixed

- **Search engines and AI crawlers are told to keep out.** The tracker is a private work app: a robots.txt disallows everything, and every page says noindex, so it doesn't show up in search results.
- **Filtering the Leaderboard (and Dashboard) by a project lists only that project's contributors.** Picking a project showed every contributor, each with that project's target. It now shows the contributors assigned to it, plus anyone who logged tasks on it in the period, and "without submissions" counts only them.

## 8.23.0 — 2026-11-10

### Added

- **Contributors are assigned projects.** The Contributors page has a Projects column with each contributor's projects. Their lead (on the lead's own projects) or an admin ticks and unticks them from the projects the lead runs, with at least one always ticked. A contributor's assigned projects are the ones they can pick when logging a task, and the ones their Hours / day target comes from. Their profile's Project Levels lists only those. Everyone starts on all of their lead's projects, as before.

### Changed

- **The browser extension files Octet Mind extensions and reclaims on TASK ISSUES.** As in the tracker, sending an extension or reclaim for an Octet Mind task records it as filed and opens the TASK ISSUES form in a new tab with your details filled in, at any time of day, instead of sending your lead a request. Other projects still go to your lead. Browser extension 1.4.0; download it again from Resources.

## 8.22.1 — 2026-11-10

### Changed

- **Attendance photos can be uploaded.** "Or upload a photo" is always under the camera, not only when the camera won't open, and on phones it offers the gallery as well as the camera. Any photo can be used: it's no longer refused for being older than 30 minutes going by its file date. It still has to show a face.
- **Attendance photos are filed in Google Drive by day.** Each photo goes into a folder named for its day (e.g. 2026-11-11) inside the attendance folder, created with the day's first photo. Photos already in Drive stay where they are and still show in the Tracker.

## 8.22.0 — 2026-11-10

### Added

- **L10 tasks.** Tasks can be logged at L10 (Add/Edit task, bulk import, Task Log filter and the browser extension). L10 goes to the Back Up Task Tracker, CTS and Reclaim / Extend forms as "L10". Rewards have an L10 level with its own points; existing rewards count L10 tasks at 1 point, like the other levels. Browser extension 1.3.0 adds the L10 choice; download it again from Resources.

### Changed

- **New reward is a step-by-step form.** Basics (title, rule, projects, team), then Levels (which count and their points), then Prize & dates, then Review, where you add details, see a summary and create it. Back and Next move between steps, each step is checked before moving on, and the step bar shows where you are.

### Changed

- **The Leaderboard's table tracks hours.** A new Hours column shows the time on each contributor's task timers for the day, week or month. The target is in hours: the highest Hours / day among the projects on their lead's team, times 5 for a week (or 1 for a day, 20 for a month), or that project's when filtered to one. Progress is hours rendered against that target, and sorting and the CSV export follow it. "Not set" shows when none of their projects has Hours / day. Tasks Submitted is unchanged.
- **Contributors' goals are in hours.** On a contributor's dashboard and profile, the Day / Week / Month Goal ring and the Day and Week goal bars show hours on their task timers against Hours / day on their projects (for example 2.5h / 8h). Hours replaces Logged next to the ring; Submitted stays. "Not set" shows until their projects have Hours / day.

### Added

- **Hours / day per project.** Projects has a new Hours / day column, set when adding or editing a project: how many hours a contributor should render on it each day. It's the start of moving targets from task counts to hours rendered.

### Removed

- **Task timers no longer have a limit, and tasks no longer expire by themselves.** A timer now runs until the contributor pauses it or the task is no longer in progress. The Timer Limit column and setting are gone from Projects, and Running tasks on the lead dashboard lists the longest-running first, without Limit and Left. Tasks already marked Expired by the limit stay Expired.

## 8.21.1 — 2026-11-10

### Fixed

- **The TASK ISSUES and RST forms open in a new tab again.** Inside the Tracker, browsers that block Google's cookies in frames (Brave, Safari) showed a Google sign-in page instead of the form. Leads' requests are marked approved when the form opens, as with the Scale form. An Octet Mind contributor's own extension or reclaim is recorded when the form opens.

## 8.21.0 — 2026-11-10

### Changed

- **Octet Mind contributors file their own extensions and reclaims.** On an Octet Mind task, Request extension or Request reclaim asks for the reason, then opens the TASK ISSUES form inside the Tracker with the contributor's details filled in. Once they submit it, the request is recorded as filed, so their lead sees it in Requests without having to act on it. It isn't limited to the lead's shift. Closing the form without submitting records nothing. Aloha OTS and Aloha OTS Tasking (RST) requests still go to the lead as before.

## 8.20.0 — 2026-11-10

### Changed

- **The TASK ISSUES and RST extension forms open inside the Tracker.** When a lead clicks Request on an Octet Mind or Aloha OTS Tasking (RST) task, the prefilled form now opens in a window in the Tracker, like the CTS form, instead of a new tab. The request is marked approved once the lead submits the form there; closing it without submitting leaves the request pending. If the form doesn't load, it can still be opened in a new tab. The Scale form (Aloha OTS) needs a Google sign-in, so it still opens in a new tab.

## 8.19.0 — 2026-11-10

### Changed

- **Extension and reclaim requests open the right form for the task's project.** When a lead or admin clicks Request:
  - **Aloha OTS** (aloha_data_collection_v1) opens the Scale Reclaim / Extend form, as before.
  - **Aloha OTS Tasking (RST)** (Aloha-OTS_Tasking) opens the RST Task Extension Form.
  - **Octet Mind** (octet-mind) opens the new TASK ISSUES form, with the task ID as its Scene ID, the Remotasks ID, email, Extend or Reclaim, the reason under Additional details and the location (REMOTE - BOOTCAMP) filled in. The reason category is picked on the form.

  Previously the form went by the team's program (Bootcamp or RST).
- **Report bad video is only offered for Aloha OTS tasks** (and the other projects on the Bad Video form). It's no longer in the menu for Aloha OTS Tasking (RST) or Octet Mind tasks, which have no bad video form.

## 8.18.2 — 2026-11-10

### Fixed

- **Announcements show who posted them.** Contributors saw "Unknown" and a "U" avatar on announcements posted by an admin. The admin's name and photo now show, on the Announcements page and in search.

## 8.18.1 — 2026-11-10

### Changed

- **Messaging is off for every team.** As announced, the app has outgrown it. New leads' teams start with it off too. An admin can still turn it back on for a team in Settings → Team.

## 8.18.0 — 2026-11-10

### Added

- **Admins can turn messaging off per team.** Settings → Team has a new Messaging switch for each lead's team. With it off, the lead and their contributors don't see Messages, the chat button, chat bubbles or group chats, and messages can't be sent by them or to them. Leads see their team's setting but only an admin can change it. Every team keeps messaging until an admin turns it off, and each change is recorded in the Activity Log.

### Changed

- **Idle tabs stop working in the background, to keep the tracker quick for everyone.** After 10 minutes with no mouse, keyboard or touch (or with the tab hidden), a tab stops checking in as online, stops refreshing its pages, and stops listening for new submissions and requests. The first movement or key press wakes it and refreshes anything out of date. Chat messages, calls, running timers and the leads' request alarm keep working while idle.
- **Switching back to the tracker no longer reloads everything on screen.** Anything loaded in the last 30 seconds is shown as is.

## 8.17.0 — 2026-11-10

### Changed

- **Every task needs a project.** Adding or editing a task (Task Log, your dashboard, Data Quality) no longer offers "None". Saving without a project highlights the Project field and says to choose one. The browser extension already required it. Bulk import is unchanged.

### Fixed

- **Tasks that didn't reach the Back Up Task Tracker form are sent again automatically.** Every 5 minutes, a finished task from today or yesterday whose last send failed is tried again, up to 5 tries. Editing the task still tries it straight away. Hovering "Not in backup form" shows why it failed and whether it's still being retried.
- **Why some tasks never reached the backup form: they had no project.** The form requires a Project, so Google turned away every task logged without one. Such a task is no longer sent to be refused; "Not in backup form" says it needs a project, and setting the project on the task sends it.
- **"Not in backup form" now says what the form refused.** When Google turns a task away, the reason names the question it rejected, Google's own message and what was sent, e.g. *The Google Form refused Project "…": …*. If the team's CTS trainer isn't one of the form's Support / Trainer choices, it says so. A busy form (too many answers at once) is reported as such and retried.

## 8.16.0 — 2026-11-10

### Added

- **Attendance photos must show a face.** While the camera is open, each face found is boxed and a label shows whether a face is in frame. Taking the photo checks it: if no face can be seen (an empty desk, the ceiling, a dark room) the photo isn't taken and the camera stays open with a note on what to fix. A photo of an animal with no person in it is refused too ("That looks like a cat, not a person"); a pet beside its owner is fine. The label reads **Ghost** (with a ghost icon) for a person, **Animal (cat)**, **No face in frame** or **Move closer**. The saved photo keeps the box and the Ghost label, so leads see what was checked. An uploaded photo is checked and marked the same way. The check runs on the phone or computer itself. It only finds a face and never identifies who it is, and nothing about the face is saved. On a browser that can't run the check, the photo is taken as before.

## 8.15.0 — 2026-11-10

### Added

- **Running tasks on the lead dashboard.** A new table shows every task whose timer is going right now on your team: contributor, task ID, project, stage, when it was logged, its time limit, time so far and time left before it expires. The ones closest to expiring are listed first and highlighted. Leads and admins can stop a timer from the table (after a confirmation); the time so far is kept and the task stays in progress.
- **Timer limit per project.** In Projects, each project can set how many minutes a task's timer can run (Task Timer Limit). Blank means 3 hours.

### Changed

- **A task's timer stops at its project's limit and the task is marked Expired.** Once a task has been timed for its project's limit in total (3 hours unless the project sets one), it's expired within a minute and the timer stays at the limit. Tasks already in progress past their limit are expired when this goes live.

## 8.14.2 — 2026-11-10

### Fixed

- **Finished tasks reach the Back Up Task Tracker form again.** For teams with the backup form on, no task was being sent: the tracker treated every team as having it off, however the task was logged (the tracker, Task Log or the browser extension). Each finished task is now sent once as intended, with the email the contributor logs tasks with. If sending ever fails, the reason is recorded instead of looking like the form is switched off.

## 8.14.1 — 2026-11-10

### Fixed

- **Reclaim and extension requests are filed under the contributor's own lead.** When a lead opens the Scale Reclaim / Extend form from a request, the Support Name now shows that contributor's lead (for example "Garcia, Ina") instead of always Jay Anne. If the contributor has no lead, the field is left blank to fill in.

## 8.14.0 — 2026-11-09

### Added

- **Two new themes: Black and Neon.** Pick them in **Settings → Appearance**. Black is the dark theme on pure black with plain greys, easy on phones with OLED screens. Neon is near-black with neon green buttons, links and highlights. Like the other themes, the choice is remembered on each device.

## 8.13.0 — 2026-11-09

### Added

- **Install the tracker as an app.** Open your account menu (your name, top right) and choose **Install app**. It then opens from your desktop, dock or home screen in its own window, without the browser bars. On an iPhone or iPad, the same button shows the two Safari steps (Share → Add to Home Screen). If the connection drops, the app shows a short "You're offline" page with a Try again button instead of the browser's error.

## 8.12.0 — 2026-11-09

### Changed

- The **CBs** page and sidebar link are now called **Contributors**.
- On the **Leads** page, team settings open in a window from the new **Team settings** button next to Add Login, instead of sitting under the list of logins.

### Fixed

- **Add Submission is quicker.** Saving a task used to make four trips to the server one after another before the task was even sent, two of them only to re-check who you are. It now makes two. Opening the form no longer looks up your own lead before the Project list settles. The rest of the tracker is a little quicker for the same reason.

## 8.11.0 — 2026-11-09

### Changed

- **Leads and CBs are separate pages.** The sidebar's **Users** link is now **CBs** (contributor logins), and a new **Leads** link lists lead and admin logins with every team's settings below them: program, CTS Form, Attendance, Public, backup form and CTS trainer. These settings moved here from Settings, which no longer has a Team tab. A lead's link is called **Team settings** and shows their own team's settings. What each setting does is folded away under "What each setting does".

## 8.10.0 — 2026-11-09

### Added

- **Program for each team: Bootcamp or RST.** An admin sets it in **Settings → Team** (new Program column). Jay Anne's team starts as RST and everyone else as Bootcamp. When a lead files an extension for someone on an RST team, the tracker opens the **RST Task Extension Form** with the CB's email, Task ID, reason and project filled in, instead of the Scale Reclaim / Extend form.

### Changed

- **Attendance is filled in step by step:** Photo, Hours, Status, then Review, with Next and Back buttons and a progress bar showing where you are. The Review step shows your photo and every answer in one card before you submit; tap any of them to go back and change it. A lead filing for someone skips the photo step. The photo you took stays when you go back to it, instead of opening the camera again.
- The attendance camera no longer mirrors. The live view, the photo you take and the saved photo all face the same way, so nothing flips when you take it.

## 8.9.2 — 2026-11-09

### Changed

- The sign-in, forgot-password and application pages no longer show the Grey Owls badge in the top-left corner. The owl on the card stays.

## 8.9.1 — 2026-11-09

### Fixed

- **New accounts from the Users page are emailed their sign-in details**, like accounts made from Hiring. Before, nothing was sent. The temporary password no longer defaults to "password": leave it blank and a strong one is made up. If the email can't be sent, the page says why and shows the temporary password to pass on yourself.

## 8.9.0 — 2026-11-09

### Changed

- **Settings → Team is now one table.** Each team is a single row of switches (CTS Form, Attendance, Public, Backup form) with its CTS trainer, and what each switch does is explained once at the top instead of under every team. On a phone each team is a short list of labelled switches. A team with the backup form on but no trainer gets a red note under the trainer field.

## 8.8.0 — 2026-11-09

### Added

- **Back Up Task Tracker form.** Each task marked Submitted, Rejected/SBQ or Expired can now go to the "Back Up Task Tracker Remote" Google Form by itself, once, so contributors no longer fill it in for every task. It works however the task is marked: the task form, Task Log, the timer or the browser extension. A lead (or an admin) turns it on for their team in **Settings → Team**. It's off until then, and it uses the team's CTS trainer as Support / Trainer. A task that couldn't be sent shows **Not in backup form**, and editing the task tries again.
- **Rejected/SBQ status** for a task rejected or sent back to the queue in Remotasks.

## 8.7.1 — 2026-11-09

### Fixed

- **Backup and restore.** `npm run backup` now also saves scheduled jobs, and `npm run restore` brings them back pointed at the new project, along with the bot reply address. Restoring no longer stops on database permissions that only Supabase itself can set, and a wrong database password now gives a clear message. Nothing changes in the app itself.

## 8.7.0 — 2026-11-07

### Added

- **Full backup for moving the database.** `npm run backup` saves every table, user account and uploaded file to a private folder, and `npm run restore` rebuilds it in a new Supabase project and checks every row arrived. Steps are in `docs/moving-supabase.md`. Nothing changes in the app itself.

## 8.6.0 — 2026-11-07

### Changed

- The tracker checks the server for updates less often in the background, to stay within the database plan's limits. Messages, group chats and request alerts still arrive straight away. Badge counts, the online list and page lists such as Requests, Users and Attendance now refresh every two to five minutes instead of every 15 to 60 seconds, and still refresh as soon as you act on them.

## 8.5.0 — 2026-11-07

### Added

- Web addresses in messages (direct, group and Meera's replies) are now links that open in a new tab, including bare **www.** addresses. Only http and https addresses become links.

### Changed

- Your own message bubbles and the **Send** buttons are honey instead of Messenger blue, and Meera's suggestion chips are plain outline pills, to match the rest of the tracker.

### Fixed

- The Messages page grew taller than the window, so the conversation scrolled with the page and the message box ended up out of view. It fits the screen again.
- In dark mode, the text in your own message bubbles turned dark on the blue and was hard to read.

## 8.4.0 — 2026-11-07

### Added

- **A "page not found" screen.** An address the tracker doesn't have, or a page your account can't open, now says so, with a big shaky "404" and the address you tried,, offering **Go to the dashboard** and, when you came from another page, **Go back**. Before, it quietly dropped you on the dashboard.

### Fixed

- The breadcrumb at the top showed "Dashboard" on Rewards and Audits; it now names the page you're on.

## 8.3.0 — 2026-11-07

### Changed

- **Fewer menu items under Logs.** For leads and admins, the eight Logs pages are now three, each with tabs across the top: **To do** (Requests, Feedback), **Tasks** (Task Log, Audits, Data Quality) and **Reports** (Team Reports, Activity Log). Contributors get **Task Log** and **To do** (Requests, Feedback). The **To do** badge counts pending requests and feedback together, turning red when a request is overdue, and the Requests and Feedback tabs show their own counts. Old links and bookmarks still open the right tab.
- **Attendance** moves up to its own item under **Overview**.
- The last few tab bars that still had the old look now match the rest: Team Reports' measures and **Weeks** menu, the Leaderboard periods, Activity Log, the Day / Week / Month switch on a contributor's profile, and the filter on Announcements.

## 8.2.0 — 2026-11-07

### Changed

- On the Attendance page, people who haven't filed stand out in red again: their card is tinted red, and "Not filed" and "No attendance yet" are in red. The same goes for the team's day on the **Team** tab.

## 8.1.0 — 2026-11-07

### Changed

- The sign-in page and the application form now match the rest of the tracker: the cream background with the Grey Owls logo in the corner, the same soft card, pill-shaped fields and a flat honey **Sign in** button. The owl still perches on the card, now in the new colours (near-black with honey eyes and beak), and the sky and clouds are gone.
- Dark mode is calmer: no brown glow in the corner, clearer steps between the page, cards and buttons, and the dark pills and meters are a soft cream instead of bright white.
- Cards and round buttons cast their shadow below them instead of showing a bright line along the top.

### Fixed

- A small honey meter fill (e.g. 10%) no longer covers its percentage; the number sits beside it.

## 8.0.0 — 2026-11-07

### Changed

- **A new look across the tracker.** Warm cream pages with a honey-yellow accent, softer rounded cards, pill-shaped buttons and tabs, and new type (Inter for text, Outfit for titles and big numbers). Dark mode gets the same warm palette.
- **Dashboards open with a big greeting and your numbers at a glance.** Leads see tasks submitted, active contributors and who has no progress, with meters for submitted, team target and logged-then-submitted. Contributors see today, this week and their streak, with day and week goal meters. The sky banner and owl are gone from the dashboard (the login page keeps them).
- The menu is now a floating dark panel. A round tab on its edge collapses it to icons and expands it again, and in the collapsed menu, hovering or tabbing to an icon shows the page's name.
- Switching pages slides the menu's honey highlight to the new page, stretching toward it and settling. The pill tabs (Day / Week / Month, Mine / Team and the others) move the same way.
- Page titles unfold letter by letter when a page opens. With reduced motion turned on in your device settings, they just appear.
- The top bar's search, messages, notifications and account are round buttons, and their unread counts are honey badges.
- **Attendance Form** on the dashboard says "Attendance opens at 6:00 AM" before the window opens, instead of being greyed out.

### Removed

- The date picker on the lead dashboard. Use **Prev** / **Next** and **Day / Week / Month** to move between periods.
- The "with no progress" button on the lead dashboard. The count is now the **No progress** figure and meter at the top.

## 7.3.0 — 2026-11-07

### Changed

- Task and attendance statuses are now a grey icon with a label instead of coloured pills, in the Task Log, profiles, the CTS Form, search, the task picker and the Attendance page. The ones that need attention (Empty, Claimed by Another Person, Not filed, support hours) are bold with a warning icon.
- Attendance cards no longer turn red when someone hasn't filed; use the **Missing** tab to see who's left. Hovering a card shades it instead of lifting it, and **File for them** is the card's main button.
- **Open CTS Form** now uses the same colour as the tracker's other main buttons.

### Fixed

- **File today's attendance** now says why it can't be used yet ("Opens at 6:00 AM" or "Closed at …, your lead can file it for you") under the button, instead of only in a tooltip.
- **Open CTS Form** with no task ticked now tells you to tick one, instead of being greyed out.
- Save, Retry and Use default buttons stay readable while saving instead of fading out, and a second click doesn't save twice.
- A Google Form send that failed now shows the reason on the card, so it's readable on phones too.
- **Public attendance** in Settings → Team now says to turn on Attendance first, instead of just being greyed out.
- On phones and tablets, toolbar filters, tabs, switches and card buttons are bigger and easier to tap.

## 7.2.1 — 2026-11-06

### Fixed

- The CTS Form no longer puts every contributor under Jay Anne's team. "Under Trainer Team" is now prefilled with the contributor's own team's trainer, set per team in **Settings → Team → CTS trainer**. Ina's team is set to "garcia, ina dimaano" and Jay Anne's to "tan, jay-anne ratunil". A team with no trainer set leaves the field for the contributor to pick.

## 7.2.0 — 2026-11-06

### Added

- **Public attendance** for a team, in **Settings → Team**. When it's on, the team's contributors get a **Team** tab on the Attendance page showing who on the team has filed for the day (and who hasn't), with their hours, tasking status and attendance photo. Emails, Task IDs and screenshot links stay private. Ina's team starts with it on; every other team stays private until its lead turns it on.
- Attendance cards now show the person's attendance photo for that day as their picture, falling back to their usual avatar when there's no photo. Photos load only as the cards scroll into view, and each is fetched once per visit.

## 7.1.0 — 2026-11-06

### Added

- Leads can switch the CTS Form and Attendance off for their own team, in **Settings → Team** (admins can do it for any lead's team). With the CTS Form off, the team's contributors no longer see the CTS Form button or the CTS column. With Attendance off, the Attendance page, form and countdown are hidden from the team, contributors can't file it themselves, and the team is left out of the Attendance page. Jay Anne's team starts with both switched off; Ina's team keeps both.

## 7.0.0 — 2026-11-05

### Removed

- The Halloween theme is gone, along with its switch in **Settings → Appearance**.

## 6.3.0 — 2026-10-29

### Added

- Leads have an Audits page, under Logs, for spot-checking the tasks their CBs logged. Press Add entry, find the task by its task ID or the CB's name or email (with nothing typed it lists your team's latest submitted tasks), give it a quality score from the bootcamp rubric (5 perfect to 1 spam) and write down the errors you found. The CB and project come from the task, and each task can be audited once. Open in Remotasks, on the chosen task and on each audit, opens the CB's work in a new tab so you can check it before scoring. The page lists your audits with the team's average score, a filter for each CB, and tabs for audits with errors and scores of 3 or lower. You can edit or delete an entry later. Only the CB's lead and admins see audits, and admins can switch between teams.

## 6.2.0 — 2026-10-29

### Added

- The browser extension has a Screenshot link field on the task card. Paste your screenshot link and press Save, or press Submitted to save it with the task. It's the same Screenshot link as on the tracker's Add Submission form.
- The browser extension card on the Resources page has How to use steps, alongside How to install.

## 6.1.0 — 2026-10-29

### Added

- A Grey Owls Tracker browser extension for Brave, Chrome and Edge, downloadable from the top of the Resources page with install steps. Sign in with your tracker account, paste a task ID and press Start to log it as In Progress with its timer running, then press Submitted when you're done. It rings at 30 minutes, 1 hour, and 10 minutes before a task expires (1 hour 30 minutes for Attempt and L1, 2 hours for L0), and you can send extension and reclaim requests from it.

## 6.0.2 — 2026-10-28

### Fixed

- Leaving the Requests page works again: clicking another page from it no longer does nothing.
- Task IDs show in full in the Submissions table, the Bulk Import preview and on the Data Quality page, instead of being cut off.

## 6.0.1 — 2026-10-27

### Fixed

- Leads get the new-request alarm reliably, on whatever page they're on: it now rings whenever a pending request is waiting that they haven't looked at yet, including ones sent while the tab was asleep or before they signed in, and stops when they open the bell, the Requests page or press Later.

## 6.0.0 — 2026-10-27

### Changed

- Daily quotas now depend on your CB level on each project. Admins and project leads set a daily quota for Attempt, L0, L1 and L10 on the Projects page, and a contributor's weekly target is the quotas on their projects times 5 working days, so it's no longer typed in by hand on the Leaderboard. Contributors see today's progress against each project's quota under Project Levels on their Dashboard, and a contributor's profile shows the quota beside their level. A contributor with no quota set on any of their projects keeps the target they had.

## 5.30.0 — 2026-10-27

### Changed

- Rewards keep you guessing: while a reward is running, contributors no longer see who's leading. The leaderboard stays sealed (you still see your own progress, and whether you're in the prize zone) until the winners are announced. Leads and admins still see the full standings.

## 5.29.1 — 2026-10-27

### Fixed

- Deleting an announcement that can't be deleted now tells you why, instead of looking like nothing happened.

## 5.29.0 — 2026-10-24

### Added

- Every task has a timer showing how long you've spent on it. It starts by itself when you log a task that's in progress, and you can pause and start it from the Time column in your Task Log. It stops when the task is submitted or otherwise finished, and only one runs at a time: starting one pauses the others.

## 5.28.0 — 2026-10-23

### Changed

- Bad-video reports can be sent any time again. Only extension and reclaim requests wait for the lead's shift.

## 5.27.0 — 2026-10-23

### Added

- Leads have a shift. A lead sets theirs in Settings, under Profile, and their contributors can only send extension, reclaim and bad-video requests during it. Outside the shift those options are greyed out and the Requests page says when requests open again. A lead's shift shows on their profile and on their contributors' dashboards. Jay Anne's shift is 6:00 AM – 2:00 PM.
- Anyone can open anyone's profile, leads' and admins' included, from search, a chat or a link.
- The dashboard has a "Message your lead" button next to "Chat with Meera".

### Changed

- The default weekly target is now 125 tasks, which makes the daily target 25. Targets a lead already set for someone stay as they are.

## 5.26.0 — 2026-10-23

### Changed

- On the Rewards page, task levels show as coloured pills: orange for Attempter, blue for L0 and purple for L1. A reward lists the levels it counts and what each is worth, and each person in the standings shows how many tasks they've done at each level, with the levels they haven't touched faded out.

## 5.25.0 — 2026-10-23

### Added

- Rewards now count task levels. When creating a reward, choose which levels count (Attempter, L0, L1) and how many points a task at each level is worth (decimals like 1.5 work too), so the harder L0 and L1 reviews can score more. Places and minimums then go by points. Each person's standing shows how many Attempter, L0 and L1 tasks they've done. Existing rewards count every level as 1 point, the same as before.

Needs the `20261023_reward_levels` database migration. Until it's applied, creating a reward fails with an error.

## 5.24.0 — 2026-10-22

### Changed

- Every button and ⋮ menu item now shows an icon next to its label, so actions are quicker to spot. The same action uses the same icon everywhere: a bin for Delete, a pencil for Edit, a plus for Add, a tick for Confirm, an × for Cancel, and so on. Confirmation popups show a bin when the action deletes something, and the small × close buttons now match the rest.
- The dashboard banner has a new look. Today's date sits at the top, and your greeting rides a gold ribbon (orange for Halloween) that flows across the banner from edge to edge. Hover over it to pause it, or drag it to spin it along. It holds still with reduced motion on.

## 5.23.1 — 2026-10-21

### Fixed

- The new-request alarm, and the bell's live alerts for new submissions and requests, stopped listening a moment after the page loaded, so leads got no alarm when a request came in. They now stay connected.

## 5.23.0 — 2026-10-21

### Added

- You can edit the reason on your own extension or reclaim request while it's still pending: use **Edit request** in the task's ⋮ menu, or **Edit** on the Requests page or in the "awaiting review" box.
- If an extension or reclaim request is denied, you can send it again with **Resend request** in the task's ⋮ menu or **Resend** on the Requests page. The reason from last time is already filled in.
- Approved or denied a request by mistake? Leads can now put it back to pending with **Unapprove** or **Undo deny** on the Requests page, or in the task's ⋮ menu for extensions and reclaims. If the Scale form was already submitted, that isn't undone, and the confirm message says so.

### Changed

- When a lead clicks **Request** on an extension or reclaim, the Scale form no longer opens straight away. A popup first shows the details that go on the form (Extend or Reclaim, task ID, Remotask ID and reason), and the lead can change any of them. The form opens only when they click **Open form**, and the request is marked approved at that point.

Needs the `20261021_edit_own_task_request` database migration before contributors can edit a request. Until it's applied, saving an edit fails with an error. Resending works without it.

## 5.22.0 — 2026-10-21

### Added

- Leads can't miss a new request any more. When an extension, reclaim or bad video request comes in, an alarm pops up over the page: the screen pulses red, a bell shakes inside sonar rings, and it lists who asked for what. An alert sound plays on repeat, the bell in the header shakes and the tab title flashes **NEW REQUEST** until you choose **Review now** (opens Requests) or **Later**. Your own requests don't set it off. With reduced motion turned on, the pulsing and shaking stop.

## 5.21.0 — 2026-10-21

### Added

- If attendance closes before you've filed, the countdown bomb goes off: a flash, a fireball, flying sparks and debris, rolling smoke, a jolt of the page and a boom. Then a note says attendance has closed and to ask your lead to file it for you. The boom stays quiet if you've muted the beeps, and there's no shaking if your device is set to reduce motion.

## 5.20.1 — 2026-10-21

### Fixed

- The attendance countdown's beeps could stay silent, especially on iPhones and in Safari. Any click, tap or key press on the page now turns the sound on. While the browser is still holding it back, the speaker turns amber and an **Allow sound** link appears.

## 5.20.0 — 2026-10-21

### Changed

- The attendance countdown floats in the corner of every page, not just the Dashboard, until you've filed today. **File now** opens the form wherever you are, and the minus button shrinks it to a small pill.

### Fixed

- Attendance could still be filed after closing time on a page that had been left open. An open attendance form now locks at closing time with a note to ask your lead, and the Dashboard button notices the closing time straight away.

## 5.19.0 — 2026-10-21

### Added

- Until you've filed today's attendance, the Dashboard shows a countdown to closing time with a lit bomb whose fuse burns down through the day. It wobbles in the last hour, then shakes and glows red in the last 15 minutes. In the last 5 minutes it beeps every second, twice a second in the final minute. A button on it opens the attendance form, and a speaker button turns the beeps off.

## 5.18.0 — 2026-10-21

### Added

- Leads can change when their team's attendance closes, from the Attendance page. Admins set the default closing time for everyone (still 1:30 PM to start) and can change any team's. Every change is recorded in the Activity Log.
- Contributors see their own team's closing time on the Dashboard and the Attendance page, and can file until then.

## 5.17.0 — 2026-10-20

### Changed

- The featured badge beside people's names (Leaderboard, profiles) uses the same gold design as on the Dashboard.
- All badges share the featured badge's look: the icon in a coloured disc, then the name. Earned badges are tinted in their own colour (readable in dark mode too), and ones still to earn are grey.
- Streak flames flicker like real fire, and the streak chip beside names is a warm orange that suits dark mode too.

## 5.16.0 — 2026-10-20

### Changed

- Your featured badge stands out: a gold pill with a **Featured** tag and a light that sweeps across it now and then, in place of the thin outline.

## 5.15.0 — 2026-10-20

### Changed

- The row of shortcut tiles (Profile, Leaderboard, Task Log, Resources, Messages) is gone from the contributor Dashboard. The sidebar has the same links.

## 5.14.0 — 2026-10-20

### Changed

- The light/dark and Halloween buttons are gone from the header. Both live in **Settings → Appearance** now.

## 5.13.0 — 2026-10-20

### Added

- A **Settings** page (account menu → Settings, or search for it), in tabs:
  - **Profile**: photo, name, Remotask ID, shift and bio.
  - **Password**: a new password with a strength meter and a match check.
  - **Appearance**: System (follows your device), Light or Dark, each with a picture of the app in that theme, plus the Halloween theme switch in October.
  - **Calls**: the microphone and speaker your calls use, with a live mic test and a test sound (loudspeaker or phone on mobile).

### Changed

- **Edit Profile** on your profile page and the profile steps of the Getting started checklist now open Settings instead of a pop-up. Changing your password moved to its own Password tab.

## 5.12.0 — 2026-10-20

### Added

- Announcements can be edited: **Edit** in an announcement's menu (for its author and admins) reopens it in the editor, audience, title, message and pin included.

### Changed

- Announcements show their first few lines, fading out. Click the preview or **Read more** to open the whole message, and **Show less** to fold it again. Short announcements show in full.
- The **Seen by** window is redesigned: a ring showing how much of the audience has seen it, the latest faces, tabs for All / Seen / Not yet, search for long lists, and how long ago each person saw it.
- The sidebar is black with white text, in every theme.
- Your name, profile link and **Sign out** moved from the bottom of the sidebar to an account menu on your avatar in the header.
- Scrollbars are hidden on the main page area, in Messages and in the **Seen by** list. Everything still scrolls.

## 5.11.1 — 2026-10-20

### Fixed

- Typing in a new announcement's message no longer stalls on every key: the editor was being rebuilt with each key press.
- Announcements keep their spacing as typed: blank lines, extra spaces and a line break at the end of a paragraph are no longer squeezed out.

## 5.11.0 — 2026-10-20

### Added

- The call card can be dragged anywhere on screen, with the mouse or a finger. Double-click an empty spot on it to send it back to the top.

## 5.10.0 — 2026-10-20

### Added

- Call settings: the gear on the call card lets you pick your microphone (with a live level meter) and speaker on a computer, or switch between loudspeaker and phone (earpiece) on a phone. Changes apply mid-call and are remembered.
- The call card is animated: sonar rings while it rings, a spinning arc while it connects, and rings and bars that move with the other person's voice on a call. Tap the name for a bigger full view.

## 5.9.0 — 2026-10-20

### Changed

- The Attendance page for admins and leads lists contributors in the team's set order (kept in `src/lib/attendanceOrder.ts`). Anyone not on that list, such as a new contributor, appears at the bottom, A–Z by name.
- Contributors with no attendance for the day are highlighted in red, instead of being moved to the top.

### Fixed

- The Attendance cards follow the light theme. They were dark navy on both themes.

## 5.8.0 — 2026-10-20

### Changed

- Admins choose whether a photo is required to file attendance, with the **Require photo** switch on the Attendance page. It starts off, so the photo is optional; when it's on, contributors must take one before submitting. Each change is recorded in the Activity Log under Settings.

## 5.7.4 — 2026-10-20

### Fixed

- Profile photos are cropped to a square and shrunk to 256px when uploaded, so a photo straight from a phone is about 15 KB instead of several MB. Avatars load faster and use far less of the Supabase download quota.
- Profile photos are now kept by browsers for good instead of re-downloaded every hour. Each upload gets a new file name, so a new photo still shows straight away, and the replaced photo's file is deleted.
- `scripts/shrink-avatars.mjs` shrinks photos uploaded before this the same way (dry run by default).

## 5.7.3 — 2026-10-20

### Added

- If your camera can't be opened in the attendance form, you can upload a photo of yourself instead. It must have been taken in the last 30 minutes.

## 5.7.2 — 2026-10-20

### Changed

- A photo is required again to submit your attendance. Take one with your camera before submitting; when editing today's entry you can keep the photo you already took.

## 5.7.1 — 2026-10-17

### Changed

- Updated the team attendance cards with darker surfaces, clearer contrast, and matching accent actions.

## 5.7.0 — 2026-10-17

### Changed

- Only your first attendance submission of the day goes to the Google Form. Editing it later, or retaking your photo, changes it in the Tracker but doesn't send it to the form again, so the form gets one response per person per day.

## 5.6.3 — 2026-10-17

### Changed

- You can submit your attendance without taking a photo. The camera still opens in the form, and a photo you take is saved as before.

## 5.6.2 — 2026-10-17

### Changed

- Attendance now closes at 1:30 PM Singapore time (was 2:30 PM).

## 5.6.1 — 2026-10-17

### Fixed

- Retaking your attendance photo now always saves the new photo. Before, saving while the camera was still open kept the old photo without saying so. Now you take the new photo first, or choose "Keep current photo".
- Each attendance photo in Google Drive has its own name with the time it was taken, so a retake doesn't look like the same file.

## 5.6.0 — 2026-10-17

### Changed

- Sending attendance to the team's Google Form now has an on/off switch, and it starts off, so attendance can be tried out without adding responses to the form. While it's off, attendance cards don't show the Google Form status.

## 5.5.0 — 2026-10-17

### Added

- A Privacy page (linked at the bottom of every page) explaining what the Tracker keeps, who can see it, and how attendance photos are stored in Google Drive.

## 5.4.0 — 2026-10-17

### Changed

- Every attendance you save in the Tracker is also sent to the team's "Centralize | Attendance" Google Form in the background, so the form's sheet keeps getting everyone's attendance. That includes the ones a lead files for someone, and changes to an entry, which arrive as a new response. Each attendance card shows whether it reached the form, with a Retry if it didn't.

## 5.3.0 — 2026-10-17

### Changed

- Filing your own attendance now needs a photo taken with your camera. The form opens the camera, you take the photo (and can retake it), then submit. When you edit today's entry, your photo stays unless you retake it. Attendance a lead files for you doesn't need one.
- Today only (October 17), attendance stays open all day so the new photo step can be tried out.

### Added

- Leads and admins can open anyone's attendance photo from their card on the Attendance page, and contributors can see their own. Photos are kept in the team's Google Drive, not in the Tracker.

## 5.2.0 — 2026-10-17

### Changed

- The Attendance page shows each person as a card instead of a table row: their photo, hours, tasking status, Task ID and screenshot, and when they filed. People who haven't filed have a dashed outline, and the cards stack on a phone. Your own attendance history is shown as cards too.

## 5.1.0 — 2026-10-17

### Added

- Announcements can now be formatted as you write them: bold, italic, underline, strikethrough, headings, bulleted and numbered lists, quotes and links, in a choice of fonts (Serif, Elegant, Modern, Condensed, Handwritten, Monospace) and sizes. The 4,000-character limit counts only the text, not the formatting. Older announcements look the same as before.

## 5.0.0 — 2026-10-17

### Changed

- Attendance is now filed inside the Tracker instead of on the Google Form. The Dashboard's Attendance Form button opens the same questions as before (hours you can commit today, tasking status, and the Task ID and screenshot link when you're tasking), and shows "Attendance filed ✓" once you've filed. You can change today's entry until 2:30 PM. Attendance no longer goes to the Google Form or its sheet.

### Added

- An Attendance page. Contributors see every day they've filed. Leads and admins see who on their team has and hasn't filed on any day, with a count for each hours option, a team filter for admins, and a CSV export. They can file or correct anyone's attendance on their team, including Absent, Discontinued and Disabled, which only a lead or admin can pick.

## 4.0.4 — 2026-10-17

### Changed

- The Attendance Form now stays open until 2:30 PM Singapore time (was 1:30 PM).

## 4.0.3 — 2026-10-15

### Fixed

- Scrolling to the very bottom of a page no longer drags the whole window past the end, sliding the sidebar up and leaving an empty band underneath.

## 4.0.2 — 2026-10-14

### Security

- The Apply form has a Cloudflare Turnstile human check, and applications are now saved through the server, which also enforces the Philippines-only rule. Before, a script could skip both by calling the database directly.

## 4.0.1 — 2026-10-14

### Fixed

- Editing a weekly target from a device east of Singapore time (e.g. Australia, Japan) saved it to the previous week, and the date pickers on the dashboard and leaderboard jumped to the day before.
- A contributor's own dashboard, task log and profile now count tasks logged under their email in different capitals (e.g. `Jane.Doe@…`), as the leaderboard and rewards already did.
- Searching for something with `(` or `)` in the Task Log, global search or the bad video report no longer leaves the page stuck on "Loading…".
- On a flaky connection, submitting a task saves it on the device to send later, instead of failing with "Unauthenticated".
- Task Log pages no longer repeat or skip rows when sorted by date, status or stage.
- A contributor's dashboard, work panel and profile move on to the new day and week at midnight Singapore time, instead of staying on yesterday when the tab is left open.
- The hiring list and board no longer drop applications past the first 1,000.
- Bulk import works for large pastes: the duplicate check no longer fails or misses existing tasks, and contributors past the first 1,000 profiles are matched.
- An "On target every week" reward can't be created for dates that contain no full Tuesday–Monday week, since nobody could ever win it.
- Calls with several tabs open in the same browser: answering in one tab stops the others ringing, and a "busy" or "decline" from another tab no longer drops a call that was already answered.

### Security

- Leads can no longer change hidden profile fields (bot flag, badge, email, password flags) directly; those only change through the app's own actions.
- General resources can only be listed by signed-in, active users.
- Each lead's application link accepts at most 30 applications an hour, so the form can't be flooded.
- Leads can only log tasks under their own email or their own team's.
- The forced password change can't be skipped: it only lifts once a new password has actually been chosen.
- Contributors no longer see other contributors' emails on the leaderboard, team history or reward standings.
- Profile photos must be images under 5 MB, uploaded through Edit Profile.
- CSV exports can't run spreadsheet formulas when opened in Excel.

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
