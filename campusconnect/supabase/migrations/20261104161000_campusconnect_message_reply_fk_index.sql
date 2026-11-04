create index if not exists messages_parent_message_conversation_idx
  on public.messages (parent_message_id, conversation_id)
  where parent_message_id is not null;