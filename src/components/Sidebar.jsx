import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
  onEditRecipe,
  onDeleteRecipe,
  onRecipeUpdated,
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
        <div className="flex gap-2">
          <button
            onClick={onNewRecipe}
            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
          >
            <Plus size={14} />
            NEW RECIPE
          </button>
          {activeRecipeId && (
            <button
              onClick={() => onEditRecipe?.(activeRecipeId)}
              title="Edit this recipe"
              aria-label="Edit this recipe"
              className="flex items-center justify-center rounded border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-amber-500 hover:text-amber-400"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>

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
