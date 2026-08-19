-- Precision Load Vault — Recipes v2
--
-- Fixes the "two unrelated things both called Firearm" confusion flagged
-- in the UX audit: `load_recipes.rifle_model` was a free-text field on
-- the New Recipe form, completely disconnected from the real Firearm
-- Profiles system (firearms table, schema_firearms.sql) used everywhere
-- else a firearm is picked (the Range Day session picker). A user could
-- type "Bergara B-14" in one place and pick an unrelated saved profile
-- in the other, with no warning.
--
-- This links a recipe to an actual firearm profile instead. Additive
-- only (ALTER ... ADD COLUMN IF NOT EXISTS) per this project's migration
-- rule — real recipe data already exists, so `rifle_model` is NOT
-- dropped. It's simply no longer written to by the New Recipe form going
-- forward; existing rows keep their old free-text value and the app
-- falls back to displaying it for any recipe that was never given a
-- linked firearm profile (see mapRecipeRow's firearmLabel in
-- src/lib/recipes.js).

ALTER TABLE load_recipes
  ADD COLUMN IF NOT EXISTS firearm_id UUID REFERENCES firearms(id) ON DELETE SET NULL;
