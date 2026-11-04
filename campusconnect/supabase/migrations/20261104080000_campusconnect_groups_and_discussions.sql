-- CampusConnect groups, membership bootstrap, and group discussions.
-- Tighten tenant matching in the existing group membership policies.
drop policy if exists group_members_join_public on public.group_members;
create policy group_members_join_public
on public.group_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'member'::public.group_member_role
  and institution_id = (select private.current_institution_id())
  and exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.institution_id = group_members.institution_id
      and g.visibility = 'public'::public.group_visibility
  )
);

drop policy if exists group_members_read_visible on public.group_members;
create policy group_members_read_visible
on public.group_members
for select
to authenticated
using (
  institution_id = (select private.current_institution_id())
  and (
    (select private.is_group_member(group_id))
    or exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.institution_id = group_members.institution_id
        and g.visibility = 'public'::public.group_visibility
    )
  )
);

-- Only a group owner may bootstrap their own admin membership.
drop policy if exists group_members_owner_add_self on public.group_members;
create policy group_members_owner_add_self
on public.group_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'admin'::public.group_member_role
  and institution_id = (select private.current_institution_id())
  and exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.institution_id = group_members.institution_id
      and g.owner_id = (select auth.uid())
  )
);

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  group_id uuid not null,
  author_id uuid not null,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  constraint group_posts_group_same_institution_fk
    foreign key (group_id, institution_id)
    references public.groups(id, institution_id) on delete cascade,
  constraint group_posts_author_same_institution_fk
    foreign key (author_id, institution_id)
    references public.users(id, institution_id) on delete cascade
);

create index if not exists group_posts_group_created_idx
on public.group_posts(group_id, created_at desc);

alter table public.group_posts enable row level security;
grant select, insert, delete on public.group_posts to authenticated;

drop policy if exists group_posts_read_members on public.group_posts;
create policy group_posts_read_members
on public.group_posts for select to authenticated
using (
  institution_id = (select private.current_institution_id())
  and (select private.is_group_member(group_id))
);

drop policy if exists group_posts_insert_members on public.group_posts;
create policy group_posts_insert_members
on public.group_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and (select private.is_group_member(group_id))
);

drop policy if exists group_posts_delete_author_or_owner on public.group_posts;
create policy group_posts_delete_author_or_owner
on public.group_posts for delete to authenticated
using (
  institution_id = (select private.current_institution_id())
  and (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.groups g
      where g.id = group_posts.group_id
        and g.institution_id = group_posts.institution_id
        and g.owner_id = (select auth.uid())
    )
  )
);
