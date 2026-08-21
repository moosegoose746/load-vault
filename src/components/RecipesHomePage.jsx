import { useMemo, useState } from 'react';
import { ArrowDownNarrowWide, Pencil, Plus, Trash2 } from 'lucide-react';

// One recipe, as a card. Deliberately keeps the same lightweight fields
// fetchUserRecipes already computes cheaply for the whole list (title,
// caliber, firearm, bestMoa, lastActivityAt) rather than pulling in
// Cost/Round or similar — that number needs a full per-recipe inventory-
// price join (see calculateCostPerRound in lib/recipes.js), which is fine
// to pay for ONE recipe at a time on Dashboard but would mean N extra
// joins just to render this grid. Edit/Delete mirror FirearmsPage's
// FirearmCard pattern exactly (same confirm-before-delete flow) for
// consistency across the app's card-grid pages.
function RecipeCard({ recipe, onOpen, onEdit, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const subtitle = [recipe.caliber, recipe.firearm].filter(Boolean).join(' · ');

  return (
    <div
      onClick={() => onOpen(recipe.id)}
      className="flex cursor-pointer flex-col gap-3 rounded border border-amber-500 bg-panel p-4 shadow-[0_0_14px_rgba(245,158,11,0.15)] transition-shadow hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
    >
      <div className="min-w-0">
        <h3 className="truncate font-mono text-sm font-bold text-amber-400">{recipe.title}</h3>
        {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Best MOA</span>
        <span className="font-mono text-sm font-semibold text-amber-400">
          {recipe.bestMoa != null ? recipe.bestMoa.toFixed(2) : '—'}
        </span>
      </div>

      {recipe.lastActivityAt && (
        <p className="font-mono text-[10px] text-slate-600">
          Last activity {new Date(recipe.lastActivityAt).toLocaleDateString()}
        </p>
      )}

      {confirmingDelete && (
        <p className="rounded border border-red-800 bg-red-950/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-red-300">
          This archives the recipe — its Loading/Range Session history stays intact, and it can be
          restored later from Archived Recipes.
        </p>
      )}

      <div className="mt-auto flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(recipe.id);
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
        >
          <Pencil size={12} />
          EDIT
        </button>
        {confirmingDelete ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(recipe.id);
              }}
              className="rounded border border-red-600 bg-red-950 px-3 py-1.5 font-mono text-xs text-red-300 hover:bg-red-900"
            >
              CONFIRM
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingDelete(false);
              }}
              className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-slate-500"
            >
              CANCEL
            </button>
          </>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmingDelete(true);
            }}
            className="rounded border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// Section: Recipes Home — the new default landing view (see App.jsx and
// Header.jsx's VIEWS). Was requested because switching between recipes
// meant scrolling a cramped 288px Sidebar list; this gives every saved
// recipe its own card, with more room to actually see what's in it, plus
// the same caliber/firearm/component filters the Sidebar already offers
// (once there's enough recipes for that to matter) and quick Edit/Delete
// actions right on each card instead of only after opening one.
export default function RecipesHomePage({ userRecipes, onSelectRecipe, onNewRecipe, onEditRecipe, onDeleteRecipe, onViewArchived }) {
  const [caliberFilter, setCaliberFilter] = useState('');
  const [firearmFilter, setFirearmFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [sortByMoa, setSortByMoa] = useState(false);

  // Same >3 threshold as the Sidebar's Filter Recipes card — not worth
  // showing filter controls above a handful of cards that are already
  // easy to scan.
  const showFilters = (userRecipes?.length ?? 0) > 3;

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
    // Default order (sortByMoa off) is most-recently-worked-on first —
    // the same "what am I actually doing right now" ordering a home page
    // should lead with, rather than creation date or alphabetical.
    return [...list].sort((a, b) => {
      if (sortByMoa) {
        if (a.bestMoa == null && b.bestMoa == null) return 0;
        if (a.bestMoa == null) return 1;
        if (b.bestMoa == null) return -1;
        return a.bestMoa - b.bestMoa;
      }
      return new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0);
    });
  }, [userRecipes, caliberFilter, firearmFilter, componentFilter, sortByMoa]);

  const anyFilterActive = Boolean(caliberFilter || firearmFilter || componentFilter);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold text-slate-100">MY RECIPES</h1>
          <p className="text-xs text-slate-400">
            Every saved load recipe — click one to open it, or use Edit/Delete right here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onViewArchived && (
            <button
              onClick={onViewArchived}
              className="font-mono text-[11px] text-slate-500 hover:text-amber-400"
            >
              View archived
            </button>
          )}
          <button
            onClick={onNewRecipe}
            className="flex items-center justify-center gap-1.5 rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
          >
            <Plus size={14} />
            NEW RECIPE
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 p-3">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-wide text-slate-400">Filter</span>
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
              className="font-mono text-[10px] text-slate-500 hover:text-amber-400"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto font-mono text-[10px] text-slate-500">
            {filteredRecipes.length} of {userRecipes?.length ?? 0} match
          </span>
        </div>
      )}

      {(userRecipes?.length ?? 0) === 0 ? (
        <p className="rounded border border-slate-800 bg-panel px-4 py-8 text-center font-mono text-xs text-slate-500">
          No recipes yet — create one to start tracking real loads.
        </p>
      ) : filteredRecipes.length === 0 ? (
        <p className="rounded border border-slate-800 bg-panel px-4 py-8 text-center font-mono text-xs text-slate-500">
          No recipes match these filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onOpen={onSelectRecipe}
              onEdit={onEditRecipe}
              onDelete={onDeleteRecipe}
            />
          ))}
        </div>
      )}
    </main>
  );
}
