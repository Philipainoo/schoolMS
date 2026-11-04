-- Restrict private Realtime Presence/Broadcast topics to current conversation members.
-- Topic format: campusconnect:conversation:<conversation UUID>
drop policy if exists "Conversation members can receive private chat presence" on realtime.messages;
drop policy if exists "Conversation members can publish private chat presence" on realtime.messages;

create policy "Conversation members can receive private chat presence"
on realtime.messages
for select
to authenticated
using (
  private.is_conversation_member(
    split_part(realtime.topic(), ':', 3)::uuid
  )
);

create policy "Conversation members can publish private chat presence"
on realtime.messages
for insert
to authenticated
with check (
  private.is_conversation_member(
    split_part(realtime.topic(), ':', 3)::uuid
  )
);
