-- Permit verified group owners and administrators to rename their group.
-- RLS and column-level grants enforce the operation without SECURITY DEFINER.
create policy conversations_rename_group_admin
on public.conversations
for update
to authenticated
using (
  is_group = true
  and institution_id = (select private.current_institution_id())
  and (select private.is_conversation_member(id))
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversations.id
      and cm.institution_id = conversations.institution_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
)
with check (
  is_group = true
  and institution_id = (select private.current_institution_id())
  and (select private.is_conversation_member(id))
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversations.id
      and cm.institution_id = conversations.institution_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

revoke update on public.conversations from authenticated;
grant update (title) on public.conversations to authenticated;

create or replace function public.rename_group_conversation(
  target_conversation_id uuid,
  new_title text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clean_title text := btrim(new_title);
begin
  if (select auth.uid()) is null then raise exception 'Sign in to rename a group.'; end if;
  if not (select private.is_verified_institution_user((select auth.uid()), (select private.current_institution_id()))) then
    raise exception 'A verified UEW account is required.';
  end if;
  if clean_title is null or char_length(clean_title) < 3 or char_length(clean_title) > 60 then
    raise exception 'Group names must contain 3 to 60 characters.';
  end if;
  update public.conversations
  set title = clean_title
  where id = target_conversation_id
    and institution_id = (select private.current_institution_id())
    and is_group = true;
  if not found then raise exception 'This group is not available or you do not have permission to rename it.'; end if;
end;
$$;

revoke all on function public.rename_group_conversation(uuid, text) from public, anon;
grant execute on function public.rename_group_conversation(uuid, text) to authenticated;
