-- CampusConnect private notification inbox and database-generated activity alerts.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  notification_type text not null check (notification_type in ('comment', 'direct_message', 'group_invite')),
  entity_type text not null check (entity_type in ('post', 'message', 'group')),
  entity_id uuid not null,
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_institution_recipient_idx
  on public.notifications(institution_id, recipient_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
for select to authenticated
using (
  recipient_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
);

drop policy if exists notifications_mark_own_read on public.notifications;
create policy notifications_mark_own_read on public.notifications
for update to authenticated
using (
  recipient_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
)
with check (
  recipient_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
);

create or replace function private.notify_comment_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare recipient_id uuid;
begin
  select p.author_id into recipient_id
  from public.posts p
  where p.id = new.post_id and p.institution_id = new.institution_id
    and p.is_removed = false and p.author_id <> new.author_id;
  if recipient_id is not null then
    insert into public.notifications (institution_id, recipient_id, actor_id, notification_type, entity_type, entity_id, message)
    values (new.institution_id, recipient_id, new.author_id, 'comment', 'post', new.post_id, 'commented on your post');
  end if;
  return new;
end;
$$;

create or replace function private.notify_direct_message_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare recipient_id uuid;
begin
  for recipient_id in
    select cm.user_id
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id and c.institution_id = cm.institution_id
    where cm.conversation_id = new.conversation_id
      and cm.institution_id = new.institution_id
      and cm.user_id <> new.sender_id and c.is_group = false
  loop
    insert into public.notifications (institution_id, recipient_id, actor_id, notification_type, entity_type, entity_id, message)
    values (new.institution_id, recipient_id, new.sender_id, 'direct_message', 'message', new.id, 'sent you a message');
  end loop;
  return new;
end;
$$;

create or replace function private.notify_group_invite_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (institution_id, recipient_id, actor_id, notification_type, entity_type, entity_id, message)
    values (new.institution_id, new.invited_user_id, new.invited_by, 'group_invite', 'group', new.group_id, 'invited you to join a community');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_comment_created() from public, anon, authenticated;
revoke all on function private.notify_direct_message_created() from public, anon, authenticated;
revoke all on function private.notify_group_invite_created() from public, anon, authenticated;

drop trigger if exists campusconnect_notify_comment on public.comments;
create trigger campusconnect_notify_comment after insert on public.comments
for each row execute function private.notify_comment_created();
drop trigger if exists campusconnect_notify_direct_message on public.messages;
create trigger campusconnect_notify_direct_message after insert on public.messages
for each row execute function private.notify_direct_message_created();
drop trigger if exists campusconnect_notify_group_invite on public.group_invites;
create trigger campusconnect_notify_group_invite after insert on public.group_invites
for each row execute function private.notify_group_invite_created();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- Extend the private inbox to cover accepted student connections.
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in ('comment','direct_message','group_invite','connection_accepted'));
alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
  check (entity_type in ('post','message','group','connections'));

create or replace function private.notify_connection_accepted()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.status is distinct from 'accepted' and new.status = 'accepted' then
    insert into public.notifications (institution_id, recipient_id, actor_id, notification_type, entity_type, entity_id, message)
    values (new.institution_id, new.requester_id, new.recipient_id, 'connection_accepted', 'connections', new.id, 'accepted your connection request');
  end if;
  return new;
end;
$$;
revoke all on function private.notify_connection_accepted() from public, anon, authenticated;
drop trigger if exists campusconnect_notify_connection_accepted on public.campus_connections;
create trigger campusconnect_notify_connection_accepted after update of status on public.campus_connections
for each row execute function private.notify_connection_accepted();
