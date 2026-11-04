-- Restrict private Realtime Presence/Broadcast topics to current conversation members.
-- Topic format: campusconnect:conversation:<conversation UUID>
drop policy if exists "Conversation members can receive private chat presence" on realtime.messages;
drop policy if exists "Conversation members can publish private chat presence" on realtime.messages;

create policy "Conversation members can receive private chat presence"
on realtime.messages
for select
to authenticated
using (
  case
    when split_part(realtime.topic(), ':', 1) = 'campusconnect'
     and split_part(realtime.topic(), ':', 2) = 'conversation'
     and split_part(realtime.topic(), ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_conversation_member(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);

create policy "Conversation members can publish private chat presence"
on realtime.messages
for insert
to authenticated
with check (
  case
    when split_part(realtime.topic(), ':', 1) = 'campusconnect'
     and split_part(realtime.topic(), ':', 2) = 'conversation'
     and split_part(realtime.topic(), ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_conversation_member(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);
