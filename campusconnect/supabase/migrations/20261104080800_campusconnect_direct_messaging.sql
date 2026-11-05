-- Direct messaging uses the existing conversation tables and RLS model.
create index if not exists conversation_members_user_tenant_idx
  on public.conversation_members(user_id, institution_id, conversation_id);
create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc);

create or replace function public.open_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  tenant_id uuid := (select private.current_institution_id());
  thread_id uuid;
begin
  if requester_id is null then
    raise exception 'You must be signed in to start a conversation.';
  end if;
  if target_user_id is null or target_user_id = requester_id then
    raise exception 'Choose another campus member.';
  end if;
  if not exists (
    select 1 from public.users u
    where u.id = requester_id and u.institution_id = tenant_id
      and u.verification_status = 'verified'::public.verification_status
  ) then
    raise exception 'Your UEW account must be verified before messaging.';
  end if;
  if not exists (
    select 1 from public.users u
    where u.id = target_user_id and u.institution_id = tenant_id
      and u.verification_status = 'verified'::public.verification_status
  ) then
    raise exception 'That member is not available for direct messages.';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = requester_id and b.blocked_id = target_user_id)
       or (b.blocker_id = target_user_id and b.blocked_id = requester_id)
  ) then
    raise exception 'This conversation cannot be started because one member has blocked the other.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(requester_id::text, target_user_id::text) || ':' ||
    greatest(requester_id::text, target_user_id::text), 0
  ));

  select c.id into thread_id
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.institution_id = c.institution_id
   and mine.user_id = requester_id
  join public.conversation_members theirs
    on theirs.conversation_id = c.id and theirs.institution_id = c.institution_id
   and theirs.user_id = target_user_id
  where c.institution_id = tenant_id and c.is_group = false
    and not exists (
      select 1 from public.conversation_members extra
      where extra.conversation_id = c.id
        and extra.user_id not in (requester_id, target_user_id)
    )
  limit 1;

  if thread_id is null then
    insert into public.conversations(institution_id, is_group, created_by)
    values (tenant_id, false, requester_id)
    returning id into thread_id;
    insert into public.conversation_members(institution_id, conversation_id, user_id)
    values (tenant_id, thread_id, requester_id),
           (tenant_id, thread_id, target_user_id);
  end if;
  return thread_id;
end;
$$;
revoke all on function public.open_direct_conversation(uuid) from public, anon;
grant execute on function public.open_direct_conversation(uuid) to authenticated;

grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant insert on public.messages to authenticated;

drop policy if exists conversations_read_members on public.conversations;
create policy conversations_read_members on public.conversations for select to authenticated
using (institution_id = (select private.current_institution_id())
  and (select private.is_conversation_member(id)));

drop policy if exists conversation_members_read_members on public.conversation_members;
create policy conversation_members_read_members on public.conversation_members for select to authenticated
using (institution_id = (select private.current_institution_id())
  and (select private.is_conversation_member(conversation_id)));

drop policy if exists messages_read_members on public.messages;
create policy messages_read_members on public.messages for select to authenticated
using (institution_id = (select private.current_institution_id())
  and (select private.is_conversation_member(conversation_id)));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and char_length(btrim(body)) between 1 and 10000
  and (select private.is_conversation_member(conversation_id))
  and not exists (
    select 1 from public.user_blocks b
    join public.conversation_members cm
      on cm.conversation_id = messages.conversation_id
     and cm.institution_id = messages.institution_id
     and cm.user_id <> (select auth.uid())
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = cm.user_id)
       or (b.blocker_id = cm.user_id and b.blocked_id = (select auth.uid()))
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
