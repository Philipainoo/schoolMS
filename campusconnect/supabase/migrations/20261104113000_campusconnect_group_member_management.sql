-- Group conversation membership roles and owner/admin management.
alter table public.conversation_members
  add column if not exists role text not null default 'member';

alter table public.conversation_members
  drop constraint if exists conversation_members_role_check;
alter table public.conversation_members
  add constraint conversation_members_role_check
  check (role in ('owner','admin','member'));

-- Existing group creators become owners; direct-chat members remain ordinary members.
update public.conversation_members cm
set role = 'owner'
from public.conversations c
where c.id = cm.conversation_id
  and c.institution_id = cm.institution_id
  and c.is_group = true
  and c.created_by = cm.user_id;

create index if not exists conversation_members_group_role_idx
  on public.conversation_members(conversation_id, role, joined_at);

-- Assign the creator's owner role when the group-creation RPC inserts its first member.
create or replace function private.assign_group_conversation_owner_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members cm
  set role = 'owner'
  from public.conversations c
  where cm.conversation_id = new.conversation_id
    and cm.institution_id = new.institution_id
    and cm.user_id = new.user_id
    and c.id = new.conversation_id
    and c.institution_id = new.institution_id
    and c.is_group = true
    and c.created_by = new.user_id;
  return new;
end;
$$;

revoke all on function private.assign_group_conversation_owner_role() from public, anon, authenticated;
drop trigger if exists assign_group_conversation_owner_role on public.conversation_members;
create trigger assign_group_conversation_owner_role
after insert on public.conversation_members
for each row execute function private.assign_group_conversation_owner_role();

-- Membership changes are exposed only through these narrowly scoped RPCs.
create or replace function public.manage_group_conversation_member(
  target_conversation_id uuid,
  target_user_id uuid,
  action text
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
  target_role text;
  member_count integer;
begin
  if requester_id is null then
    raise exception 'Sign in to manage group members.';
  end if;
  if action not in ('add','remove','leave') then
    raise exception 'Unsupported group membership action.';
  end if;
  if target_user_id is null then
    raise exception 'Choose a valid group member.';
  end if;
  if not (select private.is_verified_institution_user(requester_id, tenant_id)) then
    raise exception 'Your UEW account must be verified.';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and c.institution_id = tenant_id
      and c.is_group = true
  ) then
    raise exception 'This group conversation is not available.';
  end if;

  select cm.role into requester_role
  from public.conversation_members cm
  where cm.conversation_id = target_conversation_id
    and cm.institution_id = tenant_id
    and cm.user_id = requester_id;

  select cm.role into target_role
  from public.conversation_members cm
  where cm.conversation_id = target_conversation_id
    and cm.institution_id = tenant_id
    and cm.user_id = target_user_id;

  if action = 'leave' then
    if target_user_id <> requester_id then
      raise exception 'You can only leave a group as yourself.';
    end if;
    if requester_role is null then
      raise exception 'You are not a member of this group.';
    end if;
    if requester_role = 'owner' then
      raise exception 'Transfer group ownership before leaving.';
    end if;
    delete from public.conversation_members
    where conversation_id = target_conversation_id
      and institution_id = tenant_id
      and user_id = requester_id;
    return;
  end if;

  if requester_role not in ('owner','admin') then
    raise exception 'Only group owners and administrators can manage members.';
  end if;

  if action = 'add' then
    if target_role is not null then
      raise exception 'This person is already in the group.';
    end if;
    if not exists (
      select 1 from public.users u
      where u.id = target_user_id
        and u.institution_id = tenant_id
        and u.verification_status = 'verified'::public.verification_status
    ) then
      raise exception 'Only verified UEW members can be added.';
    end if;
    if exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = requester_id and b.blocked_id = target_user_id)
         or (b.blocker_id = target_user_id and b.blocked_id = requester_id)
    ) then
      raise exception 'This member cannot be added because of a block relationship.';
    end if;
    select count(*) into member_count
    from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.institution_id = tenant_id;
    if member_count >= 20 then
      raise exception 'This group has reached its 20-member limit.';
    end if;
    insert into public.conversation_members(institution_id, conversation_id, user_id, role)
    values (tenant_id, target_conversation_id, target_user_id, 'member');
    return;
  end if;

  if target_role is null then
    raise exception 'That person is not a member of this group.';
  end if;
  if target_role = 'owner' then
    raise exception 'The group owner cannot be removed.';
  end if;
  if target_role = 'admin' and requester_role <> 'owner' then
    raise exception 'Only the group owner can remove an administrator.';
  end if;

  delete from public.conversation_members
  where conversation_id = target_conversation_id
    and institution_id = tenant_id
    and user_id = target_user_id;
end;
$$;

create or replace function public.set_group_conversation_admin(
  target_conversation_id uuid,
  target_user_id uuid,
  make_admin boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  tenant_id uuid := (select private.current_institution_id());
  target_role text;
begin
  if requester_id is null
     or not (select private.is_verified_institution_user(requester_id, tenant_id)) then
    raise exception 'A verified UEW account is required.';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and c.institution_id = tenant_id
      and c.is_group = true
      and c.created_by = requester_id
  ) then
    raise exception 'Only the group owner can manage administrators.';
  end if;
  select cm.role into target_role
  from public.conversation_members cm
  where cm.conversation_id = target_conversation_id
    and cm.institution_id = tenant_id
    and cm.user_id = target_user_id;
  if target_role is null or target_role = 'owner' then
    raise exception 'Choose an existing group member.';
  end if;
  update public.conversation_members
  set role = case when make_admin then 'admin' else 'member' end
  where conversation_id = target_conversation_id
    and institution_id = tenant_id
    and user_id = target_user_id;
end;
$$;

create or replace function public.transfer_group_conversation_ownership(
  target_conversation_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  tenant_id uuid := (select private.current_institution_id());
begin
  if requester_id is null
     or not (select private.is_verified_institution_user(requester_id, tenant_id)) then
    raise exception 'A verified UEW account is required.';
  end if;
  if target_user_id = requester_id then
    raise exception 'Choose another member to receive ownership.';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and c.institution_id = tenant_id
      and c.is_group = true
      and c.created_by = requester_id
  ) then
    raise exception 'Only the group owner can transfer ownership.';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.institution_id = tenant_id
      and cm.user_id = target_user_id
  ) then
    raise exception 'The new owner must already be a group member.';
  end if;

  update public.conversation_members
  set role = case when user_id = requester_id then 'admin'
                  when user_id = target_user_id then 'owner'
                  else role end
  where conversation_id = target_conversation_id
    and institution_id = tenant_id
    and user_id in (requester_id, target_user_id);

  update public.conversations
  set created_by = target_user_id
  where id = target_conversation_id
    and institution_id = tenant_id
    and is_group = true;
end;
$$;

revoke all on function public.manage_group_conversation_member(uuid, uuid, text) from public, anon;
revoke all on function public.set_group_conversation_admin(uuid, uuid, boolean) from public, anon;
revoke all on function public.transfer_group_conversation_ownership(uuid, uuid) from public, anon;
grant execute on function public.manage_group_conversation_member(uuid, uuid, text) to authenticated;
grant execute on function public.set_group_conversation_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.transfer_group_conversation_ownership(uuid, uuid) to authenticated;
