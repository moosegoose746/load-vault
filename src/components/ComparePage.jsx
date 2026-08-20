import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Scale, Trophy, X } from 'lucide-react';
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
// `better` — 'lower' | 'higher' | null — is what powers the winner badge
// (see computeRowState below): only set on rows where "which one wins"
// is an objective, unambiguous call a reloader would actually make
// (cheaper cost/round, tighter groups, more stock on hand). Left null on
// pure specs (caliber, powder, etc. — there's no "better" caliber) and on
// numbers that don't have one universally correct direction (Avg
// Velocity, Charge Weight, Distance — a higher or lower value isn't
// inherently better, it's just different).
const ROWS = [
  { label: 'Caliber', get: (r) => r.caliber, format: (v) => v || '—' },
  { label: 'Powder', get: (r) => r.powder, format: (v) => v || '—' },
  { label: 'Charge Weight', get: (r) => r.chargeGrains, format: (v) => (v != null ? `${v} gr` : '—') },
  { label: 'Bullet', get: (r) => r.bullet, format: (v) => v || '—' },
  { label: 'Primer', get: (r) => r.primer, format: (v) => v || '—' },
  { label: 'Brass', get: (r) => r.brass, format: (v) => v || '—' },
  { label: 'COAL', get: (r) => r.coalInches, format: (v) => (v != null ? `${v}"` : '—') },
  { label: 'Firearm', get: (r) => r.firearmLabel, format: (v) => v || '—' },
  { label: 'Cost / Round', get: (r) => r.costPerRound, format: moneyFmt, better: 'lower' },
  { label: 'Money Saved', get: (r) => r.moneySaved, format: moneyFmt, better: 'higher' },
  {
    label: 'Avg Velocity',
    get: (r) => r.avgVelocity,
    format: (v) => (v != null ? `${numberFmt(v)} fps` : '—'),
    caliberSensitive: true,
  },
  {
    label: 'SD',
    get: (r) => r.stdDevFps,
    format: (v) => (v != null ? numberFmt(v, 1) : '—'),
    better: 'lower',
    caliberSensitive: true,
  },
  {
    label: 'ES',
    get: (r) => r.extremeSpread,
    format: (v) => (v != null ? numberFmt(v, 1) : '—'),
    better: 'lower',
    caliberSensitive: true,
  },
  {
    label: 'Group Size',
    get: (r) => r.groupSizeMoa,
    format: (v) => (v != null ? `${numberFmt(v, 2)} MOA` : '—'),
    better: 'lower',
    caliberSensitive: true,
  },
  { label: 'Distance', get: (r) => r.distanceYards, format: (v) => (v != null ? `${v} yd` : '—') },
  {
    label: 'Loaded & Ready',
    get: (r) => r.roundsOnHand,
    format: (v) => (v != null ? `${v} rds` : '—'),
    better: 'higher',
  },
  {
    label: 'Loadable From Stock',
    get: (r) => r.loadableFromStock,
    format: (v) => (v != null ? `${v} rds` : '—'),
    better: 'higher',
  },
];

/** For one row, across every recipe whose detail has actually loaded:
 * (1) whether every displayed value is identical — used to dim the row,
 * so a glance down the label column tells you which specs/stats are
 * shared vs. which ones actually distinguish these recipes, rather than
 * making you read every cell to find that out yourself; (2) which
 * recipe id(s) hold the "winning" value, if this row has a `better`
 * direction — ties (two recipes sharing the best value) both win, since
 * picking one arbitrarily would be misleading. Recipes still loading, or
 * with no value for this row, are excluded from both checks rather than
 * counted as a default 0/empty that could falsely win or falsely break
 * the "all same" check. */
function computeRowState(row, recipes, details, caliberMismatch) {
  const loaded = recipes.filter((r) => details[r.id]);
  if (loaded.length < 2) return { allSame: false, winnerIds: new Set() };

  const displayValues = loaded.map((r) => row.format(row.get(details[r.id])));
  const allSame = displayValues.every((v) => v === displayValues[0]);

  // Don't crown a "winner" on a row whose values aren't apples-to-apples
  // in the first place — a lower SD on a 9mm load next to a .270 load
  // isn't actually the "better" one, the calibers just behave
  // differently. The row still shows its raw values and the mismatch
  // warning icon (see caliberSensitive above); it just doesn't award a
  // trophy that would imply a real head-to-head win.
  const winnerIds = new Set();
  if (!allSame && row.better && !(row.caliberSensitive && caliberMismatch)) {
    const numeric = loaded
      .map((r) => ({ id: r.id, value: row.get(details[r.id]) }))
      .filter((entry) => entry.value != null && !Number.isNaN(Number(entry.value)));
    if (numeric.length >= 2) {
      const extreme =
        row.better === 'lower'
          ? Math.min(...numeric.map((e) => Number(e.value)))
          : Math.max(...numeric.map((e) => Number(e.value)));
      numeric.filter((e) => Number(e.value) === extreme).forEach((e) => winnerIds.add(e.id));
    }
  }
  return { allSame, winnerIds };
}

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

  // Caliber/distance mismatch detection — velocity, SD, ES, and group
  // size are only directly comparable within the same caliber (different
  // bullet weights and powder charges behave completely differently), and
  // group size specifically loses some of its apples-to-apples value when
  // recorded at different distances too. Computed off the loaded details'
  // raw caliberId (not the display string) so it can't be fooled by two
  // differently-worded labels for the same caliber; distance uses the
  // plain yardage value. Only recipes whose detail has actually loaded
  // are considered, same as the row-level diff/winner logic below.
  const mismatchInfo = useMemo(() => {
    const loaded = selectedRecipes.filter((r) => details[r.id]);
    if (loaded.length < 2) return { caliberMismatch: false, distanceMismatch: false, caliberGroups: [] };
    const caliberIds = new Set(loaded.map((r) => details[r.id].caliberId ?? details[r.id].caliber));
    const distances = new Set(loaded.map((r) => details[r.id].distanceYards ?? null));
    const groupsByLabel = {};
    loaded.forEach((r) => {
      const label = details[r.id].caliber || '—';
      groupsByLabel[label] = groupsByLabel[label] || [];
      groupsByLabel[label].push(r.title);
    });
    return {
      caliberMismatch: caliberIds.size > 1,
      distanceMismatch: distances.size > 1,
      caliberGroups: Object.entries(groupsByLabel),
    };
  }, [selectedRecipes, details]);

  // Row diff/winner state, recomputed whenever the selection or the
  // fetched details change — see computeRowState above.
  const rowStates = useMemo(() => {
    const map = {};
    ROWS.forEach((row) => {
      map[row.label] = computeRowState(row, selectedRecipes, details, mismatchInfo.caliberMismatch);
    });
    return map;
  }, [selectedRecipes, details, mismatchInfo.caliberMismatch]);

  const anyWinnerBadges = Object.values(rowStates).some((s) => s.winnerIds.size > 0);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <Scale className="text-amber-500" size={20} />
        <h1 className="font-mono text-lg font-bold text-amber-400">COMPARE RECIPES</h1>
        <InfoTooltip>
          Pick two or more of your recipes to see their specs and stats side by side — cost per
          round, velocity stats, group size, and how much of each is currently loaded or loadable
          from stock. Rows where every recipe matches are dimmed; rows that differ are highlighted,
          with the best value (cheapest, tightest, most stock) marked with a trophy. No chart here;
          for a charge-weight-vs-velocity ladder chart, use a Load Workup instead.
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
        <div className="flex flex-col gap-2">
          {mismatchInfo.caliberMismatch && (
            <div className="flex items-start gap-2 rounded border border-amber-600 bg-amber-500/10 p-3 font-mono text-xs leading-relaxed text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <span>
                These recipes are different calibers (
                {mismatchInfo.caliberGroups.map(([caliber, titles], i) => (
                  <span key={caliber}>
                    {i > 0 && ', '}
                    <span className="font-semibold">{caliber}</span>: {titles.join(', ')}
                  </span>
                ))}
                ) — Avg Velocity, SD, ES, and Group Size (marked below) aren't directly comparable
                across different calibers; bullet weight and charge weight behave too differently
                for those numbers to mean the same thing. Specs and cost/round are still fine to
                compare.
              </span>
            </div>
          )}
          {!mismatchInfo.caliberMismatch && mismatchInfo.distanceMismatch && (
            <div className="flex items-start gap-2 rounded border border-slate-700 bg-slate-900/60 p-3 font-mono text-xs leading-relaxed text-slate-400">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <span>
                These recipes were tested at different distances — Group Size is in MOA (already
                angle-normalized, so it's still comparable), but keep in mind different range days
                and distances can mean different conditions behind the numbers.
              </span>
            </div>
          )}
          {anyWinnerBadges && (
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
              <Trophy size={12} className="text-emerald-400" />
              marks the best value in a row (cheapest cost/round, most money saved, tightest
              group/SD/ES, most rounds on hand)
            </p>
          )}
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
                {ROWS.map((row) => {
                  const { allSame, winnerIds } = rowStates[row.label];
                  return (
                    <tr key={row.label} className={allSame ? 'opacity-40' : 'odd:bg-slate-900/40'}>
                      <td
                        className={`sticky left-0 z-10 border-r border-slate-700 px-3 py-2 ${
                          allSame ? 'bg-slate-900 text-slate-500' : 'bg-slate-900 font-semibold text-slate-300'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {row.label}
                          {row.caliberSensitive && mismatchInfo.caliberMismatch && (
                            <AlertTriangle
                              size={11}
                              className="shrink-0 text-amber-400"
                              aria-label="Not directly comparable across calibers"
                            />
                          )}
                        </span>
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
                        const isWinner = winnerIds.has(r.id);
                        return (
                          <td
                            key={r.id}
                            className={`px-3 py-2 ${
                              isWinner
                                ? 'font-semibold text-emerald-300'
                                : allSame
                                  ? 'text-slate-500'
                                  : 'text-slate-200'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {isWinner && <Trophy size={11} className="shrink-0 text-emerald-400" />}
                              {row.format(value)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
