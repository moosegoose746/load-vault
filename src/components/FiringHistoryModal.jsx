import { X } from 'lucide-react';

/** Firing History popup — how many times this recipe's ammo was fired,
 * broken down by calendar day (newest day first). The range side of the
 * same "Recent Activity" pairing LoadingHistoryModal covers for the
 * bench side — opened from the "Last fired" row instead of "Last
 * loaded." A single day can have more than one Range Session logged
 * (e.g. two separate range trips, or a session split across chrono
 * setups), so entries here are grouped by day rather than shown as a
 * flat one-row-per-session list: each day shows total rounds fired that
 * day and how many sessions made up that total. `history` is expected
 * pre-grouped (see fetchFiringHistory in lib/recipes.js) so this
 * component stays pure presentation. */
export default function FiringHistoryModal({ open, onClose, history, loading }) {
  if (!open) return null;

  const lifetimeTotal = history ? history.reduce((sum, d) => sum + (d.roundsFired || 0), 0) : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded border border-amber-500 bg-panel shadow-[0_0_24px_rgba(245,158,11,0.25)]">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="font-mono text-sm font-bold text-amber-400">Firing History</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="py-6 text-center font-mono text-xs text-slate-400">Loading history…</p>}

          {!loading && (!history || history.length === 0) && (
            <p className="py-6 text-center font-mono text-xs text-slate-500">
              No Range Sessions with rounds fired logged yet.
            </p>
          )}

          {!loading && history && history.length > 0 && (
            <>
              <div className="mb-3 flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
                <span className="text-slate-500">Lifetime rounds fired</span>
                <span className="font-mono text-sm font-semibold text-slate-100">{lifetimeTotal}</span>
              </div>
              <div className="flex flex-col gap-2">
                {history.map((day) => (
                  <div
                    key={day.date}
                    className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-100">
                          {day.roundsFired} rds
                        </span>
                        <span className="text-slate-500">{new Date(day.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      {day.sessionCount} {day.sessionCount === 1 ? 'session' : 'sessions'}
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
