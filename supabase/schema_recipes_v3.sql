-- Precision Load Vault — Recipes v3
--
-- Adds the "Money Saved vs. Factory Ammo" stat, discussed and agreed with
-- the user ahead of time: an optional per-recipe "Comparable Factory
-- Price (per round)" field, entered by the user (never scraped/assumed —
-- see the pricing-is-always-personal principle in the progress log).
-- Money Saved = (factory price − cost/round) × total rounds ever loaded
-- for that recipe (lifetime, from load_batches — not just what's
-- currently on hand, so it doesn't go down as ammo gets shot).
--
-- Additive only (ALTER ... ADD COLUMN IF NOT EXISTS) per this project's
-- migration rule — real recipe data already exists.

ALTER TABLE load_recipes
  ADD COLUMN IF NOT EXISTS factory_price_per_round NUMERIC;
