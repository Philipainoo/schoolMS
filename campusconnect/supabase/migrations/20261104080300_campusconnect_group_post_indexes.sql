create index if not exists group_posts_author_tenant_idx
on public.group_posts(author_id, institution_id);

create index if not exists group_posts_group_tenant_idx
on public.group_posts(group_id, institution_id);

create index if not exists group_posts_institution_idx
on public.group_posts(institution_id);
