import { supabase } from './supabaseClient.js';

/** Whether this account has done each of the "Getting Started" steps that
 * aren't already known for free elsewhere — used by GettingStartedCard.jsx.
 * `hasRecipe` isn't checked here: App.jsx already has `userRecipes` loaded
 * for the Sidebar's recipe switcher, so that step is derived from
 * `userRecipes.length > 0` instead of a redundant query.
 *
 * Each check here is a `head: true` count query (no rows returned, just a
 * count) rather than a real fetch of firearms/inventory data — cheap, and
 * this only ever runs for an account that hasn't dismissed/completed
 * onboarding yet (see the `onboarding_dismissed` profile flag), so it's
 * not an ongoing cost once someone's past this stage. */
export async function fetchOnboardingProgress(userId) {
  const [firearmResult, inventoryResult] = await Promise.all([
    supabase.from('firearms').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('user_inventory').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  if (firearmResult.error) throw firearmResult.error;
  if (inventoryResult.error) throw inventoryResult.error;
  return {
    hasFirearm: (firearmResult.count || 0) > 0,
    hasInventory: (inventoryResult.count || 0) > 0,
  };
}
