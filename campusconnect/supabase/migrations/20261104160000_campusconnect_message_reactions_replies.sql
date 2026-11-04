-- Message reactions and threaded replies for CampusConnect.
alter table public.messages
  add column if not exists parent_message_id uuid;

create unique index if not exists messages_id_conversation_id_uidx
  on public.messages (id, conversation_id);

alter table public.messages
  drop constraint if exists messages_parent_same_conversation_fkey;

alter table public.messages
  add constraint messages_parent_same_conversation_fkey
  foreign key (parent_message_id, conversation_id)
  references public.messages (id, conversation_id)
  on delete cascade;

create index if not exists messages_parent_message_id_created_at_idx
  on public.messages (parent_message_id, created_at)
  where parent_message_id is not null;

drop policy if exists messages_reply_parent_valid on public.messages;
create policy messages_reply_parent_valid
on public.messages
as restrictive
for insert
to authenticated
with check (
  parent_message_id is null
  or exists (
    select 1
    from public.messages parent
    where parent.id = messages.parent_message_id
      and parent.conversation_id = messages.conversation_id
      and parent.institution_id = messages.institution_id
      and parent.deleted_at is null
      and parent.parent_message_id is null
  )
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji = any (array['👍','❤️','😂','🎉','🙏','🔥']::text[])),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_user_message_idx
  on public.message_reactions (user_id, message_id);

alter table public.message_reactions enable row level security;

revoke all on public.message_reactions from anon, authenticated;
grant select, insert, delete on public.message_reactions to authenticated;

drop policy if exists message_reactions_read_conversation_members on public.message_reactions;
create policy message_reactions_read_conversation_members
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
      and m.institution_id = (select private.current_institution_id())
      and (select private.is_conversation_member(m.conversation_id))
  )
);

drop policy if exists message_reactions_insert_self_members on public.message_reactions;
create policy message_reactions_insert_self_members
on public.message_reactions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
      and m.institution_id = (select private.current_institution_id())
      and m.deleted_at is null
      and (select private.is_conversation_member(m.conversation_id))
  )
);

drop policy if exists message_reactions_delete_self_members on public.message_reactions;
create policy message_reactions_delete_self_members
on public.message_reactions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
      and m.institution_id = (select private.current_institution_id())
      and (select private.is_conversation_member(m.conversation_id))
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'message_reactions'
     ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
