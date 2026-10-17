-- Announcement bodies are now HTML from the Announcements editor (bold, lists, links, fonts, sizes),
-- and the markup takes room of its own: the editor still holds the visible text to 4,000
-- characters, and this leaves space for the formatting around it.
alter table public.announcements drop constraint if exists announcements_body_check;
alter table public.announcements add constraint announcements_body_check
  check (char_length(trim(body)) between 1 and 20000);
