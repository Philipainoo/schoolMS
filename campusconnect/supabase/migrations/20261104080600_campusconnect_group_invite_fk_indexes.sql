create index if not exists group_invites_group_tenant_idx on public.group_invites(group_id, institution_id);
create index if not exists group_invites_recipient_tenant_idx on public.group_invites(invited_user_id, institution_id);
create index if not exists group_invites_inviter_tenant_idx on public.group_invites(invited_by, institution_id);
create index if not exists group_invites_institution_idx on public.group_invites(institution_id);