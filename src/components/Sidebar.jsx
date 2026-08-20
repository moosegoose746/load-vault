import { useMemo, useState } from 'react';
import { ArrowDownNarrowWide, Plus } from 'lucide-react';
import MoaBadge from './MoaBadge.jsx';

// Section 3: "Left Sidebar (Specs & Filter Panel) — Prominent MOA Badge,
// Dropdown Selectors (Caliber/Powder/Bullet), Quick Spec List."
//
// The original Phase 2 version had hardcoded, non-functional
// caliber/powder/bullet "filter" dropdowns as placeholders. Now that real
// recipes exist, this is a real recipe switcher instead: pick a saved
// recipe to view, or create a new one, and filter/sort down to a specific
// one once there's enough to make that worthwhile. The full spec sheet
// (Component Specs, Cost/Round, Loaded & Ready, Money Saved, Loadable
// From Stock) used to live here too, but moved to Dashboard.jsx's Overview
// (and a compact reference on Loading Session) — it only ever describes
// whichever recipe is open, so it belongs with that recipe's own content
// rather than pinned in a 288px-wide side panel that was cramped for it.

export default function Sidebar({
  recipe,
  userRecipes,
  activeRecipeId,
  onSelectRecipe,
  onNewRecipe,
  onViewArchived,
  liveMoa,
  liveDistanceYards,
}) {
  const [caliberFilter, setCaliberFilter] = useState('');
  const [firearmFilter, setFirearmFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [sortByMoa, setSortByMoa] = useState(false);

  // Only surface the filter row once there's actually enough recipes for
  // scanning a plain dropdown to get tedious — for a handful of recipes
  // it'd just be clutter above a list that's already easy to scan. Picked
  // discrete dropdowns (populated only with values that actually appear
  // among the user's own recipes, not every caliber/firearm/component in
  // the system) over a free-text search box — a first version of this
  // used a text input, but its results only showed up inside a closed
  // <select>'s hidden option list, which read as "not working" even
  // though the matching itself was fine. Dropdowns can't typo either.
  const showRecipeFilters = (userRecipes?.length ?? 0) > 3;

  const caliberOptions = useMemo(
    () => Array.from(new Set((userRecipes || []).map((r) => r.caliber).filter(Boolean))).sort(),
    [userRecipes]
  );
  const firearmOptions = useMemo(
    () => Array.from(new Set((userRecipes || []).map((r) => r.firearm).filter(Boolean))).sort(),
    [userRecipes]
  );
  const componentOptions = useMemo(
    () =>
      Array.from(
        new Set((userRecipes || []).flatMap((r) => [r.powder, r.bullet, r.primer, r.brass]).filter(Boolean))
      ).sort(),
    [userRecipes]
  );

  const filteredRecipes = useMemo(() => {
    let list = userRecipes || [];
    if (caliberFilter) list = list.filter((r) => r.caliber === caliberFilter);
    if (firearmFilter) list = list.filter((r) => r.firearm === firearmFilter);
    if (componentFilter) {
      list = list.filter((r) => [r.powder, r.bullet, r.primer, r.brass].includes(componentFilter));
    }
    if (sortByMoa) {
      // Tightest group first; recipes with nothing recorded yet sink to
      // the bottom rather than sorting as if a 0 MOA group were real.
      list = [...list].sort((a, b) => {
        if (a.bestMoa == null && b.bestMoa == null) return 0;
        if (a.bestMoa == null) return 1;
        if (b.bestMoa == null) return -1;
        return a.bestMoa - b.bestMoa;
      });
    }
    return list;
  }, [userRecipes, caliberFilter, firearmFilter, componentFilter, sortByMoa]);

  const anyFilterActive = Boolean(caliberFilter || firearmFilter || componentFilter);
  const demoMatches = !anyFilterActive;
  // If the active recipe got filtered out from under the user, keep the
  // <select> showing it anyway rather than silently jumping to a
  // different option — it's still selected, just not in the visible list
  // otherwise.
  const activeRecipeStillListed = activeRecipeId ? filteredRecipes.some((r) => r.id === activeRecipeId) : true;
  const showDemoOption = demoMatches || !activeRecipeId;
  const selectOptions =
    activeRecipeId && !activeRecipeStillListed ? [{ id: activeRecipeId, title: recipe.title }, ...filteredRecipes] : filteredRecipes;

  // Prefer the live reading from shots currently being plotted on the
  // target; fall back to whatever MOA was saved on the recipe's last range
  // session once nothing is actively being measured. Distance follows the
  // same live-or-saved pairing — a bare MOA number is meaningless without
  // knowing what distance it was measured at (see MoaBadge.jsx).
  const displayMoa = liveMoa ?? recipe.groupSizeMoa;
  const displayDistanceYards = liveMoa != null ? liveDistanceYards : recipe.distanceYards;

  return (
    <aside className="flex w-full flex-col gap-6 border-slate-800 p-4 sm:w-72 sm:border-r">
      <MoaBadge moa={displayMoa} distanceYards={displayDistanceYards} />

      <div className="flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-amber-400">My Recipes</h2>

        {/* Fixed at the top, above the filter card and the list — Edit and
            Delete moved to Dashboard.jsx (they act on whichever recipe is
            currently open, so they now live right under that recipe's own
            title instead of down here). New Recipe doesn't depend on
            anything below it, so anchoring it here keeps it from jumping
            around as the list's height changes with the filter results. */}
        <button
          onClick={onNewRecipe}
          className="flex items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
        >
          <Plus size={14} />
          NEW RECIPE
        </button>

        {/* Its own clearly-labeled card, separate from the recipe list
            below — narrowing/sorting and "which recipe is open" are two
            different jobs, and cramming both into one undifferentiated
            block was part of why this read as confusing. The live match
            count is the fix for the actual bug that was reported: picking
            a filter used to only change a closed <select>'s hidden
            options, so nothing visibly happened. Now every change updates
            a number right here, and the list right below it. */}
        {showRecipeFilters && (
          <div className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Filter Recipes</span>
              <span className="font-mono text-[10px] text-slate-500">
                {filteredRecipes.length} of {userRecipes?.length ?? 0} match
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <select
                value={caliberFilter}
                onChange={(e) => setCaliberFilter(e.target.value)}
                aria-label="Filter by caliber"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-300 focus:border-amber-500 focus:outline-none"
              >
                <option value="">Caliber: All</option>
                {caliberOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={firearmFilter}
                onChange={(e) => setFirearmFilter(e.target.value)}
                aria-label="Filter by firearm"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-300 focus:border-amber-500 focus:outline-none"
              >
                <option value="">Firearm: All</option>
                {firearmOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                value={componentFilter}
                onChange={(e) => setComponentFilter(e.target.value)}
                aria-label="Filter by component"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-300 focus:border-amber-500 focus:outline-none"
              >
                <option value="">Component: All</option>
                {componentOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setSortByMoa((v) => !v)}
              className={`flex items-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[11px] ${
                sortByMoa
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <ArrowDownNarrowWide size={12} />
              Sort by best MOA
            </button>
            {anyFilterActive && (
              <button
                type="button"
                onClick={() => {
                  setCaliberFilter('');
                  setFirearmFilter('');
                  setComponentFilter('');
                }}
                className="self-start font-mono text-[10px] text-slate-500 hover:text-amber-400"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* The actual picker — a real, always-visible list of clickable
            rows instead of a native <select>, so filtering/sorting has
            somewhere to actually show its result. Capped height with
            internal scroll once there's more than a handful, so it can't
            push the rest of the sidebar down. */}
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded border border-slate-800 p-1">
          {showDemoOption && (
            <button
              type="button"
              onClick={() => onSelectRecipe(null)}
              className={`rounded px-2.5 py-1.5 text-left transition-colors ${
                !activeRecipeId ? 'bg-amber-500/10 text-amber-300' : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <span className="block font-mono text-sm">Demo Recipe</span>
              <span className="block font-mono text-[10px] text-slate-500">Sample data</span>
            </button>
          )}
          {selectOptions.map((r) => {
            const isActive = r.id === activeRecipeId;
            // The one injected fallback row (active recipe filtered out
            // from under the user) only carries id/title — fall back to
            // the loaded recipe detail's own caliber/firearm for its
            // subtitle rather than showing a blank second line.
            const caliber = r.caliber ?? (isActive ? recipe.caliber : null);
            const firearm = r.firearm ?? (isActive ? recipe.firearmLabel : null);
            const subtitle = [caliber, firearm].filter(Boolean).join(' · ');
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelectRecipe(r.id)}
                className={`rounded px-2.5 py-1.5 text-left transition-colors ${
                  isActive ? 'bg-amber-500/10 text-amber-300' : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span className="block font-mono text-sm">{r.title}</span>
                {subtitle && <span className="block font-mono text-[10px] text-slate-500">{subtitle}</span>}
              </button>
            );
          })}
          {showRecipeFilters && selectOptions.length === 0 && !showDemoOption && (
            <p className="p-2 text-center font-mono text-[11px] text-slate-500">No recipes match these filters</p>
          )}
        </div>

        {/* Deleting a recipe is a soft delete (see archiveRecipe in
            lib/recipes.js) — this is the way back to it. Always shown,
            not just when a recipe is active/being deleted, since the
            whole point is finding something you deleted a while ago. */}
        {onViewArchived && (
          <button
            onClick={onViewArchived}
            className="text-left font-mono text-[11px] text-slate-600 hover:text-amber-400"
          >
            View archived recipes
          </button>
        )}
      </div>
    </aside>
  );
}
