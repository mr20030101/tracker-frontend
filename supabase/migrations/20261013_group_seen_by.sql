-- "Seen by" in group chats: each member's last_read_at now comes back with the group's members,
-- so the app can show who has read up to your latest message. Direct messages need no change:
-- they already carry read_at.

create or replace function public.chat_group_summaries()
returns table (id bigint, name text, my_role text, created_at timestamptz, unread_count bigint, last_message jsonb, members jsonb)
language sql stable security definer set search_path = public
as $$
  select g.id, g.name, me.role, g.created_at,
    (select count(*) from public.group_messages m
      where m.group_id = g.id and m.created_at > me.last_read_at and m.sender_id <> auth.uid()),
    (select to_jsonb(m) from public.group_messages m where m.group_id = g.id order by m.id desc limit 1),
    (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'role', cm.role, 'last_read_at', cm.last_read_at) order by p.name), '[]'::jsonb)
      from public.chat_group_members cm join public.profiles p on p.id = cm.user_id where cm.group_id = g.id)
  from public.chat_groups g
  join public.chat_group_members me on me.group_id = g.id and me.user_id = auth.uid()
  where public.is_active_user()
$$;
