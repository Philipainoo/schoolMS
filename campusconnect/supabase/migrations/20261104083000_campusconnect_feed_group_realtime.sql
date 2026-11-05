-- Enable scoped Realtime notifications for the UEW campus feed and community discussions.
-- All three tables already enforce institution/member access through RLS.
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'supabase_realtime publication does not exist';
  end if;

  foreach table_name in array array['posts','comments','group_posts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
