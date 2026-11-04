-- CampusConnect private profile avatar storage.
-- Applied to Supabase project jfwnudfdiuopdsjqakku as campusconnect_profile_avatars.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-avatars', 'campus-avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "campus_avatars_read_verified_members" on storage.objects;
create policy "campus_avatars_read_verified_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'campus-avatars'
  and (select private.current_institution_id()) is not null
);

drop policy if exists "campus_avatars_insert_own_folder" on storage.objects;
create policy "campus_avatars_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'campus-avatars'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "campus_avatars_update_own_folder" on storage.objects;
create policy "campus_avatars_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'campus-avatars'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'campus-avatars'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "campus_avatars_delete_own_folder" on storage.objects;
create policy "campus_avatars_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'campus-avatars'
  and (select private.current_institution_id()) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
