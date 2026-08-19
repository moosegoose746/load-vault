import { X } from 'lucide-react';

/** Scrollable target history popup — every Range Session for a recipe
 * that has a saved target photo, newest first, each with its full
 * per-session context (date, distance, group size, velocity stats,
 * rounds fired, which firearm). Opened by clicking the Overview tab's
 * "Last Target" card. Photos are shown at a size big enough to actually
 * read the group, not a tiny thumbnail — but this isn't a full-size
 * lightbox viewer; the stats alongside each photo are the point, not a
 * zoomed-in image. `firearmsById` is Dashboard's already-fetched
 * firearms list, keyed by id, so each entry can show a firearm name
 * without a new fetch/join. */
export default function TargetHistoryModal({ open, onClose, history, loading, firearmsById }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded border border-amber-500 bg-panel shadow-[0_0_24px_rgba(245,158,11,0.25)]">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="font-mono text-sm font-bold text-amber-400">Target History</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="py-6 text-center font-mono text-xs text-slate-400">Loading targets…</p>}

          {!loading && (!history || history.length === 0) && (
            <p className="py-6 text-center font-mono text-xs text-slate-500">No saved target photos yet.</p>
          )}

          {!loading && history && history.length > 0 && (
            <div className="flex flex-col gap-3">
              {history.map((s) => {
                const firearmName = s.firearm_id ? firearmsById?.[s.firearm_id]?.name : null;
                return (
                  <div key={s.id} className="flex gap-3 rounded border border-slate-800 bg-slate-900/60 p-3">
                    <img
                      src={s.target_image_url}
                      alt="Target"
                      className="h-28 w-28 shrink-0 rounded border border-slate-700 object-cover"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-100">
                          {s.group_size_moa != null ? `${s.group_size_moa.toFixed(2)} MOA` : '—'}
                        </span>
                        <span className="shrink-0 text-slate-500">
                          {new Date(s.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {s.group_size_inches != null && (
                        <p className="text-slate-500">{s.group_size_inches.toFixed(3)}" group</p>
                      )}
                      <div className="mt-1.5 flex flex-col gap-0.5 text-slate-400">
                        <span>{s.distance_yards ?? 100} yd</span>
                        {s.avg_velocity_fps != null && (
                          <span>
                            {s.avg_velocity_fps} FPS avg
                            {s.std_dev_fps != null ? `, SD ${s.std_dev_fps}` : ''}
                            {s.extreme_spread_fps != null ? `, ES ${s.extreme_spread_fps}` : ''}
                          </span>
                        )}
                        {s.rounds_fired != null && <span>{s.rounds_fired} rounds fired</span>}
                        {firearmName && <span>{firearmName}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
