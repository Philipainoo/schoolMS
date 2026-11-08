-- Make the main CampusConnect feed global while preserving existing accounts and content.
-- Institution affiliation remains available for optional community features.

alter table public.users alter column institution_id drop not null;
alter table public.profiles alter column institution_id drop not null;
alter table public.posts alter column institution_id drop not null;
alter table public.comments alter column institution_id drop not null;

-- Existing posts and comments become part of the global feed; no content is deleted.
update public.comments set institution_id = null where institution_id is not null;
update public.posts set institution_id = null where institution_id is not null;

create or replace function public.handle_new_connect_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
declare
  display_name_value text;
  username_value text;
begin
  display_name_value := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );
  username_value := lower(regexp_replace(
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
    '[^a-zA-Z0-9_]+', '', 'g'
  ));
  if username_value = '' then
    username_value := 'user_' || replace(new.id::text, '-', '');
  end if;

  -- Every new account starts as a standard member with no required affiliation.
  -- Email confirmation is synchronized by the private auth.users trigger below.
  insert into public.users (id, institution_id, email, role, verification_status)
  values (new.id, null, new.email, 'student'::public.account_role, 'pending');

  insert into public.profiles (user_id, institution_id, display_name, username)
  values (new.id, null, left(display_name_value, 120), left(username_value, 30));

  return new;
end;
$;

create or replace function private.is_email_confirmed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users au
    where au.id = (select auth.uid())
      and au.email_confirmed_at is not null
  );
$$;

revoke all on function private.is_email_confirmed_user() from public;
grant execute on function private.is_email_confirmed_user() to authenticated;

create or replace function private.sync_email_confirmation_to_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null then
    if tg_op = 'INSERT' or old.email_confirmed_at is null then
      update public.users
         set verification_status = 'verified'::public.verification_status
       where id = new.id
         and verification_status = 'pending'::public.verification_status;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_email_confirmation_to_user() from public, anon, authenticated;

drop trigger if exists sync_connect_user_email_confirmation_insert on auth.users;
create trigger sync_connect_user_email_confirmation_insert
after insert on auth.users
for each row execute function private.sync_email_confirmation_to_user();

drop trigger if exists sync_connect_user_email_confirmation_update on auth.users;
create trigger sync_connect_user_email_confirmation_update
after update of email_confirmed_at on auth.users
for each row execute function private.sync_email_confirmation_to_user();

-- Global member discovery/profile visibility is limited to users who confirmed their email.
drop policy if exists profiles_read_tenant on public.profiles;
create policy profiles_read_confirmed_members
on public.profiles for select to authenticated
using (private.is_email_confirmed_user());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles for insert to authenticated
with check (user_id = (select auth.uid()) and institution_id is null);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Global feed access for email-confirmed members. Old feed rows were migrated to NULL institution_id above.
drop policy if exists posts_read_tenant on public.posts;
create policy posts_read_global_confirmed
on public.posts for select to authenticated
using (private.is_email_confirmed_user() and is_removed = false and institution_id is null);

drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_global_self
on public.posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and institution_id is null
  and private.is_email_confirmed_user()
);

drop policy if exists posts_update_self on public.posts;
create policy posts_update_global_self
on public.posts for update to authenticated
using (author_id = (select auth.uid()) and institution_id is null and private.is_email_confirmed_user())
with check (author_id = (select auth.uid()) and institution_id is null);

drop policy if exists comments_read_tenant on public.comments;
create policy comments_read_global_confirmed
on public.comments for select to authenticated
using (institution_id is null and private.is_email_confirmed_user());

drop policy if exists comments_insert_self on public.comments;
create policy comments_insert_global_self
on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and institution_id is null
  and private.is_email_confirmed_user()
);
