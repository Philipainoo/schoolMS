-- Permit verified group owners and administrators to rename their group.
create or replace function public.rename_group_conversation(
  target_conversation_id uuid,
  new_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  tenant_id uuid := (select private.current_institution_id());
  requester_role text;
  clean_title text := btrim(new_title);
begin
  if requester_id is null then raise exception 'Sign in to rename a group.'; end if;
  if not (select private.is_verified_institution_user(requester_id, tenant_id)) then
    raise exception 'A verified UEW account is required.';
  end if;
  if clean_title is null or char_length(clean_title) < 3 or char_length(clean_title) > 60 then
    raise exception 'Group names must contain 3 to 60 characters.';
  end if;
  select cm.role into requester_role
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id and c.institution_id = cm.institution_id
  where cm.conversation_id = target_conversation_id
    and cm.institution_id = tenant_id
    and cm.user_id = requester_id
    and c.is_group = true;
  if requester_role is null or requester_role not in ('owner','admin') then
    raise exception 'Only group owners and administrators can rename this group.';
  end if;
  update public.conversations
  set title = clean_title
  where id = target_conversation_id and institution_id = tenant_id and is_group = true;
  if not found then raise exception 'This group conversation is not available.'; end if;
end;
$$;

revoke all on function public.rename_group_conversation(uuid, text) from public, anon;
grant execute on function public.rename_group_conversation(uuid, text) to authenticated;
