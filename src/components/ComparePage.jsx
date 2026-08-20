import { useEffect, useMemo, useState } from 'react';
import { Scale, X } from 'lucide-react';
import InfoTooltip from './InfoTooltip.jsx';
import { fetchUserRecipes, fetchRecipeDetail } from '../lib/recipes.js';

// Load Workup Slice 4 — the standalone Compare page. Per the original
// 4-slice plan (see progress-log.md), this is deliberately the general
// case: pick ANY 2+ of the user's own recipes (not scoped to a single
// Workup's rungs) and see them side by side in a plain spec/stat table.
// No chart here on purpose — that's what the Workup chart is for. A
// side-by-side TABLE is the right form per the dataviz skill's
// choosing-a-form guidance: this is direct value comparison across a
// handful of discrete items, not a trend or distribution, so a table
// reads faster than any chart would.
//
// Reuses fetchRecipeDetail per selected recipe rather than inventing a
// new bulk-fetch query — it already computes every stat this page wants
// (cost/round, velocity stats, group size, Loaded & Ready, Loadable From
// Stock, Money Saved) from the same pricing/inventory logic used
// everywhere else in the app, so the numbers here can never drift from
// what Sidebar/Dashboard show for the same recipe.

const numberFmt = (value, digits = 0) => (value == null ? '—' : Number(value).toFixed(digits));
const moneyFmt = (value) => (value == null ? '—' : `$${Number(value).toFixed(2)}`);

// One row per spec/stat, in display order. `get` pulls the value off a
// mapRecipeRow-shaped detail object; `format` turns it into display text.
const ROWS = [
  { label: 'Caliber', get: (r) => r.caliber, format: (v) => v || '—' },
  { label: 'Powder', get: (r) => r.powder, format: (v) => v || '—' },
  { label: 'Charge Weight', get: (r) => r.chargeGrains, format: (v) => (v != null ? `${v} gr` : '—') },
  { label: 'Bullet', get: (r) => r.bullet, format: (v) => v || '—' },
  { label: 'Primer', get: (r) => r.primer, format: (v) => v || '—' },
  { label: 'Brass', get: (r) => r.brass, format: (v) => v || '—' },
  { label: 'COAL', get: (r) => r.coalInches, format: (v) => (v != null ? `${v}"` : '—') },
  { label: 'Firearm', get: (r) => r.firearmLabel, format: (v) => v || '—' },
  { label: 'Cost / Round', get: (r) => r.costPerRound, format: moneyFmt, highlight: true },
  { label: 'Money Saved', get: (r) => r.moneySaved, format: moneyFmt, highlight: true },
  {
    label: 'Avg Velocity',
    get: (r) => r.avgVelocity,
    format: (v) => (v != null ? `${numberFmt(v)} fps` : '—'),
  },
  { label: 'SD', get: (r) => r.stdDevFps, format: (v) => (v != null ? numberFmt(v, 1) : '—') },
  { label: 'ES', get: (r) => r.extremeSpread, format: (v) => (v != null ? numberFmt(v, 1) : '—') },
  {
    label: 'Group Size',
    get: (r) => r.groupSizeMoa,
    format: (v) => (v != null ? `${numberFmt(v, 2)} MOA` : '—'),
  },
  { label: 'Distance', get: (r) => r.distanceYards, format: (v) => (v != null ? `${v} yd` : '—') },
  { label: 'Loaded & Ready', get: (r) => r.roundsOnHand, format: (v) => (v != null ? `${v} rds` : '—') },
  {
    label: 'Loadable From Stock',
    get: (r) => r.loadableFromStock,
    format: (v) => (v != null ? `${v} rds` : '—'),
  },
];

export default function ComparePage({ authUser }) {
  const [recipeList, setRecipeList] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [details, setDetails] = useState({}); // recipeId -> detail object
  const [loadingIds, setLoadingIds] = useState([]);
  const [listError, setListError] = useState('');
  const [detailErrors, setDetailErrors] = useState({}); // recipeId -> message

  useEffect(() => {
    if (!authUser) return;
    fetchUserRecipes(authUser.id)
      .then(setRecipeList)
      .catch((err) => {
        console.error('Failed to load recipe list for Compare', err);
        setListError('Failed to load your recipes.');
      });
  }, [authUser]);

  const toggleRecipe = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Fetch detail for any newly-selected recipe not already cached; never
  // refetch one that's already loaded (or currently loading) — selecting
  // and deselecting recipes shouldn't re-hit the network for ones already
  // seen this session.
  useEffect(() => {
    if (!authUser) return;
    const missing = selectedIds.filter((id) => !details[id] && !loadingIds.includes(id));
    if (!missing.length) return;
    setLoadingIds((prev) => [...prev, ...missing]);
    missing.forEach((id) => {
      fetchRecipeDetail(id, authUser.id)
        .then((detail) => {
          setDetails((prev) => ({ ...prev, [id]: detail }));
        })
        .catch((err) => {
          console.error('Failed to load recipe detail for Compare', err);
          setDetailErrors((prev) => ({ ...prev, [id]: 'Failed to load this recipe.' }));
        })
        .finally(() => {
          setLoadingIds((prev) => prev.filter((x) => x !== id));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, authUser]);

  const selectedRecipes = useMemo(
    () => selectedIds.map((id) => recipeList.find((r) => r.id === id)).filter(Boolean),
    [selectedIds, recipeList]
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <Scale className="text-amber-500" size={20} />
        <h1 className="font-mono text-lg font-bold text-amber-400">COMPARE RECIPES</h1>
        <InfoTooltip>
          Pick two or more of your recipes to see their specs and stats side by side — cost per
          round, velocity stats, group size, and how much of each is currently loaded or loadable
          from stock. No chart here; for a charge-weight-vs-velocity ladder chart, use a Load
          Workup instead.
        </InfoTooltip>
      </div>

      {listError && <p className="font-mono text-xs text-red-400">{listError}</p>}

      {/* Recipe picker */}
      <div className="rounded border border-slate-700 bg-slate-900/60 p-4">
        <p className="mb-3 font-mono text-xs uppercase tracking-wide text-slate-400">
          Select recipes to compare
        </p>
        {recipeList.length === 0 ? (
          <p className="font-mono text-xs text-slate-500">
            You don't have any saved recipes yet — save one from the Vault first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recipeList.map((r) => {
              const active = selectedIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRecipe(r.id)}
                  className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                    active
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-slate-700 text-slate-300 hover:border-amber-500/60 hover:text-amber-400'
                  }`}
                >
                  {r.title}
                  {active && <X size={12} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Comparison table */}
      {selectedRecipes.length === 0 ? (
        <p className="font-mono text-xs text-slate-500">
          Pick two or more recipes above to compare them.
        </p>
      ) : selectedRecipes.length === 1 ? (
        <p className="font-mono text-xs text-slate-500">Pick at least one more recipe to compare.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-700 bg-slate-900/60">
          <table className="min-w-full border-collapse font-mono text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-slate-700 bg-slate-900 px-3 py-2 text-left text-slate-400">
                  &nbsp;
                </th>
                {selectedRecipes.map((r) => (
                  <th
                    key={r.id}
                    className="min-w-[160px] border-b border-slate-700 px-3 py-2 text-left text-amber-300"
                  >
                    {r.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="odd:bg-slate-900/40">
                  <td className="sticky left-0 z-10 border-r border-slate-700 bg-slate-900 px-3 py-2 text-slate-400 odd:bg-slate-900">
                    {row.label}
                  </td>
                  {selectedRecipes.map((r) => {
                    const detail = details[r.id];
                    if (loadingIds.includes(r.id)) {
                      return (
                        <td key={r.id} className="px-3 py-2 text-slate-600">
                          loading…
                        </td>
                      );
                    }
                    if (detailErrors[r.id]) {
                      return (
                        <td key={r.id} className="px-3 py-2 text-red-400">
                          error
                        </td>
                      );
                    }
                    if (!detail) {
                      return (
                        <td key={r.id} className="px-3 py-2 text-slate-600">
                          —
                        </td>
                      );
                    }
                    const value = row.get(detail);
                    return (
                      <td
                        key={r.id}
                        className={`px-3 py-2 ${
                          row.highlight ? 'font-semibold text-amber-300' : 'text-slate-200'
                        }`}
                      >
                        {row.format(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
