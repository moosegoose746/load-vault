-- Migration for Load Workups (ladder tests / OCW charge workups) — run
-- once in the Supabase SQL Editor. Additive only: three new tables,
-- nothing here touches or removes any existing data.
--
-- Design notes (see discussion with the user):
-- - A Workup is deliberately its OWN entity, separate from load_recipes —
--   not every charge-weight test point a user tries needs to become a
--   permanent saved recipe. A rung can optionally link to a real recipe
--   (recipe_id below) once/if it graduates into "the load," but doesn't
--   have to.
-- - Strict family definition, per the user's explicit choice: a Workup
--   fixes caliber/powder/bullet/primer/brass, and every rung under it
--   varies ONLY charge weight — the textbook definition of a ladder test.
--   This is why the fixed components live on load_workups itself rather
--   than being re-entered per rung.
-- - workup_rung_shots mirrors shot_logs' relationship to range_sessions
--   exactly (see schema.sql) — individual chrono readings per rung, so
--   the eventual charge-weight-vs-velocity chart can plot every real shot,
--   not just each rung's average (a lone weird reading shouldn't look
--   like a false flat/node). avg_velocity_fps/std_dev_fps/
--   extreme_spread_fps are still denormalized onto workup_rungs itself,
--   same pattern as range_sessions storing its own aggregate stats
--   alongside shot_logs — a rung can also be entered with just those
--   summary numbers and no raw shot string, if that's all the user has.

CREATE TABLE public.load_workups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  caliber_id UUID REFERENCES public.calibers(id) ON DELETE RESTRICT NOT NULL,
  powder_id UUID REFERENCES public.components(id) ON DELETE RESTRICT,
  bullet_id UUID REFERENCES public.components(id) ON DELETE RESTRICT,
  primer_id UUID REFERENCES public.components(id) ON DELETE RESTRICT,
  brass_id UUID REFERENCES public.components(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_load_workups_user_id ON public.load_workups(user_id);

-- Matches an existing Workup's fixed component set against a recipe's own
-- (excluding charge weight) — powers the later "Part of Workup" card on a
-- recipe's Overview. An index isn't strictly required for that lookup at
-- expected data volumes, but the columns it filters on are all already
-- indexed via the foreign keys above.

CREATE TABLE public.workup_rungs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workup_id UUID REFERENCES public.load_workups(id) ON DELETE CASCADE NOT NULL,
  charge_weight_grains NUMERIC(5,2) NOT NULL CHECK (charge_weight_grains > 0),
  avg_velocity_fps INT,
  std_dev_fps NUMERIC(4,1),
  extreme_spread_fps INT,
  group_size_moa NUMERIC(4,2),
  rounds_fired INT CHECK (rounds_fired IS NULL OR rounds_fired > 0),
  notes TEXT,
  recipe_id UUID REFERENCES public.load_recipes(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_workup_rungs_workup_id ON public.workup_rungs(workup_id);

CREATE TABLE public.workup_rung_shots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  rung_id UUID REFERENCES public.workup_rungs(id) ON DELETE CASCADE NOT NULL,
  shot_number INT NOT NULL,
  velocity_fps INT NOT NULL CHECK (velocity_fps > 0)
);

CREATE INDEX idx_workup_rung_shots_rung_id ON public.workup_rung_shots(rung_id);

ALTER TABLE public.load_workups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workups" ON public.load_workups FOR ALL USING (auth.uid() = user_id);

-- workup_rungs/workup_rung_shots have no user_id of their own — ownership
-- is checked by walking back up to load_workups, same pattern shot_logs
-- uses against range_sessions (see schema.sql).
ALTER TABLE public.workup_rungs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workup rungs" ON public.workup_rungs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.load_workups WHERE id = workup_rungs.workup_id AND user_id = auth.uid())
);

ALTER TABLE public.workup_rung_shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workup rung shots" ON public.workup_rung_shots FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workup_rungs
    JOIN public.load_workups ON public.load_workups.id = public.workup_rungs.workup_id
    WHERE public.workup_rungs.id = workup_rung_shots.rung_id AND public.load_workups.user_id = auth.uid()
  )
);
