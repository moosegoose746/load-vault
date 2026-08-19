import { supabase } from './supabaseClient.js';
import { fetchUserInventoryMap, candidateInventoryLots } from './inventory.js';

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

/** Cost of one unit of a component (one bullet, one primer, one case, or —
 * for powder — one grain), from the user's OWN saved inventory pricing —
 * never the shared `components.unit_cost` catalog field, which is just
 * generic placeholder data (see schema_inventory.sql). `inventoryByComponent`
 * is component_id -> array of lots, from fetchUserInventoryMap(). A
 * component can now have multiple lots (see schema_inventory_v4.sql); this
 * prices off whichever qualifying lot (caliber-matched first, same rule as
 * deduction — see candidateInventoryLots) is oldest and actually has a
 * price entered, mirroring the lot deduction would draw from first.
 * Returns `null` (not 0) when the component is selected but no qualifying
 * lot has a price yet, so callers can tell "free/not applicable" apart
 * from "unknown cost" instead of silently under-counting the total.
 * `reloadCycles` divides the per-unit cost further — only meaningful for
 * brass (amortizing a case's cost across multiple reloadings); everything
 * else passes 1 (no-op). */
function costForComponent(component, inventoryByComponent, caliberId, caliberSpecific, quantity = 1, reloadCycles = 1) {
  if (!component) return 0; // nothing selected for this slot — not applicable
  const lots = candidateInventoryLots(inventoryByComponent, component.id, caliberId, caliberSpecific);
  const entry = lots.find((l) => l.unit_cost != null && l.package_qty);
  if (!entry) return null;
  const cycles = reloadCycles && reloadCycles > 0 ? reloadCycles : 1;
  return ((entry.unit_cost / entry.package_qty) * quantity) / cycles;
}

/** Cost-per-round for a recipe, using the signed-in user's own saved
 * component pricing (see costForComponent above). Powder cost scales with
 * charge weight (package_qty for powder is in grains), bullet/primer are
 * flat one-per-round costs, and brass is divided by however many reload
 * cycles the user estimated for it (defaulting to 1 / single-use if they
 * haven't set one) — matching the master doc's cost formula. Bullet and
 * brass pricing is caliber-matched against the recipe's own caliber_id
 * (see costForComponent/candidateInventoryLots), same as deduction.
 * Returns `null` if ANY selected component has no saved price yet, rather
 * than silently showing a partial (understated) total. */
function calculateCostPerRound(row, inventoryByComponent) {
  const caliberId = row.caliber_id ?? null;
  const brassLots = row.brass ? candidateInventoryLots(inventoryByComponent, row.brass.id, caliberId, true) : [];
  const brassEntry = brassLots.find((l) => l.reload_cycles != null) ?? brassLots[0];
  const parts = [
    costForComponent(row.powder, inventoryByComponent, caliberId, false, row.charge_weight_grains ?? 0),
    costForComponent(row.bullet, inventoryByComponent, caliberId, true),
    costForComponent(row.primer, inventoryByComponent, caliberId, false),
    costForComponent(row.brass, inventoryByComponent, caliberId, true, 1, brassEntry?.reload_cycles),
  ];
  if (parts.some((p) => p == null)) return null;
  return parts.reduce((sum, p) => sum + p, 0);
}

/** How many more complete rounds this recipe could be LOADED from raw
 * component stock — bottlenecked by whichever tracked component would run
 * out first. Deliberately NOT called "rounds remaining"/"on hand" (an
 * earlier version of this was) since that reads as "rounds you already
 * have loaded and ready to shoot," which is a totally different number —
 * see `roundsOnHand`/`fetchRoundsOnHand` below for that one. This is
 * purely a raw-materials capacity estimate. Components with no saved Qty
 * On Hand are simply skipped (unknown, not zero) rather than forcing the
 * whole estimate to `null` — unlike cost-per-round, a partial answer ("at
 * least 40, limited by primers") is still useful even if powder isn't
 * tracked yet. Returns `{ loadableFromStock: null, loadableBottleneck:
 * null }` if nothing on this recipe is tracked at all. Brass uses its Qty
 * On Hand (case count) here, same as everything else — separate from
 * cycles_used/reload_cycles, which is about a batch of brass wearing out,
 * not how many cases exist. */
function calculateLoadableFromStock(row, inventoryByComponent) {
  const caliberId = row.caliber_id ?? null;
  const parts = [];
  const add = (component, label, perRoundAmount, caliberSpecific) => {
    if (!component || !(perRoundAmount > 0)) return;
    // Two different "nothing here" cases, and they mean different things:
    // (1) the user has never entered ANY quantity for this component at
    // all — genuinely unknown, skip it so a partial answer stays honest
    // ("at least 40, limited by primers" shouldn't silently become "0"
    // just because brass isn't tracked yet). (2) the user HAS entered
    // quantity for this component, but every lot is tagged to a DIFFERENT
    // caliber than this recipe (a real, if easy-to-make, data-entry
    // mismatch) — that's not unknown, it's a genuine 0 usable for THIS
    // recipe, and needs to count as a real bottleneck. Checking the raw
    // per-component lots (before caliber filtering) for #1, then the
    // caliber-matched lots (via candidateInventoryLots, same rule
    // costForComponent/deduction use) for the real total, is what tells
    // these apart — collapsing them into one check is the bug that made
    // a caliber-mismatched bullet lot silently vanish from this estimate
    // instead of correctly reporting 0.
    const rawTrackedLots = (inventoryByComponent?.[component.id] || []).filter((l) => l.quantity_on_hand != null);
    if (!rawTrackedLots.length) return;
    const lots = candidateInventoryLots(inventoryByComponent, component.id, caliberId, caliberSpecific);
    const trackedLots = lots.filter((l) => l.quantity_on_hand != null);
    const totalOnHand = trackedLots.reduce((sum, l) => sum + l.quantity_on_hand, 0);
    parts.push({ label, rounds: Math.floor(totalOnHand / perRoundAmount) });
  };
  add(row.powder, `${row.powder?.brand} ${row.powder?.model}`, row.charge_weight_grains ?? 0, false);
  add(row.bullet, `${row.bullet?.brand} ${row.bullet?.model}`, 1, true);
  add(row.primer, `${row.primer?.brand} ${row.primer?.model}`, 1, false);
  add(row.brass, `${row.brass?.brand} ${row.brass?.model}`, 1, true);

  if (!parts.length) return { loadableFromStock: null, loadableBottleneck: null };
  const min = parts.reduce((a, b) => (b.rounds < a.rounds ? b : a));
  return { loadableFromStock: min.rounds, loadableBottleneck: min.label };
}

/** How many rounds of this recipe are currently loaded and sitting ready
 * to shoot — SUM(load_batches.rounds_loaded) - SUM(range_sessions.
 * rounds_fired) for this recipe. Deliberately computed fresh each time
 * rather than stored as a mutable running counter, so it can never drift
 * out of sync with the actual batch/session history (see
 * supabase/schema_batches.sql). Clamped at 0 — if more has been fired
 * than was ever logged as loaded (e.g. a loading session from before this
 * feature existed, or factory ammo fired under this recipe by mistake),
 * that's a real discrepancy worth noticing, but this number just floors
 * at zero rather than going negative. */
export async function fetchRoundsOnHand(recipeId) {
  const [{ data: batches, error: batchError }, { data: sessions, error: sessionError }] = await Promise.all([
    supabase.from('load_batches').select('rounds_loaded').eq('recipe_id', recipeId),
    supabase.from('range_sessions').select('rounds_fired').eq('recipe_id', recipeId),
  ]);
  if (batchError) throw batchError;
  if (sessionError) throw sessionError;
  const totalLoaded = (batches || []).reduce((sum, b) => sum + (b.rounds_loaded || 0), 0);
  const totalFired = (sessions || []).reduce((sum, s) => sum + (s.rounds_fired || 0), 0);
  return Math.max(0, totalLoaded - totalFired);
}

/** Same idea as fetchRoundsOnHand above, but aggregated across every
 * recipe that shares a given brass component + caliber, instead of one
 * recipe at a time — this is what lets the Inventory page show "N cases
 * currently loaded and not yet fired" for a brass lot, without needing to
 * record which specific lot every Loading Session actually drew from
 * (see the caveat about caliber-level, not lot-level, tracking discussed
 * with the user). Returns a map of `${brassComponentId}::${caliberId} ->
 * currently-loaded count (only keys with a nonzero count are included).
 *
 * Deliberately does NOT filter out archived recipes: archiving a recipe
 * just hides it from the recipe switcher, it doesn't mean any ammo
 * already loaded under it stopped existing or stopped tying up brass —
 * excluding archived recipes here would silently understate how much is
 * actually loaded. */
export async function fetchCurrentlyLoadedByBrassCaliber(userId) {
  const { data: recipes, error: recipeError } = await supabase
    .from('load_recipes')
    .select('id, brass_id, caliber_id')
    .eq('user_id', userId)
    .not('brass_id', 'is', null);
  if (recipeError) throw recipeError;
  if (!recipes || !recipes.length) return {};

  const recipeIds = recipes.map((r) => r.id);
  const [{ data: batches, error: batchError }, { data: sessions, error: sessionError }] = await Promise.all([
    supabase.from('load_batches').select('recipe_id, rounds_loaded').in('recipe_id', recipeIds),
    supabase.from('range_sessions').select('recipe_id, rounds_fired').in('recipe_id', recipeIds),
  ]);
  if (batchError) throw batchError;
  if (sessionError) throw sessionError;

  const loadedByRecipe = {};
  (batches || []).forEach((b) => {
    loadedByRecipe[b.recipe_id] = (loadedByRecipe[b.recipe_id] || 0) + (b.rounds_loaded || 0);
  });
  const firedByRecipe = {};
  (sessions || []).forEach((s) => {
    firedByRecipe[s.recipe_id] = (firedByRecipe[s.recipe_id] || 0) + (s.rounds_fired || 0);
  });

  const byKey = {};
  recipes.forEach((r) => {
    const onHand = Math.max(0, (loadedByRecipe[r.id] || 0) - (firedByRecipe[r.id] || 0));
    if (!onHand) return;
    const key = `${r.brass_id}::${r.caliber_id}`;
    byKey[key] = (byKey[key] || 0) + onHand;
  });
  return byKey;
}

/** Total rounds of this recipe EVER logged as loaded — plain
 * SUM(load_batches.rounds_loaded), no subtraction for rounds fired. This
 * is deliberately different from fetchRoundsOnHand above: Money Saved
 * (see mapRecipeRow) should reflect every round this recipe has ever
 * saved money on, not just what's presently sitting loaded and unfired —
 * it shouldn't go DOWN just because some of that ammo got shot. */
async function fetchTotalRoundsLoaded(recipeId) {
  const { data, error } = await supabase
    .from('load_batches')
    .select('rounds_loaded')
    .eq('recipe_id', recipeId);
  if (error) throw error;
  return (data || []).reduce((sum, b) => sum + (b.rounds_loaded || 0), 0);
}

/** Most recent Loading Session (load_batches row) for this recipe — used
 * to power the "Recent Activity" summary on the Overview tab (last loaded
 * date + rounds), same idea as the most-recent range_session already
 * fetched in fetchRecipeDetail but for the loading side instead of the
 * shooting side. Returns `null` if this recipe has never had a Loading
 * Session logged. */
async function fetchLastLoadingBatch(recipeId) {
  const { data, error } = await supabase
    .from('load_batches')
    .select('rounds_loaded, notes, created_at')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Average velocity per Range Session for this recipe, oldest first — the
 * "session-over-session" trend, as opposed to the per-shot trend within
 * one session (see displayShots/VelocitySparkline in Dashboard.jsx). This
 * is what actually shows a load drifting (barrel wear, powder lot change)
 * over the recipe's life, which a single session's shot-to-shot noise
 * can't. Sessions with no avg_velocity_fps recorded (no chrono data that
 * day) are skipped rather than plotted as a gap or zero. Fetched lazily —
 * only when the Overview tab's Velocity Trend card is switched to
 * "Trend" mode — since it's a separate query from the single latest
 * session fetchRecipeDetail already pulls. */
export async function fetchVelocityTrend(recipeId) {
  const { data, error } = await supabase
    .from('range_sessions')
    .select('avg_velocity_fps, created_at')
    .eq('recipe_id', recipeId)
    .not('avg_velocity_fps', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((s) => ({ avgVelocity: s.avg_velocity_fps, date: s.created_at }));
}

/** Every Range Session for this recipe that has a saved target photo,
 * newest first, with the full per-session context (distance, group size,
 * velocity stats, rounds fired, which firearm) — powers the Overview
 * tab's target history popup (see TargetHistoryModal.jsx). Fetched lazily
 * on open, same reasoning as fetchVelocityTrend above: fetchRecipeDetail
 * only ever pulls the single latest session, so a full photo history
 * needs its own query rather than bloating every recipe load with data
 * most views never show. */
export async function fetchTargetHistory(recipeId) {
  const { data, error } = await supabase
    .from('range_sessions')
    .select(
      'id, target_image_url, created_at, distance_yards, group_size_moa, group_size_inches, avg_velocity_fps, std_dev_fps, extreme_spread_fps, rounds_fired, firearm_id'
    )
    .eq('recipe_id', recipeId)
    .not('target_image_url', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Log a Loading Session — a batch of `roundsLoaded` rounds of this
 * recipe actually assembled at the bench. This is what should trigger
 * component deduction (see computeBatchDeduction/applyBatchDeduction in
 * lib/inventory.js), NOT firing a round at the range. */
export async function createLoadBatch({ recipeId, userId, roundsLoaded, notes }) {
  const { data, error } = await supabase
    .from('load_batches')
    .insert({ recipe_id: recipeId, user_id: userId, rounds_loaded: roundsLoaded, notes: notes || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function mapRecipeRow(row, session, shots, inventory, roundsOnHand, totalRoundsLoaded, lastBatch) {
  const componentLabel = (c) => (c ? `${c.brand} ${c.model}` : '—');
  const costPerRound = calculateCostPerRound(row, inventory);
  const factoryPricePerRound = row.factory_price_per_round ?? null;
  // Money Saved vs. Factory Ammo — only computable once BOTH a factory
  // price has been entered AND cost-per-round is known (every selected
  // component has a saved price — see calculateCostPerRound). Uses
  // lifetime rounds loaded (fetchTotalRoundsLoaded), not roundsOnHand, so
  // it reflects money saved on every round ever assembled under this
  // recipe rather than shrinking as ammo gets fired. `totalRoundsLoaded`
  // of 0 (recipe created but nothing loaded yet) legitimately yields $0
  // saved so far, not "unknown" — still shown once a factory price exists.
  const moneySaved =
    factoryPricePerRound != null && costPerRound != null
      ? (factoryPricePerRound - costPerRound) * (totalRoundsLoaded ?? 0)
      : null;
  return {
    id: row.id,
    title: row.title,
    caliber: row.calibers?.name ?? '—',
    // Raw caliber id — used (alongside powderId/bulletId/primerId/brassId
    // below) to caliber-match bullet/brass inventory lots for both the
    // Cost/Round math above and the Loading Session deduction preview in
    // Dashboard (see candidateInventoryLots in lib/inventory.js).
    caliberId: row.caliber_id ?? null,
    powder: componentLabel(row.powder),
    bullet: componentLabel(row.bullet),
    chargeGrains: row.charge_weight_grains,
    coalInches: row.coal_inches,
    primer: componentLabel(row.primer),
    brass: componentLabel(row.brass),
    // Raw component ids, kept alongside the display-label strings above, so
    // the Log a Loading Session flow can look each one up in the user's own
    // user_inventory rows for auto-deduction (see
    // computeBatchDeduction/applyBatchDeduction in lib/inventory.js).
    // Not needed by anything that only renders the recipe (Sidebar etc.),
    // just by the deduction feature in Dashboard.
    powderId: row.powder?.id ?? null,
    bulletId: row.bullet?.id ?? null,
    primerId: row.primer?.id ?? null,
    brassId: row.brass?.id ?? null,
    rifleModel: row.rifle_model || '—',
    // The real firearm this recipe is linked to, if any (see
    // schema_recipes_v2.sql) — a proper Firearm Profile, not the old
    // free-text rifle_model field above. `firearmLabel` is what UI code
    // should actually render: the linked profile's name if one's set,
    // falling back to the legacy free-text field for older recipes that
    // predate Firearm Profiles and were never given a linked one.
    firearmId: row.firearm_id ?? null,
    firearmLabel: row.firearm?.name ?? (row.rifle_model || null),
    distanceYards: session?.distance_yards ?? 100,
    groupSizeMoa: session?.group_size_moa ?? null,
    avgVelocity: session?.avg_velocity_fps ?? null,
    stdDevFps: session?.std_dev_fps ?? null,
    extremeSpread: session?.extreme_spread_fps ?? null,
    targetImageUrl: session?.target_image_url ?? null,
    costPerRound,
    // See schema_recipes_v3.sql. factoryPricePerRound is the raw
    // user-entered value (used to pre-fill the edit input in Sidebar);
    // moneySaved is the derived stat actually rendered — both null until
    // the user sets a factory price for this recipe.
    factoryPricePerRound,
    moneySaved,
    ...calculateLoadableFromStock(row, inventory),
    // How many rounds of this recipe are currently loaded & ready to
    // shoot — see fetchRoundsOnHand above. `undefined` (not fetched, e.g.
    // no recipeId yet) renders the same as `null` (nothing logged) in the
    // UI, both show as "—".
    roundsOnHand: roundsOnHand ?? null,
    // Best-guess pre-fill for the Range Day firearm picker (see
    // Dashboard.jsx) — NOT a hard link, since firearm is still a
    // per-session choice (see schema_firearms.sql for why). Prefers
    // whatever was picked on the most recent range session for this
    // recipe (recency wins, e.g. this recipe got tested on a different
    // rifle last time out); falls back to the recipe's own linked
    // firearm (firearmId above) for the very first session, or for
    // recipes that have never had a session logged yet.
    defaultFirearmId: session?.firearm_id ?? row.firearm_id ?? null,
    shots: shots ?? [],
    // Free-text notes captured at recipe creation (see RecipeForm.jsx) —
    // selected by fetchRecipeDetail's query but previously never mapped
    // into the view model, so nothing could render it. Now shown +
    // inline-editable on the Overview tab (see RecipeNotesCard.jsx).
    notes: row.notes || '',
    // "Recent Activity" summary on Overview — last time this recipe was
    // loaded at the bench vs. last time it was fired at the range. Both
    // independently null if that side has never happened yet.
    lastLoadedAt: lastBatch?.created_at ?? null,
    lastLoadedRounds: lastBatch?.rounds_loaded ?? null,
    lastFiredAt: session?.created_at ?? null,
    lastFiredRounds: session?.rounds_fired ?? null,
  };
}

/** Fetch one recipe, joined with its component names, its most recent range
 * session, that session's per-shot velocity log, and — if `userId` is
 * given — the signed-in user's own saved pricing for whichever components
 * this recipe uses, to compute a real cost-per-round (see
 * calculateCostPerRound above and schema_inventory.sql for why pricing
 * isn't just read off the shared `components` catalog).
 *
 * Note: only the target *photo* is restorable — the individual shot-hole
 * coordinates plotted on the canvas aren't persisted anywhere in the
 * schema (no column for them), so reopening a saved recipe shows the
 * saved photo but not the shot markers on it; re-plotting starts fresh on
 * top of the restored photo. */
export async function fetchRecipeDetail(recipeId, userId) {
  const { data: row, error } = await supabase
    .from('load_recipes')
    .select(
      `
      id, title, caliber_id, charge_weight_grains, coal_inches, rifle_model, firearm_id, notes, factory_price_per_round,
      calibers ( name ),
      firearm:firearms ( id, name ),
      powder:components!load_recipes_powder_id_fkey ( id, brand, model ),
      bullet:components!load_recipes_bullet_id_fkey ( id, brand, model ),
      primer:components!load_recipes_primer_id_fkey ( id, brand, model ),
      brass:components!load_recipes_brass_id_fkey ( id, brand, model )
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

  const inventory = userId ? await fetchUserInventoryMap(userId) : {};
  const [roundsOnHand, totalRoundsLoaded, lastBatch] = await Promise.all([
    fetchRoundsOnHand(recipeId),
    fetchTotalRoundsLoaded(recipeId),
    fetchLastLoadingBatch(recipeId),
  ]);

  return mapRecipeRow(row, latestSession, shots, inventory, roundsOnHand, totalRoundsLoaded, lastBatch);
}

/** Soft-delete a recipe (sets is_archived = true rather than a hard DELETE,
 * so any range_sessions/shot_logs history isn't lost and the row can be
 * recovered later if needed). RLS's "Users manage own recipes" policy
 * covers the UPDATE. */
export async function archiveRecipe(recipeId) {
  const { error } = await supabase.from('load_recipes').update({ is_archived: true }).eq('id', recipeId);
  if (error) throw error;
}

/** Create a new load_recipes row. `fields` uses the *_id foreign keys
 * directly. `firearmId` links to a real Firearm Profile (see
 * schema_recipes_v2.sql) — the New Recipe form no longer collects the
 * old free-text `rifle_model`, so that column is just left null for new
 * recipes going forward (still populated on older rows, read as a
 * fallback — see firearmLabel in mapRecipeRow above). */
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
      firearm_id: fields.firearmId || null,
      notes: fields.notes || null,
      factory_price_per_round: fields.factoryPricePerRound || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Full recipe edit — every field RecipeForm collects, including the five
 * core components and charge weight. Deliberately no snapshotting: cost
 * per round, Money Saved, and inventory-deduction matching are ALWAYS
 * computed from a recipe's CURRENT component links (see
 * costForComponent/calculateCostPerRound above), never from whatever they
 * were at the time a past Loading/Range Session was logged. So editing a
 * recipe's components after it already has history retroactively changes
 * its past cost figures too — RecipeForm warns the user about this before
 * saving when `fetchRecipeHasHistory` says there's session history to
 * lose accuracy on, but the write itself here doesn't gate on it; that's
 * a UI-layer confirmation, not a data-integrity rule. */
export async function updateRecipe(recipeId, fields) {
  const { data, error } = await supabase
    .from('load_recipes')
    .update({
      title: fields.title,
      caliber_id: fields.caliberId,
      powder_id: fields.powderId || null,
      charge_weight_grains: fields.chargeGrains,
      bullet_id: fields.bulletId || null,
      primer_id: fields.primerId || null,
      brass_id: fields.brassId || null,
      coal_inches: fields.coalInches || null,
      firearm_id: fields.firearmId || null,
      notes: fields.notes || null,
      factory_price_per_round: fields.factoryPricePerRound || null,
    })
    .eq('id', recipeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Whether a recipe has ANY logged history (a Loading Session or a Range
 * Session) — used purely to decide whether RecipeForm should warn before
 * saving an edit to its core components/charge weight (see updateRecipe
 * above for why that matters). Two small `head: true, count: 'exact'`
 * queries rather than fetching real rows — this only needs a yes/no. */
export async function fetchRecipeHasHistory(recipeId) {
  const [batches, sessions] = await Promise.all([
    supabase.from('load_batches').select('id', { head: true, count: 'exact' }).eq('recipe_id', recipeId),
    supabase.from('range_sessions').select('id', { head: true, count: 'exact' }).eq('recipe_id', recipeId),
  ]);
  if (batches.error) throw batches.error;
  if (sessions.error) throw sessions.error;
  return (batches.count || 0) > 0 || (sessions.count || 0) > 0;
}

/** Lifetime money saved across EVERY recipe the user has given a
 * Comparable Factory Price — same math as the per-recipe `moneySaved` in
 * mapRecipeRow ((factoryPrice - costPerRound) * total rounds ever
 * loaded), just summed across recipes instead of shown one at a time.
 * The user asked for this specifically so it can be shown somewhere as
 * an account-wide "lifetime saved" number (see Header.jsx) — a natural
 * extension of the per-recipe stat, not a new concept.
 *
 * Recipes with no factory price set, or where cost-per-round still can't
 * be computed (a selected component has no saved inventory price yet),
 * are skipped entirely rather than counted as $0 — an unpriced recipe
 * has no real "saved" number yet, and letting it silently count as zero
 * would understate the total for no good reason. Returns `total: null`
 * (not 0) if nothing qualifies at all, so the caller can hide the badge
 * entirely instead of showing a misleading $0.00 to a user who's never
 * set a factory price on anything. */
export async function fetchLifetimeMoneySaved(userId) {
  const { data: rows, error } = await supabase
    .from('load_recipes')
    .select(
      `
      id, caliber_id, charge_weight_grains, factory_price_per_round,
      powder:components!load_recipes_powder_id_fkey ( id, brand, model ),
      bullet:components!load_recipes_bullet_id_fkey ( id, brand, model ),
      primer:components!load_recipes_primer_id_fkey ( id, brand, model ),
      brass:components!load_recipes_brass_id_fkey ( id, brand, model )
    `
    )
    .eq('user_id', userId)
    .eq('is_archived', false)
    .not('factory_price_per_round', 'is', null);
  if (error) throw error;
  if (!rows || !rows.length) return { total: null, recipesCounted: 0 };

  const inventory = await fetchUserInventoryMap(userId);
  const recipeIds = rows.map((r) => r.id);
  const { data: batches, error: batchError } = await supabase
    .from('load_batches')
    .select('recipe_id, rounds_loaded')
    .in('recipe_id', recipeIds);
  if (batchError) throw batchError;

  const loadedByRecipe = {};
  (batches || []).forEach((b) => {
    loadedByRecipe[b.recipe_id] = (loadedByRecipe[b.recipe_id] || 0) + (b.rounds_loaded || 0);
  });

  let total = null;
  let recipesCounted = 0;
  rows.forEach((row) => {
    const costPerRound = calculateCostPerRound(row, inventory);
    if (costPerRound == null) return; // pricing incomplete — skip, don't guess
    const roundsLoaded = loadedByRecipe[row.id] || 0;
    total = (total ?? 0) + (row.factory_price_per_round - costPerRound) * roundsLoaded;
    recipesCounted += 1;
  });
  return { total, recipesCounted };
}

/** Set (or clear, passing null) a recipe's Comparable Factory Price —
 * there's no general recipe-edit UI yet (recipes are create-once via
 * RecipeForm.jsx), so this is a narrow, single-field update exposed
 * directly from Sidebar's Money Saved section rather than building a
 * full edit flow just for this one optional field. RLS's "Users manage
 * own recipes" policy covers the UPDATE. */
export async function updateRecipeFactoryPrice(recipeId, factoryPricePerRound) {
  const { error } = await supabase
    .from('load_recipes')
    .update({ factory_price_per_round: factoryPricePerRound })
    .eq('id', recipeId);
  if (error) throw error;
}

/** Set (or clear, passing '') a recipe's free-text notes — same narrow
 * single-field pattern as updateRecipeFactoryPrice above, exposed from the
 * Overview tab's Notes card so a user can jot something down mid-range-day
 * or mid-loading-session without a full recipe-edit flow. RLS's "Users
 * manage own recipes" policy covers the UPDATE. */
export async function updateRecipeNotes(recipeId, notes) {
  const { error } = await supabase
    .from('load_recipes')
    .update({ notes: notes || null })
    .eq('id', recipeId);
  if (error) throw error;
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
 * TargetCalculator.jsx). `roundsFired` — how many rounds were actually
 * shot today, separate from how many got a chrono reading — is persisted
 * so it can draw down `roundsOnHand` (see fetchRoundsOnHand above); unlike
 * the old behavior, saving a range session no longer deducts raw
 * component stock on its own (see supabase/schema_batches.sql).
 * `firearmId` — which firearm profile this session's rounds were fired
 * through, optional — is what actually drives a firearm's tracked round
 * count/barrel life (see lib/firearms.js); it's a per-session choice, not
 * inherited from the recipe. */
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
  roundsFired,
  firearmId,
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
      rounds_fired: roundsFired ?? null,
      firearm_id: firearmId || null,
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
