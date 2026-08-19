/**
 * Caliber seed loader.
 *
 * supabase/schema.sql already inserts the baseline caliber list at
 * migration time. This script exists for the ongoing case: adding new
 * calibers later without hand-writing SQL or a new migration file.
 * It's idempotent (upsert on the unique `name` column) so it's safe to
 * re-run any time BASELINE_CALIBERS below is edited.
 *
 * Requires the service_role key (bypasses RLS) since calibers has no
 * insert policy for anon/authenticated users by design — caliber
 * management is an admin/operator task, not a user-facing feature.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... VITE_SUPABASE_URL=... node src/scripts/seedCalibers.js
 *   (or: npm run seed:calibers, with those vars in a local .env)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const BASELINE_CALIBERS = [
  { name: '6.5 Creedmoor', category: 'Rifle' },
  { name: '.308 Winchester', category: 'Rifle' },
  { name: '.223 Remington / 5.56 NATO', category: 'Rifle' },
  { name: '.300 Winchester Magnum', category: 'Rifle' },
  { name: '6mm Creedmoor', category: 'Rifle' },
  { name: '9mm Luger', category: 'Handgun' },
  { name: '.45 ACP', category: 'Handgun' },
  // Add new calibers here, then re-run this script.
];

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in your local .env (never commit the service role key).'
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('calibers')
    .upsert(BASELINE_CALIBERS, { onConflict: 'name', ignoreDuplicates: false })
    .select();

  if (error) {
    console.error('Caliber seed failed:', error.message);
    process.exit(1);
  }

  console.log(`Seeded/updated ${data.length} calibers.`);
}

main();
