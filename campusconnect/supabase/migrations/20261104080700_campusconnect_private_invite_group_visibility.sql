create or replace function private.has_pending_group_invite(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_invites gi
    where gi.group_id = target_group_id
      and gi.invited_user_id = (select auth.uid())
      and gi.institution_id = (select private.current_institution_id())
      and gi.status = 'pending'
  );
$$;
revoke all on function private.has_pending_group_invite(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_pending_group_invite(uuid) to authenticated;

drop policy if exists groups_read_tenant on public.groups;
create policy groups_read_tenant
on public.groups
for select
to authenticated
using (
  institution_id = (select private.current_institution_id())
  and (
    visibility = 'public'::public.group_visibility
    or (select private.is_group_member(id))
    or (select private.has_pending_group_invite(id))
  )
);
