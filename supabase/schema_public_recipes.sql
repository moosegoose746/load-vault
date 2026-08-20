-- Public Recipe Page support.
--
-- load_recipes.visibility ('public' | 'unlisted' | 'private') and its RLS
-- SELECT policy already existed from the original schema (schema.sql) but
-- were never wired up to anything — no UI ever set visibility, and no page
-- ever read a recipe anonymously. This migration closes the RLS half of
-- that gap: a public/unlisted recipe's row itself was already readable by
-- anyone, but its most recent range_session (best group, velocity stats)
-- and that session's shot_logs were NOT — both only had "owner only"
-- policies (see schema.sql / schema_firearms.sql), so an anonymous visitor
-- to a shared recipe link could see the recipe's spec but not its results.
--
-- These two policies extend read access to exactly the same audience the
-- recipe row itself is already visible to: range_sessions/shot_logs
-- belonging to a non-archived public or unlisted recipe. Nothing about
-- write access changes — "Users manage own range sessions"/"...shot logs"
-- (FOR ALL) still gate every insert/update/delete to the owner only; these
-- are pure additive SELECT policies (Postgres RLS policies are OR'd
-- together, so this only ever grants access, never narrows it).

CREATE POLICY "Public range sessions viewable" ON public.range_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.load_recipes
      WHERE load_recipes.id = range_sessions.recipe_id
        AND load_recipes.visibility IN ('public', 'unlisted')
        AND load_recipes.is_archived = FALSE
    )
  );

CREATE POLICY "Public shot logs viewable" ON public.shot_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.range_sessions
      JOIN public.load_recipes ON load_recipes.id = range_sessions.recipe_id
      WHERE range_sessions.id = shot_logs.session_id
        AND load_recipes.visibility IN ('public', 'unlisted')
        AND load_recipes.is_archived = FALSE
    )
  );
