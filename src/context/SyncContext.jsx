import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { countPending, getPendingSessions, markSynced, queueSession } from '../lib/db.js';

const SyncContext = createContext(null);

// Section 2: Offline Range Mode Architecture — the IndexedDB queue (see
// src/lib/db.js) plus the Sync Status HUD badge state plus background
// sync on reconnect. This is a shared context rather than a plain hook
// because both the header badge and the "Save to Vault" action need the
// same live status, not independent copies of it.
//
// NOTE on scope: `sync()` below simulates the batch push rather than
// actually writing to Supabase's `range_sessions` table. A real insert
// needs a valid `recipe_id` foreign key, which requires an actual
// saved `load_recipes` row — that flow doesn't exist yet (recipes are
// still the Phase 2 mock data). The offline queue → reconnect → sync UX
// is fully real and testable end to end; only the final network call is
// a stand-in until recipe saving is built.
export function SyncProvider({ children }) {
  const [status, setStatus] = useState('synced'); // synced | queued | syncing
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const count = await countPending();
    setPendingCount(count);
    if (!syncingRef.current) {
      setStatus(count > 0 ? (navigator.onLine ? 'syncing' : 'queued') : 'synced');
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    const pending = await getPendingSessions();
    if (!pending.length) return;
    syncingRef.current = true;
    setStatus('syncing');
    // Simulated batch round-trip — see NOTE above.
    await new Promise((resolve) => setTimeout(resolve, 900));
    await markSynced(pending.map((p) => p.id));
    syncingRef.current = false;
    await refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    const handleOnline = () => sync();
    const handleOffline = () => refreshPendingCount();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync, refreshPendingCount]);

  const saveSession = useCallback(
    async (payload) => {
      await queueSession(payload);
      await refreshPendingCount();
      if (navigator.onLine) sync();
    },
    [refreshPendingCount, sync]
  );

  return (
    <SyncContext.Provider value={{ status, pendingCount, saveSession }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return ctx;
}
