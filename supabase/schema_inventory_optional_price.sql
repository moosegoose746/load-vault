-- Make Purchase Price and Qty per Package optional on user_inventory.
--
-- Qty On Hand becomes the sole required field for a row (already enforced
-- client-side in InventoryPage.jsx's parseDraft). A user can log what they
-- have without knowing what they paid for it yet.
--
-- The existing CHECK constraints (unit_cost >= 0, package_qty > 0) are safe
-- to leave in place: Postgres evaluates a CHECK as not-violated when the
-- column value is NULL, so they only ever validate a value that's actually
-- present.
ALTER TABLE public.user_inventory ALTER COLUMN unit_cost DROP NOT NULL;
ALTER TABLE public.user_inventory ALTER COLUMN package_qty DROP NOT NULL;
