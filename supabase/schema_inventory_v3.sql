-- Migration v3 for user_inventory — run once in the Supabase SQL Editor,
-- additive only (no DROP), safe alongside existing data.
--
-- Adds Caliber (for bullet/brass rows) and Primer Size (for primer rows).
-- These live on user_inventory rather than the shared `components` table
-- on purpose: regular accounts have no INSERT/UPDATE policy on
-- `components` (admin/service_role only, see schema.sql), and the
-- existing seeded catalog entries (brand + generic model, e.g. "Hornady
-- Match" brass) don't actually encode a specific caliber today — fixing
-- that catalog-side would mean an admin backfill pass with no immediate
-- payoff for the user. Putting these fields on the user's own inventory
-- row instead means they're usable right away for every row, whether
-- it's a shared catalog component or a private custom one.

ALTER TABLE public.user_inventory
  ADD COLUMN IF NOT EXISTS caliber TEXT,
  ADD COLUMN IF NOT EXISTS primer_size TEXT;

COMMENT ON COLUMN public.user_inventory.caliber IS
  'Bullet/brass only: e.g. "6.5 Creedmoor", ".308 Win". Free text, not linked to the calibers table, since bullet diameter (e.g. .264) and cartridge name (e.g. 6.5 Creedmoor) are both meaningful ways a reloader might want to label a row.';
COMMENT ON COLUMN public.user_inventory.primer_size IS
  'Primer only: e.g. "Small Rifle", "Large Pistol Magnum".';
