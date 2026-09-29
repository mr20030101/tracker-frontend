-- Removes the Office page's database objects: the shared floor positions, the per-person 3D
-- character, and the functions the page called. Deletes that data for good.

drop function if exists public.set_office_position(text, real, real);
drop function if exists public.office_floor_positions(text);
drop function if exists public.can_view_office_floor(text);
drop function if exists public.set_office_avatar(jsonb);
drop function if exists public.office_roster();

drop table if exists public.office_positions;

alter table public.profiles drop column if exists office_avatar;
