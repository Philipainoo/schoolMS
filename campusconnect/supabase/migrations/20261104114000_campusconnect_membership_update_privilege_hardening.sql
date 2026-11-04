-- Preserve per-user read receipts without allowing direct role or membership edits.
revoke update on table public.conversation_members from public, anon, authenticated;
grant update (last_read_at) on table public.conversation_members to authenticated;
