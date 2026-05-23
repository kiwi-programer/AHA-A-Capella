# AHA-A-Capella

## Folder Layout

- `index.html` is the public front-end.
- `admin/index.html` is the Supabase-locked editor.
- `backend/api/*` is the Vercel backend that stores content in Supabase.
- `backend/api/submissions.js` stores and returns public form submissions.
- `shared/site-content.js` is the shared content helper used by both pages.

## Deployment

For the backend project on Vercel, set these environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGIN`

Create a Supabase table named `site_content` with at least these columns:

- `id` as the primary key
- `content` as `jsonb`
- `updated_at` as `timestamptz`
- `updated_by` as `text`

Create a Supabase table named `form_submissions` with at least these columns:

- `id` as an identity primary key
- `submission_type` as `text`
- `name` as `text`
- `title` as `text`
- `message` as `text`
- `metadata` as `jsonb`
- `status` as `text`
- `created_at` as `timestamptz`
- `reviewed_at` as `timestamptz`
- `reviewed_by` as `text`

The public front-end and the admin page both need the backend API URL replaced before deployment. The admin page also needs the Supabase project URL and anon key replaced before deployment.