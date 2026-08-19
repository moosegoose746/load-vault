import { supabase } from './supabaseClient.js';

// Personal component pricing/stock — see supabase/schema_inventory.sql for
// why this is a separate per-user table rather than reusing the shared
// `components.unit_cost` catalog field, and for the catalog-linked vs.
// custom/freeform row design.

/** Every non-deleted catalog component (all types), for the Inventory
 * page's "add a row" dropdown — separate from fetchComponentsByType in
 * recipes.js, which only fetches one type at a time for the New Recipe
 * form's dropdowns. */
export async function fetchAllComponents() {
  const { data, error } = await supabase
    .from('components')
    .select('id, type, brand, model')
    .eq('is_deleted', false)
    .order('type')
    .order('brand');
  if (error) throw error;
  return data;
}

/** This user's saved inventory rows, each joined with its catalog
 * component (when it has one), for rendering the spreadsheet-style
 * Inventory page. A row is either catalog-linked (row.component set) or
 * custom/freeform (row.custom_name/row.custom_type set, row.component
 * null) — see schema_inventory.sql. */
export async function fetchUserInventoryRows(userId) {
  const { data, error } = await supabase
    .from('user_inventory')
    .select('*, component:components ( id, type, brand, model )')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** This user's saved price/stock entries for CATALOG components only,
 * keyed by component_id — the shape recipes.js's cost-per-round
 * calculation needs. Custom/freeform rows aren't linked to any recipe's
 * component_id, so they're intentionally excluded here (they don't affect
 * Cost/Round on a recipe, only the Inventory page's own display). */
export async function fetchUserInventoryMap(userId) {
  const { data, error } = await supabase
    .from('user_inventory')
    .select('*')
    .eq('user_id', userId)
    .not('component_id', 'is', null);
  if (error) throw error;
  const byComponentId = {};
  (data || []).forEach((row) => {
    byComponentId[row.component_id] = row;
  });
  return byComponentId;
}

/** Add a new inventory row — either catalog-linked (pass componentId) or
 * custom/freeform (pass customName + customType instead). */
export async function addInventoryEntry(userId, fields) {
  const { data, error } = await supabase
    .from('user_inventory')
    .insert({
      user_id: userId,
      component_id: fields.componentId || null,
      custom_name: fields.componentId ? null : fields.customName,
      custom_type: fields.componentId ? null : fields.customType,
      unit_cost: fields.unitCost,
      package_qty: fields.packageQty,
      quantity_on_hand: fields.quantityOnHand ?? null,
      reload_cycles: fields.reloadCycles ?? null,
      caliber: fields.caliber || null,
      primer_size: fields.primerSize || null,
      notes: fields.notes || null,
    })
    .select('*, component:components ( id, type, brand, model )')
    .single();
  if (error) throw error;
  return data;
}

/** Update an existing row's editable fields (price/qty/reload cycles/
 * cycles used/caliber/primer size) by its own id — component/custom
 * identity isn't editable once created; delete and re-add instead.
 * `cyclesUsed` is only meaningful for brass, `caliber` for bullet/brass,
 * `primerSize` for primer, but harmless to send as null for other
 * types. */
export async function updateInventoryEntry(rowId, fields) {
  const { data, error } = await supabase
    .from('user_inventory')
    .update({
      unit_cost: fields.unitCost,
      package_qty: fields.packageQty,
      quantity_on_hand: fields.quantityOnHand ?? null,
      reload_cycles: fields.reloadCycles ?? null,
      cycles_used: fields.cyclesUsed ?? 0,
      caliber: fields.caliber || null,
      primer_size: fields.primerSize || null,
      notes: fields.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .select('*, component:components ( id, type, brand, model )')
    .single();
  if (error) throw error;
  return data;
}

/** Remove a saved inventory row entirely. */
export async function deleteInventoryEntry(rowId) {
  const { error } = await supabase.from('user_inventory').delete().eq('id', rowId);
  if (error) throw error;
}

// --- Low stock / brass retirement flags --------------------------------

/** A row counts as "running low" once what's on hand drops under this
 * fraction of a full package — e.g. under 20% of however much you
 * normally buy at once. Deliberately relative rather than a fixed number,
 * since "low" means something very different for a box of 100 primers vs.
 * an 8lb jug of powder. Applies to Qty On Hand for every type, including
 * brass (case count) — separate from cycles_used/reload_cycles below,
 * which is about a batch of brass wearing out, not how many cases you
 * own. */
export const LOW_STOCK_RATIO = 0.2;

export function isLowStock(row) {
  if (row.quantity_on_hand == null || !row.package_qty) return false;
  return row.quantity_on_hand < row.package_qty * LOW_STOCK_RATIO;
}

/** Brass only: true once a batch has been fired at least as many times as
 * its own estimated reload_cycles ceiling — a signal to inspect/retire
 * those cases, not a hard cutoff. */
export function isBrassNearingRetirement(row) {
  return row.reload_cycles != null && row.cycles_used != null && row.cycles_used >= row.reload_cycles;
}

// --- Automated deduction on logging a Loading Session ------------------
//
// Components get used up when a batch is actually LOADED, not when it's
// fired — see supabase/schema_batches.sql for the full reasoning (loading
// and shooting are two separate events, since a batch might sit loaded
// for weeks before any of it gets fired, and a single range day might
// only fire part of one). So this deduction now runs off "Rounds Loaded"
// on Dashboard's "Log a Loading Session" panel (previously it ran off
// "Total Rounds Fired" on the range-session save — renamed from
// computeSessionDeduction/applySessionDeduction accordingly). A preview
// of exactly what will change is shown *before* anything is written.
//
// Brass is handled differently from powder/bullet/primer: loading a round
// doesn't reduce how many cases you physically own (you still have the
// brass — it's the powder/bullet/primer that get consumed) — instead it
// increments a `cycles_used` counter, compared against that row's own
// `reload_cycles` estimate to flag a batch nearing retirement (see
// isBrassNearingRetirement above).

export const GRAINS_PER_LB = 7000;

/** Pure preview calculation — no network calls, safe to recompute on every
 * keystroke of the Rounds Loaded field. `recipeComponents` is
 * { powderId, powderLabel, chargeGrains, bulletId, bulletLabel, primerId,
 * primerLabel, brassId, brassLabel } (see mapRecipeRow in recipes.js).
 * `inventoryMap` is from fetchUserInventoryMap (component_id -> row).
 * Returns one line per component slot that's actually filled in on the
 * recipe. Powder/bullet/primer lines have `kind: 'consume'`; the brass
 * line (if any) has `kind: 'cycles'` and different fields (see below).
 * `tracked: false` means there's nothing to write for that line (no
 * inventory row at all, or — for consume lines only — no Qty On Hand
 * set) — those lines still show in the preview so it's obvious nothing
 * will happen for them, but are skipped by applyBatchDeduction. */
export function computeBatchDeduction(recipeComponents, inventoryMap, roundsLoaded) {
  const rounds = Number(roundsLoaded);
  if (!Number.isFinite(rounds) || rounds <= 0) return [];

  const lines = [];

  const pushConsumeLine = (componentId, label, type, perRoundAmount, unitLabel) => {
    if (!componentId) return;
    const totalAmount = perRoundAmount * rounds;
    const entry = inventoryMap?.[componentId];
    if (!entry || entry.quantity_on_hand == null) {
      lines.push({ componentId, label, type, totalAmount, unitLabel, tracked: false, kind: 'consume' });
      return;
    }
    const newQty = Math.max(0, entry.quantity_on_hand - totalAmount);
    lines.push({
      componentId,
      rowId: entry.id,
      label,
      type,
      totalAmount,
      unitLabel,
      tracked: true,
      kind: 'consume',
      currentQty: entry.quantity_on_hand,
      newQty,
    });
  };

  const pushBrassCycleLine = (componentId, label) => {
    if (!componentId) return;
    const entry = inventoryMap?.[componentId];
    if (!entry) {
      lines.push({ componentId, label, type: 'brass', totalAmount: rounds, unitLabel: 'firings', tracked: false, kind: 'cycles' });
      return;
    }
    const currentCycles = entry.cycles_used ?? 0;
    const newCycles = currentCycles + rounds;
    lines.push({
      componentId,
      rowId: entry.id,
      label,
      type: 'brass',
      totalAmount: rounds,
      unitLabel: 'firings',
      tracked: true,
      kind: 'cycles',
      currentCycles,
      newCycles,
      maxCycles: entry.reload_cycles ?? null,
      nearingRetirement: entry.reload_cycles != null && newCycles >= entry.reload_cycles,
    });
  };

  pushConsumeLine(recipeComponents.powderId, recipeComponents.powderLabel, 'powder', recipeComponents.chargeGrains ?? 0, 'grains');
  pushConsumeLine(recipeComponents.bulletId, recipeComponents.bulletLabel, 'bullet', 1, 'count');
  pushConsumeLine(recipeComponents.primerId, recipeComponents.primerLabel, 'primer', 1, 'count');
  pushBrassCycleLine(recipeComponents.brassId, recipeComponents.brassLabel);

  return lines;
}

/** Actually write the deduction — only the `tracked: true` lines from
 * computeBatchDeduction have anything to update. Best-effort per line
 * (one failed row doesn't roll back the others, since this always runs
 * after the load_batches row itself already saved successfully — losing a
 * stock update shouldn't make it look like the batch wasn't logged). */
export async function applyBatchDeduction(userId, lines) {
  const trackedLines = (lines || []).filter((l) => l.tracked);
  const results = await Promise.allSettled(
    trackedLines.map((line) => {
      const update =
        line.kind === 'cycles'
          ? { cycles_used: line.newCycles, updated_at: new Date().toISOString() }
          : { quantity_on_hand: line.newQty, updated_at: new Date().toISOString() };
      return supabase.from('user_inventory').update(update).eq('id', line.rowId).eq('user_id', userId);
    })
  );
  const failed = results.filter((r) => r.status === 'rejected' || r.value?.error);
  if (failed.length) {
    console.error('Some inventory deductions failed to save', failed);
  }
  return { succeeded: trackedLines.length - failed.length, failed: failed.length };
}
