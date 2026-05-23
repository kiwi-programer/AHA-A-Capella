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
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Notes:

- The admin page uses the public publishable key with the browser Supabase client.
- Do not put `SUPABASE_SERVICE_ROLE_KEY` in the browser.

## Backend Vercel Deployment

Files: `backend/api/content.js`, `backend/api/save.js`, `backend/api/health.js`

Required values:

- `SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional values:

- `CORS_ORIGIN`

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` stays server-side only.
- `CORS_ORIGIN` falls back to `*` if it is not set.