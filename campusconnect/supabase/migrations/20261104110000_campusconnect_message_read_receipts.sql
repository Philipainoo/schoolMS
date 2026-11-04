-- Per-member read markers for private and group conversations.
alter table public.conversation_members
  add column if not exists last_read_at timestamptz;

create index if not exists conversation_members_read_marker_idx
  on public.conversation_members(conversation_id, last_read_at desc);

grant update (last_read_at) on public.conversation_members to authenticated;

drop policy if exists conversation_members_update_own_read_marker on public.conversation_members;
create policy conversation_members_update_own_read_marker
on public.conversation_members for update to authenticated
using (
  user_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and (select private.is_conversation_member(conversation_id))
)
with check (
  user_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and (select private.is_conversation_member(conversation_id))
);
