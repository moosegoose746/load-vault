import { useEffect, useMemo, useState } from 'react';
import { ArrowDownNarrowWide, Pencil, Plus } from 'lucide-react';
import MoaBadge from './MoaBadge.jsx';
import InfoTooltip from './InfoTooltip.jsx';
import { updateRecipeFactoryPrice } from '../lib/recipes.js';

// Section 3: "Left Sidebar (Specs & Filter Panel) — Prominent MOA Badge,
// Dropdown Selectors (Caliber/Powder/Bullet), Quick Spec List."
//
// The original Phase 2 version had hardcoded, non-functional
// caliber/powder/bullet "filter" dropdowns as placeholders. Now that real
// recipes exist, this is a real recipe switcher instead: pick a saved
// recipe to view, or create a new one. The specs below always reflect
// whichever recipe (real or the built-in demo) is currently active.

// items-start (not items-center) + a non-wrapping, non-shrinking label is
// deliberate: a long value (e.g. ".223 Remington / 5.56 NATO") wraps to
// two lines at the Sidebar's width, and items-center was pulling the
// label down to vertically center against the now-taller wrapped value
// instead of staying pinned to its first line. text-right on the value
// keeps wrapped lines readable instead of straddling the row's center.
function SpecRow({ label, value, info }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800 py-2 last:border-none">
      <span className="flex shrink-0 items-center whitespace-nowrap text-xs text-slate-400">
        {label}
        {info && <InfoTooltip align="left">{info}</InfoTooltip>}
      </span>
      <span className="text-right font-mono text-sm text-slate-100">{value}</span>
    </div>
  );
}

// For the derived numbers that get checked most (Cost/Round, Loaded &
// Ready — see the UX audit) — an amber-highlighted row instead of a
// plain SpecRow, so they stand out from raw component specs (Caliber,
// COAL, etc.) and from Loadable From Stock, which is more of a
// secondary projection than a number you'd check at a glance.
function HighlightRow({ label, value, tone = 'amber', info, children }) {
  const toneClasses =
    tone === 'emerald'
      ? { bg: 'bg-emerald-500/10', label: 'text-emerald-400', value: 'text-emerald-300' }
      : { bg: 'bg-amber-500/10', label: 'text-amber-400', value: 'text-amber-300' };
  return (
    <div className={`flex items-center justify-between rounded ${toneClasses.bg} px-2 py-2`}>
      <span className={`flex items-center text-xs font-semibold uppercase tracking-wide ${toneClasses.label}`}>
        {label}
        {info && <InfoTooltip align="left">{info}</InfoTooltip>}
      </span>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-base font-bold ${toneClasses.value}`}>{value}</span>
        {children}
      </div>
    </div>
  );
}

const formatMoney = (n) => `$${n.toFixed(2)}`;

// Money Saved vs. Factory Ammo — only computable once the user has
// entered a Comparable Factory Price for this recipe (see
// schema_recipes_v3.sql / mapRecipeRow's moneySaved). Since there's no
// general recipe-edit UI (recipes are create-once via RecipeForm.jsx),
// setting/changing that price happens right here instead — a narrow
// inline editor rather than a whole edit flow just for one field. Only
// rendered for a real saved recipe (`recipeId` set); the demo recipe has
// nothing to persist a price against.
function MoneySavedRow({ recipe, recipeId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEditing(false);
    setInput('');
    setError('');
  }, [recipeId]);

  if (!recipeId) return null;

  const startEditing = () => {
    setInput(recipe.factoryPricePerRound != null ? String(recipe.factoryPricePerRound) : '');
    setError('');
    setEditing(true);
  };

  const handleSave = async () => {
    const parsed = input === '' ? null : Number.parseFloat(input);
    if (input !== '' && (Number.isNaN(parsed) || parsed < 0)) {
      setError('Enter a valid price, or leave blank to clear it.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateRecipeFactoryPrice(recipeId, parsed);
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 rounded border border-slate-700 bg-slate-900 p-2">
        <span className="text-xs text-slate-400">Comparable factory price ($/round)</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. 1.25"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded border border-amber-500 px-2 py-1 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
          >
            {saving ? '…' : 'SAVE'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded border border-slate-700 px-2 py-1 font-mono text-xs text-slate-300 hover:border-slate-500"
          >
            CANCEL
          </button>
        </div>
        {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
      </div>
    );
  }

  if (recipe.moneySaved != null) {
    // Deliberately NOT the shared HighlightRow layout — cramming
    // "MONEY SAVED" + the info icon + a dollar value + "saved" + an edit
    // pencil all onto one label/value line was too tight at the
    // Sidebar's width and caused both sides to wrap unpredictably. Label
    // (with the edit pencil alongside it, not the value) on its own top
    // line, one big value line underneath — same visual weight as
    // HighlightRow, just stacked instead of squeezed side by side.
    return (
      <div className="flex flex-col gap-1 rounded bg-emerald-500/10 px-2 py-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-emerald-400">
            Money Saved
            <InfoTooltip align="left">
              (factory price − your cost/round) × every round you've ever loaded of this recipe.
              Doesn't go down as ammo gets fired — it's lifetime savings, not what's currently on
              hand.
            </InfoTooltip>
          </span>
          <button
            onClick={startEditing}
            aria-label="Edit factory price"
            className="text-emerald-400/70 hover:text-emerald-300"
          >
            <Pencil size={12} />
          </button>
        </div>
        <span className="font-mono text-base font-bold text-emerald-300">
          {formatMoney(recipe.moneySaved)}
        </span>
        {/* Show the comparable factory price itself right here, not just
            the derived savings — the user shouldn't have to open the
            editor just to see what number they entered. */}
        <p className="font-mono text-[10px] text-slate-500">
          vs. {formatMoney(recipe.factoryPricePerRound)}/rd factory
        </p>
      </div>
    );
  }

  // moneySaved is null for two different reasons, and the CTA needs to
  // name the right one: either no factory price has been entered yet, or
  // one has, but costPerRound itself is null because some component on
  // this recipe still doesn't have a saved Inventory price (now that
  // pricing is optional, this got a lot more likely to happen — see the
  // Cost/Round row's tooltip above). Telling someone to "add a factory
  // price" they already added would send them chasing the wrong field.
  if (recipe.factoryPricePerRound != null) {
    return (
      <button
        onClick={startEditing}
        className="rounded border border-dashed border-slate-700 px-2 py-1.5 text-left font-mono text-[11px] text-slate-500 hover:border-amber-500 hover:text-amber-400"
      >
        Money saved needs a price for every component — add pricing in Inventory
      </button>
    );
  }

  return (
    <button
      onClick={startEditing}
      className="rounded border border-dashed border-slate-700 px-2 py-1.5 text-left font-mono text-[11px] text-slate-500 hover:border-amber-500 hover:text-amber-400"
    >
      + Add factory price to see money saved
    </button>
  );
}

export default function Sidebar({
  recipe,
  userRecipes,
  activeRecipeId,
  onSelectRecipe,
  onNewRecipe,
  onRecipeUpdated,
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

      <div className="flex flex-col rounded border border-slate-800 bg-panel p-3">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-amber-400">
          Component Specs
        </h2>
        {/* Charge Weight moved right under Powder — it's a property of
            the powder charge, so it reads more naturally directly below
            it than separated by Bullet. The value also no longer repeats
            the powder name (e.g. "25 gr Hodgon H4350") — that's redundant
            with the Powder row directly above it, just "25 gr" now. */}
        <SpecRow label="Caliber" value={recipe.caliber} />
        <SpecRow label="Powder" value={recipe.powder} />
        <SpecRow label="Charge Weight" value={recipe.chargeGrains != null ? `${recipe.chargeGrains} gr` : '—'} />
        <SpecRow label="Bullet" value={recipe.bullet} />
        <SpecRow label="COAL" value={recipe.coalInches ? `${recipe.coalInches}"` : '—'} />
        <SpecRow label="Primer" value={recipe.primer} />
        <SpecRow label="Brass" value={recipe.brass} />

        <div className="my-2 border-t border-slate-800" />

        <div className="flex flex-col gap-1.5 pb-1.5">
          <HighlightRow
            label="Cost / Round"
            value={recipe.costPerRound != null ? `$${recipe.costPerRound.toFixed(2)}` : '—'}
            info={`What one round of this recipe costs in components, from your own saved Inventory pricing. Shows "—" if any component doesn't have a saved price yet.`}
          />
          <HighlightRow
            label="Loaded & Ready"
            value={recipe.roundsOnHand != null ? `${recipe.roundsOnHand} rounds` : '—'}
            info="Rounds actually assembled and sitting ready to shoot right now — total rounds logged in a Loading Session, minus rounds logged as fired at the range."
          />
          <MoneySavedRow
            recipe={recipe}
            recipeId={activeRecipeId}
            onSaved={onRecipeUpdated ?? (() => Promise.resolve())}
          />
        </div>

        <SpecRow
          label="Loadable From Stock"
          value={
            recipe.loadableFromStock != null
              ? `${recipe.loadableFromStock} (${recipe.loadableBottleneck})`
              : '—'
          }
          info="How many MORE rounds you could load from raw components you have on hand — a raw-materials estimate, not rounds already assembled (that's Loaded & Ready above). Limited by whichever tracked component would run out first."
        />
      </div>
    </aside>
  );
}
