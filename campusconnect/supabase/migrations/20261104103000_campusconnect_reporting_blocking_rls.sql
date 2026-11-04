-- Tighten report and block writes to verified UEW accounts and real same-campus targets.
drop policy if exists blocks_create_own on public.user_blocks;
create policy blocks_create_own
on public.user_blocks for insert to authenticated
with check (
  blocker_id = (select auth.uid())
  and blocked_id <> (select auth.uid())
  and exists (
    select 1
    from public.users target
    where target.id = user_blocks.blocked_id
      and target.institution_id = (select private.current_institution_id())
      and target.verification_status = 'verified'::public.verification_status
  )
  and (select private.is_verified_institution_user((select auth.uid()), (select private.current_institution_id())))
);

drop policy if exists reports_create_own on public.reports;
create policy reports_create_own
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and target_type = 'post'
  and char_length(btrim(reason)) between 3 and 120
  and (select private.is_verified_institution_user((select auth.uid()), institution_id))
  and exists (
    select 1
    from public.posts target
    where target.id = reports.target_id
      and target.institution_id = reports.institution_id
      and target.is_removed = false
  )
);

create index if not exists user_blocks_blocker_idx
  on public.user_blocks(blocker_id, blocked_id);
create index if not exists reports_target_created_idx
  on public.reports(institution_id, target_type, target_id, created_at desc);
