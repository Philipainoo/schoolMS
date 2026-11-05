-- Verified buyer/seller confirmation and post-purchase marketplace reviews.
create table if not exists public.marketplace_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references public.users(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','confirmed','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id,buyer_id),
  check (buyer_id <> seller_id)
);
create index if not exists marketplace_purchase_requests_seller_idx
  on public.marketplace_purchase_requests(seller_id,status,created_at desc);
alter table public.marketplace_purchase_requests enable row level security;
revoke all on public.marketplace_purchase_requests from public,anon;
grant select,insert on public.marketplace_purchase_requests to authenticated;
create policy marketplace_purchase_requests_read_parties on public.marketplace_purchase_requests
for select to authenticated using (
  (buyer_id=(select auth.uid()) or seller_id=(select auth.uid()))
  and (select private.is_verified_institution_user((select auth.uid()),(select private.current_institution_id())))
);
create policy marketplace_purchase_requests_create_buyer on public.marketplace_purchase_requests
for insert to authenticated with check (
  buyer_id=(select auth.uid())
  and (select private.is_verified_institution_user(buyer_id,(select private.current_institution_id())))
  and exists (
    select 1 from public.marketplace_listings l
    where l.id=marketplace_purchase_requests.listing_id and l.seller_id=marketplace_purchase_requests.seller_id
      and l.institution_id=(select private.current_institution_id())
      and l.status='active' and l.seller_id<>buyer_id
  )
);
create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null unique references public.marketplace_purchase_requests(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references public.users(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '' check (char_length(review_text)<=1000),
  created_at timestamptz not null default now(),
  check (buyer_id<>seller_id)
);
create index if not exists marketplace_reviews_seller_idx on public.marketplace_reviews(seller_id,created_at desc);
create index if not exists marketplace_reviews_listing_idx on public.marketplace_reviews(listing_id,created_at desc);
alter table public.marketplace_reviews enable row level security;
revoke all on public.marketplace_reviews from public,anon;
grant select,insert on public.marketplace_reviews to authenticated;
create policy marketplace_reviews_read_verified on public.marketplace_reviews
for select to authenticated using (
  (select private.is_verified_institution_user((select auth.uid()),(select private.current_institution_id())))
  and exists (select 1 from public.marketplace_listings l where l.id=marketplace_reviews.listing_id and l.institution_id=(select private.current_institution_id()))
);
create policy marketplace_reviews_create_confirmed_buyer on public.marketplace_reviews
for insert to authenticated with check (
  buyer_id=(select auth.uid())
  and (select private.is_verified_institution_user(buyer_id,(select private.current_institution_id())))
  and exists (
    select 1 from public.marketplace_purchase_requests p
    join public.marketplace_listings l on l.id=p.listing_id
    where p.id=marketplace_reviews.purchase_request_id and p.listing_id=marketplace_reviews.listing_id
      and p.buyer_id=marketplace_reviews.buyer_id and p.seller_id=marketplace_reviews.seller_id
      and p.status='confirmed' and l.status='sold'
      and l.institution_id=(select private.current_institution_id())
  )
);
create or replace function public.confirm_marketplace_purchase(request_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_request public.marketplace_purchase_requests%rowtype;
begin
  select * into v_request from public.marketplace_purchase_requests
  where id=request_id for update;
  if not found or v_request.seller_id <> (select auth.uid()) then
    raise exception 'Purchase request not found or not owned by this seller';
  end if;
  if not (select private.is_verified_institution_user((select auth.uid()),(select private.current_institution_id()))) then
    raise exception 'Verified UEW account required';
  end if;
  if v_request.status <> 'pending' then raise exception 'This request has already been handled'; end if;
  update public.marketplace_listings set status='sold',updated_at=now()
    where id=v_request.listing_id and seller_id=(select auth.uid()) and status='active';
  if not found then raise exception 'This listing is no longer available'; end if;
  update public.marketplace_purchase_requests set status='confirmed',updated_at=now()
    where id=request_id;
  update public.marketplace_purchase_requests set status='declined',updated_at=now()
    where listing_id=v_request.listing_id and id<>request_id and status='pending';
end;
$$;
revoke all on function public.confirm_marketplace_purchase(uuid) from public,anon;
grant execute on function public.confirm_marketplace_purchase(uuid) to authenticated;
