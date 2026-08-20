import { X } from 'lucide-react';

/** Loading History popup — every Loading Session (load_batches row) ever
 * logged for this recipe, newest first, each showing the date, rounds
 * assembled, and any notes from the bench. This is the bench-side
 * counterpart to TargetHistoryModal (which covers Range Sessions) —
 * opened from the Overview tab's Recent Activity card so a recipe's
 * full loading history isn't limited to just "last loaded," which is
 * all fetchRecipeDetail normally surfaces. Running total is shown next
 * to each entry (oldest-first cumulative, computed from the already
 * newest-first list) so it's easy to see how much of a recipe has been
 * built up over time without doing the math by hand. */
export default function LoadingHistoryModal({ open, onClose, history, loading }) {
  if (!open) return null;

  // Cumulative total as of each entry, walking oldest → newest even
  // though `history` itself is sorted newest-first for display.
  const runningTotals = (() => {
    if (!history) return {};
    let sum = 0;
    const byId = {};
    [...history]
      .reverse()
      .forEach((b) => {
        sum += b.rounds_loaded || 0;
        byId[b.id] = sum;
      });
    return byId;
  })();

  const lifetimeTotal = history ? history.reduce((sum, b) => sum + (b.rounds_loaded || 0), 0) : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded border border-amber-500 bg-panel shadow-[0_0_24px_rgba(245,158,11,0.25)]">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="font-mono text-sm font-bold text-amber-400">Loading History</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="py-6 text-center font-mono text-xs text-slate-400">Loading history…</p>}

          {!loading && (!history || history.length === 0) && (
            <p className="py-6 text-center font-mono text-xs text-slate-500">
              No Loading Sessions logged yet.
            </p>
          )}

          {!loading && history && history.length > 0 && (
            <>
              <div className="mb-3 flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
                <span className="text-slate-500">Lifetime rounds loaded</span>
                <span className="font-mono text-sm font-semibold text-slate-100">{lifetimeTotal}</span>
              </div>
              <div className="flex flex-col gap-2">
                {history.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-100">
                          {b.rounds_loaded} rds
                        </span>
                        <span className="text-slate-500">{new Date(b.created_at).toLocaleDateString()}</span>
                      </div>
                      {b.notes && <p className="mt-1 truncate text-slate-400">{b.notes}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      {runningTotals[b.id]} total
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
