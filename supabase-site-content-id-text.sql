-- Convert the single-row site_content table to use a text primary key.
-- The backend reads and writes the row with id = 'main'.

alter table public.site_content
  alter column id drop identity if exists;

alter table public.site_content
  alter column id type text using id::text;

insert into public.site_content (id, content, updated_at, updated_by)
values ('main', '{}'::jsonb, now(), null)
on conflict (id) do nothing;
