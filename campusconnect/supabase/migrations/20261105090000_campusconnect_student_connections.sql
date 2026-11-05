-- Verified UEW member connection requests.
create table if not exists public.campus_connections (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_connections_distinct_members check (requester_id <> recipient_id),
  constraint campus_connections_unique_pair unique (institution_id, requester_id, recipient_id)
);
create index if not exists campus_connections_recipient_status_idx
  on public.campus_connections(recipient_id, status, created_at desc);
create index if not exists campus_connections_requester_status_idx
  on public.campus_connections(requester_id, status, created_at desc);
alter table public.campus_connections enable row level security;
revoke all on public.campus_connections from public, anon;
grant select, insert, update, delete on public.campus_connections to authenticated;

drop policy if exists campus_connections_read_participants on public.campus_connections;
create policy campus_connections_read_participants on public.campus_connections
for select to authenticated using (
  institution_id = (select private.current_institution_id())
  and (select auth.uid()) in (requester_id, recipient_id)
);
drop policy if exists campus_connections_send_request on public.campus_connections;
create policy campus_connections_send_request on public.campus_connections
for insert to authenticated with check (
  requester_id = (select auth.uid())
  and status = 'pending'
  and institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user(recipient_id, institution_id))
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = requester_id and b.blocked_id = recipient_id)
       or (b.blocker_id = recipient_id and b.blocked_id = requester_id)
  )
  and not exists (
    select 1 from public.campus_connections existing
    where existing.institution_id = institution_id
      and ((existing.requester_id = requester_id and existing.recipient_id = recipient_id)
        or (existing.requester_id = recipient_id and existing.recipient_id = requester_id))
      and existing.status in ('pending','accepted')
  )
);
drop policy if exists campus_connections_recipient_respond on public.campus_connections;
create policy campus_connections_recipient_respond on public.campus_connections
for update to authenticated using (
  recipient_id = (select auth.uid()) and status = 'pending'
) with check (
  recipient_id = (select auth.uid()) and status in ('accepted','declined')
);
drop policy if exists campus_connections_cancel_request on public.campus_connections;
create policy campus_connections_cancel_request on public.campus_connections
for delete to authenticated using (
  (requester_id = (select auth.uid()) and status = 'pending')
  or (status = 'accepted' and (select auth.uid()) in (requester_id, recipient_id))
);

-- Limit recipient updates to the response fields; identity and tenant columns remain immutable.
revoke update on public.campus_connections from authenticated;
grant update (status, updated_at) on public.campus_connections to authenticated;
