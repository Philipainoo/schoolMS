-- Use one administrator UPDATE policy for both group title and profile metadata.
drop policy if exists conversations_rename_group_admin on public.conversations;
drop policy if exists conversations_update_group_profile on public.conversations;

create policy conversations_group_admin_update
on public.conversations
for update
to authenticated
using (
  is_group
  and institution_id = (select private.current_institution_id())
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conversations.id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
  )
)
with check (
  is_group
  and institution_id = (select private.current_institution_id())
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conversations.id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
  )
);
