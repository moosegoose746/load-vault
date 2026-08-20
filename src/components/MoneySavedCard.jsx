import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import InfoTooltip from './InfoTooltip.jsx';
import { updateRecipeFactoryPrice } from '../lib/recipes.js';

const formatMoney = (n) => `$${n.toFixed(2)}`;

// Money Saved vs. Factory Ammo — only computable once the user has entered
// a Comparable Factory Price for this recipe (see schema_recipes_v3.sql /
// mapRecipeRow's moneySaved). Since there's no general recipe-edit UI
// (recipes are create-once via RecipeForm.jsx), setting/changing that
// price happens right here instead — a narrow inline editor rather than a
// whole edit flow just for one field. Only rendered for a real saved
// recipe (`recipeId` set); the demo recipe has nothing to persist a price
// against.
//
// Moved out of Sidebar.jsx (was MoneySavedRow there) into its own file
// alongside the rest of the Overview's highlighted-stats row — same logic,
// restyled from a narrow sidebar row into a card matching MetricCard's
// size/weight so it sits naturally next to Cost/Round, Loaded & Ready, and
// Loadable From Stock now that there's real width to work with.
export default function MoneySavedCard({ recipe, recipeId, onSaved }) {
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
      <div className="flex flex-col justify-center gap-1.5 rounded border border-slate-700 bg-panel px-3 py-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Comparable Factory Price ($/round)
        </span>
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded border border-amber-500 px-2 py-1 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
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
    return (
      <div className="flex flex-col items-center justify-center gap-0.5 rounded border border-emerald-700/60 bg-emerald-500/10 px-3 py-4">
        <span className="font-mono text-2xl font-bold text-emerald-300">{formatMoney(recipe.moneySaved)}</span>
        <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
          Money Saved
          <InfoTooltip align="left">
            (factory price − your cost/round) × every round you've ever loaded of this recipe.
            Doesn't go down as ammo gets fired — it's lifetime savings, not what's currently on
            hand.
          </InfoTooltip>
          <button
            onClick={startEditing}
            aria-label="Edit factory price"
            className="text-emerald-400/70 hover:text-emerald-300"
          >
            <Pencil size={11} />
          </button>
        </span>
        {/* Show the comparable factory price itself right here, not just
            the derived savings — the user shouldn't have to open the
            editor just to see what number they entered. */}
        <span className="font-mono text-[10px] text-slate-500">
          vs. {formatMoney(recipe.factoryPricePerRound)}/rd factory
        </span>
      </div>
    );
  }

  // moneySaved is null for two different reasons, and the CTA needs to
  // name the right one: either no factory price has been entered yet, or
  // one has, but costPerRound itself is null because some component on
  // this recipe still doesn't have a saved Inventory price. Telling
  // someone to "add a factory price" they already added would send them
  // chasing the wrong field.
  return (
    <button
      onClick={startEditing}
      className="flex flex-col items-center justify-center gap-1 rounded border border-dashed border-slate-700 px-3 py-4 text-center hover:border-amber-500"
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Money Saved</span>
      <span className="font-mono text-[11px] text-slate-500">
        {recipe.factoryPricePerRound != null
          ? 'Needs a price for every component — add pricing in Inventory'
          : '+ Add factory price'}
      </span>
    </button>
  );
}
