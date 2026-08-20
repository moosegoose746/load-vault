import { X } from 'lucide-react';
import LoadingHistoryList from './LoadingHistoryList.jsx';

/** Loading History popup — every Loading Session (load_batches row) ever
 * logged for this recipe, newest first, each showing the date, rounds
 * assembled, and any notes from the bench. This is the bench-side
 * counterpart to TargetHistoryModal (which covers Range Sessions) —
 * opened from the "Last loaded" row of the Overview tab's Recent
 * Activity card. The actual list rendering (running totals, lifetime
 * total, empty/loading states) lives in LoadingHistoryList.jsx now, since
 * the Loading Session tab shows this same history inline, without a
 * modal wrapper — this component is just the popup chrome around it. */
export default function LoadingHistoryModal({ open, onClose, history, loading }) {
  if (!open) return null;

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
          <LoadingHistoryList history={history} loading={loading} />
        </div>
      </div>
    </div>
  );
}
