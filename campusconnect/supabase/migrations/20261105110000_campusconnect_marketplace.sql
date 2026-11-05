-- UEW-only student marketplace listings.
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  category text not null check (category in ('Books','Electronics','Fashion','Furniture','Accommodation','Other')),
  price numeric(12,2) not null check (price >= 0),
  item_condition text not null check (item_condition in ('New','Like new','Good','Fair')),
  location text not null check (char_length(trim(location)) between 2 and 100),
  status text not null default 'active' check (status in ('active','sold','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_listings_browse_idx
  on public.marketplace_listings(institution_id,status,created_at desc);
create index if not exists marketplace_listings_category_idx
  on public.marketplace_listings(institution_id,category,status);
alter table public.marketplace_listings enable row level security;
revoke all on public.marketplace_listings from public, anon;
grant select, insert, update on public.marketplace_listings to authenticated;
drop policy if exists marketplace_listings_read_verified on public.marketplace_listings;
create policy marketplace_listings_read_verified on public.marketplace_listings
for select to authenticated using (
  institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user(seller_id,institution_id))
  and status <> 'removed'
);
drop policy if exists marketplace_listings_create_verified on public.marketplace_listings;
create policy marketplace_listings_create_verified on public.marketplace_listings
for insert to authenticated with check (
  seller_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user(seller_id,institution_id))
  and status = 'active'
);
drop policy if exists marketplace_listings_update_owner on public.marketplace_listings;
create policy marketplace_listings_update_owner on public.marketplace_listings
for update to authenticated using (
  seller_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
) with check (
  seller_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
);
