-- Row Level Security for the single site content table.
-- The backend writes with the Supabase service role key, so it bypasses RLS.
-- This policy only allows signed-in users to read the public content row directly.

alter table public.site_content enable row level security;

drop policy if exists "Authenticated users can read public site content" on public.site_content;

create policy "Authenticated users can read public site content"
on public.site_content
for select
to authenticated
using (id = 'main');