-- Migration v2 for user_inventory — run once in the Supabase SQL Editor,
-- AFTER schema_inventory.sql has already been applied and you have real
-- inventory rows saved. This is purely additive (ALTER, not DROP/CREATE)
-- so it does NOT touch any existing data.
--
-- Adds brass reload-cycle tracking: previously "Reload Cycles" on a brass
-- row was just a static estimate used to amortize cost, with no way to
-- know how many times a given batch had actually been fired so far. Now
-- that Save to Vault can auto-deduct on save, brass needs different
-- handling than powder/bullet/primer — firing a round doesn't reduce how
-- many cases you physically own (you pick them back up to reload), it
-- just uses up one of that batch's estimated reload cycles. So instead of
-- decrementing Qty On Hand, a brass row's `cycles_used` counter now
-- auto-increments by Total Rounds Fired each time a session is saved with
-- deduction enabled, and the Inventory page flags a row once cycles_used
-- reaches reload_cycles (time to inspect/retire that batch). Qty On Hand
-- for brass keeps its original meaning — how many cases you have — and is
-- no longer touched by auto-deduct at all.

ALTER TABLE public.user_inventory
  ADD COLUMN IF NOT EXISTS cycles_used INT NOT NULL DEFAULT 0 CHECK (cycles_used >= 0);

COMMENT ON COLUMN public.user_inventory.cycles_used IS
  'Brass only: how many times this batch has actually been fired so far, auto-incremented by Total Rounds Fired on each Save to Vault with deduction enabled. Compared against reload_cycles (the estimated max) to flag brass nearing retirement. Not used for powder/bullet/primer rows.';
