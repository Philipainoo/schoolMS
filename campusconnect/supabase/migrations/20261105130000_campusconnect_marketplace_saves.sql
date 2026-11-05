create table if not exists public.marketplace_listing_saves (
  user_id uuid not null references public.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id,listing_id)
);
create index if not exists marketplace_listing_saves_listing_idx on public.marketplace_listing_saves(listing_id);
alter table public.marketplace_listing_saves enable row level security;
revoke all on public.marketplace_listing_saves from public,anon;
grant select,insert,delete on public.marketplace_listing_saves to authenticated;
create policy marketplace_saves_read_owner on public.marketplace_listing_saves
for select to authenticated using (user_id=(select auth.uid()) and (select private.is_verified_institution_user(user_id,(select private.current_institution_id()))));
create policy marketplace_saves_create_owner on public.marketplace_listing_saves
for insert to authenticated with check (
 user_id=(select auth.uid())
 and (select private.is_verified_institution_user(user_id,(select private.current_institution_id())))
 and exists (select 1 from public.marketplace_listings l where l.id=listing_id and l.institution_id=(select private.current_institution_id()) and l.status='active')
);
create policy marketplace_saves_delete_owner on public.marketplace_listing_saves
for delete to authenticated using (user_id=(select auth.uid()));
