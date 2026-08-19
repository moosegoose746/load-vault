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

function mapRecipeRow(row, session) {
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
    costPerRound: null, // wired up in a later phase (Cost-Per-Round calculator)
    shots: [], // Phase 6+: pull from shot_logs if the per-shot list is needed on-screen
  };
}

/** Fetch one recipe, joined with its component names and its most recent range session. */
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

  return mapRecipeRow(row, sessions?.[0]);
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

/** Create a real range_sessions row (+ shot_logs, if velocity readings are provided). */
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
}) {
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
