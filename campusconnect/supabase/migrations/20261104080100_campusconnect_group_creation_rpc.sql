create or replace function public.create_campus_group(
  p_name text,
  p_description text default null,
  p_category text default null,
  p_visibility public.group_visibility default 'public'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_institution_id uuid := private.current_institution_id();
  v_group_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if v_user_id is null or v_institution_id is null then
    raise exception 'A verified campus account is required';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'Group name must be between 3 and 80 characters';
  end if;
  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'Group description must be 500 characters or fewer';
  end if;
  if v_category is not null and char_length(v_category) > 40 then
    raise exception 'Group category must be 40 characters or fewer';
  end if;
  if p_visibility is null then
    raise exception 'Group visibility is required';
  end if;

  insert into public.groups (institution_id, owner_id, name, description, category, visibility)
  values (v_institution_id, v_user_id, v_name, v_description, v_category, p_visibility)
  returning id into v_group_id;

  insert into public.group_members (institution_id, group_id, user_id, role)
  values (v_institution_id, v_group_id, v_user_id, 'admin'::public.group_member_role);

  return v_group_id;
end;
$function$;

revoke all on function public.create_campus_group(text, text, text, public.group_visibility) from public;
revoke all on function public.create_campus_group(text, text, text, public.group_visibility) from anon;
grant execute on function public.create_campus_group(text, text, text, public.group_visibility) to authenticated;
