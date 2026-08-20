import { supabase } from './supabaseClient.js';
import { compressFirearmPhoto } from './imageCompression.js';

// Firearm Profiles — see supabase/schema_firearms.sql for the full design
// rationale. Short version: one caliber per profile, a firearm is picked
// per Range Session (not locked to a recipe) so round count/barrel life
// stay accurate even if a recipe gets tested across more than one rifle,
// and round count is always computed fresh from real session history —
// never a stored mutable counter — same philosophy as Rounds On Hand in
// lib/recipes.js.

/** This user's firearm profiles, joined with caliber name, alphabetical
 * by name (unlike recipes/inventory, these are a static reference list
 * someone wants to find by name, not a recency-ordered feed). */
export async function fetchUserFirearms(userId) {
  const { data, error } = await supabase
    .from('firearms')
    .select('*, caliber:calibers ( id, name )')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** How many rounds have been fired through each firearm, per the app's
 * own range-session history — grouped client-side rather than one query
 * per firearm. Returns a map of firearm_id -> rounds fired (only
 * sessions with both a firearm_id and a rounds_fired value count; older
 * sessions logged before this feature existed just won't contribute).
 * Add each firearm's own `starting_round_count` on top of this to get
 * the real total — see totalRoundsForFirearm below. */
export async function fetchRoundsFiredByFirearm(userId) {
  const { data, error } = await supabase
    .from('range_sessions')
    .select('firearm_id, rounds_fired')
    .eq('user_id', userId)
    .not('firearm_id', 'is', null);
  if (error) throw error;
  const byFirearm = {};
  (data || []).forEach((s) => {
    byFirearm[s.firearm_id] = (byFirearm[s.firearm_id] || 0) + (s.rounds_fired || 0);
  });
  return byFirearm;
}

/** How many recipes and range sessions currently point at this firearm
 * profile — used to warn before deleting it, since both links use
 * ON DELETE SET NULL (see schema_firearms.sql/schema_recipes_v2.sql):
 * the recipes and sessions themselves are never touched, they just stop
 * being linked to this firearm once it's gone. Archived recipes are
 * excluded since they're already out of the active list. */
export async function countFirearmReferences(firearmId) {
  const [recipeResult, sessionResult] = await Promise.all([
    supabase
      .from('load_recipes')
      .select('id', { count: 'exact', head: true })
      .eq('firearm_id', firearmId)
      .eq('is_archived', false),
    supabase.from('range_sessions').select('id', { count: 'exact', head: true }).eq('firearm_id', firearmId),
  ]);
  if (recipeResult.error) throw recipeResult.error;
  if (sessionResult.error) throw sessionResult.error;
  return { recipeCount: recipeResult.count || 0, sessionCount: sessionResult.count || 0 };
}

/** Total rounds a firearm has seen — its own starting count (rounds it
 * had before you started tracking it here) plus everything logged
 * through the app since. */
export function totalRoundsForFirearm(firearm, roundsFiredByFirearm) {
  const appTracked = roundsFiredByFirearm?.[firearm.id] || 0;
  return (firearm.starting_round_count || 0) + appTracked;
}

/** 0-100, or null if no barrel life estimate has been set — how far
 * through its estimated life this firearm's barrel is. Clamped at 100
 * rather than reporting e.g. 140% — the estimate is a rough target, not
 * something worth showing as "over-shot" numerically once it's already
 * flagged as nearing/at end of life (see isNearingBarrelLife). */
export function barrelLifePercentUsed(firearm, totalRounds) {
  if (!firearm.estimated_barrel_life) return null;
  return Math.min(100, Math.round((totalRounds / firearm.estimated_barrel_life) * 100));
}

/** True once a firearm's tracked round count has reached its own
 * estimated barrel life — a signal to keep an eye on accuracy/throat
 * erosion, not a hard cutoff (mirrors isBrassNearingRetirement in
 * lib/inventory.js). */
export function isNearingBarrelLife(firearm, totalRounds) {
  return firearm.estimated_barrel_life != null && totalRounds >= firearm.estimated_barrel_life;
}

/** "Fun stats" for a single firearm's detail view — how many range
 * sessions it's been used for, the best (smallest) group size ever shot
 * with it, and a breakdown of which recipes have been fired through it
 * and how many rounds each. All derived from range_sessions rows already
 * being logged; nothing new to track. `load_recipes(title)` is an
 * embedded join — RLS on load_recipes already lets the owning user read
 * their own recipes, so this works the same as any other own-data read. */
export async function fetchFirearmStats(firearmId) {
  const { data, error } = await supabase
    .from('range_sessions')
    .select('recipe_id, rounds_fired, group_size_moa, load_recipes ( title )')
    .eq('firearm_id', firearmId);
  if (error) throw error;
  const sessions = data || [];

  const sessionCount = sessions.length;
  const bestGroupMoa = sessions.reduce(
    (best, s) => (s.group_size_moa != null && (best == null || s.group_size_moa < best) ? s.group_size_moa : best),
    null
  );

  // Keyed by recipe_id (not title) so the UI can link each entry back to
  // the actual recipe — a plain title string had nothing to link to.
  const roundsByRecipe = {};
  sessions.forEach((s) => {
    if (!s.recipe_id) return;
    const title = s.load_recipes?.title || 'Unknown recipe';
    if (!roundsByRecipe[s.recipe_id]) roundsByRecipe[s.recipe_id] = { recipeId: s.recipe_id, title, rounds: 0 };
    roundsByRecipe[s.recipe_id].rounds += s.rounds_fired || 0;
  });
  const recipesUsed = Object.values(roundsByRecipe).sort((a, b) => b.rounds - a.rounds);

  return { sessionCount, bestGroupMoa, recipesUsed };
}

/** Upload a compressed firearm photo to Supabase Storage and return its
 * public URL — same pattern as uploadTargetImage in lib/recipes.js, just
 * a different bucket/compression profile (see compressFirearmPhoto). */
async function uploadFirearmPhoto(file, userId) {
  const compressed = await compressFirearmPhoto(file);
  const path = `${userId}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from('firearm-images').upload(path, compressed, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('firearm-images').getPublicUrl(path);
  return data.publicUrl;
}

/** Create a new firearm profile. `photoFile`, if given, is a raw File
 * from an <input type="file"> — compressed and uploaded here, so callers
 * don't need to know about the storage/compression details. */
export async function createFirearm(userId, fields, photoFile) {
  let photoUrl = null;
  if (photoFile) {
    try {
      photoUrl = await uploadFirearmPhoto(photoFile, userId);
    } catch (err) {
      console.error('Failed to upload firearm photo', err);
      // Don't let a failed photo upload block saving the profile itself.
    }
  }
  const { data, error } = await supabase
    .from('firearms')
    .insert({
      user_id: userId,
      name: fields.name,
      caliber_id: fields.caliberId,
      make: fields.make || null,
      model: fields.model || null,
      optic: fields.optic || null,
      barrel_length_inches: fields.barrelLengthInches ?? null,
      twist_rate: fields.twistRate || null,
      starting_round_count: fields.startingRoundCount ?? 0,
      estimated_barrel_life: fields.estimatedBarrelLife ?? null,
      notes: fields.notes || null,
      photo_url: photoUrl,
    })
    .select('*, caliber:calibers ( id, name )')
    .single();
  if (error) throw error;
  return data;
}

/** Best-effort removal of a firearm photo from Storage, given its public
 * URL. Supabase does not allow deleting from `storage.objects` directly
 * via SQL (a DB trigger that tried this fails with "Direct deletion from
 * storage tables is not allowed"), so cleanup has to go through the real
 * Storage API from the client instead — this is that call. Failures here
 * are logged but never thrown; a leftover orphaned file in Storage is a
 * minor cleanup issue, not a reason to fail the firearm update/delete
 * that's actually the point of the operation. */
async function deleteFirearmPhoto(photoUrl) {
  if (!photoUrl) return;
  try {
    const path = photoUrl.replace(/.*firearm-images\//, '');
    const { error } = await supabase.storage.from('firearm-images').remove([path]);
    if (error) console.error('Failed to remove old firearm photo from storage', error);
  } catch (err) {
    console.error('Failed to remove old firearm photo from storage', err);
  }
}

/** Update an existing firearm profile. Passing a new `photoFile` replaces
 * the photo (the old one is removed from Storage afterward via
 * `deleteFirearmPhoto`); passing `removePhoto: true` clears it without
 * setting a new one — either way, cleanup only runs once the row update
 * itself has succeeded, and never blocks it. */
export async function updateFirearm(firearmId, fields, userId, photoFile, removePhoto) {
  const oldPhotoUrl = fields.existingPhotoUrl ?? null;
  let photoUrl = oldPhotoUrl;
  if (photoFile) {
    try {
      photoUrl = await uploadFirearmPhoto(photoFile, userId);
    } catch (err) {
      console.error('Failed to upload firearm photo', err);
    }
  } else if (removePhoto) {
    photoUrl = null;
  }
  const { data, error } = await supabase
    .from('firearms')
    .update({
      name: fields.name,
      caliber_id: fields.caliberId,
      make: fields.make || null,
      model: fields.model || null,
      optic: fields.optic || null,
      barrel_length_inches: fields.barrelLengthInches ?? null,
      twist_rate: fields.twistRate || null,
      starting_round_count: fields.startingRoundCount ?? 0,
      estimated_barrel_life: fields.estimatedBarrelLife ?? null,
      notes: fields.notes || null,
      photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', firearmId)
    .select('*, caliber:calibers ( id, name )')
    .single();
  if (error) throw error;

  if (oldPhotoUrl && oldPhotoUrl !== photoUrl) {
    await deleteFirearmPhoto(oldPhotoUrl);
  }

  return data;
}

/** Delete a firearm profile. Any range_sessions that referenced it keep
 * their round history — `firearm_id` just goes to NULL (ON DELETE SET
 * NULL) rather than the sessions themselves disappearing. Its photo (if
 * any) is looked up first and removed from Storage via the real Storage
 * API AFTER the row itself is gone, so a Storage hiccup never blocks the
 * actual delete the user asked for. */
export async function deleteFirearm(firearmId) {
  const { data: existing } = await supabase
    .from('firearms')
    .select('photo_url')
    .eq('id', firearmId)
    .single();

  const { error } = await supabase.from('firearms').delete().eq('id', firearmId);
  if (error) throw error;

  if (existing?.photo_url) {
    await deleteFirearmPhoto(existing.photo_url);
  }
}
