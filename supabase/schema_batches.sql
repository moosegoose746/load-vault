-- Loading Sessions / batch tracking — run once in the Supabase SQL Editor.
-- Additive only (new table + a couple of ALTER ... ADD COLUMN IF NOT
-- EXISTS) — safe to run alongside existing data, nothing is dropped.
--
-- Why this exists: the app previously had exactly one "consumption" event
-- — firing a round at the range — which deducted components at the same
-- moment it logged velocity data. That's not how reloading actually
-- works: components get used up when you sit down and LOAD a batch (say
-- 50 rounds), which might happen weeks before you actually shoot any of
-- them, and you might only fire 5 of those 50 on a given range day. This
-- migration splits "loading" and "shooting" into two separate events:
--
--   Loading Session (load_batches, new table): you log "I loaded N rounds
--   of this recipe today" — THIS is what deducts powder/bullet/primer
--   from user_inventory and increments brass's cycles_used (see
--   computeBatchDeduction/applyBatchDeduction in src/lib/inventory.js,
--   renamed from computeSessionDeduction/applySessionDeduction now that
--   they're used here instead of on Save to Vault).
--
--   Range Session (range_sessions, existing table, gained rounds_fired):
--   logging a day at the range now just draws down how many loaded
--   rounds you have on hand for that recipe — it does NOT touch raw
--   component stock anymore, since those were already spent when the
--   batch was loaded.
--
-- "Rounds On Hand" for a recipe (how many loaded-and-ready rounds you
-- have) is deliberately NOT a stored/mutable counter — it's computed as
-- SUM(load_batches.rounds_loaded) - SUM(range_sessions.rounds_fired) for
-- that recipe (see fetchRoundsOnHand in src/lib/recipes.js), so it can
-- never drift out of sync the way a manually-incremented/decremented
-- column could.

CREATE TABLE public.load_batches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipe_id UUID REFERENCES public.load_recipes(id) ON DELETE CASCADE NOT NULL,
  rounds_loaded INT NOT NULL CHECK (rounds_loaded > 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_load_batches_recipe_id ON public.load_batches(recipe_id);
CREATE INDEX idx_load_batches_user_id ON public.load_batches(user_id);

ALTER TABLE public.load_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own load batches" ON public.load_batches
  FOR ALL USING (auth.uid() = user_id);

-- How many rounds were actually fired on a given range day — previously
-- this number only existed transiently in the browser (typed into "Total
-- Rounds Fired" at save time, used for the old fire-time deduction, then
-- thrown away). Now it needs to persist, since it's what draws down
-- Rounds On Hand.
ALTER TABLE public.range_sessions
  ADD COLUMN IF NOT EXISTS rounds_fired INT CHECK (rounds_fired IS NULL OR rounds_fired >= 0);
