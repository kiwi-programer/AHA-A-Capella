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

Files: `backend/api/content.js`, `backend/api/save.js`, `backend/api/health.js`

Required values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional values:

- `CORS_ORIGIN`

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` stays server-side only.
- `CORS_ORIGIN` falls back to `*` if it is not set.

## Submissions Table

File: `supabase-form-submissions.sql`

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