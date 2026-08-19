# Precision Load Vault — Phase 1

Database, auth, and Supabase client wiring. See `LoadVaultMasterFile.md` in
the project for full product context.

## Setup

1. Create a Supabase project (free tier).
2. In the Supabase SQL Editor, run `supabase/schema.sql` once.
3. Copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — from Project Settings > API.
   - `SUPABASE_SERVICE_ROLE_KEY` — only needed locally to run the seed script; never ship this to the client or commit it.
4. `npm install`
5. `npm run dev`

## What's here

- `supabase/schema.sql` — full Postgres schema: profiles, calibers, components,
  load_recipes, range_sessions, shot_logs, RLS policies for public/unlisted/private
  visibility, the auto-delete-orphaned-target-image storage trigger, and baseline
  caliber seed data. Also adds an `on_auth_user_created` trigger (not in the
  original spec) so every new signup gets a `profiles` row automatically —
  `useAuth` depends on that row existing.
- `src/lib/supabaseClient.js` — single shared Supabase client, env-driven.
- `src/hooks/useAuth.js` — session + profile state, magic-link sign-in (no
  passwords to manage), sign-out, and `updateProfile`.
- `src/scripts/seedCalibers.js` — idempotent upsert script for adding calibers
  after initial migration, run with `npm run seed:calibers`.
- `src/App.jsx` — minimal placeholder shell to verify auth wiring end-to-end.
  Phase 2 replaces this with the real app shell (Sync HUD, Range Mode, dashboard).

## Next: Phase 2

App shell, Range Mode toggle, and Sync Status HUD per Section 3 of the master doc.
