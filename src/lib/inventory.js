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
      notes: fields.notes || null,
    })
    .select('*, component:components ( id, type, brand, model )')
    .single();
  if (error) throw error;
  return data;
}

/** Update an existing row's editable fields (price/qty/reload cycles) by
 * its own id — component/custom identity isn't editable once created;
 * delete and re-add instead. */
export async function updateInventoryEntry(rowId, fields) {
  const { data, error } = await supabase
    .from('user_inventory')
    .update({
      unit_cost: fields.unitCost,
      package_qty: fields.packageQty,
      quantity_on_hand: fields.quantityOnHand ?? null,
      reload_cycles: fields.reloadCycles ?? null,
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

// --- Automated deduction on Save to Vault -----------------------------
//
// Range-day shot counts are inherently a little fuzzy (sighters, warm-up
// rounds, shots that never got chrono'd) — so deduction is built around a
// single editable "Total Rounds Fired" number the user confirms at save
// time, defaulted from the velocity log but not required to match it, and
// a preview of exactly what will change *before* anything is written. See
// computeSessionDeduction (pure, for the preview) and
// applySessionDeduction (the actual write) below, both used from
// Dashboard's Save to Vault flow.

export const GRAINS_PER_LB = 7000;

/** Pure preview calculation — no network calls, safe to recompute on every
 * keystroke of the Rounds Fired field. `recipeComponents` is
 * { powderId, powderLabel, chargeGrains, bulletId, bulletLabel, primerId,
 * primerLabel, brassId, brassLabel } (see mapRecipeRow in recipes.js).
 * `inventoryMap` is from fetchUserInventoryMap (component_id -> row).
 * Returns one line per component slot that's actually filled in on the
 * recipe; `tracked: false` means that component either isn't in the
 * user's inventory at all or has no Qty On Hand set, so there's nothing
 * to subtract from — those lines still show in the preview (so it's
 * obvious nothing will happen for them) but are skipped by
 * applySessionDeduction. */
export function computeSessionDeduction(recipeComponents, inventoryMap, roundsFired) {
  const rounds = Number(roundsFired);
  if (!Number.isFinite(rounds) || rounds <= 0) return [];

  const lines = [];
  const pushLine = (componentId, label, type, perRoundAmount, unitLabel) => {
    if (!componentId) return;
    const totalAmount = perRoundAmount * rounds;
    const entry = inventoryMap?.[componentId];
    if (!entry || entry.quantity_on_hand == null) {
      lines.push({ componentId, label, type, totalAmount, unitLabel, tracked: false });
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
      currentQty: entry.quantity_on_hand,
      newQty,
    });
  };

  pushLine(recipeComponents.powderId, recipeComponents.powderLabel, 'powder', recipeComponents.chargeGrains ?? 0, 'grains');
  pushLine(recipeComponents.bulletId, recipeComponents.bulletLabel, 'bullet', 1, 'count');
  pushLine(recipeComponents.primerId, recipeComponents.primerLabel, 'primer', 1, 'count');
  pushLine(recipeComponents.brassId, recipeComponents.brassLabel, 'brass', 1, 'count');
  return lines;
}

/** Actually write the deduction — only the `tracked: true` lines from
 * computeSessionDeduction have anything to update. Best-effort per line
 * (one failed row doesn't roll back the others, since this always runs
 * after the range session itself already saved successfully — losing a
 * stock update shouldn't make it look like the session wasn't logged). */
export async function applySessionDeduction(userId, lines) {
  const trackedLines = (lines || []).filter((l) => l.tracked);
  const results = await Promise.allSettled(
    trackedLines.map((line) =>
      supabase
        .from('user_inventory')
        .update({ quantity_on_hand: line.newQty, updated_at: new Date().toISOString() })
        .eq('id', line.rowId)
        .eq('user_id', userId)
    )
  );
  const failed = results.filter((r) => r.status === 'rejected' || r.value?.error);
  if (failed.length) {
    console.error('Some inventory deductions failed to save', failed);
  }
  return { succeeded: trackedLines.length - failed.length, failed: failed.length };
}
