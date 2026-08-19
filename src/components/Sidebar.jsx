import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import MoaBadge from './MoaBadge.jsx';

// Section 3: "Left Sidebar (Specs & Filter Panel) — Prominent MOA Badge,
// Dropdown Selectors (Caliber/Powder/Bullet), Quick Spec List."
//
// The original Phase 2 version had hardcoded, non-functional
// caliber/powder/bullet "filter" dropdowns as placeholders. Now that real
// recipes exist, this is a real recipe switcher instead: pick a saved
// recipe to view, or create a new one. The specs below always reflect
// whichever recipe (real or the built-in demo) is currently active.

function SpecRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 py-1.5 last:border-none">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-sm text-slate-100">{value}</span>
    </div>
  );
}

export default function Sidebar({
  recipe,
  userRecipes,
  activeRecipeId,
  onSelectRecipe,
  onNewRecipe,
  onDeleteRecipe,
  liveMoa,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Drop any pending delete confirmation if the selected recipe changes out
  // from under it (e.g. switching recipes mid-confirm).
  useEffect(() => {
    setConfirmingDelete(false);
  }, [activeRecipeId]);

  // Prefer the live reading from shots currently being plotted on the
  // target; fall back to whatever MOA was saved on the recipe's last range
  // session once nothing is actively being measured.
  const displayMoa = liveMoa ?? recipe.groupSizeMoa;

  return (
    <aside className="flex w-full flex-col gap-6 border-slate-800 p-4 sm:w-72 sm:border-r">
      <MoaBadge moa={displayMoa} />

      <div className="flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-amber-400">My Recipes</h2>
        <select
          value={activeRecipeId ?? 'demo'}
          onChange={(e) => onSelectRecipe(e.target.value === 'demo' ? null : e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
        >
          <option value="demo">Demo Recipe (sample data)</option>
          {(userRecipes || []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <button
          onClick={onNewRecipe}
          className="flex items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
        >
          <Plus size={14} />
          NEW RECIPE
        </button>

        {activeRecipeId &&
          (confirmingDelete ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDeleteRecipe(activeRecipeId)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-red-600 bg-red-950 px-3 py-1.5 font-mono text-xs text-red-300 hover:bg-red-900"
              >
                CONFIRM DELETE
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-slate-500"
              >
                CANCEL
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center justify-center gap-1.5 rounded border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
            >
              <Trash2 size={14} />
              DELETE RECIPE
            </button>
          ))}
      </div>

      <div className="flex flex-col rounded border border-slate-800 bg-panel p-3">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-amber-400">
          Component Specs
        </h2>
        <SpecRow label="Caliber" value={recipe.caliber} />
        <SpecRow label="Powder" value={recipe.powder} />
        <SpecRow label="Bullet" value={recipe.bullet} />
        <SpecRow label="Charge Weight" value={`${recipe.chargeGrains ?? '—'} gr ${recipe.powder}`} />
        <SpecRow label="COAL" value={recipe.coalInches ? `${recipe.coalInches}"` : '—'} />
        <SpecRow label="Primer" value={recipe.primer} />
        <SpecRow label="Brass" value={recipe.brass} />

        <div className="my-2 border-t border-slate-800" />

        <SpecRow
          label="Cost / Round"
          value={recipe.costPerRound != null ? `$${recipe.costPerRound.toFixed(2)}` : '—'}
        />
        <SpecRow
          label="Loaded & Ready"
          value={recipe.roundsOnHand != null ? `${recipe.roundsOnHand} rounds` : '—'}
        />
        <SpecRow
          label="Loadable From Stock"
          value={
            recipe.loadableFromStock != null
              ? `${recipe.loadableFromStock} (${recipe.loadableBottleneck})`
              : '—'
          }
        />
      </div>
    </aside>
  );
}
