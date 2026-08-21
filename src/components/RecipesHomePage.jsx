import { useMemo, useState } from 'react';
import { ArrowDownNarrowWide, Pencil, Plus, Trash2 } from 'lucide-react';
import MetricCard from './MetricCard.jsx';

// A small label/value stat box — same visual treatment Best MOA already
// used, pulled out since the card now shows four of these instead of one.
function CardStat({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
      <span className="font-mono text-sm font-semibold text-amber-400">{value ?? '—'}</span>
    </div>
  );
}

const moneyFmt = (v) => (v != null ? `$${v.toFixed(2)}` : null);
const moaFmt = (v) => (v != null ? v.toFixed(2) : null);

// One recipe, as a card. Caliber and Firearm get their own labeled lines
// instead of being joined into one bare "X · Y" subtitle — a recipe whose
// linked firearm happens to be named after its own caliber (a plausible
// naming choice, e.g. a firearm called ".270 Winchester") used to render
// as "X · X" with nothing distinguishing which word was which. Best MOA
// (tightest group ever) and Most Recent MOA (the last one actually
// measured) are shown separately — "how good has this load ever shot" and
// "how's it shooting lately" are genuinely different questions, and they
// can diverge (see Dashboard's Quick Log discussion in the progress log:
// a recipe's most recent session might not have a measured group at all).
// Total Money Spent and Money Saved reuse the exact same per-recipe cost
// math Dashboard uses, computed in bulk against one shared inventory
// price map instead of one query per card (see fetchUserRecipes in
// lib/recipes.js) — that's what keeps this affordable to show for every
// card at once. Edit/Delete mirror FirearmsPage's FirearmCard pattern
// exactly (same confirm-before-delete flow) for consistency across the
// app's card-grid pages.
function RecipeCard({ recipe, onOpen, onEdit, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div
      onClick={() => onOpen(recipe.id)}
      className="flex cursor-pointer flex-col gap-3 rounded border border-amber-500 bg-panel p-4 shadow-[0_0_14px_rgba(245,158,11,0.15)] transition-shadow hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
    >
      <div className="min-w-0">
        <h3 className="truncate font-mono text-sm font-bold text-amber-400">{recipe.title}</h3>
        {recipe.caliber && (
          <p className="truncate text-xs text-slate-400">
            <span className="text-slate-600">Caliber:</span> {recipe.caliber}
          </p>
        )}
        {recipe.firearm && (
          <p className="truncate text-xs text-slate-400">
            <span className="text-slate-600">Firearm:</span> {recipe.firearm}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CardStat label="Best MOA" value={moaFmt(recipe.bestMoa)} />
        <CardStat label="Recent MOA" value={moaFmt(recipe.recentMoa)} />
        <CardStat label="Cost/Round" value={moneyFmt(recipe.costPerRound)} />
        <CardStat label="Rounds Fired" value={recipe.totalRoundsFired || null} />
        <CardStat label="Total Spent" value={moneyFmt(recipe.totalMoneySpent)} />
        <CardStat label="Money Saved" value={moneyFmt(recipe.moneySaved)} />
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
export default function RecipesHomePage({
  userRecipes,
  lifetimeSaved,
  onSelectRecipe,
  onNewRecipe,
  onEditRecipe,
  onDeleteRecipe,
  onViewArchived,
}) {
  const [caliberFilter, setCaliberFilter] = useState('');
  const [firearmFilter, setFirearmFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [sortByMoa, setSortByMoa] = useState(false);

  // Same >3 threshold as the Sidebar's Filter Recipes card — not worth
  // showing filter controls above a handful of cards that are already
  // easy to scan.
  const showFilters = (userRecipes?.length ?? 0) > 3;

  // Account-wide totals row — the "dashboard" part of this page, per the
  // progress log's Recipes Home follow-up. Every number here is just a
  // sum/min over the SAME per-recipe fields already computed once in
  // fetchUserRecipes (see lib/recipes.js) — no separate aggregate query,
  // since userRecipes already has everything needed. Money Saved is the
  // one exception: it uses the `lifetimeSaved` prop (Header's existing
  // fetchLifetimeMoneySaved value, already fetched by App.jsx for the
  // header badge) rather than re-summing recipe.moneySaved here, so the
  // two never show two different numbers for the same underlying stat.
  const totals = useMemo(() => {
    const list = userRecipes || [];
    let totalRoundsLoaded = 0;
    let totalRoundsFired = 0;
    let totalMoneySpent = 0;
    let hasAnyMoneySpent = false;
    let bestMoaOverall = null;
    for (const r of list) {
      totalRoundsLoaded += r.totalRoundsLoaded || 0;
      totalRoundsFired += r.totalRoundsFired || 0;
      if (r.totalMoneySpent != null) {
        totalMoneySpent += r.totalMoneySpent;
        hasAnyMoneySpent = true;
      }
      if (r.bestMoa != null && (bestMoaOverall == null || r.bestMoa < bestMoaOverall)) {
        bestMoaOverall = r.bestMoa;
      }
    }
    return {
      recipeCount: list.length,
      totalRoundsLoaded,
      totalRoundsFired,
      totalMoneySpent: hasAnyMoneySpent ? totalMoneySpent : null,
      bestMoaOverall,
    };
  }, [userRecipes]);

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

      {totals.recipeCount > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard value={totals.recipeCount} label="Recipes" />
          <MetricCard value={totals.totalRoundsLoaded} unit="rds" label="Rounds Loaded" />
          <MetricCard value={totals.totalRoundsFired} unit="rds" label="Rounds Fired" />
          <MetricCard
            value={totals.totalMoneySpent != null ? `$${totals.totalMoneySpent.toFixed(2)}` : null}
            label="Total Spent"
            info="Sum of every recipe's Total Money Spent — recipes missing full component pricing in Inventory aren't counted, so this may understate your real total."
          />
          <MetricCard
            value={lifetimeSaved != null ? `$${lifetimeSaved.toFixed(2)}` : null}
            label="Total Saved"
            info="Lifetime money saved vs. comparable factory ammo, across every recipe with a factory price set — same figure shown in the header badge."
          />
          <MetricCard
            value={totals.bestMoaOverall != null ? totals.bestMoaOverall.toFixed(2) : null}
            label="Best MOA Overall"
          />
        </div>
      )}

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
