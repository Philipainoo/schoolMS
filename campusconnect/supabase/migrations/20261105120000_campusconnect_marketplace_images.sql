alter table public.marketplace_listings add column if not exists image_path text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('marketplace-images','marketplace-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy marketplace_images_upload_verified on storage.objects
for insert to authenticated with check (
  bucket_id='marketplace-images'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select private.is_verified_institution_user((select auth.uid()),(select private.current_institution_id())))
);

create policy marketplace_images_read_verified on storage.objects
for select to authenticated using (
  bucket_id='marketplace-images'
  and (select private.is_verified_institution_user((select auth.uid()),(select private.current_institution_id())))
);

create policy marketplace_images_update_owner on storage.objects
for update to authenticated using (
  bucket_id='marketplace-images' and (storage.foldername(name))[1]=(select auth.uid())::text
) with check (
  bucket_id='marketplace-images' and (storage.foldername(name))[1]=(select auth.uid())::text
);

create policy marketplace_images_delete_owner on storage.objects
for delete to authenticated using (
  bucket_id='marketplace-images' and (storage.foldername(name))[1]=(select auth.uid())::text
);
