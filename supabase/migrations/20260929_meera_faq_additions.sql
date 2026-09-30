-- Meera FAQ additions, from what contributors asked and Meera couldn't answer (or answered
-- inconsistently) in September 2026. How the Tracker app works now lives in the bot-reply function
-- itself (APP_GUIDE); this file is for project guideline answers, which only a lead can write.
--
-- HOW TO USE
-- 1. Run step 1 to see what Meera's reference already says on each topic. The hand off / regrasp
--    contradictions probably come from an existing row that's ambiguous: fix that row rather than
--    adding a second one that disagrees with it.
-- 2. For each entry in step 2, replace the TODO with the real guideline answer, uncomment it, and
--    run it. Leave an entry commented out until it has a confirmed answer: Meera repeats whatever is
--    here as fact.
-- Keywords are matched as plain substrings of what people type (lower-case), so list the words and
-- spellings contributors actually use. Every insert skips itself if its keyword set already exists,
-- so this file is safe to re-run.

-- Step 1: what's there now.
select id, keywords, left(answer, 300) as answer_start
from public.bot_faqs
where exists (
  select 1 from unnest(keywords) k
  where k ilike any (array['%hand%off%', '%handoff%', '%regrasp%', '%pull%', '%mistake%', '%drop%', '%fall%', '%push%', '%tool%', '%aloha%', '%cts%'])
)
order by sort_order;

-- Step 2: new entries.

-- "pull mistakes list", "examples of pull mistakes": asked three ways, "I'm not sure" every time.
-- insert into public.bot_faqs (keywords, answer, sort_order)
-- select array['pull mistake', 'pull mistakes', 'pulling mistake', 'pull error'],
--   'TODO: what a pull mistake is, and the common examples to avoid.', 100
-- where not exists (select 1 from public.bot_faqs where keywords = array['pull mistake', 'pull mistakes', 'pulling mistake', 'pull error']);

-- Hand off vs regrasp: one contributor needed 8 follow-ups, and Meera contradicted itself. State the
-- rule for this exact case: the item goes left gripper -> right gripper -> back to the left gripper.
-- Is that one regrasp, or a hand off clip then a regrasp clip, and does it depend on whether the
-- left gripper lets go in between?
-- insert into public.bot_faqs (keywords, answer, sort_order)
-- select array['hand off', 'handoff', 'hand-off', 'regrasp', 're-grasp', 'other gripper', 'same gripper'],
--   'TODO: hand off vs regrasp, including the left -> right -> left example and when each clip starts and ends.', 101
-- where not exists (select 1 from public.bot_faqs where keywords = array['hand off', 'handoff', 'hand-off', 'regrasp', 're-grasp', 'other gripper', 'same gripper']);

-- A dropped item, or one that falls off the table. Meera cited a "Grip drops item" bad video
-- category; confirm whether that category exists, and what to label otherwise.
-- insert into public.bot_faqs (keywords, answer, sort_order)
-- select array['drop', 'dropped', 'drops the item', 'fell', 'falls', 'fall below', 'below the table', 'release the item'],
--   'TODO: how to label a clip where the gripper drops the item or it falls off/below the table (bad video or not, and which category).', 102
-- where not exists (select 1 from public.bot_faqs where keywords = array['drop', 'dropped', 'drops the item', 'fell', 'falls', 'fall below', 'below the table', 'release the item']);

-- Using a held item as a tool: "picked up an item, used it to push another item while holding it,
-- then put it in the container: how to annotate?"
-- insert into public.bot_faqs (keywords, answer, sort_order)
-- select array['push', 'pushed', 'while holding', 'using it to', 'used it to', 'tool', 'push the other'],
--   'TODO: how to clip and word a sequence where a held item is used to push/move another item before being put away.', 103
-- where not exists (select 1 from public.bot_faqs where keywords = array['push', 'pushed', 'while holding', 'using it to', 'used it to', 'tool', 'push the other']);

-- What CTS stands for. Meera made up "Contributor Tracking System"; it now just describes the form.
-- If CTS has a real name worth knowing, add it here.
-- insert into public.bot_faqs (keywords, answer, sort_order)
-- select array['cts stand', 'what is cts', 'what does cts', 'cts mean'],
--   'TODO: what CTS stands for and what it is used for.', 104
-- where not exists (select 1 from public.bot_faqs where keywords = array['cts stand', 'what is cts', 'what does cts', 'cts mean']);

-- Step 3 (ready to run): the greeting / "help" answer listed only five things Meera can do, so it
-- told people it couldn't help with anything else. Only updates the original seeded row.
update public.bot_faqs
set answer = 'Hi! I''m Meera. I can answer questions about the project guidelines and about using this app (logging tasks, Bulk Import, the CTS form, extension, reclaim and bad video requests, messages, announcements and your profile), and I can check the grammar of your text: tap "Check grammar" or start a message with "Grammar:". What do you need?'
where keywords = array['help', 'hi', 'hello'];
