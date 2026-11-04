-- Group conversations and private image attachments for CampusConnect.
-- This migration is additive; existing one-to-one conversations remain unchanged.

alter table public.conversations
  add column if not exists title text;

alter table public.conversations
  drop constraint if exists conversations_title_length_check;
alter table public.conversations
  add constraint conversations_title_length_check
  check (title is null or char_length(btrim(title)) between 2 and 80);

create index if not exists conversations_institution_created_idx
  on public.conversations(institution_id, created_at desc);

grant select, insert on public.conversations, public.conversation_members to authenticated;

drop policy if exists conversations_create_group on public.conversations;
create policy conversations_create_group
on public.conversations for insert to authenticated
with check (
  created_by = (select auth.uid())
  and is_group = true
  and institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user((select auth.uid()), institution_id))
);

drop policy if exists conversation_members_create_group on public.conversation_members;
create policy conversation_members_create_group
on public.conversation_members for insert to authenticated
with check (
  institution_id = (select private.current_institution_id())
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_members.conversation_id
      and c.institution_id = conversation_members.institution_id
      and c.created_by = (select auth.uid())
      and c.is_group = true
  )
  and (
    user_id = (select auth.uid())
    or (
      (select private.is_verified_institution_user(user_id, institution_id))
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = user_id)
           or (b.blocker_id = user_id and b.blocked_id = (select auth.uid()))
      )
    )
  )
);

create or replace function public.create_group_conversation(
  target_user_ids uuid[],
  conversation_title text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  tenant_id uuid := (select private.current_institution_id());
  selected_user_ids uuid[];
  verified_count integer;
  blocked_count integer;
  thread_id uuid;
  clean_title text := btrim(conversation_title);
begin
  if requester_id is null then
    raise exception 'You must be signed in to create a group chat.';
  end if;
  if not (select private.is_verified_institution_user(requester_id, tenant_id)) then
    raise exception 'Your UEW account must be verified before messaging.';
  end if;
  if clean_title is null or char_length(clean_title) not between 2 and 80 then
    raise exception 'Group name must be between 2 and 80 characters.';
  end if;

  select coalesce(array_agg(distinct selected.member_id), '{}'::uuid[])
    into selected_user_ids
  from unnest(coalesce(target_user_ids, '{}'::uuid[])) as selected(member_id)
  where selected.member_id is not null and selected.member_id <> requester_id;

  if cardinality(selected_user_ids) < 1 or cardinality(selected_user_ids) > 19 then
    raise exception 'Choose between 1 and 19 other verified campus members.';
  end if;

  select count(*) into verified_count
  from public.users u
  where u.id = any(selected_user_ids)
    and u.institution_id = tenant_id
    and u.verification_status = 'verified'::public.verification_status;

  if verified_count <> cardinality(selected_user_ids) then
    raise exception 'Every group member must be a verified member of the same campus.';
  end if;

  select count(*) into blocked_count
  from public.user_blocks b
  where (b.blocker_id = requester_id and b.blocked_id = any(selected_user_ids))
     or (b.blocked_id = requester_id and b.blocker_id = any(selected_user_ids));

  if blocked_count > 0 then
    raise exception 'A group cannot include a member involved in a block relationship with you.';
  end if;

  insert into public.conversations(institution_id, is_group, created_by, title)
  values (tenant_id, true, requester_id, clean_title)
  returning id into thread_id;

  insert into public.conversation_members(institution_id, conversation_id, user_id)
  values (tenant_id, thread_id, requester_id);

  insert into public.conversation_members(institution_id, conversation_id, user_id)
  select tenant_id, thread_id, selected.member_id
  from unnest(selected_user_ids) as selected(member_id);

  return thread_id;
end;
$$;

revoke all on function public.create_group_conversation(uuid[], text) from public, anon;
grant execute on function public.create_group_conversation(uuid[], text) to authenticated;

-- Private image bucket. Paths are: <conversation UUID>/<uploader UUID>/<file name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campus-message-attachments',
  'campus-message-attachments',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists campus_message_attachments_read_members on storage.objects;
create policy campus_message_attachments_read_members
on storage.objects for select to authenticated
using (
  bucket_id = 'campus-message-attachments'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (select private.is_conversation_member(((storage.foldername(name))[1])::uuid))
);

drop policy if exists campus_message_attachments_insert_own on storage.objects;
create policy campus_message_attachments_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campus-message-attachments'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.is_conversation_member(((storage.foldername(name))[1])::uuid))
);

drop policy if exists campus_message_attachments_update_own on storage.objects;
create policy campus_message_attachments_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'campus-message-attachments'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.is_conversation_member(((storage.foldername(name))[1])::uuid))
)
with check (
  bucket_id = 'campus-message-attachments'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.is_conversation_member(((storage.foldername(name))[1])::uuid))
);

drop policy if exists campus_message_attachments_delete_own on storage.objects;
create policy campus_message_attachments_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'campus-message-attachments'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.is_conversation_member(((storage.foldername(name))[1])::uuid))
);

-- Message rows may reference only files uploaded by their sender into this conversation.
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and char_length(btrim(body)) between 1 and 10000
  and coalesce(array_length(attachment_paths, 1), 0) <= 4
  and not exists (
    select 1
    from unnest(attachment_paths) as attachments(path)
    where attachments.path !~ (
      '^' || conversation_id::text || '/' || (select auth.uid())::text || '/[^/]+$'
    )
  )
  and (select private.is_conversation_member(conversation_id))
  and not exists (
    select 1
    from public.user_blocks b
    join public.conversation_members cm
      on cm.conversation_id = messages.conversation_id
     and cm.institution_id = messages.institution_id
     and cm.user_id <> (select auth.uid())
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = cm.user_id)
       or (b.blocker_id = cm.user_id and b.blocked_id = (select auth.uid()))
  )
);
