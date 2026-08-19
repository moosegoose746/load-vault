-- Migration v4 for user_inventory — run once in the Supabase SQL Editor.
--
-- Replaces the free-text `caliber` column added in v3 with `caliber_id`, a
-- foreign key into the same shared `calibers` table the New Recipe form's
-- caliber dropdown already uses. This is a genuine DROP (not just an ADD),
-- which normally isn't allowed once real data exists — but v3 shipped very
-- recently and nothing has actually relied on the free-text column yet, so
-- it's safe here. Confirmed with the app owner before running.
--
-- Why this matters: automated Loading Session deduction has to match a
-- recipe's caliber against an inventory row's caliber to know which lot of
-- bullets/brass to draw down. Comparing two free-typed strings ("6.5
-- Creedmoor" vs "6.5CM" vs a stray typo) would silently fail to match and
-- just skip the deduction with no explanation. Comparing two foreign keys
-- into the same `calibers` table can't have that problem — either they're
-- the same id or they're not.

ALTER TABLE public.user_inventory
  ADD COLUMN IF NOT EXISTS caliber_id UUID REFERENCES public.calibers(id) ON DELETE SET NULL;

ALTER TABLE public.user_inventory DROP COLUMN IF EXISTS caliber;

COMMENT ON COLUMN public.user_inventory.caliber_id IS
  'Bullet/brass only: which caliber (from the shared calibers table) this lot is for. Used to match a Loading Session''s recipe caliber to the correct inventory lot(s) when auto-deducting stock.';
