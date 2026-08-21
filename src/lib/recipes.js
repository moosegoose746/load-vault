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

/** The user's active (non-archived) recipes, enriched with just enough of
 * each recipe's caliber/firearm/components/best-group data for the
 * Sidebar's recipe filter (see Sidebar.jsx) to search across without a
 * second round trip per recipe. `bestMoa` is the tightest group_size_moa
 * ever recorded across this recipe's range sessions — the smallest number,
 * since a smaller MOA group is the better one — or `null` if nothing's
 * been logged yet. Two queries (recipes, then a lightweight moa-only pull
 * from range_sessions) rather than one big join, since Supabase's
 * embedded-resource syntax can't express "aggregate MIN() per recipe" —
 * the aggregation happens here in JS instead. */
export async function fetchUserRecipes(userId) {
  const [recipesRes, sessionsRes, batchesRes, inventoryMap] = await Promise.all([
    supabase
      .from('load_recipes')
      .select(
        `
        id, title, created_at, caliber_id, charge_weight_grains, factory_price_per_round,
        calibers ( name ),
        firearm:firearms ( name ),
        powder:components!load_recipes_powder_id_fkey ( id, brand, model ),
        bullet:components!load_recipes_bullet_id_fkey ( id, brand, model ),
        primer:components!load_recipes_primer_id_fkey ( id, brand, model ),
        brass:components!load_recipes_brass_id_fkey ( id, brand, model )
      `
      )
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false }),
    supabase.from('range_sessions').select('recipe_id, group_size_moa, created_at, rounds_fired').eq('user_id', userId),
    // Recipes Home (see the progress log) wants a "last worked on" date and
    // a lifetime rounds-loaded count per card — bench sessions count
    // toward "last worked on" just as much as range days, and rounds_loaded
    // here feeds Total Money Spent below — so this pulls both fields and
    // aggregates in JS, same cheap group-by approach bestMoaByRecipe
    // already uses, rather than a second round trip per recipe for either.
    supabase.from('load_batches').select('recipe_id, created_at, rounds_loaded').eq('user_id', userId),
    // ONE query for the user's whole inventory (not per-recipe) — the same
    // shared map calculateCostPerRound below already takes for a single
    // recipe on Dashboard, just reused here across every recipe in the
    // list at once, which is what keeps Cost/Round-derived fields on this
    // list cheap despite needing per-component pricing.
    fetchUserInventoryMap(userId),
  ]);
  if (recipesRes.error) throw recipesRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (batchesRes.error) throw batchesRes.error;

  const bestMoaByRecipe = {};
  // Most recent MEASURED group per recipe — NOT just whichever session is
  // newest (a Quick Log session, see Dashboard's rangeMode, never has a
  // group_size_moa), same "measured vs. merely latest" distinction
  // fetchRecipeDetail's measuredSession draws, applied here for the card
  // grid's own "Most Recent MOA" stat.
  const recentMoaByRecipe = {};
  const recentMoaAtByRecipe = {};
  const lastActivityByRecipe = {};
  const totalRoundsLoadedByRecipe = {};
  const totalRoundsFiredByRecipe = {};
  const noteActivity = (recipeId, createdAt) => {
    if (!createdAt) return;
    if (!lastActivityByRecipe[recipeId] || createdAt > lastActivityByRecipe[recipeId]) {
      lastActivityByRecipe[recipeId] = createdAt;
    }
  };
  for (const s of sessionsRes.data || []) {
    if (s.group_size_moa != null) {
      if (bestMoaByRecipe[s.recipe_id] == null || s.group_size_moa < bestMoaByRecipe[s.recipe_id]) {
        bestMoaByRecipe[s.recipe_id] = s.group_size_moa;
      }
      if (!recentMoaAtByRecipe[s.recipe_id] || s.created_at > recentMoaAtByRecipe[s.recipe_id]) {
        recentMoaAtByRecipe[s.recipe_id] = s.created_at;
        recentMoaByRecipe[s.recipe_id] = s.group_size_moa;
      }
    }
    totalRoundsFiredByRecipe[s.recipe_id] = (totalRoundsFiredByRecipe[s.recipe_id] ?? 0) + (s.rounds_fired || 0);
    noteActivity(s.recipe_id, s.created_at);
  }
  for (const b of batchesRes.data || []) {
    noteActivity(b.recipe_id, b.created_at);
    totalRoundsLoadedByRecipe[b.recipe_id] = (totalRoundsLoadedByRecipe[b.recipe_id] ?? 0) + (b.rounds_loaded || 0);
  }

  const componentLabel = (c) => (c ? `${c.brand} ${c.model}` : null);
  return (recipesRes.data || []).map((row) => {
    // Reuses the exact same per-component pricing math Dashboard's
    // costPerRound/totalMoneySpent/moneySaved use (see mapRecipeRow
    // below) — `row` here has the same shape (caliber_id,
    // charge_weight_grains, powder/bullet/primer/brass with .id) that
    // function expects, just fetched in bulk instead of one at a time.
    const costPerRound = calculateCostPerRound(row, inventoryMap);
    const totalRoundsLoaded = totalRoundsLoadedByRecipe[row.id] ?? 0;
    const factoryPricePerRound = row.factory_price_per_round ?? null;
    return {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      caliber: row.calibers?.name ?? null,
      firearm: row.firearm?.name ?? null,
      powder: componentLabel(row.powder),
      bullet: componentLabel(row.bullet),
      primer: componentLabel(row.primer),
      brass: componentLabel(row.brass),
      bestMoa: bestMoaByRecipe[row.id] ?? null,
      // Tightest group ever (bestMoa) vs. the most recent one measured
      // (recentMoa) are genuinely different questions — "how good has
      // this load ever shot" vs. "how's it shooting lately" — so both
      // get their own card field rather than picking one.
      recentMoa: recentMoaByRecipe[row.id] ?? null,
      costPerRound,
      totalMoneySpent: costPerRound != null ? costPerRound * totalRoundsLoaded : null,
      moneySaved:
        factoryPricePerRound != null && costPerRound != null
          ? (factoryPricePerRound - costPerRound) * totalRoundsLoaded
          : null,
      // Raw counts, not just the derived dollar figures above — Recipes
      // Home's card grid wants Rounds Fired directly, and its account-wide
      // totals row (see RecipesHomePage.jsx) sums these across every
      // recipe rather than issuing a separate aggregate query.
      totalRoundsLoaded,
      totalRoundsFired: totalRoundsFiredByRecipe[row.id] ?? 0,
      // Most recent Loading Session or Range Session logged for this recipe
      // — falls back to the recipe's own created_at (nothing logged yet
      // still has a meaningful "added on" date for sorting/display) rather
      // than null, which would read as broken instead of just "brand new."
      lastActivityAt: lastActivityByRecipe[row.id] ?? row.created_at,
    };
  });
}

/** The user's archived (soft-deleted) recipes — the flip side of
 * fetchUserRecipes above (`is_archived = true` instead of `false`).
 * Pulls in enough component context to show a real spec line per archived
 * recipe (caliber/powder/bullet), not just a bare title, so the Archived
 * Recipes view is actually useful for recognizing which one you're
 * looking at before restoring it — same embedded-join shape
 * fetchRecipeDetail uses, just without the range-session/inventory joins
 * this lighter list view doesn't need. Ordered newest-archived-first is
 * not possible (there's no `archived_at` column — see archiveRecipe
 * below, which only flips a boolean), so this orders by `created_at`
 * like the active list does; the "most recently deleted" ordering some
 * users might expect isn't available without a schema change. */
export async function fetchArchivedRecipes(userId) {
  const { data, error } = await supabase
    .from('load_recipes')
    .select(
      `
      id, title, created_at,
      calibers ( name ),
      powder:components!load_recipes_powder_id_fkey ( id, brand, model ),
      bullet:components!load_recipes_bullet_id_fkey ( id, brand, model )
    `
    )
    .eq('user_id', userId)
    .eq('is_archived', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const componentLabel = (c) => (c ? `${c.brand} ${c.model}` : null);
  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    caliber: row.calibers?.name ?? null,
    powder: componentLabel(row.powder),
    bullet: componentLabel(row.bullet),
  }));
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
 * tab's target history popup (see TargetHistoryModal.jsx). Includes
 * `shot_coordinates` (the plotted {x, y} points, if this session has any
 * — see schema_shot_coordinates.sql) so the popup can redraw the actual
 * shot holes on top of the photo, not just show the final group size.
 * Fetched lazily on open, same reasoning as fetchVelocityTrend above:
 * fetchRecipeDetail only ever pulls the single latest session, so a full
 * photo history needs its own query rather than bloating every recipe
 * load with data most views never show. */
export async function fetchTargetHistory(recipeId) {
  const { data, error } = await supabase
    .from('range_sessions')
    .select(
      'id, target_image_url, shot_coordinates, created_at, distance_yards, group_size_moa, group_size_inches, avg_velocity_fps, std_dev_fps, extreme_spread_fps, rounds_fired, firearm_id'
    )
    .eq('recipe_id', recipeId)
    .not('target_image_url', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Every Range Session logged for this recipe, newest first — the range-
 * day counterpart to fetchLoadingHistory, and deliberately NOT filtered
 * down to sessions with a target photo the way fetchTargetHistory above
 * is (that one only powers the "Last Target" photo popup). A Quick Log
 * session (see Dashboard's rangeMode) never has a photo, group, or
 * velocity data at all — just rounds fired — and still belongs in this
 * list; the UI tells the two kinds of row apart by checking whether
 * group_size_moa/avg_velocity_fps are null, not by a separate flag,
 * since "no group was measured" is the same honest state regardless of
 * which entry mode produced it. Powers the inline Range Session History
 * on the Range Day tab. */
export async function fetchRangeSessionHistory(recipeId) {
  const { data, error } = await supabase
    .from('range_sessions')
    .select(
      'id, distance_yards, group_size_moa, group_size_inches, avg_velocity_fps, std_dev_fps, extreme_spread_fps, rounds_fired, notes, created_at'
    )
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Every Loading Session (load_batches row) ever logged for this recipe,
 * newest first — the full bench history, as opposed to
 * fetchLastLoadingBatch above which only grabs the single most recent
 * one for the Overview tab's Recent Activity summary. Powers the
 * Loading History popup (see LoadingHistoryModal.jsx), opened by
 * clicking the "Last loaded" row of Recent Activity. Fetched lazily on
 * open, same reasoning as fetchTargetHistory/fetchVelocityTrend: most
 * Overview visits never need the full list, just the latest entry
 * fetchRecipeDetail already pulls in. */
export async function fetchLoadingHistory(recipeId) {
  const { data, error } = await supabase
    .from('load_batches')
    .select('id, rounds_loaded, notes, created_at')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Every Range Session for this recipe that logged a rounds_fired count,
 * grouped by calendar day (newest day first) — the range-side
 * counterpart to fetchLoadingHistory above. Grouped rather than a flat
 * per-session list because "how many times was this fired on a given
 * day" is naturally a day-level question, and a single day can have more
 * than one Range Session logged. Sessions with no rounds_fired recorded
 * are skipped (nothing to count), same treatment fetchVelocityTrend
 * gives sessions missing chrono data. Powers the Firing History popup
 * (see FiringHistoryModal.jsx), opened by clicking the "Last fired" row
 * of Recent Activity. Grouping is done here in JS rather than a
 * Postgres-side GROUP BY since `created_at` is a full timestamp and the
 * "day" boundary should follow the user's local calendar day, not UTC. */
export async function fetchFiringHistory(recipeId) {
  const { data, error } = await supabase
    .from('range_sessions')
    .select('rounds_fired, created_at')
    .eq('recipe_id', recipeId)
    .not('rounds_fired', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const byDay = new Map();
  (data || []).forEach((s) => {
    // Local calendar day the session was logged on, as a stable sort/
    // group key — toLocaleDateString() alone isn't safely sortable
    // across locales, so key on the ISO date portion instead.
    const dayKey = new Date(s.created_at).toISOString().slice(0, 10);
    const existing = byDay.get(dayKey) || { date: dayKey, roundsFired: 0, sessionCount: 0 };
    existing.roundsFired += s.rounds_fired || 0;
    existing.sessionCount += 1;
    byDay.set(dayKey, existing);
  });
  return Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
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

function mapRecipeRow(row, latestSession, measuredSession, shots, inventory, roundsOnHand, totalRoundsLoaded, lastBatch) {
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
    // These seven fields deliberately read from measuredSession, NOT
    // latestSession — a Quick Log session (see Dashboard's rangeMode) can
    // easily be the most recent range trip while having none of this
    // data, and pulling from whichever session is merely newest was
    // nulling out the Overview hero card the moment one got logged (see
    // the Range Day overhaul follow-up in the progress log). measuredSession
    // is the most recent session that actually HAS a group size or
    // velocity reading, which may be an older session than the true
    // latest one below.
    distanceYards: measuredSession?.distance_yards ?? 100,
    groupSizeMoa: measuredSession?.group_size_moa ?? null,
    // Companion to groupSizeMoa above — MOA alone means nothing without
    // knowing the distance it was measured at, and plenty of shooters
    // think in inches at the actual distance shot rather than doing MOA
    // math in their head. Shown alongside MOA wherever group size renders
    // (see the Range Day reference card / history list).
    groupSizeInches: measuredSession?.group_size_inches ?? null,
    avgVelocity: measuredSession?.avg_velocity_fps ?? null,
    stdDevFps: measuredSession?.std_dev_fps ?? null,
    extremeSpread: measuredSession?.extreme_spread_fps ?? null,
    targetImageUrl: measuredSession?.target_image_url ?? null,
    // Date the above seven fields actually came from — NOT necessarily
    // the same as lastFiredAt below, if the most recent trip(s) were
    // Quick Logs. Lets the Range Day reference card be honest about
    // "this group is from X, your last trip out was Y" instead of
    // implying the group/velocity numbers are as fresh as the most
    // recent session.
    lastMeasuredAt: measuredSession?.created_at ?? null,
    costPerRound,
    // Total spent loading this recipe, lifetime — Cost/Round × every round
    // EVER logged as loaded (fetchTotalRoundsLoaded), same rounds-loaded
    // basis Money Saved uses just below and for the same reason: cost is
    // locked in the moment components get consumed at the bench, not when
    // the round eventually gets fired, so this shouldn't shrink or hide
    // spend just because some of that ammo hasn't been shot yet. `null`
    // (not "$0.00") when Cost/Round itself is unknown — some component
    // still needs a saved Inventory price — vs. a legitimate $0.00 once
    // pricing is known but nothing's been loaded yet.
    totalMoneySpent: costPerRound != null ? costPerRound * (totalRoundsLoaded ?? 0) : null,
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
    // This one intentionally follows latestSession, not measuredSession —
    // a Quick Log session is still a real, most-recent choice of firearm,
    // unlike the group/velocity fields above which a Quick Log never has.
    defaultFirearmId: latestSession?.firearm_id ?? row.firearm_id ?? null,
    shots: shots ?? [],
    // Free-text notes captured at recipe creation (see RecipeForm.jsx) —
    // selected by fetchRecipeDetail's query but previously never mapped
    // into the view model, so nothing could render it. Now shown +
    // inline-editable on the Overview tab (see RecipeNotesCard.jsx).
    notes: row.notes || '',
    // "Recent Activity" summary on Overview — last time this recipe was
    // loaded at the bench vs. last time it was fired at the range. Both
    // independently null if that side has never happened yet. Follows
    // latestSession (the true most recent trip, Quick Log included) —
    // "last fired" should say when you actually last went, not silently
    // skip over a Quick Log to report an older measured session's date.
    lastLoadedAt: lastBatch?.created_at ?? null,
    lastLoadedRounds: lastBatch?.rounds_loaded ?? null,
    lastFiredAt: latestSession?.created_at ?? null,
    lastFiredRounds: latestSession?.rounds_fired ?? null,
    // Lets the UI distinguish "last trip had no group/velocity data
    // because it was a Quick Log" from "last trip legitimately has no
    // data yet" — used by the Range Day reference card to explain why
    // lastFiredAt and lastMeasuredAt above might point at two different
    // sessions.
    lastFiredWasQuickLog:
      latestSession != null &&
      latestSession.group_size_moa == null &&
      latestSession.avg_velocity_fps == null,
    // 'private' | 'unlisted' | 'public' — see schema.sql's original
    // load_recipes.visibility column and schema_public_recipes.sql for the
    // RLS policies that make 'public'/'unlisted' actually readable by an
    // anonymous visitor. Defaults to 'private' at the DB level, so this
    // should never actually be null/undefined for a real saved row, but
    // the mock demo recipe doesn't set it — fall back to 'private' so
    // nothing downstream (RecipeForm, the share-link logic in
    // TargetExportModal) has to null-check it separately.
    visibility: row.visibility || 'private',
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
      id, title, caliber_id, charge_weight_grains, coal_inches, rifle_model, firearm_id, notes, factory_price_per_round, visibility,
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

  // The true most-recent session (above) is what "last fired"/the default
  // firearm pick should follow — a Quick Log session (see Dashboard's
  // rangeMode) is a completely real, most-recent trip to the range. But
  // it never has a group size or velocity reading, and a naive "pull MOA/
  // FPS from whichever session is newest" was nulling out the Overview
  // hero card the moment someone logged one (see the Range Day overhaul
  // follow-up in the progress log). So the display fields that describe
  // load PERFORMANCE — group size, velocity stats, the distance/photo
  // that go with them — instead follow whichever session is most recent
  // AND actually has one of those two measurements, which may be an
  // older session than `latestSession` if the most recent trip(s) were
  // Quick Logs. Skipped entirely (no extra query) if the latest session
  // already qualifies, since it's then the same row either way.
  let measuredSession = latestSession;
  if (latestSession && latestSession.group_size_moa == null && latestSession.avg_velocity_fps == null) {
    const { data: measuredSessions, error: measuredError } = await supabase
      .from('range_sessions')
      .select('*')
      .eq('recipe_id', recipeId)
      .or('group_size_moa.not.is.null,avg_velocity_fps.not.is.null')
      .order('created_at', { ascending: false })
      .limit(1);
    if (measuredError) throw measuredError;
    measuredSession = measuredSessions?.[0] ?? null;
  }

  let shots = [];
  if (measuredSession) {
    const { data: shotRows, error: shotError } = await supabase
      .from('shot_logs')
      .select('velocity_fps')
      .eq('session_id', measuredSession.id)
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

  return mapRecipeRow(row, latestSession, measuredSession, shots, inventory, roundsOnHand, totalRoundsLoaded, lastBatch);
}

/** The anonymous-safe counterpart to fetchRecipeDetail, powering the
 * Public Recipe Page (see PublicRecipePage.jsx / the `/r/:id` route in
 * App.jsx). Deliberately does NOT reuse fetchRecipeDetail — it never
 * passes a userId (there may not be a signed-in session at all, and even
 * if there is one, Cost/Round and Money Saved are the VIEWER's private
 * inventory pricing question, not something to compute or show on a
 * stranger's shared recipe), and it never touches
 * load_batches/user_inventory (owner-only tables with no public RLS
 * policy — see schema_public_recipes.sql, which only opens up
 * range_sessions/shot_logs, not those).
 *
 * Relies entirely on RLS to enforce "only public/unlisted, non-archived
 * recipes are visible" — the explicit .eq('is_archived', false) below is
 * a defensive belt-and-suspenders check, not what's actually doing the
 * access control. A private recipe, or one that doesn't exist, comes back
 * as .single() erroring (0 rows) exactly like it would for a genuinely
 * missing id — callers can't distinguish "private" from "doesn't exist,"
 * which is the correct, boring answer for a share link (no need to leak
 * "there's something here, it's just private" to a stranger). */
export async function fetchPublicRecipeDetail(recipeId) {
  const { data: row, error } = await supabase
    .from('load_recipes')
    .select(
      `
      id, title, caliber_id, charge_weight_grains, coal_inches, notes, visibility, created_at,
      calibers ( name ),
      powder:components!load_recipes_powder_id_fkey ( brand, model ),
      bullet:components!load_recipes_bullet_id_fkey ( brand, model ),
      primer:components!load_recipes_primer_id_fkey ( brand, model ),
      brass:components!load_recipes_brass_id_fkey ( brand, model ),
      author:profiles ( username )
    `
    )
    .eq('id', recipeId)
    .eq('is_archived', false)
    .single();
  if (error) throw error;

  // Same fix as fetchRecipeDetail above (see the Range Day overhaul
  // follow-up in the progress log): only ever pull performance stats from
  // a session that actually has a group size or velocity reading, so a
  // Quick Log session (rounds fired, no measurements) logged after the
  // last real measured session doesn't null out a shared recipe's stats
  // for whoever's viewing the public link.
  const { data: sessions, error: sessionError } = await supabase
    .from('range_sessions')
    .select('distance_yards, group_size_moa, avg_velocity_fps, std_dev_fps, extreme_spread_fps, target_image_url, created_at')
    .eq('recipe_id', recipeId)
    .or('group_size_moa.not.is.null,avg_velocity_fps.not.is.null')
    .order('created_at', { ascending: false })
    .limit(1);
  if (sessionError) throw sessionError;
  const latestSession = sessions?.[0] ?? null;

  const componentLabel = (c) => (c ? `${c.brand} ${c.model}` : null);
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
    notes: row.notes || '',
    visibility: row.visibility,
    createdAt: row.created_at,
    authorUsername: row.author?.username || 'a Precision Load Vault user',
    distanceYards: latestSession?.distance_yards ?? null,
    groupSizeMoa: latestSession?.group_size_moa ?? null,
    avgVelocity: latestSession?.avg_velocity_fps ?? null,
    stdDevFps: latestSession?.std_dev_fps ?? null,
    extremeSpread: latestSession?.extreme_spread_fps ?? null,
    targetImageUrl: latestSession?.target_image_url ?? null,
  };
}

/** Soft-delete a recipe (sets is_archived = true rather than a hard DELETE,
 * so any range_sessions/shot_logs history isn't lost and the row can be
 * recovered later if needed). RLS's "Users manage own recipes" policy
 * covers the UPDATE. */
export async function archiveRecipe(recipeId) {
  const { error } = await supabase.from('load_recipes').update({ is_archived: true }).eq('id', recipeId);
  if (error) throw error;
}

/** Un-archive a recipe (sets is_archived = false) — the other half of
 * archiveRecipe above. Since deleting was always a soft delete, restoring
 * is just flipping the same flag back; nothing else needs to change, and
 * the recipe's full history (loading sessions, range sessions, shot logs)
 * was never touched by archiving in the first place, so it comes back
 * exactly as it was. RLS's "Users manage own recipes" policy covers the
 * UPDATE. */
export async function restoreRecipe(recipeId) {
  const { error } = await supabase.from('load_recipes').update({ is_archived: false }).eq('id', recipeId);
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
      visibility: fields.visibility || 'private',
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
      visibility: fields.visibility || 'private',
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
 * "STORAGE BUCKET SECURITY" in supabase/schema.sql). Nothing currently
 * updates or hard-deletes a range_sessions row after it's created, so
 * there's no orphaned-file cleanup to do yet — if that ever changes,
 * clean up the old file the same way deleteFirearmPhoto in
 * lib/firearms.js does (the real Storage API from application code, not
 * a database trigger — see schema_fix_storage_delete.sql for why a
 * trigger can't do this on Supabase). */
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
 * TargetCalculator.jsx). Note `shots` here is chrono VELOCITY readings
 * (fps, one per shot_logs row) — a completely different thing from
 * `shotCoordinates`, the {x, y} points plotted on the target photo itself
 * (see TargetCalculator.jsx's `shots` state, which is coordinates — this
 * function just uses a different name to keep the two apart). `roundsFired`
 * — how many rounds were actually shot today, separate from how many got a
 * chrono reading — is persisted so it can draw down `roundsOnHand` (see
 * fetchRoundsOnHand above); unlike the old behavior, saving a range session
 * no longer deducts raw component stock on its own (see
 * supabase/schema_batches.sql). `firearmId` — which firearm profile this
 * session's rounds were fired through, optional — is what actually drives
 * a firearm's tracked round count/barrel life (see lib/firearms.js); it's
 * a per-session choice, not
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
  shotCoordinates,
  imageBlob,
  roundsFired,
  firearmId,
  notes,
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
      // Was `distanceYards ?? 100` — that default made sense back when
      // every session went through Target Analysis and had a real
      // distance one way or another. A Quick Log session (see Dashboard's
      // rangeMode) never collects a distance at all, so forcing it to
      // "100" would show a fabricated number in history instead of
      // honestly having none. Full Session still always supplies a real
      // value here (sessionDistanceYards itself defaults to 100 upstream).
      distance_yards: distanceYards ?? null,
      group_size_moa: groupSizeMoa,
      group_size_inches: groupInches,
      avg_velocity_fps: avgVelocity != null ? Math.round(avgVelocity) : null,
      std_dev_fps: stdDevFps,
      extreme_spread_fps: extremeSpread,
      target_image_url: targetImageUrl,
      shot_coordinates: shotCoordinates && shotCoordinates.length ? shotCoordinates : null,
      rounds_fired: roundsFired ?? null,
      firearm_id: firearmId || null,
      notes: notes || null,
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
