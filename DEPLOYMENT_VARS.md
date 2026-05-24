# Deployment Vars

This project has three deployment surfaces:

## Public Frontend

File: `index.html`

Required values:

- `BACKEND_API_BASE` in the inline script

Notes:

- No Supabase client key is used directly on the public site.

## Admin Page

File: `admin/index.html`

Required values:

- `BACKEND_API_BASE` in the inline script
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Notes:

- The admin page uses the anon key with the browser Supabase client.
- Do not put `SUPABASE_SERVICE_ROLE_KEY` in the browser.

## Backend Vercel Deployment

Files: `backend/api/content.js`, `backend/api/save.js`, `backend/api/submissions.js`, `backend/api/users.js`, `backend/api/health.js`

Required values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional values:

- `CORS_ORIGIN`
- `ADMIN_SIGNIN_URL` (or `SUPABASE_INVITE_REDIRECT_URL`)

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` stays server-side only.
- `CORS_ORIGIN` falls back to `*` if it is not set.
- Set `ADMIN_SIGNIN_URL` to your deployed admin URL so invite/verification links do not redirect to localhost.

## Submissions Table

File: `sql/supabase-form-submissions.sql`

Required values:

- `form_submissions.id` as an identity primary key
- `submission_type`
- `name`
- `title`
- `message`
- `metadata`
- `status`
- `created_at`
- `reviewed_at`
- `reviewed_by`

Notes:

- The backend writes public form submissions into `form_submissions`.
- The admin panel reads submissions through the backend using a logged-in Supabase session.

## Admin Users Table

File: `sql/supabase-admin-users.sql`

Required values:

- `admin_users.id` as an identity primary key
- `email` with a unique constraint
- `display_name`
- `role`
- `is_active`
- `created_at`
- `updated_at`

Notes:

- The users API bootstraps the first authenticated user as `owner` when the table is empty.
- User management actions are available to `owner` and `admin` roles.