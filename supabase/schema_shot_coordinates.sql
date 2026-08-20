-- Adds persistent storage for the individual shot-hole coordinates
-- plotted in TargetCalculator.jsx, alongside the already-saved photo and
-- computed group size. Additive only.
--
-- TargetCalculator already computes each shot as a normalized {x, y}
-- pair (0-1 fractions of the square canvas the target photo is drawn
-- into) -- see `pointFromEvent`/`shots` there. Up to now those points
-- only ever lived in React state for the current session; saving a
-- range session threw them away once the group size/MOA was computed
-- from them. This column keeps the actual points too, as a JSON array
-- of {x, y} objects, so a past group can be redrawn later (Target
-- History) instead of only showing the final number.
--
-- Nullable, no default -- older sessions (and any session saved without
-- a photo/without plotting shots) simply have no coordinates, same
-- "unset reads as unknown" pattern already used for distance_yards on
-- workup_rungs.

ALTER TABLE public.range_sessions
  ADD COLUMN IF NOT EXISTS shot_coordinates JSONB;
