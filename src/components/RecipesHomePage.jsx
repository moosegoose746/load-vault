import { useMemo, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Scale,
  Square,
  Trash2,
  Trophy,
  Zap,
} from 'lucide-react';
import MetricCard from './MetricCard.jsx';
import { STALE_TEST_DAYS } from '../lib/recipes.js';

// A small label/value stat box — same visual treatment Best MOA already
// used, pulled out since the card now shows several of these instead of
// one. `variant="saved"` mirrors MetricCard's emerald treatment so Money
// Saved reads as the same kind of good-news figure here as it does on the
// totals row and the individual recipe's Overview. A null value renders
// dim/slate instead of amber — a card with several "—" stats (a brand new
// recipe, or one that's only ever been Quick Logged) should visually read
// as "nothing here yet" at a glance, not compete for attention with cards
// that actually have real numbers.
function CardStat({ label, value, variant }) {
  const isSaved = variant === 'saved';
  const isEmpty = value == null;
  return (
    <div
      className={`flex items-center justify-between rounded border px-3 py-2 ${
        isSaved && !isEmpty ? 'border-emerald-700/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'
      }`}
    >
      <span
        className={`font-mono text-[10px] uppercase tracking-widest ${
          isSaved && !isEmpty ? 'text-emerald-400' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-sm font-semibold ${
          isEmpty ? 'text-slate-600' : isSaved ? 'text-emerald-300' : 'text-amber-400'
        }`}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

// The card's three "headline" stats (Best MOA, Cost/Round, Money Saved) —
// visually bigger than CardStat below since these are the ones worth
// reading at a glance while scanning the grid; everything else (Recent
// MOA, Loaded & Ready, Rounds Fired, Total Spent) lives behind the "More
// stats" toggle instead of competing with these for attention.
function PrimaryStat({ label, value, variant }) {
  const isSaved = variant === 'saved';
  const isEmpty = value == null;
  return (
    <div
      className={`flex flex-col items-center justify-center gap-0.5 rounded border px-2 py-2.5 ${
        isSaved && !isEmpty ? 'border-emerald-700/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'
      }`}
    >
      <span
        className={`font-mono text-base font-bold ${
          isEmpty ? 'text-slate-600' : isSaved ? 'text-emerald-300' : 'text-amber-400'
        }`}
      >
        {value ?? '—'}
      </span>
      <span
        className={`font-mono text-[9px] uppercase tracking-widest ${
          isSaved && !isEmpty ? 'text-emerald-400' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

const moneyFmt = (v) => (v != null ? `$${v.toFixed(2)}` : null);
const moaFmt = (v) => (v != null ? v.toFixed(2) : null);

// Days between now and a timestamp, floored — null-safe. Used for both the
// "last tested" staleness check and the relative-date labels below.
function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// "3 days ago" / "6 mo ago" / "2 yr ago" — coarser than a raw date once
// it's been a while, since "this load hasn't been touched in 8 months" is
// the thing worth noticing, not the exact day.
function relativeLabel(days) {
  if (days == null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.round(days / 365)} yr ago`;
}

// One recipe, as a card. Caliber gets its own small chip, and charge
// weight/powder/bullet get a compact spec line under the title — two
// recipes for the same caliber and firearm (a common "Test 1"/"Test 2"
// charge-weight ladder) used to look identical at a glance except for the
// title; this line is what actually tells them apart the way a reloader
// would ("42.5gr H4350 · 140gr ELD-M"). Best MOA (tightest group ever) and
// Most Recent MOA (the last one actually measured) are shown separately —
// "how good has this load ever shot" and "how's it shooting lately" are
// genuinely different questions, and they can diverge (see Dashboard's
// Quick Log discussion in the progress log). A trophy badge marks whichever
// card(s) hold the single best Best MOA across the whole vault — computed
// automatically from the same numbers already on every card, not a manual
// pin, so there's no separate favorite state to keep in sync. A low-stock
// badge and a last-tested/Quick-Log activity line both surface exactly the
// kind of thing a reloader would otherwise only notice by opening the
// recipe: "you're close to needing more primers for this," and "that group
// is from four months ago, not last week." Select mode (driven by
// RecipesHomePage's Compare toggle) swaps the click-to-open/Edit/Delete
// behavior for a checkbox so 2+ cards can be picked and sent to Compare.
function RecipeCard({ recipe, onOpen, onEdit, onDelete, isBestOverall, selectMode, selected, onToggleSelect }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const hasAnyActivity = (recipe.totalRoundsLoaded || 0) > 0 || (recipe.totalRoundsFired || 0) > 0;

  const staleDays = daysSince(recipe.lastMeasuredAt);
  const isStale = staleDays != null && staleDays >= STALE_TEST_DAYS;

  const handleCardClick = () => {
    if (selectMode) {
      onToggleSelect(recipe.id);
    } else {
      onOpen(recipe.id);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`relative flex cursor-pointer flex-col gap-3 rounded border bg-panel p-4 shadow-[0_0_14px_rgba(245,158,11,0.15)] transition-shadow hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] ${
        selectMode && selected ? 'border-sky-400 ring-1 ring-sky-400' : 'border-amber-500'
      }`}
    >
      {selectMode && (
        <div className="absolute right-3 top-3 text-sky-400">
          {selected ? <CheckSquare size={18} /> : <Square size={18} className="text-slate-600" />}
        </div>
      )}

      <div className="min-w-0 pr-6">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <h3 className="truncate font-mono text-sm font-bold text-amber-400">{recipe.title}</h3>
          {isBestOverall && (
            <span
              className="flex items-center gap-1 rounded border border-amber-500 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-amber-400"
              title="Tightest Best MOA across every recipe in your vault"
            >
              <Trophy size={10} />
              Best Load
            </span>
          )}
          {recipe.lowStock && (
            <span
              className="flex items-center gap-1 rounded border border-red-700 bg-red-950/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-red-300"
              title={`Only ${recipe.loadableFromStock} more round(s) loadable from stock — limited by ${recipe.loadableBottleneck}`}
            >
              <AlertTriangle size={10} />
              Low Stock
            </span>
          )}
        </div>
        {recipe.caliber && (
          <span className="mb-1 inline-block rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
            {recipe.caliber}
          </span>
        )}
        {recipe.firearm && (
          <p className="truncate text-xs text-slate-400">
            <span className="text-slate-600">Firearm:</span> {recipe.firearm}
          </p>
        )}
        {(recipe.chargeGrains != null || recipe.powder || recipe.bullet || recipe.primer || recipe.brass) && (
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-400">
            <p className="truncate">
              <span className="text-slate-600">Powder:</span>{' '}
              {recipe.chargeGrains != null ? `${recipe.chargeGrains}gr ` : ''}
              {recipe.powder || '—'}
            </p>
            <p className="truncate">
              <span className="text-slate-600">Bullet:</span> {recipe.bullet || '—'}
            </p>
            <p className="truncate">
              <span className="text-slate-600">Primer:</span> {recipe.primer || '—'}
            </p>
            <p className="truncate">
              <span className="text-slate-600">Brass:</span> {recipe.brass || '—'}
            </p>
          </div>
        )}
      </div>

      {hasAnyActivity ? (
        <>
          {/* Loaded & Ready sits up here with Best MOA/Cost/Money Saved
              rather than behind "More stats" — this is the one number a
              reloader actually wants scannable before heading to the
              range ("how much of this do I already have loaded"), not
              buried with the more retrospective stats below. */}
          <div className="grid grid-cols-2 gap-2">
            <PrimaryStat label="Best MOA" value={moaFmt(recipe.bestMoa)} />
            <PrimaryStat label="Loaded & Ready" value={recipe.roundsOnHand || null} />
            <PrimaryStat label="Cost/Round" value={moneyFmt(recipe.costPerRound)} />
            <PrimaryStat label="Money Saved" value={moneyFmt(recipe.moneySaved)} variant="saved" />
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMore((v) => !v);
            }}
            className="flex items-center justify-center gap-1 font-mono text-[10px] text-slate-500 hover:text-amber-400"
          >
            {showMore ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {showMore ? 'Fewer stats' : 'More stats'}
          </button>

          {showMore && (
            <div className="grid grid-cols-2 gap-2">
              <CardStat label="Recent MOA" value={moaFmt(recipe.recentMoa)} />
              <CardStat label="Rounds Fired" value={recipe.totalRoundsFired || null} />
              <CardStat label="Total Spent" value={moneyFmt(recipe.totalMoneySpent)} />
            </div>
          )}
        </>
      ) : (
        <p className="rounded border border-slate-800 bg-slate-900/40 px-3 py-3 text-center font-mono text-[11px] leading-relaxed text-slate-500">
          No batches loaded or range sessions logged yet — open this recipe to get started.
        </p>
      )}

      {hasAnyActivity ? (
        recipe.lastFiredWasQuickLog ? (
          <p className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
            <Zap size={10} className="text-amber-500" />
            Last range trip: Quick Log ({relativeLabel(daysSince(recipe.lastFiredAt))})
          </p>
        ) : recipe.lastMeasuredAt ? (
          <p className={`font-mono text-[10px] ${isStale ? 'text-amber-500' : 'text-slate-600'}`}>
            {isStale && '⚠ '}
            Last tested {relativeLabel(staleDays)}
          </p>
        ) : (
          recipe.lastActivityAt && (
            <p className="font-mono text-[10px] text-slate-600">
              Last activity {new Date(recipe.lastActivityAt).toLocaleDateString()}
            </p>
          )
        )
      ) : (
        <p className="font-mono text-[10px] text-slate-600">
          Added {new Date(recipe.lastActivityAt).toLocaleDateString()}
        </p>
      )}

      {confirmingDelete && (
        <p className="rounded border border-red-800 bg-red-950/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-red-300">
          This archives the recipe — its Loading/Range Session history stays intact, and it can be
          restored later from Archived Recipes.
        </p>
      )}

      {!selectMode && (
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
      )}
    </div>
  );
}

const SORT_OPTIONS = [
  { key: 'recent', label: 'Recently active' },
  { key: 'moa', label: 'Best MOA' },
  { key: 'cost', label: 'Cost/round (cheapest)' },
  { key: 'alpha', label: 'Alphabetical' },
];

// Section: Recipes Home — the new default landing view (see App.jsx and
// Header.jsx's VIEWS). Was requested because switching between recipes
// meant scrolling a cramped 288px Sidebar list; this gives every saved
// recipe its own card, with more room to actually see what's in it, plus
// the same caliber/firearm/component filters the Sidebar already offers
// (once there's enough recipes for that to matter), quick Edit/Delete
// actions right on each card, and a Compare select mode that hands 2+
// picked recipes straight to the Compare page.
export default function RecipesHomePage({
  userRecipes,
  lifetimeSaved,
  onSelectRecipe,
  onNewRecipe,
  onEditRecipe,
  onDeleteRecipe,
  onViewArchived,
  onCompareSelected,
}) {
  const [caliberFilter, setCaliberFilter] = useState('');
  const [firearmFilter, setFirearmFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [sortMode, setSortMode] = useState('recent');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

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
    return [...list].sort((a, b) => {
      if (sortMode === 'moa') {
        if (a.bestMoa == null && b.bestMoa == null) return 0;
        if (a.bestMoa == null) return 1;
        if (b.bestMoa == null) return -1;
        return a.bestMoa - b.bestMoa;
      }
      if (sortMode === 'cost') {
        if (a.costPerRound == null && b.costPerRound == null) return 0;
        if (a.costPerRound == null) return 1;
        if (b.costPerRound == null) return -1;
        return a.costPerRound - b.costPerRound;
      }
      if (sortMode === 'alpha') {
        return (a.title || '').localeCompare(b.title || '');
      }
      // Default: most-recently-worked-on first — the same "what am I
      // actually doing right now" ordering a home page should lead with,
      // rather than creation date or alphabetical.
      return new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0);
    });
  }, [userRecipes, caliberFilter, firearmFilter, componentFilter, sortMode]);

  const anyFilterActive = Boolean(caliberFilter || firearmFilter || componentFilter);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold text-slate-100">MY RECIPES</h1>
          <p className="text-xs text-slate-400">
            Every saved load recipe — click one to open it, or use Edit/Delete right here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(userRecipes?.length ?? 0) > 1 && onCompareSelected && !selectMode && (
            <button
              onClick={() => setSelectMode(true)}
              className="flex items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-sky-400 hover:text-sky-300"
            >
              <Scale size={14} />
              COMPARE
            </button>
          )}
          {onViewArchived && (
            // Upgraded from a bare text link to a bordered button matching
            // NEW RECIPE's visual weight — a small text link next to the
            // recipe cards was easy to miss as the only way to reach
            // archived recipes (see the progress log's Recipes Home
            // follow-up). Still visually secondary (slate, not amber) so it
            // doesn't compete with NEW RECIPE for attention, but it's now a
            // real button with an icon instead of blending into body text.
            <button
              onClick={onViewArchived}
              className="flex items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
            >
              <Archive size={14} />
              ARCHIVED
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

      {selectMode && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-sky-700/60 bg-sky-500/10 px-3 py-2">
          <span className="font-mono text-xs text-sky-300">
            {selectedIds.length === 0
              ? 'Select 2 or more recipes to compare'
              : `${selectedIds.length} selected`}
          </span>
          <button
            type="button"
            disabled={selectedIds.length < 2}
            onClick={() => {
              onCompareSelected?.(selectedIds);
              exitSelectMode();
            }}
            className="rounded border border-sky-400 bg-sky-500/20 px-3 py-1 font-mono text-xs text-sky-200 hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compare Selected
          </button>
          <button
            type="button"
            onClick={exitSelectMode}
            className="ml-auto font-mono text-[11px] text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      )}

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
            variant="saved"
          />
          <MetricCard
            value={totals.bestMoaOverall != null ? totals.bestMoaOverall.toFixed(2) : null}
            label="Best MOA Overall"
          />
        </div>
      )}

      {(userRecipes?.length ?? 0) > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Sort</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            aria-label="Sort recipes"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-300 focus:border-amber-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
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
              isBestOverall={totals.bestMoaOverall != null && recipe.bestMoa === totals.bestMoaOverall}
              selectMode={selectMode}
              selected={selectedIds.includes(recipe.id)}
              onToggleSelect={toggleSelected}
            />
          ))}
        </div>
      )}
    </main>
  );
}
