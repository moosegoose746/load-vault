import { supabase } from './supabaseClient.js';

// Full account data export — the "don't lose my load data" trust-builder
// flagged in the five-persona review. Deliberately pulls straight from the
// raw tables (not the app's display-oriented view-model shapes in
// recipes.js/firearms.js/inventory.js) so nothing gets dropped or rounded
// on the way out: this is meant to be a real backup someone could hand to
// a spreadsheet or another tool, not just a pretty printout of what's on
// screen right now.
//
// Every table queried here has a direct or walk-up-the-chain RLS policy
// scoping it to auth.uid() (see schema.sql / schema_firearms.sql /
// schema_inventory.sql / schema_workups.sql / schema_batches.sql), so the
// explicit .eq('user_id', userId) filters below are belt-and-suspenders,
// not what's actually enforcing "only your own data comes back" — same
// pattern fetchPublicRecipeDetail documents for RLS-backed reads.
export async function fetchFullExport(userId) {
  const [firearmsRes, inventoryRes, recipesRes, sessionsRes, batchesRes, workupsRes] = await Promise.all([
    supabase.from('firearms').select('*, calibers ( name )').eq('user_id', userId).order('created_at'),
    supabase
      .from('user_inventory')
      .select('*, components ( brand, model, type )')
      .eq('user_id', userId)
      .order('created_at'),
    supabase
      .from('load_recipes')
      .select(
        `
        id, title, caliber_id, charge_weight_grains, coal_inches, rifle_model, firearm_id, notes,
        factory_price_per_round, visibility, is_archived, created_at, updated_at,
        calibers ( name ),
        firearm:firearms ( id, name ),
        powder:components!load_recipes_powder_id_fkey ( id, brand, model ),
        bullet:components!load_recipes_bullet_id_fkey ( id, brand, model ),
        primer:components!load_recipes_primer_id_fkey ( id, brand, model ),
        brass:components!load_recipes_brass_id_fkey ( id, brand, model )
      `
      )
      .eq('user_id', userId)
      .order('created_at'),
    supabase.from('range_sessions').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('load_batches').select('*').eq('user_id', userId).order('created_at'),
    supabase
      .from('load_workups')
      .select(
        `
        id, title, caliber_id, notes, created_at, updated_at,
        calibers ( name ),
        powder:components!load_workups_powder_id_fkey ( id, brand, model ),
        bullet:components!load_workups_bullet_id_fkey ( id, brand, model ),
        primer:components!load_workups_primer_id_fkey ( id, brand, model ),
        brass:components!load_workups_brass_id_fkey ( id, brand, model )
      `
      )
      .eq('user_id', userId)
      .order('created_at'),
  ]);

  for (const res of [firearmsRes, inventoryRes, recipesRes, sessionsRes, batchesRes, workupsRes]) {
    if (res.error) throw res.error;
  }

  const sessionIds = (sessionsRes.data || []).map((s) => s.id);
  const workupIds = (workupsRes.data || []).map((w) => w.id);

  // Children fetched as a second wave, keyed off the parent ids just
  // pulled above — shot_logs/workup_rungs have no user_id of their own
  // (same ownership-by-walk-up-the-chain shape RLS uses for them), so
  // there's nothing to query them by directly.
  const [shotLogsRes, rungsRes] = await Promise.all([
    sessionIds.length
      ? supabase.from('shot_logs').select('*').in('session_id', sessionIds).order('shot_number')
      : Promise.resolve({ data: [] }),
    workupIds.length
      ? supabase.from('workup_rungs').select('*').in('workup_id', workupIds).order('created_at')
      : Promise.resolve({ data: [] }),
  ]);
  if (shotLogsRes.error) throw shotLogsRes.error;
  if (rungsRes.error) throw rungsRes.error;

  const rungIds = (rungsRes.data || []).map((r) => r.id);
  const rungShotsRes = rungIds.length
    ? await supabase.from('workup_rung_shots').select('*').in('rung_id', rungIds).order('shot_number')
    : { data: [] };
  if (rungShotsRes.error) throw rungShotsRes.error;

  // Nest children back under their parent rather than shipping five flat,
  // hard-to-cross-reference arrays — someone opening this file to actually
  // read it (not just re-import it) shouldn't have to manually join
  // session_id -> shot_logs themselves.
  const shotsBySession = groupBy(shotLogsRes.data || [], 'session_id');
  const rungShotsByRung = groupBy(rungShotsRes.data || [], 'rung_id');
  const rungsByWorkup = groupBy(rungsRes.data || [], 'workup_id');
  const sessionsByRecipe = groupBy(sessionsRes.data || [], 'recipe_id');
  const batchesByRecipe = groupBy(batchesRes.data || [], 'recipe_id');

  const recipes = (recipesRes.data || []).map((r) => ({
    ...r,
    range_sessions: (sessionsByRecipe[r.id] || []).map((s) => ({ ...s, shots: shotsBySession[s.id] || [] })),
    load_batches: batchesByRecipe[r.id] || [],
  }));

  const workups = (workupsRes.data || []).map((w) => ({
    ...w,
    rungs: (rungsByWorkup[w.id] || []).map((rung) => ({ ...rung, shots: rungShotsByRung[rung.id] || [] })),
  }));

  return {
    exported_at: new Date().toISOString(),
    firearms: firearmsRes.data || [],
    inventory: inventoryRes.data || [],
    recipes,
    workups,
  };
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const k = row[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Triggers a browser download of the export as a formatted JSON file.
 * Plain client-side Blob + object URL — no server round trip needed
 * beyond the reads fetchFullExport already did. */
export function downloadExportAsJson(exportData) {
  const stamp = exportData.exported_at ? exportData.exported_at.slice(0, 10) : 'export';
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `precision-load-vault-export-${stamp}.json`);
}

const componentLabel = (c) => (c ? `${c.brand} ${c.model}` : '');

/** Splits the nested export shape from fetchFullExport into one flat table
 * per entity — CSV can't represent "a recipe with an array of range
 * sessions, each with an array of shots" the way JSON can, so each of
 * those becomes its own sheet with a foreign-key column (recipe_id,
 * session_id, workup_id, rung_id) to cross-reference back, the same shape
 * the underlying Postgres tables already have. Returns
 * { filename: [ {col: value, ...}, ... ] } — turned into actual CSV text
 * by toCsv() below, one call per sheet. */
function buildTables(exportData) {
  const recipeTitleById = Object.fromEntries((exportData.recipes || []).map((r) => [r.id, r.title]));
  const workupTitleById = Object.fromEntries((exportData.workups || []).map((w) => [w.id, w.title]));

  const firearms = (exportData.firearms || []).map((f) => ({
    id: f.id,
    name: f.name,
    caliber: f.calibers?.name ?? '',
    make: f.make ?? '',
    model: f.model ?? '',
    optic: f.optic ?? '',
    barrel_length_inches: f.barrel_length_inches ?? '',
    twist_rate: f.twist_rate ?? '',
    starting_round_count: f.starting_round_count ?? '',
    estimated_barrel_life: f.estimated_barrel_life ?? '',
    notes: f.notes ?? '',
    created_at: f.created_at ?? '',
    updated_at: f.updated_at ?? '',
  }));

  const inventory = (exportData.inventory || []).map((i) => ({
    id: i.id,
    component_type: i.components?.type ?? i.custom_type ?? '',
    component: i.components ? componentLabel(i.components) : i.custom_name ?? '',
    unit_cost: i.unit_cost ?? '',
    package_qty: i.package_qty ?? '',
    quantity_on_hand: i.quantity_on_hand ?? '',
    reload_cycles: i.reload_cycles ?? '',
    notes: i.notes ?? '',
    created_at: i.created_at ?? '',
    updated_at: i.updated_at ?? '',
  }));

  const recipes = (exportData.recipes || []).map((r) => ({
    id: r.id,
    title: r.title,
    caliber: r.calibers?.name ?? '',
    firearm: r.firearm?.name ?? '',
    powder: componentLabel(r.powder),
    charge_weight_grains: r.charge_weight_grains ?? '',
    bullet: componentLabel(r.bullet),
    primer: componentLabel(r.primer),
    brass: componentLabel(r.brass),
    coal_inches: r.coal_inches ?? '',
    rifle_model: r.rifle_model ?? '',
    factory_price_per_round: r.factory_price_per_round ?? '',
    visibility: r.visibility,
    is_archived: r.is_archived,
    notes: r.notes ?? '',
    created_at: r.created_at ?? '',
    updated_at: r.updated_at ?? '',
  }));

  const rangeSessions = [];
  const loadBatches = [];
  for (const r of exportData.recipes || []) {
    for (const s of r.range_sessions || []) {
      rangeSessions.push({
        id: s.id,
        recipe_id: r.id,
        recipe_title: r.title,
        distance_yards: s.distance_yards ?? '',
        group_size_moa: s.group_size_moa ?? '',
        group_size_inches: s.group_size_inches ?? '',
        avg_velocity_fps: s.avg_velocity_fps ?? '',
        std_dev_fps: s.std_dev_fps ?? '',
        extreme_spread_fps: s.extreme_spread_fps ?? '',
        rounds_fired: s.rounds_fired ?? '',
        target_image_url: s.target_image_url ?? '',
        created_at: s.created_at ?? '',
      });
    }
    for (const b of r.load_batches || []) {
      loadBatches.push({
        id: b.id,
        recipe_id: r.id,
        recipe_title: r.title,
        rounds_loaded: b.rounds_loaded,
        notes: b.notes ?? '',
        created_at: b.created_at ?? '',
      });
    }
  }

  const shotLogs = [];
  for (const r of exportData.recipes || []) {
    for (const s of r.range_sessions || []) {
      for (const shot of s.shots || []) {
        shotLogs.push({
          session_id: s.id,
          recipe_title: r.title,
          shot_number: shot.shot_number,
          velocity_fps: shot.velocity_fps,
        });
      }
    }
  }

  const workups = (exportData.workups || []).map((w) => ({
    id: w.id,
    title: w.title,
    caliber: w.calibers?.name ?? '',
    powder: componentLabel(w.powder),
    bullet: componentLabel(w.bullet),
    primer: componentLabel(w.primer),
    brass: componentLabel(w.brass),
    notes: w.notes ?? '',
    created_at: w.created_at ?? '',
    updated_at: w.updated_at ?? '',
  }));

  const workupRungs = [];
  const workupRungShots = [];
  for (const w of exportData.workups || []) {
    for (const rung of w.rungs || []) {
      workupRungs.push({
        id: rung.id,
        workup_id: w.id,
        workup_title: w.title,
        charge_weight_grains: rung.charge_weight_grains,
        avg_velocity_fps: rung.avg_velocity_fps ?? '',
        std_dev_fps: rung.std_dev_fps ?? '',
        extreme_spread_fps: rung.extreme_spread_fps ?? '',
        group_size_moa: rung.group_size_moa ?? '',
        rounds_fired: rung.rounds_fired ?? '',
        linked_recipe_title: recipeTitleById[rung.recipe_id] ?? '',
        notes: rung.notes ?? '',
        created_at: rung.created_at ?? '',
      });
      for (const shot of rung.shots || []) {
        workupRungShots.push({
          rung_id: rung.id,
          workup_title: w.title,
          shot_number: shot.shot_number,
          velocity_fps: shot.velocity_fps,
        });
      }
    }
  }
  // workupTitleById is only used for the lookup above via w.title directly,
  // kept for symmetry/future use if rungs ever need to look up by id alone.
  void workupTitleById;

  return {
    'firearms.csv': firearms,
    'inventory.csv': inventory,
    'recipes.csv': recipes,
    'range_sessions.csv': rangeSessions,
    'shot_logs.csv': shotLogs,
    'load_batches.csv': loadBatches,
    'workups.csv': workups,
    'workup_rungs.csv': workupRungs,
    'workup_rung_shots.csv': workupRungShots,
  };
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(','));
  }
  return lines.join('\r\n');
}

// --- Minimal dependency-free ZIP writer (STORE method, no compression) ---
// Bundling a real zip library just for this one export button felt like a
// lot of extra weight to add to the app for one feature; a stored-only zip
// is a small, well-defined binary format and every table here is small
// enough that skipping compression costs nothing that matters.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  // files: [{ name, data: Uint8Array }]
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const size = data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, 0, true); // mod time
    local.setUint16(12, 0x21, true); // mod date (arbitrary valid value)
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true); // compressed size
    local.setUint32(22, size, true); // uncompressed size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra length
    localParts.push(new Uint8Array(local.buffer), nameBytes, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0, true); // flags
    central.setUint16(10, 0, true); // method
    central.setUint16(12, 0, true); // mod time
    central.setUint16(14, 0x21, true); // mod date
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true); // extra length
    central.setUint16(32, 0, true); // comment length
    central.setUint16(34, 0, true); // disk number start
    central.setUint16(36, 0, true); // internal attrs
    central.setUint32(38, 0, true); // external attrs
    central.setUint32(42, offset, true); // local header offset
    centralParts.push(new Uint8Array(central.buffer), nameBytes);

    offset += local.buffer.byteLength + nameBytes.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const centralOffset = offset;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true); // disk number
  end.setUint16(6, 0, true); // disk with central dir
  end.setUint16(8, files.length, true); // entries this disk
  end.setUint16(10, files.length, true); // entries total
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  end.setUint16(20, 0, true); // comment length

  return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/** Triggers a browser download of the export as a .zip of CSV files, one
 * per table (see buildTables above) — the CSV counterpart to
 * downloadExportAsJson. A single flat CSV can't hold relational data like
 * this (a recipe has many range sessions, each with many shots), so this
 * is a zip of sheets rather than one file, cross-referenced by id columns
 * the same way the underlying database tables are. */
export function downloadExportAsCsvZip(exportData) {
  const stamp = exportData.exported_at ? exportData.exported_at.slice(0, 10) : 'export';
  const tables = buildTables(exportData);
  const encoder = new TextEncoder();
  const files = Object.entries(tables)
    .filter(([, rows]) => rows.length > 0)
    .map(([name, rows]) => ({ name, data: encoder.encode(toCsv(rows)) }));
  if (!files.length) {
    files.push({ name: 'README.txt', data: encoder.encode('No data to export yet.') });
  }
  downloadBlob(buildZip(files), `precision-load-vault-export-${stamp}.zip`);
}
