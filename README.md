# AHA! A Cappella Harmonic Association

AHA! is a static public site with a protected admin portal and a Vercel serverless backend powered by Supabase.

## What This Project Does

- Public site at the repo root for visitors.
- Admin portal at `admin/` for editing page content and reviewing submissions.
- Backend API in `backend/api/` for content, submissions, and user management.
- Shared content helpers in `shared/site-content.js`.
- Supabase storage for site content, form submissions, and admin access records.

## Folder Layout

- `index.html` - public site.
- `admin/index.html` - admin portal.
- `backend/api/content.js` - reads site content from Supabase.
- `backend/api/save.js` - saves site content after auth checks.
- `backend/api/submissions.js` - stores public form submissions and returns them to admins.
- `backend/api/users.js` - manages admin portal users and invites.
- `backend/api/health.js` - simple health check.
- `shared/site-content.js` - shared content loader, saver, and sanitizer.
- `invite-email.html` - reusable invite email template.
- `sql/` - all Supabase SQL scripts for tables and RLS.

## Local Setup

You do not need a local build step for the public site. The project is designed for static deployment on Vercel.

### 1. Supabase

Create a Supabase project and run the SQL scripts in this repo in the Supabase SQL editor:

- `sql/supabase-site-content-id-text.sql`
- `sql/supabase-site-content-rls.sql`
- `sql/supabase-form-submissions.sql`
- `sql/supabase-admin-users.sql`
- or `sql/supabase-rls-all-three-tables.sql`

### 2. Vercel backend environment variables

Set these in the Vercel project that deploys `backend/`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGIN` - optional comma-separated allowlist of origins

Optional but recommended:

- `ADMIN_SIGNIN_URL` - use `https://aha-a-capella-admin.vercel.app/`

### 3. Frontend references

The frontend and admin portal are already wired to the deployed backend URL in the codebase. If you move deployments, update these URLs in the HTML files.

## Deployment Notes

### Public site

Deploy the repo root as the public site.

### Admin portal

Deploy `admin/` as its own Vercel project.

### Backend

Deploy `backend/` as a separate Vercel project.

## Favicon Placement

Use `.ico` files.

- Public site favicon: `favicon.ico` at the repo root.
- Admin favicon: `admin/favicon.ico` inside the admin deployment root.

The HTML files already point to `/favicon.ico`.

## Security Measures

The project includes several protections:

- Rate limiting on backend endpoints using in-memory limits per process.
- CORS origin checks on backend responses.
- Request size limits on JSON payloads.
- HTML sanitizing in the shared content helper before render and save.
- Backend-side sanitizing for content payloads and form metadata.
- Supabase service role use only on the backend.
- Auth-gated content edits and admin management.
- Security headers such as `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on API responses.

Important note: the current rate limiting is best-effort in serverless runtime memory. If you need stronger cross-instance limits in production, use an external rate limiter such as Upstash or a WAF rule.

## Database Schema Summary

### `site_content`

- `id` text primary key, seeded with `main`
- `content` jsonb
- `updated_at` timestamptz
- `updated_by` text

### `form_submissions`

- `id` identity primary key
- `submission_type` text
- `name` text
- `title` text
- `message` text
- `metadata` jsonb
- `status` text
- `created_at` timestamptz
- `reviewed_at` timestamptz
- `reviewed_by` text

### `admin_users`

- `id` identity primary key
- `email` text unique
- `display_name` text
- `role` text: `owner`, `admin`, or `editor`
- `is_active` boolean
- `created_at` timestamptz
- `updated_at` timestamptz

## Admin Invite Flow

The admin invite flow uses `invite-email.html` as the email template structure and redirects verification to:

- `https://aha-a-capella-admin.vercel.app/`

## Editing Flow

- The public site is the real editable surface.
- The admin portal loads the public site in an iframe editor mode.
- Edits are synchronized back to the admin portal through `postMessage`.
- Save operations write the sanitized content to Supabase.

## Run / Verify

Typical checks after changes:

- Open the public site and confirm content loads.
- Open the admin portal and confirm login works.
- Edit page content and save.
- Submit a form and confirm it appears in admin submissions.

## Notes

- The project does not rely on a separate frontend build system.
- Supabase direct table access is restricted by RLS; the backend should be the primary write path.
- If you change deployment URLs, update the backend `CORS_ORIGIN` and any hard-coded frontend/backend URLs together.
