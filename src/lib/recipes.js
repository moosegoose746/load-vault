import { supabase } from './supabaseClient.js';

// Real Supabase-backed recipe data layer. Everything here maps Postgres
// rows into the same flat "recipe view model" shape `src/data/mockRecipe.js`
// already used (title, caliber, powder, bullet, chargeGrains, coalInches,
// primer, brass, rifleModel, distanceYards, groupSizeMoa, avgVelocity,
// stdDevFps, extremeSpread, costPerRound, shots) — so Sidebar/Dashboard/
// MetricCard etc. don't need to know or care whether they're rendering
// mock data or a real saved recipe.

export async function fetchCalibers() {
  const { data, error } = await supabase.from('calibers').select('id, name').order('name');
  if (error) throw error;
  return data;
}

export async function fetchComponentsByType(type) {
  const { data, error } = await supabase
    .from('components')
    .select('id, brand, model')
    .eq('type', type)
    .eq('is_deleted', false)
    .order('brand');
  if (error) throw error;
  return data;
}

export async function fetchUserRecipes(userId) {
  const { data, error } = await supabase
    .from('load_recipes')
    .select('id, title, created_at')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

function mapRecipeRow(row, session, shots) {
  const componentLabel = (c) => (c ? `${c.brand} ${c.model}` : '—');
  return {
    id: row.id,
    title: row.title,
    caliber: row.calibers?.name ?? '—',
    powder: componentLabel(row.powder),
    bullet: componentLabel(row.bullet),
    chargeGrains: row.charge_weight_grains,
    coalInches: row.coal_inches,
    primer: componentLabel(row.primer),
    brass: componentLabel(row.brass),
    rifleModel: row.rifle_model || '—',
    distanceYards: session?.distance_yards ?? 100,
    groupSizeMoa: session?.group_size_moa ?? null,
    avgVelocity: session?.avg_velocity_fps ?? null,
    stdDevFps: session?.std_dev_fps ?? null,
    extremeSpread: session?.extreme_spread_fps ?? null,
    targetImageUrl: session?.target_image_url ?? null,
    costPerRound: null, // wired up in a later phase (Cost-Per-Round calculator)
    shots: shots ?? [],
  };
}

/** Fetch one recipe, joined with its component names, its most recent range
 * session, and that session's per-shot velocity log. Note: only the target
 * *photo* is restorable — the individual shot-hole coordinates plotted on
 * the canvas aren't persisted anywhere in the schema (no column for them),
 * so reopening a saved recipe shows the saved photo but not the shot
 * markers on it; re-plotting starts fresh on top of the restored photo. */
export async function fetchRecipeDetail(recipeId) {
  const { data: row, error } = await supabase
    .from('load_recipes')
    .select(
      `
      id, title, charge_weight_grains, coal_inches, rifle_model, notes,
      calibers ( name ),
      powder:components!load_recipes_powder_id_fkey ( brand, model ),
      bullet:components!load_recipes_bullet_id_fkey ( brand, model ),
      primer:components!load_recipes_primer_id_fkey ( brand, model ),
      brass:components!load_recipes_brass_id_fkey ( brand, model )
    `
    )
    .eq('id', recipeId)
    .single();
  if (error) throw error;

  const { data: sessions, error: sessionError } = await supabase
    .from('range_sessions')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (sessionError) throw sessionError;

  const latestSession = sessions?.[0];
  let shots = [];
  if (latestSession) {
    const { data: shotRows, error: shotError } = await supabase
      .from('shot_logs')
      .select('velocity_fps')
      .eq('session_id', latestSession.id)
      .order('shot_number', { ascending: true });
    if (shotError) throw shotError;
    shots = (shotRows || []).map((r) => r.velocity_fps);
  }

  return mapRecipeRow(row, latestSession, shots);
}

/** Soft-delete a recipe (sets is_archived = true rather than a hard DELETE,
 * so any range_sessions/shot_logs history isn't lost and the row can be
 * recovered later if needed). RLS's "Users manage own recipes" policy
 * covers the UPDATE. */
export async function archiveRecipe(recipeId) {
  const { error } = await supabase.from('load_recipes').update({ is_archived: true }).eq('id', recipeId);
  if (error) throw error;
}

/** Create a new load_recipes row. `fields` uses the *_id foreign keys directly. */
export async function createRecipe(fields, userId) {
  const { data, error } = await supabase
    .from('load_recipes')
    .insert({
      user_id: userId,
      title: fields.title,
      caliber_id: fields.caliberId,
      powder_id: fields.powderId || null,
      charge_weight_grains: fields.chargeGrains,
      bullet_id: fields.bulletId || null,
      primer_id: fields.primerId || null,
      brass_id: fields.brassId || null,
      coal_inches: fields.coalInches || null,
      rifle_model: fields.rifleModel || null,
      notes: fields.notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Upload a compressed target-photo Blob to Supabase Storage and return its
 * public URL. Stored under `${userId}/<timestamp>.webp` in the
 * `target-images` bucket, which is public-read / authenticated-write (see
 * "STORAGE BUCKET SECURITY" in supabase/schema.sql) — a trigger on
 * range_sessions already cleans up the old file whenever a session's
 * target_image_url changes or the session is deleted, so this doesn't need
 * to worry about orphaned files itself. */
async function uploadTargetImage(blob, userId) {
  const path = `${userId}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from('target-images').upload(path, blob, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('target-images').getPublicUrl(path);
  return data.publicUrl;
}

/** Create a real range_sessions row (+ shot_logs, if velocity readings are
 * provided, + a target photo upload if a *newly uploaded* image is passed —
 * `imageBlob` is only set when the user picked a new photo this session; a
 * photo restored from a previous session isn't re-uploaded, see
 * TargetCalculator.jsx). */
export async function createRangeSession({
  recipeId,
  userId,
  distanceYards,
  groupSizeMoa,
  groupInches,
  avgVelocity,
  stdDevFps,
  extremeSpread,
  shots,
  imageBlob,
}) {
  let targetImageUrl = null;
  if (imageBlob) {
    try {
      targetImageUrl = await uploadTargetImage(imageBlob, userId);
    } catch (err) {
      // Don't let a failed photo upload block saving the actual range
      // data — log it and just save without a photo this time.
      console.error('Failed to upload target image', err);
    }
  }

  const { data: session, error } = await supabase
    .from('range_sessions')
    .insert({
      recipe_id: recipeId,
      user_id: userId,
      distance_yards: distanceYards ?? 100,
      group_size_moa: groupSizeMoa,
      group_size_inches: groupInches,
      avg_velocity_fps: avgVelocity != null ? Math.round(avgVelocity) : null,
      std_dev_fps: stdDevFps,
      extreme_spread_fps: extremeSpread,
      target_image_url: targetImageUrl,
    })
    .select()
    .single();
  if (error) throw error;

  if (shots && shots.length) {
    const rows = shots.map((velocity, i) => ({
      session_id: session.id,
      shot_number: i + 1,
      velocity_fps: velocity,
    }));
    const { error: shotError } = await supabase.from('shot_logs').insert(rows);
    if (shotError) throw shotError;
  }

  return session;
}
