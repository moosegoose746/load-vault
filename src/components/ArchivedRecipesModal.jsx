import { useState } from 'react';
import { ArchiveRestore, X } from 'lucide-react';

/** Archived Recipes popup — the view/restore half of the soft-delete
 * flow (see archiveRecipe/restoreRecipe/fetchArchivedRecipes in
 * lib/recipes.js). Opened from Sidebar's "View archived recipes" link.
 * Deleting a recipe never actually destroys it or its history (Loading
 * Sessions, Range Sessions, shot logs) — it just sets `is_archived =
 * true` and hides it from the normal recipe switcher — so this is purely
 * a list + a one-click-with-confirm restore, not a real "trash can" that
 * needs its own permanent-delete flow. Each row shows enough spec context
 * (caliber/powder/bullet) to recognize which recipe is which, since
 * titles alone can be ambiguous across several old test loads.
 *
 * `restoringId` tracks which row's restore is in flight (rather than one
 * shared boolean) so restoring one recipe doesn't disable every other
 * row's button while its request is still out. */
export default function ArchivedRecipesModal({ open, onClose, archivedRecipes, loading, onRestore }) {
  const [confirmingId, setConfirmingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleRestore = async (id) => {
    setRestoringId(id);
    setError('');
    try {
      await onRestore(id);
      setConfirmingId(null);
    } catch (err) {
      console.error('Failed to restore recipe', err);
      setError('Failed to restore that recipe.');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded border border-amber-500 bg-panel shadow-[0_0_24px_rgba(245,158,11,0.25)]">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="font-mono text-sm font-bold text-amber-400">Archived Recipes</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-3 font-mono text-[11px] leading-relaxed text-slate-500">
            Deleted recipes land here instead of disappearing for good — restoring one brings back
            its full history (Loading Sessions, Range Sessions, everything) exactly as it was.
          </p>

          {error && <p className="mb-2 font-mono text-xs text-red-400">{error}</p>}

          {loading && (
            <p className="py-6 text-center font-mono text-xs text-slate-400">Loading archived recipes…</p>
          )}

          {!loading && (!archivedRecipes || archivedRecipes.length === 0) && (
            <p className="py-6 text-center font-mono text-xs text-slate-500">
              Nothing archived — deleted recipes will show up here.
            </p>
          )}

          {!loading && archivedRecipes && archivedRecipes.length > 0 && (
            <div className="flex flex-col gap-2">
              {archivedRecipes.map((r) => {
                const specLine = [r.caliber, r.powder, r.bullet].filter(Boolean).join(' · ');
                const isConfirming = confirmingId === r.id;
                const isRestoring = restoringId === r.id;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-slate-100">{r.title}</p>
                      {specLine && <p className="truncate font-mono text-[11px] text-slate-500">{specLine}</p>}
                    </div>
                    {isConfirming ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => handleRestore(r.id)}
                          disabled={isRestoring}
                          className="rounded border border-amber-500 px-2 py-1 font-mono text-[11px] text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
                        >
                          {isRestoring ? '…' : 'CONFIRM'}
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="rounded border border-slate-700 px-2 py-1 font-mono text-[11px] text-slate-300 hover:border-slate-500"
                        >
                          CANCEL
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(r.id)}
                        className="flex shrink-0 items-center gap-1.5 rounded border border-slate-700 px-2 py-1.5 font-mono text-[11px] text-slate-300 hover:border-amber-500 hover:text-amber-400"
                      >
                        <ArchiveRestore size={13} />
                        RESTORE
                      </button>
                    )}
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
