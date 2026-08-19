-- Migration v5 for user_inventory — run once in the Supabase SQL Editor,
-- additive/safe: dropping an index doesn't touch any existing data.
--
-- Drops idx_user_inventory_user_component, the original unique index from
-- schema_inventory.sql that enforced "at most one row per catalog
-- component per user." That made sense before multi-lot inventory was a
-- concept, but is exactly what was blocking the whole point of
-- schema_inventory_v4.sql's caliber-matched deduction work: a user
-- legitimately needing two lots of the same catalog component (two
-- purchases of the same primers, or the same brass in two different
-- calibers) hit "duplicate key value violates unique constraint
-- idx_user_inventory_user_component" trying to add the second one. The
-- app-level code (InventoryPage.jsx's add-row dropdown, the
-- fetchUserInventoryMap multi-lot lookup) was already updated for this in
-- v4's companion code changes — this is the missing piece underneath it.

DROP INDEX IF EXISTS public.idx_user_inventory_user_component;
