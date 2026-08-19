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
-- One row per (user, component) — re-saving from the Inventory page
-- upserts (updates the existing row) rather than creating duplicates.

CREATE TABLE public.user_inventory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  component_id UUID REFERENCES public.components(id) ON DELETE CASCADE NOT NULL,
  unit_cost NUMERIC(8,2) NOT NULL CHECK (unit_cost >= 0), -- what YOU paid for one package
  package_qty INT NOT NULL CHECK (package_qty > 0), -- units per package (grains for powder, count for bullet/primer/brass)
  quantity_on_hand NUMERIC(10,2), -- optional running stock count; leave null if you don't want to track stock, just price
  reload_cycles INT CHECK (reload_cycles IS NULL OR reload_cycles > 0), -- brass only: how many times you expect to reload each case before retiring it; null/unset = treated as 1 (single-use)
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (user_id, component_id)
);

CREATE INDEX idx_user_inventory_user_id ON public.user_inventory(user_id);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own inventory" ON public.user_inventory
  FOR ALL USING (auth.uid() = user_id);
