-- Consolidated RLS policies for:
-- 1) public.site_content
-- 2) public.form_submissions
-- 3) public.admin_users
--
-- Notes:
-- - Service role (backend) bypasses RLS.
-- - Client-side direct access is restricted to active admin users.
-- - Public visitors should use backend endpoints, not direct table access.

begin;

-- Ensure RLS is enabled.
alter table if exists public.site_content enable row level security;
alter table if exists public.form_submissions enable row level security;
alter table if exists public.admin_users enable row level security;

-- Helper function used by policies.
-- SECURITY DEFINER allows role checks without policy recursion.
create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.role
  from public.admin_users au
  where lower(au.email) = lower(coalesce(auth.jwt()->>'email', ''))
    and au.is_active = true
  limit 1;
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where lower(au.email) = lower(coalesce(auth.jwt()->>'email', ''))
      and au.is_active = true
  );
$$;

create or replace function public.is_manager_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_admin_role() in ('owner', 'admin'), false);
$$;

-- =============================
-- site_content policies
-- =============================
drop policy if exists "site_content_active_admin_read" on public.site_content;
drop policy if exists "site_content_manager_write" on public.site_content;

create policy "site_content_active_admin_read"
on public.site_content
for select
to authenticated
using (public.is_active_admin());

create policy "site_content_manager_write"
on public.site_content
for all
to authenticated
using (public.is_manager_admin())
with check (public.is_manager_admin());

-- =============================
-- form_submissions policies
-- =============================
drop policy if exists "form_submissions_active_admin_read" on public.form_submissions;
drop policy if exists "form_submissions_manager_update" on public.form_submissions;

create policy "form_submissions_active_admin_read"
on public.form_submissions
for select
to authenticated
using (public.is_active_admin());

create policy "form_submissions_manager_update"
on public.form_submissions
for update
to authenticated
using (public.is_manager_admin())
with check (public.is_manager_admin());

-- No direct client insert/delete policies on form_submissions.
-- Public submission inserts should happen through backend service role.

-- =============================
-- admin_users policies
-- =============================
drop policy if exists "admin_users_self_or_manager_read" on public.admin_users;
drop policy if exists "admin_users_manager_insert" on public.admin_users;
drop policy if exists "admin_users_manager_update" on public.admin_users;
drop policy if exists "admin_users_manager_delete" on public.admin_users;

create policy "admin_users_self_or_manager_read"
on public.admin_users
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  or public.is_manager_admin()
);

create policy "admin_users_manager_insert"
on public.admin_users
for insert
to authenticated
with check (public.is_manager_admin());

create policy "admin_users_manager_update"
on public.admin_users
for update
to authenticated
using (public.is_manager_admin())
with check (public.is_manager_admin());

create policy "admin_users_manager_delete"
on public.admin_users
for delete
to authenticated
using (public.is_manager_admin());

commit;
