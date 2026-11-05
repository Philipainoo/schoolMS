create or replace function private.can_add_direct_conversation_member(
  target_conversation_id uuid,
  target_user_id uuid,
  target_institution_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
begin
  if requester_id is null
     or target_institution_id <> (select private.current_institution_id())
     or not (select private.is_verified_institution_user(requester_id, target_institution_id)) then
    return false;
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and c.institution_id = target_institution_id
      and c.created_by = requester_id
      and c.is_group = false
  ) then
    return false;
  end if;
  if target_user_id = requester_id then
    return true;
  end if;
  return
    (select private.is_verified_institution_user(target_user_id, target_institution_id))
    and exists (
      select 1 from public.conversation_members mine
      where mine.conversation_id = target_conversation_id
        and mine.institution_id = target_institution_id
        and mine.user_id = requester_id
    )
    and not exists (
      select 1 from public.conversation_members other_member
      where other_member.conversation_id = target_conversation_id
        and other_member.institution_id = target_institution_id
        and other_member.user_id <> requester_id
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = requester_id and b.blocked_id = target_user_id)
         or (b.blocker_id = target_user_id and b.blocked_id = requester_id)
    );
end;
$$;
revoke all on function private.can_add_direct_conversation_member(uuid, uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_add_direct_conversation_member(uuid, uuid, uuid) to authenticated;

drop policy if exists conversations_create_direct on public.conversations;
create policy conversations_create_direct on public.conversations for insert to authenticated
with check (
  created_by = (select auth.uid())
  and is_group = false
  and institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user((select auth.uid()), institution_id))
);

drop policy if exists conversation_members_create_direct on public.conversation_members;
create policy conversation_members_create_direct on public.conversation_members for insert to authenticated
with check (
  institution_id = (select private.current_institution_id())
  and (select private.can_add_direct_conversation_member(conversation_id, user_id, institution_id))
);
