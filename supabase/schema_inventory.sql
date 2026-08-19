-- Personal inventory & pricing — run once in the Supabase SQL Editor.
--
-- Why this exists: `components.unit_cost`/`package_qty` (from schema.sql)
-- is a SHARED catalog table used by every user's recipe dropdowns — it was
-- never meant to represent any individual person's actual purchase price,
-- since reloading component prices vary wildly by retailer, sales, bulk
-- buys, and timing. This table lets each user record their OWN price (and
-- optionally how much they have on hand) for whichever components they
-- actually use, without touching the shared catalog. Matches the master
-- doc's Section 6 "Unit Economics" model: crowdsourced/self-reported
-- pricing rather than a single global price, and brass cost amortized
-- across an estimated number of reload cycles rather than treated as
-- single-use.
--
-- A row is EITHER linked to a shared catalog component (component_id set,
-- custom_name/custom_type null) OR a fully custom, private-to-you entry
-- (component_id null, custom_name/custom_type set) — e.g. a powder that
-- isn't in the shared catalog yet. Regular users have no INSERT/UPDATE
-- privileges on the shared `components` table (see schema.sql), so "type
-- in your own" has to live here as a freeform row rather than adding to
-- the catalog. Custom rows are private to your account and are NOT picked
-- up by the recipe builder's component dropdowns (those still read only
-- from the shared catalog) — they exist for your own inventory/cost
-- tracking. If you want a custom component reflected in a recipe's
-- Cost/Round, ask an admin to add it to the shared catalog instead.
--
-- Safe to re-run: drops and recreates the table if it already exists from
-- an earlier version of this script (e.g. the first cut of the Inventory
-- feature, before custom/freeform components were supported).

DROP TABLE IF EXISTS public.user_inventory CASCADE;

CREATE TABLE public.user_inventory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,

  -- Catalog-linked row: set this, leave custom_name/custom_type null.
  component_id UUID REFERENCES public.components(id) ON DELETE CASCADE,

  -- Custom/freeform row (not in the shared catalog): set these, leave
  -- component_id null.
  custom_name TEXT,
  custom_type TEXT CHECK (custom_type IS NULL OR custom_type IN ('powder', 'bullet', 'primer', 'brass')),

  unit_cost NUMERIC(8,2) NOT NULL CHECK (unit_cost >= 0), -- what YOU paid for one package
  package_qty INT NOT NULL CHECK (package_qty > 0), -- units per package (grains for powder, count for bullet/primer/brass)
  quantity_on_hand NUMERIC(10,2), -- optional running stock count; leave null if you don't want to track stock, just price
  reload_cycles INT CHECK (reload_cycles IS NULL OR reload_cycles > 0), -- brass only: how many times you expect to reload each case before retiring it; null/unset = treated as 1 (single-use)
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

  -- Exactly one of (component_id) or (custom_name + custom_type) must be set.
  CHECK (
    (component_id IS NOT NULL AND custom_name IS NULL AND custom_type IS NULL)
    OR
    (component_id IS NULL AND custom_name IS NOT NULL AND custom_type IS NOT NULL)
  )
);

CREATE INDEX idx_user_inventory_user_id ON public.user_inventory(user_id);

-- Only enforce "one row per catalog component" for catalog-linked rows —
-- custom rows have no natural key to dedupe on, and a user might
-- legitimately want two custom entries with different notes/pricing.
CREATE UNIQUE INDEX idx_user_inventory_user_component
  ON public.user_inventory(user_id, component_id)
  WHERE component_id IS NOT NULL;

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own inventory" ON public.user_inventory
  FOR ALL USING (auth.uid() = user_id);
