-- Harden direct-message bootstrap: SECURITY INVOKER plus narrow RLS insert policies.
grant insert on public.conversations, public.conversation_members to authenticated;

drop policy if exists conversations_create_direct on public.conversations;
create policy conversations_create_direct
on public.conversations for insert to authenticated
with check (
  created_by = (select auth.uid())
  and is_group = false
  and institution_id = (select private.current_institution_id())
  and exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.institution_id = conversations.institution_id
      and u.verification_status = 'verified'::public.verification_status
  )
);

drop policy if exists conversation_members_create_direct on public.conversation_members;
create policy conversation_members_create_direct
on public.conversation_members for insert to authenticated
with check (
  institution_id = (select private.current_institution_id())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_members.conversation_id
      and c.institution_id = conversation_members.institution_id
      and c.created_by = (select auth.uid())
      and c.is_group = false
  )
  and (
    user_id = (select auth.uid())
    or (
      (select private.is_verified_institution_user(user_id, institution_id))
      and exists (
        select 1 from public.conversation_members mine
        where mine.conversation_id = conversation_members.conversation_id
          and mine.institution_id = conversation_members.institution_id
          and mine.user_id = (select auth.uid())
      )
      and not exists (
        select 1 from public.conversation_members other_member
        where other_member.conversation_id = conversation_members.conversation_id
          and other_member.institution_id = conversation_members.institution_id
          and other_member.user_id <> (select auth.uid())
      )
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = user_id)
           or (b.blocker_id = user_id and b.blocked_id = (select auth.uid()))
      )
    )
  )
);

alter function public.open_direct_conversation(uuid) security invoker;

-- The pre-existing messages_conversation_idx covers conversation/time lookups.
drop index if exists public.messages_conversation_created_idx;
