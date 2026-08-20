/** Loading History — every Loading Session (load_batches row) ever
 * logged for this recipe, newest first, each showing the date, rounds
 * assembled, and any notes from the bench. Rendered inline under the
 * "Log a Loading Session" box on the Loading Session tab (moved here
 * from a popup on the Overview tab — this is the same box you just used
 * to log a batch, so seeing the batch history right underneath it reads
 * more naturally than a separate click-to-open popup elsewhere). A
 * running cumulative total is shown next to each entry (oldest-first
 * cumulative, computed from the already newest-first list) so it's easy
 * to see how much of a recipe has been built up over time without doing
 * the math by hand. */
export default function LoadingHistoryList({ history, loading }) {
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
    <div>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-amber-400">Loading History</h2>

      {loading && <p className="py-4 text-center font-mono text-xs text-slate-400">Loading history…</p>}

      {!loading && (!history || history.length === 0) && (
        <p className="py-4 text-center font-mono text-xs text-slate-500">No Loading Sessions logged yet.</p>
      )}

      {!loading && history && history.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
            <span className="text-slate-500">Lifetime rounds loaded</span>
            <span className="font-mono text-sm font-semibold text-slate-100">{lifetimeTotal}</span>
          </div>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {history.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">{b.rounds_loaded} rds</span>
                    <span className="text-slate-500">{new Date(b.created_at).toLocaleDateString()}</span>
                  </div>
                  {b.notes && <p className="mt-1 truncate text-slate-400">{b.notes}</p>}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-slate-500">{runningTotals[b.id]} total</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
