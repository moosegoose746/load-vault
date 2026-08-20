-- Migration: distance per Workup rung — run once in the Supabase SQL
-- Editor. Additive only, nothing else touches or removes existing data.
--
-- Design note: distance is deliberately per-observation (per rung, per
-- Range Session) rather than a single fixed property of a recipe or a
-- Workup — the same load can legitimately be tested at different
-- distances on different range days, so there's no one "correct"
-- distance to store higher up the chain. range_sessions already has
-- distance_yards (see schema.sql); this brings workup_rungs to parity so
-- a rung's group_size_moa can finally be paired with the real distance
-- it was measured at, instead of an unstated assumption.
--
-- Nullable, no default — an unset rung should read as "distance unknown"
-- in the UI, not silently inherit a fake 100yd like the old
-- range_sessions default did. Existing rungs will have NULL here until
-- someone edits them or a new one is added/imported with a real value.

ALTER TABLE public.workup_rungs
  ADD COLUMN IF NOT EXISTS distance_yards INT CHECK (distance_yards IS NULL OR distance_yards > 0);
