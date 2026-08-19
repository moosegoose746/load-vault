import Dexie from 'dexie';

// Local-first offline cache — Section 2's "Offline Range Mode Architecture."
// Range sessions logged with no signal at the bench get written here
// immediately (optimistic UI, zero perceived lag), then pushed to Supabase
// in a single batch once the browser is back online.
export const db = new Dexie('loadVaultDB');

db.version(1).stores({
  // `synced` is indexed (0/1, not boolean — Dexie indexes those more
  // reliably across browsers) so counting pending rows stays fast even as
  // this table grows across many range sessions.
  pendingSessions: '++id, synced, createdAt',
});

export async function queueSession(payload) {
  return db.pendingSessions.add({
    payload,
    synced: 0,
    createdAt: Date.now(),
  });
}

export async function getPendingSessions() {
  return db.pendingSessions.where('synced').equals(0).toArray();
}

export async function countPending() {
  return db.pendingSessions.where('synced').equals(0).count();
}

export async function markSynced(ids) {
  return db.pendingSessions.bulkUpdate(ids.map((id) => ({ key: id, changes: { synced: 1 } })));
}
