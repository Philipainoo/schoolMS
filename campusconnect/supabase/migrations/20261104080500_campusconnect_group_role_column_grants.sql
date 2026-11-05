revoke update on public.group_invites from authenticated;
grant update (status, responded_at) on public.group_invites to authenticated;
revoke update on public.group_members from authenticated;
grant update (role) on public.group_members to authenticated;
