-- Baseline component seed data — run once in the Supabase SQL Editor.
-- Mirrors the caliber seed pattern from schema.sql, but for the
-- components table (powders, bullets, primers, brass), so recipe-creation
-- dropdowns have real options to pick from. This is deliberately a small
-- starter set matching the master doc's example recipe (Section 3) plus a
-- few common alternatives — expand it any time by re-running with more
-- rows, this is idempotent via ON CONFLICT.
--
-- Note: components has no unique constraint on (brand, model) in the
-- schema, so this script uses a WHERE NOT EXISTS guard instead of
-- ON CONFLICT to stay safely re-runnable without adding a new constraint.

INSERT INTO public.components (type, brand, model, unit_cost, package_qty)
SELECT * FROM (VALUES
  ('powder', 'Hodgdon', 'H4350', 39.99, 3232),   -- price per 1lb-equivalent qty in grains
  ('powder', 'Hodgdon', 'Varget', 34.99, 3232),
  ('powder', 'Hodgdon', 'H4831SC', 39.99, 3232),
  ('bullet', 'Hornady', '140gr ELD-M', 44.99, 100),
  ('bullet', 'Sierra', '175gr SMK', 42.99, 100),
  ('bullet', 'Hornady', '168gr ELD-M', 39.99, 100),
  ('primer', 'Federal', 'GM205MAR', 8.99, 100),
  ('primer', 'CCI', 'BR2', 8.49, 100),
  ('brass', 'Hornady', 'Match', 89.99, 100),
  ('brass', 'Lapua', 'Match', 129.99, 100)
) AS seed(type, brand, model, unit_cost, package_qty)
WHERE NOT EXISTS (
  SELECT 1 FROM public.components c
  WHERE c.type = seed.type AND c.brand = seed.brand AND c.model = seed.model
);
