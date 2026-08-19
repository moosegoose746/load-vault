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
