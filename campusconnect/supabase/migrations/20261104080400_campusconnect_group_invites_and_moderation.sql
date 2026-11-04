-- Private group invitations and owner-managed moderator roles.
create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  group_id uuid not null,
  invited_user_id uuid not null,
  invited_by uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint group_invites_group_same_institution_fk foreign key (group_id, institution_id) references public.groups(id, institution_id) on delete cascade,
  constraint group_invites_user_same_institution_fk foreign key (invited_user_id, institution_id) references public.users(id, institution_id) on delete cascade,
  constraint group_invites_inviter_same_institution_fk foreign key (invited_by, institution_id) references public.users(id, institution_id) on delete cascade,
  constraint group_invites_not_self check (invited_user_id <> invited_by)
);
create unique index if not exists group_invites_one_pending_per_user_idx on public.group_invites(group_id, invited_user_id) where status = 'pending';
create index if not exists group_invites_recipient_status_idx on public.group_invites(invited_user_id, status, invited_at desc);
alter table public.group_invites enable row level security;
revoke all on public.group_invites from anon, authenticated;
grant select, insert, update on public.group_invites to authenticated;

create or replace function private.is_verified_institution_user(target_user_id uuid, target_institution_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = target_user_id
      and u.institution_id = target_institution_id
      and u.verification_status = 'verified'::public.verification_status
      and target_institution_id = (select private.current_institution_id())
  );
$$;
revoke all on function private.is_verified_institution_user(uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_verified_institution_user(uuid, uuid) to authenticated;

create policy group_invites_read_participants on public.group_invites for select to authenticated
using (
  institution_id = (select private.current_institution_id())
  and (
    invited_user_id = (select auth.uid())
    or invited_by = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = group_invites.group_id and g.institution_id = group_invites.institution_id and g.owner_id = (select auth.uid()))
    or exists (select 1 from public.group_members gm where gm.group_id = group_invites.group_id and gm.institution_id = group_invites.institution_id and gm.user_id = (select auth.uid()) and gm.role in ('admin'::public.group_member_role, 'moderator'::public.group_member_role))
  )
);
create policy group_invites_create_by_moderators on public.group_invites for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and invited_user_id <> (select auth.uid())
  and status = 'pending' and responded_at is null
  and institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user(invited_user_id, institution_id))
  and (
    exists (select 1 from public.groups g where g.id = group_invites.group_id and g.institution_id = group_invites.institution_id and g.owner_id = (select auth.uid()))
    or exists (select 1 from public.group_members gm where gm.group_id = group_invites.group_id and gm.institution_id = group_invites.institution_id and gm.user_id = (select auth.uid()) and gm.role in ('admin'::public.group_member_role, 'moderator'::public.group_member_role))
  )
);
create policy group_invites_respond_to_own on public.group_invites for update to authenticated
using (
  invited_user_id = (select auth.uid()) and status = 'pending'
  and institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user(invited_user_id, institution_id))
)
with check (
  invited_user_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and status in ('accepted','declined') and responded_at is not null
);

create policy group_members_owner_manage_roles on public.group_members for update to authenticated
using (
  institution_id = (select private.current_institution_id())
  and user_id <> (select auth.uid())
  and exists (select 1 from public.groups g where g.id = group_members.group_id and g.institution_id = group_members.institution_id and g.owner_id = (select auth.uid()))
)
with check (
  institution_id = (select private.current_institution_id())
  and user_id <> (select auth.uid())
  and role in ('member'::public.group_member_role, 'moderator'::public.group_member_role)
  and exists (select 1 from public.groups g where g.id = group_members.group_id and g.institution_id = group_members.institution_id and g.owner_id = (select auth.uid()))
);

drop policy if exists group_posts_delete_author_or_owner on public.group_posts;
create policy group_posts_delete_author_or_owner on public.group_posts for delete to authenticated
using (
  institution_id = (select private.current_institution_id())
  and (
    author_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = group_posts.group_id and g.institution_id = group_posts.institution_id and g.owner_id = (select auth.uid()))
    or exists (select 1 from public.group_members gm where gm.group_id = group_posts.group_id and gm.institution_id = group_posts.institution_id and gm.user_id = (select auth.uid()) and gm.role in ('admin'::public.group_member_role, 'moderator'::public.group_member_role))
  )
);

create or replace function private.accept_group_invite_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status = 'pending'
     and new.invited_user_id = (select auth.uid())
     and (select private.is_verified_institution_user(new.invited_user_id, new.institution_id)) then
    insert into public.group_members (institution_id, group_id, user_id, role)
    values (new.institution_id, new.group_id, new.invited_user_id, 'member'::public.group_member_role)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.accept_group_invite_membership() from public, anon, authenticated;
drop trigger if exists on_group_invite_accepted on public.group_invites;
create trigger on_group_invite_accepted after update of status on public.group_invites
for each row when (old.status = 'pending' and new.status = 'accepted')
execute function private.accept_group_invite_membership();
