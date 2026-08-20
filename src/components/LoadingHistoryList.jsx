// The actual list-of-sessions rendering, pulled out of
// LoadingHistoryModal.jsx so the same markup can be reused somewhere that
// isn't a popup — specifically the Loading Session tab itself, where a
// reloader sitting down at the bench wants to see "what did I load last
// time" without leaving the tab to open a modal (see the "what belongs on
// the Loading Session tab" discussion in the progress log). The modal still
// exists for the Overview tab's "Last loaded" row, and now renders through
// this same component so the two surfaces can never drift apart visually.
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

  if (loading) {
    return <p className="py-6 text-center font-mono text-xs text-slate-400">Loading history…</p>;
  }

  if (!history || history.length === 0) {
    return (
      <p className="py-6 text-center font-mono text-xs text-slate-500">No Loading Sessions logged yet.</p>
    );
  }

  return (
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
  );
}
