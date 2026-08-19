import { supabase } from './supabaseClient.js';

// Personal component pricing/stock — see supabase/schema_inventory.sql for
// why this is a separate per-user table rather than reusing the shared
// `components.unit_cost` catalog field.

/** Every non-deleted catalog component (all types), for the Inventory
 * page's list — separate from fetchComponentsByType in recipes.js, which
 * only fetches one type at a time for the New Recipe form's dropdowns. */
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

/** This user's saved price/stock entries, keyed by component_id for easy
 * lookup when rendering the Inventory page or computing a recipe's
 * cost-per-round. */
export async function fetchUserInventory(userId) {
  const { data, error } = await supabase.from('user_inventory').select('*').eq('user_id', userId);
  if (error) throw error;
  const byComponentId = {};
  (data || []).forEach((row) => {
    byComponentId[row.component_id] = row;
  });
  return byComponentId;
}

/** Create or update this user's price/stock entry for one component
 * (upsert on the (user_id, component_id) unique constraint — see
 * schema_inventory.sql). */
export async function saveInventoryEntry(userId, componentId, fields) {
  const { data, error } = await supabase
    .from('user_inventory')
    .upsert(
      {
        user_id: userId,
        component_id: componentId,
        unit_cost: fields.unitCost,
        package_qty: fields.packageQty,
        quantity_on_hand: fields.quantityOnHand ?? null,
        reload_cycles: fields.reloadCycles ?? null,
        notes: fields.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,component_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Clear a saved price entry for a component, reverting it to "no pricing
 * data" (cost-per-round shows `—` again for any recipe using it). */
export async function deleteInventoryEntry(userId, componentId) {
  const { error } = await supabase
    .from('user_inventory')
    .delete()
    .eq('user_id', userId)
    .eq('component_id', componentId);
  if (error) throw error;
}
