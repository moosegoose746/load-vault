import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, Scale, Trophy, X } from 'lucide-react';
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

// Below this many recorded shots, SD/ES (and the average they're built
// from) can look meaningfully better or worse than the load actually is —
// same threshold and reasoning as the Workup chart's small-sample caveat
// (see WorkupChart.jsx's Observations panel). Used below to color the
// shot-count subtext amber as a quiet caution, not to hide or gate the
// stat itself — a 3-shot group is still real data, just lower-confidence.
const SMALL_SAMPLE_THRESHOLD = 5;

// One row per spec/stat, in display order. `get` pulls the value off a
// mapRecipeRow-shaped detail object; `format` turns it into display text.
// `better` — 'lower' | 'higher' | null — is what powers the winner badge
// (see computeRowState below): only set on rows where "which one wins"
// is an objective, unambiguous call a reloader would actually make
// (cheaper cost/round, tighter groups, more stock on hand). Left null on
// pure specs (caliber, powder, etc. — there's no "better" caliber) and on
// numbers that don't have one universally correct direction (Avg
// Velocity, Charge Weight, Distance — a higher or lower value isn't
// inherently better, it's just different). `sampleSize` marks the three
// rows derived from the latest range session's shot-by-shot log (Avg
// Velocity, SD, ES) — their cells get a small "n=X shots" subtext (see
// SMALL_SAMPLE_THRESHOLD above) so a 3-shot SD and a 20-shot SD aren't
// presented with equal confidence just because they're both numbers in
// the same row.
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
    sampleSize: true,
  },
  {
    label: 'SD',
    get: (r) => r.stdDevFps,
    format: (v) => (v != null ? numberFmt(v, 1) : '—'),
    better: 'lower',
    caliberSensitive: true,
    sampleSize: true,
  },
  {
    label: 'ES',
    get: (r) => r.extremeSpread,
    format: (v) => (v != null ? numberFmt(v, 1) : '—'),
    better: 'lower',
    caliberSensitive: true,
    sampleSize: true,
  },
  {
    label: 'Group Size',
    get: (r) => r.groupSizeMoa,
    format: (v) => (v != null ? `${numberFmt(v, 2)} MOA` : '—'),
    better: 'lower',
    caliberSensitive: true,
    // MOA is already distance-normalized by definition, so a mismatch
    // here doesn't disqualify the comparison the way caliberSensitive
    // does — it's shown as context (see distanceContext below) rather
    // than gating the winner trophy, since a 1 MOA group at 100yd and a
    // 1 MOA group at 300yd genuinely are the same number. What differs
    // is confidence in that number (fewer shots / farther distances
    // amplify wind and measurement error), which is the user's call to
    // weigh, not something the app should silently decide for them.
    distanceContext: true,
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

// Drives the auto-generated takeaway line above the table (see
// buildTakeaway below) — a deliberately SHORT, prioritized subset of ROWS,
// not all of them. Order is the priority a reloader would actually weigh
// a decision by: cost first (the most universally actionable number),
// then accuracy/consistency (what the load actually does), then physical
// stock (practical, but secondary to whether the load is good). ES is
// deliberately left out here — it's highly correlated with SD and would
// mostly just repeat the same story in different words, which is exactly
// the kind of redundant clause a SHORT summary line can't afford. Money
// Saved is last since it's a slower-moving, less decision-relevant
// restatement of Cost/Round (it factors in how much you've loaded, not
// just the per-round economics). `clause` takes the formatted value and
// an optional context object (currently just `{ smallSample }` for SD)
// and returns the fragment of sentence naming what this recipe does well.
const TAKEAWAY_METRICS = [
  { label: 'Cost / Round', clause: (v) => `is cheaper at ${v}/rd` },
  { label: 'Group Size', clause: (v) => `groups tighter (${v})` },
  {
    label: 'SD',
    clause: (v, ctx) => `has more consistent velocity (SD ${v}${ctx?.smallSample ? ', small sample' : ''})`,
  },
  { label: 'Loaded & Ready', clause: (v) => `has more loaded and ready (${v})` },
  { label: 'Loadable From Stock', clause: (v) => `could load more from current stock (${v})` },
  { label: 'Money Saved', clause: (v) => `has saved more money overall (${v})` },
];

const TAKEAWAY_MAX_CLAUSES_PER_RECIPE = 2;
const TAKEAWAY_MAX_TOTAL_CLAUSES = 6;

/** Builds the plain-English takeaway line — the "which one should I
 * actually pick" summary that sits above the raw table. Deliberately
 * reuses `rowStates` (the same diff/winner computation that drives the
 * table's dimming and trophy badges) as its ONLY source of truth for
 * "who wins what," rather than re-deriving winners with separate logic —
 * that guarantees the takeaway line can never disagree with what the
 * table itself shows (e.g. never crowning a winner on a caliber-mismatched
 * row that the table correctly refuses to badge). Only considers recipes
 * whose detail has actually loaded — a recipe still fetching just doesn't
 * contribute a clause yet, rather than blocking or misrepresenting the
 * summary for the ones that HAVE loaded.
 *
 * Caps at TAKEAWAY_MAX_CLAUSES_PER_RECIPE per recipe (a recipe that wins
 * on cost, groups, AND stock still only gets its top 2 mentioned — the
 * full picture is one scroll away in the table) and
 * TAKEAWAY_MAX_TOTAL_CLAUSES overall (keeps a 5+ recipe comparison from
 * turning into an unreadable run-on sentence). Returns `null` if fewer
 * than two recipes have loaded yet, and a specific "no clear standout"
 * message (rather than nothing) if every metric came back tied or
 * unavailable — the absence of a difference is itself useful information
 * for a reloader deciding between two loads. */
function buildTakeaway(recipes, details, rowStates) {
  const loaded = recipes.filter((r) => details[r.id]);
  if (loaded.length < 2) return null;

  const clausesByRecipeId = {};
  let totalClauses = 0;

  for (const metric of TAKEAWAY_METRICS) {
    if (totalClauses >= TAKEAWAY_MAX_TOTAL_CLAUSES) break;
    const row = ROWS.find((r) => r.label === metric.label);
    const state = rowStates[metric.label];
    // A winner set covering EVERY loaded recipe is just a tie dressed up
    // as a win (computeRowState already excludes true ties via allSame,
    // but guard here too in case only a subset of `loaded` has a numeric
    // value for this row) — uninformative either way, skip it.
    if (!row || !state || state.winnerIds.size === 0 || state.winnerIds.size >= loaded.length) continue;

    for (const id of state.winnerIds) {
      if (totalClauses >= TAKEAWAY_MAX_TOTAL_CLAUSES) break;
      const existing = clausesByRecipeId[id] || [];
      if (existing.length >= TAKEAWAY_MAX_CLAUSES_PER_RECIPE) continue;
      const detail = details[id];
      const value = row.format(row.get(detail));
      const ctx = row.sampleSize
        ? { smallSample: (detail.shots?.length ?? 0) > 0 && (detail.shots?.length ?? 0) < SMALL_SAMPLE_THRESHOLD }
        : undefined;
      clausesByRecipeId[id] = [...existing, metric.clause(value, ctx)];
      totalClauses += 1;
    }
  }

  const sentenceParts = loaded
    .filter((r) => clausesByRecipeId[r.id]?.length)
    .map((r) => `${r.title} ${clausesByRecipeId[r.id].join(' and ')}`);

  if (!sentenceParts.length) {
    return 'No clear standout on cost, accuracy, or stock — these recipes are close to identical on the numbers below.';
  }
  return `${sentenceParts.join('; ')}.`;
}

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

  // The auto-generated takeaway line — see buildTakeaway above. Recomputes
  // whenever the row states do, since it's built entirely from them.
  const takeaway = useMemo(
    () => buildTakeaway(selectedRecipes, details, rowStates),
    [selectedRecipes, details, rowStates]
  );
  const stillLoading = selectedIds.some((id) => loadingIds.includes(id));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <Scale className="text-amber-500" size={20} />
        <h1 className="font-mono text-lg font-bold text-amber-400">COMPARE RECIPES</h1>
        <InfoTooltip>
          Pick two or more of your recipes to see their specs and stats side by side — cost per
          round, velocity stats, group size, and how much of each is currently loaded or loadable
          from stock. A plain-English takeaway line summarizes the biggest differences, built from
          the same numbers as the table below it. Rows where every recipe matches are dimmed; rows
          that differ are highlighted, with the best value (cheapest, tightest, most stock) marked
          with a trophy. Avg Velocity/SD/ES show how many shots they're based on — a small sample
          can look better or worse than the load actually is. No chart here; for a
          charge-weight-vs-velocity ladder chart, use a Load Workup instead.
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
            You don't have any saved recipes yet — save one from Recipes first.
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
          {takeaway && (
            <div className="flex items-start gap-2 rounded border border-sky-700/60 bg-sky-500/10 p-3 font-mono text-xs leading-relaxed text-sky-200">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-sky-400" />
              <span>
                {takeaway}
                {stillLoading && (
                  <span className="ml-1 text-sky-400/70">(still loading the rest — may update)</span>
                )}
              </span>
            </div>
          )}
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
                These recipes were tested at different distances (see the yardage under each Group
                Size below) — MOA is already angle-normalized, so the numbers are still directly
                comparable, but a farther distance and fewer shots both add more room for wind and
                measurement error behind the same MOA value.
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
                        // Shot count backing this stat, only for the
                        // sampleSize-flagged rows — see SMALL_SAMPLE_THRESHOLD
                        // above. `shots` is the latest range session's
                        // per-shot velocity log (same array Avg
                        // Velocity/SD/ES are all computed from), so its
                        // length is exactly the sample size behind this cell.
                        const shotCount = row.sampleSize ? (detail.shots?.length ?? 0) : null;
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
                            {shotCount > 0 && (
                              <div
                                className={`mt-0.5 text-[10px] font-normal ${
                                  shotCount < SMALL_SAMPLE_THRESHOLD ? 'text-amber-500' : 'text-slate-500'
                                }`}
                              >
                                n={shotCount} shot{shotCount === 1 ? '' : 's'}
                                {shotCount < SMALL_SAMPLE_THRESHOLD ? ' · small sample' : ''}
                              </div>
                            )}
                            {row.distanceContext && value != null && (
                              <div
                                className={`mt-0.5 text-[10px] font-normal ${
                                  detail.distanceYards != null ? 'text-slate-500' : 'text-amber-500'
                                }`}
                              >
                                {detail.distanceYards != null ? `@ ${detail.distanceYards}yd` : 'distance unknown'}
                              </div>
                            )}
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
