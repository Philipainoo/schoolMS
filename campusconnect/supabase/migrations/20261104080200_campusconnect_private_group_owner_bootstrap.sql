-- Move owner membership bootstrap out of the exposed RPC surface.
-- The groups INSERT policy already requires owner_id = auth.uid() and the verified tenant.
drop function if exists public.create_campus_group(text, text, text, public.group_visibility);
drop policy if exists group_members_owner_add_self on public.group_members;

create or replace function private.bootstrap_group_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.group_members (institution_id, group_id, user_id, role)
  values (new.institution_id, new.id, new.owner_id, 'admin'::public.group_member_role)
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$function$;

revoke all on function private.bootstrap_group_owner_membership() from public;
revoke all on function private.bootstrap_group_owner_membership() from anon;
revoke all on function private.bootstrap_group_owner_membership() from authenticated;

drop trigger if exists on_campus_group_created_add_owner on public.groups;
create trigger on_campus_group_created_add_owner
after insert on public.groups
for each row execute function private.bootstrap_group_owner_membership();
