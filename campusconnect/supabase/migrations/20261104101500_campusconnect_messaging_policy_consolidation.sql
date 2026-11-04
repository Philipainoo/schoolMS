-- Consolidate direct and group insert policies to keep one RLS policy per operation.
drop policy if exists conversations_create_direct on public.conversations;
drop policy if exists conversations_create_group on public.conversations;
drop policy if exists conversations_create_member on public.conversations;
create policy conversations_create_member
on public.conversations for insert to authenticated
with check (
  created_by = (select auth.uid())
  and institution_id = (select private.current_institution_id())
  and (select private.is_verified_institution_user((select auth.uid()), institution_id))
);

drop policy if exists conversation_members_create_direct on public.conversation_members;
drop policy if exists conversation_members_create_group on public.conversation_members;
drop policy if exists conversation_members_create_member on public.conversation_members;
create policy conversation_members_create_member
on public.conversation_members for insert to authenticated
with check (
  institution_id = (select private.current_institution_id())
  and (
    (select private.can_add_direct_conversation_member(conversation_id, user_id, institution_id))
    or (
      (select private.is_verified_institution_user((select auth.uid()), institution_id))
      and exists (
        select 1
        from public.conversations c
        where c.id = conversation_members.conversation_id
          and c.institution_id = conversation_members.institution_id
          and c.created_by = (select auth.uid())
          and c.is_group = true
      )
      and (
        user_id = (select auth.uid())
        or (
          (select private.is_verified_institution_user(user_id, institution_id))
          and not exists (
            select 1
            from public.user_blocks b
            where (b.blocker_id = (select auth.uid()) and b.blocked_id = user_id)
               or (b.blocked_id = (select auth.uid()) and b.blocker_id = user_id)
          )
        )
      )
    )
  )
);
