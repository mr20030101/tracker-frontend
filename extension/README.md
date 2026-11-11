# Grey Owls Tracker extension

Logs and times your Remotasks tasks in the tracker from a browser button, for Chrome, Edge and
Brave. It signs in with your tracker account and shows your email and Remotasks ID from your
profile.

- **Start:** open the extension on the task's Remotasks page (the ID is read from `?sceneId=` and
  filled in for you, on the Requests tab too), or paste a task ID or link, and press Start. The task is
  logged as **In Progress** under the project and stage picked, with its timer running. Your
  project is picked for you (your first assigned one); choose another if you're on more than one. A task
  you logged before picks its timer back up instead. Starting a task pauses any other timer you
  have running.
- **Screenshot link:** paste the link to your screenshot (Snipboard, Lightshot, etc.) on the
  task card and press Save, or just press Submitted, which saves it too. It's the same Screenshot
  link as on the tracker's form; clear the field and Save to remove it.
- **Submitted** marks it Submitted, which stops the timer. **Pause** and **Resume** stop and
  restart the timer without changing the task.
- **Expiry countdown:** the task card shows how long is left before the task expires on Remotasks
  (1 hour 30 minutes after it was started for Attempt, L1 and L10, 2 hours for L0). There are no
  alarms or notifications.
- **Reload** (top right) brings everything up to date from the tracker: your profile, your
  projects, and the task showing. A task that's finished (submitted, expired, or no longer in the
  tracker) is cleared, ready for the next; one still in progress stays.
- **Reset** is for a wrong task ID. It asks whether to **Remove from tracker** (only while the
  task is in progress; any requests on it go too) or **Just clear here**, which keeps it in the
  tracker with its timer paused. Either way the popup is cleared for the right task. If the
  tracker doesn't remove it, Reset says so and leaves it showing.
- **Request an extension or reclaim** sends your lead a request for a task (the current one unless
  you paste another), with a reason, as on the tracker's Submissions table. It only works during
  your lead's shift, and only for your own task while it's In Progress or Expired. The requests
  already sent for that task are listed below the form. Bad video reports are still sent from the
  tracker.
  **Octet Mind** tasks are filed by you, not your lead, on the TASK ISSUES form: Send records the
  request and opens the form in a new tab with your details filled in, at any time of day. Pick
  the reason category there and submit it. Octet Mind tasks also get **Unclaim**, which fills the
  form's issue as **Other: Unclaim**.

Nothing is read from or sent to Remotasks: the extension only talks to the tracker.

## Install

1. Unzip `grey-owls-tracker-extension-v<version>.zip` somewhere it can stay, such as Documents.
   The browser loads it from that folder, so don't delete it afterwards.
2. Open `brave://extensions` (or `chrome://extensions`, `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped **grey-owls-tracker** folder.
5. Click the puzzle-piece icon in the toolbar and pin **Grey Owls Tracker**.
6. Open it, sign in with your tracker account, and pick your project and stage.

To update to a new version, unzip it over the old folder (or into a new one and load that
instead), then press the reload button on the extension's card in the extensions page.

## Packing a new version

Raise `version` in `manifest.json`, then run `npm run pack:extension`. The zip lands in
`extension-build/` (not committed) for sharing with the team.

## How it works

`background.js` signs in to Supabase and writes to `task_submissions` and `task_requests` the same
way the tracker's Add Submission form and request buttons do, under the same access rules. The
database keeps the timer (`supabase/migrations/20261024_task_timers.sql`) and checks the lead's
shift on requests.
