-- Allow message authors to edit or soft-delete only their own messages.
-- A deleted message remains in the thread as a tombstone; sender and conversation identity are immutable.

alter table public.messages add column if not exists edited_at timestamptz, add column if not exists deleted_at timestamptz;

create or replace function private.enforce_message_author_edits() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null then raise exception 'Deleted messages cannot be changed.'; end if;
  if new.id is distinct from old.id or new.institution_id is distinct from old.institution_id or new.conversation_id is distinct from old.conversation_id or new.sender_id is distinct from old.sender_id or new.created_at is distinct from old.created_at then
    raise exception 'Message ownership and conversation cannot be changed.';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := clock_timestamp(); new.body := 'This message was deleted'; new.attachment_paths := '{}'::text[]; new.edited_at := old.edited_at;
  elsif new.body is distinct from old.body then
    if char_length(btrim(new.body)) < 1 or char_length(new.body) > 10000 then raise exception 'Messages must contain between 1 and 10,000 characters.'; end if;
    new.edited_at := clock_timestamp();
  else new.edited_at := old.edited_at;
  end if;
  return new;
end; $$;

drop trigger if exists messages_author_edit_guard on public.messages;
create trigger messages_author_edit_guard before update on public.messages for each row execute function private.enforce_message_author_edits();

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated using (sender_id = (select auth.uid()) and institution_id = (select private.current_institution_id()) and deleted_at is null and (select private.is_conversation_member(conversation_id))) with check (sender_id = (select auth.uid()) and institution_id = (select private.current_institution_id()) and (select private.is_conversation_member(conversation_id)));

revoke update on public.messages from authenticated;
grant update (body, deleted_at) on public.messages to authenticated;
