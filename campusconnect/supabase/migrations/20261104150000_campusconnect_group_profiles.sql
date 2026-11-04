-- Group descriptions and private profile photos for group conversations.
alter table public.conversations
  add column if not exists description text,
  add column if not exists avatar_path text;

alter table public.conversations
  add constraint conversations_group_description_length
    check (description is null or char_length(description) <= 500),
  add constraint conversations_group_avatar_path_scope
    check (
      avatar_path is null
      or (is_group and avatar_path like ('groups/' || id::text || '/%'))
    );

grant update (description, avatar_path) on public.conversations to authenticated;

drop policy if exists conversations_update_group_profile on public.conversations;
create policy conversations_update_group_profile
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-group-avatars', 'campus-group-avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists campus_group_avatars_read_members on storage.objects;
create policy campus_group_avatars_read_members
on storage.objects for select
to authenticated
using (
  bucket_id = 'campus-group-avatars'
  and exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.conversation_id = (storage.foldername(name))[2]::uuid
      and cm.user_id = (select auth.uid())
      and c.is_group
      and c.institution_id = (select private.current_institution_id())
      and (storage.foldername(name))[1] = 'groups'
  )
);

drop policy if exists campus_group_avatars_insert_admins on storage.objects;
create policy campus_group_avatars_insert_admins
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'campus-group-avatars'
  and (storage.foldername(name))[1] = 'groups'
  and exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.conversation_id = (storage.foldername(name))[2]::uuid
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
      and c.is_group
      and c.institution_id = (select private.current_institution_id())
  )
);

drop policy if exists campus_group_avatars_delete_admins on storage.objects;
create policy campus_group_avatars_delete_admins
on storage.objects for delete
to authenticated
using (
  bucket_id = 'campus-group-avatars'
  and (storage.foldername(name))[1] = 'groups'
  and exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.conversation_id = (storage.foldername(name))[2]::uuid
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
      and c.is_group
      and c.institution_id = (select private.current_institution_id())
  )
);
