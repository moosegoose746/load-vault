import { supabase } from './supabaseClient.js';
import { computeVelocityStats } from './stats.js';

// Load Workups — ladder tests / OCW charge workups. See
// supabase/schema_workups.sql for the full design rationale. Short
// version: a Workup fixes caliber/powder/bullet/primer/brass, and every
// rung under it varies ONLY charge weight (the textbook definition of a
// ladder test, per the user's explicit choice of strict family matching
// over a looser auto-detected grouping). Deliberately its own entity,
// separate from load_recipes — not every charge tested needs to become a
// permanent saved recipe.

const componentLabel = (c) => (c ? `${c.brand} ${c.model}` : null);

function mapWorkupRow(row) {
  return {
    id: row.id,
    title: row.title,
    caliberId: row.caliber_id,
    caliber: row.calibers?.name ?? '—',
    powderId: row.powder_id,
    powder: componentLabel(row.powder),
    bulletId: row.bullet_id,
    bullet: componentLabel(row.bullet),
    primerId: row.primer_id,
    primer: componentLabel(row.primer),
    brassId: row.brass_id,
    brass: componentLabel(row.brass),
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function mapRungRow(row) {
  return {
    id: row.id,
    workupId: row.workup_id,
    chargeGrains: row.charge_weight_grains,
    avgVelocity: row.avg_velocity_fps,
    stdDevFps: row.std_dev_fps,
    extremeSpread: row.extreme_spread_fps,
    groupSizeMoa: row.group_size_moa,
    roundsFired: row.rounds_fired,
    notes: row.notes || '',
    recipeId: row.recipe_id,
    createdAt: row.created_at,
    shots: (row.workup_rung_shots || [])
      .slice()
      .sort((a, b) => a.shot_number - b.shot_number)
      .map((s) => s.velocity_fps),
  };
}

const WORKUP_SELECT = `
  id, title, caliber_id, powder_id, bullet_id, primer_id, brass_id, notes, created_at,
  calibers ( name ),
  powder:components!load_workups_powder_id_fkey ( id, brand, model ),
  bullet:components!load_workups_bullet_id_fkey ( id, brand, model ),
  primer:components!load_workups_primer_id_fkey ( id, brand, model ),
  brass:components!load_workups_brass_id_fkey ( id, brand, model )
`;

/** This user's Workups, newest first, WITHOUT their rungs (see
 * fetchWorkupDetail for that) — just enough to render the list page's
 * cards (title, fixed components, caliber). */
export async function fetchUserWorkups(userId) {
  const { data, error } = await supabase
    .from('load_workups')
    .select(WORKUP_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWorkupRow);
}

/** One Workup plus every rung under it, sorted by charge weight ascending
 * (the natural ladder reading order — lightest charge first) rather than
 * creation order, since rungs are often added out of order (re-testing a
 * charge, filling in a gap). Each rung carries its own shot list for the
 * eventual chart's individual-shot dots. */
export async function fetchWorkupDetail(workupId) {
  const { data: workupRow, error: workupError } = await supabase
    .from('load_workups')
    .select(WORKUP_SELECT)
    .eq('id', workupId)
    .single();
  if (workupError) throw workupError;

  const { data: rungRows, error: rungError } = await supabase
    .from('workup_rungs')
    .select('*, workup_rung_shots ( shot_number, velocity_fps )')
    .eq('workup_id', workupId)
    .order('charge_weight_grains', { ascending: true });
  if (rungError) throw rungError;

  return {
    ...mapWorkupRow(workupRow),
    rungs: (rungRows || []).map(mapRungRow),
  };
}

/** Create a new Workup — the fixed component set every rung will share.
 * Caliber is required (same as a recipe); powder/bullet/primer/brass are
 * each optional individually (a user might be dialing in a bullet choice
 * before locking everything else down) but in practice a useful ladder
 * test holds all of them constant except charge weight. */
export async function createWorkup(userId, fields) {
  const { data, error } = await supabase
    .from('load_workups')
    .insert({
      user_id: userId,
      title: fields.title,
      caliber_id: fields.caliberId,
      powder_id: fields.powderId || null,
      bullet_id: fields.bulletId || null,
      primer_id: fields.primerId || null,
      brass_id: fields.brassId || null,
      notes: fields.notes || null,
    })
    .select(WORKUP_SELECT)
    .single();
  if (error) throw error;
  return mapWorkupRow(data);
}

export async function deleteWorkup(workupId) {
  // Rungs and their shots cascade automatically (ON DELETE CASCADE, see
  // schema_workups.sql) — deleting a Workup takes its whole ladder with
  // it, but never touches any load_recipes a rung happened to link to
  // (recipe_id is ON DELETE SET NULL on that side, not this one).
  const { error } = await supabase.from('load_workups').delete().eq('id', workupId);
  if (error) throw error;
}

/** Add one charge-weight test point to a Workup. If `shots` (an array of
 * fps numbers) is given, the rung's avg/SD/ES are computed from them via
 * the same computeVelocityStats used everywhere else in the app, and the
 * individual shots are persisted too (workup_rung_shots) so the chart can
 * later plot every real reading, not just the average — a lone weird shot
 * shouldn't be able to masquerade as a flat/node. If `shots` isn't given,
 * avg/SD/ES fall back to whatever was typed in directly (a user reading
 * summary numbers off their chrono's own display rather than every raw
 * shot). */
export async function addWorkupRung(workupId, fields) {
  const computed = fields.shots && fields.shots.length ? computeVelocityStats(fields.shots) : null;

  const { data: rung, error } = await supabase
    .from('workup_rungs')
    .insert({
      workup_id: workupId,
      charge_weight_grains: fields.chargeGrains,
      avg_velocity_fps: computed ? Math.round(computed.avg) : fields.avgVelocity ?? null,
      std_dev_fps: computed ? Number(computed.sd.toFixed(1)) : fields.stdDevFps ?? null,
      extreme_spread_fps: computed ? computed.es : fields.extremeSpread ?? null,
      group_size_moa: fields.groupSizeMoa ?? null,
      rounds_fired: fields.roundsFired ?? null,
      notes: fields.notes || null,
    })
    .select()
    .single();
  if (error) throw error;

  if (fields.shots && fields.shots.length) {
    const rows = fields.shots.map((velocity, i) => ({
      rung_id: rung.id,
      shot_number: i + 1,
      velocity_fps: velocity,
    }));
    const { error: shotError } = await supabase.from('workup_rung_shots').insert(rows);
    if (shotError) throw shotError;
  }

  return mapRungRow({ ...rung, workup_rung_shots: (fields.shots || []).map((v, i) => ({ shot_number: i + 1, velocity_fps: v })) });
}

export async function deleteWorkupRung(rungId) {
  const { error } = await supabase.from('workup_rungs').delete().eq('id', rungId);
  if (error) throw error;
}

/** Find the (at most one) Workup whose fixed component set EXACTLY
 * matches a recipe's own — the strict "all components must match" rule
 * the user chose for what counts as the same ladder family (see the
 * design-decisions note in the progress log). Null fields have to match
 * null-for-null too, not just get skipped, since two recipes that are
 * BOTH missing a bullet aren't necessarily the same load — `.is()` is
 * used instead of `.eq()` for those so Postgres compares them correctly
 * (a plain `.eq('bullet_id', null)` silently matches nothing). Used to
 * power the "this recipe is part of a Workup" card on a recipe's
 * Overview tab — see Dashboard.jsx. Returns `{ id, title }` or null;
 * never throws for "no match," only for a real query failure. */
export async function fetchMatchingWorkup(userId, { caliberId, powderId, bulletId, primerId, brassId }) {
  if (!userId || !caliberId) return null;

  let query = supabase.from('load_workups').select('id, title').eq('user_id', userId).eq('caliber_id', caliberId);
  query = powderId ? query.eq('powder_id', powderId) : query.is('powder_id', null);
  query = bulletId ? query.eq('bullet_id', bulletId) : query.is('bullet_id', null);
  query = primerId ? query.eq('primer_id', primerId) : query.is('primer_id', null);
  query = brassId ? query.eq('brass_id', brassId) : query.is('brass_id', null);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/** Link a rung to a real saved recipe once it's graduated into "the
 * load" — e.g. after using the rung's charge weight (and the Workup's
 * fixed components) to create one via RecipeForm. Purely a convenience
 * cross-reference; a rung is a complete test point on its own without
 * one. */
export async function linkRungToRecipe(rungId, recipeId) {
  const { error } = await supabase.from('workup_rungs').update({ recipe_id: recipeId }).eq('id', rungId);
  if (error) throw error;
}
