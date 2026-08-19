import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Crosshair, Save, Share2, SlidersHorizontal } from 'lucide-react';
import MetricCard from './MetricCard.jsx';
import VelocityLog from './VelocityLog.jsx';
import RecipeChecklist from './RecipeChecklist.jsx';
import TargetCalculator from './TargetCalculator.jsx';
import TargetExportModal from './TargetExportModal.jsx';
import ChronoImport from './ChronoImport.jsx';
import InfoTooltip from './InfoTooltip.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { createLoadBatch, createRangeSession } from '../lib/recipes.js';
import { computeVelocityStats } from '../lib/stats.js';
import { applyBatchDeduction, computeBatchDeduction, fetchUserInventoryMap } from '../lib/inventory.js';
import { fetchUserFirearms } from '../lib/firearms.js';

// Section 3: "Main Dashboard Panel — Recipe Detail header, HUD metric
// cards, metadata checklist, velocity log, action bar."
//
// Two separate events live here, deliberately not conflated (see
// supabase/schema_batches.sql): a Loading Session (assembling a batch of
// ammo — THIS is what consumes components) and a Range Session (shooting
// some of what's already loaded — this just draws down Rounds On Hand,
// it doesn't touch component stock).
//
// Which of the three recipe sub-views is showing. Split out of what used
// to be one long scrolling page — Overview (what is this recipe / where
// does it stand), Loading Session (bench workflow: assembling ammo,
// consumes components), and Range Day (what happens when you actually go
// shoot: target analysis, chrono, rounds fired). Mirrors the two real
// separate events already modeled in the database (see
// supabase/schema_batches.sql) instead of stacking every workflow into a
// single page regardless of which one a user is actually there for.
const TABS = [
  { key: 'overview', label: 'OVERVIEW', icon: SlidersHorizontal, realOnly: false },
  {
    key: 'loading',
    label: 'LOADING SESSION',
    icon: Boxes,
    realOnly: true,
    info: 'Assembling ammo at the bench — logging one here is what actually consumes powder/bullets/primers/brass from your Inventory. Do this whenever you sit down and load a batch, whether or not you shoot it right away.',
  },
  {
    key: 'range',
    label: 'RANGE DAY',
    icon: Crosshair,
    realOnly: false,
    info: "Shooting rounds that are already loaded — target photos, chrono data, and Rounds Fired. This doesn't touch your component stock (that already happened at the bench); it only draws down Loaded & Ready.",
  },
];

export default function Dashboard({ recipe, activeRecipeId, authUser, onSessionSaved, onTargetChange }) {
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [target, setTarget] = useState({ imageEl: null, imageBlob: null, shots: [], moa: null, groupInches: null });
  const [chronoShots, setChronoShots] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { saveSession, pendingCount, status } = useSync();
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState('');

  // Range Session's "Rounds Fired" is just a record of how many rounds
  // were actually shot today (drawing down Rounds On Hand) — separate
  // from the number of chrono'd shots, since plenty of range days include
  // sighters/warm-ups that never got a velocity reading.
  const [roundsFired, setRoundsFired] = useState('');
  const [roundsFiredEdited, setRoundsFiredEdited] = useState(false);

  // Which firearm this range session's rounds were fired through —
  // optional, drives that firearm's tracked round count/barrel life (see
  // lib/firearms.js). Defaults to whatever firearm was picked last time
  // for this recipe (recipe.defaultFirearmId), but never overwrites it
  // once the user's actually touched the dropdown themselves — same
  // pattern as Rounds Fired above.
  const [firearms, setFirearms] = useState([]);
  const [firearmId, setFirearmId] = useState('');
  const [firearmIdEdited, setFirearmIdEdited] = useState(false);

  // Loading Session state — logging a batch actually assembles ammo and
  // is what triggers component deduction (see computeBatchDeduction/
  // applyBatchDeduction below).
  const [inventoryMap, setInventoryMap] = useState({});
  const [roundsLoaded, setRoundsLoaded] = useState('');
  const [batchNotes, setBatchNotes] = useState('');
  const [batchStatus, setBatchStatus] = useState('idle'); // idle | saving | saved | error

  const isRealRecipe = Boolean(activeRecipeId);

  // Report the live MOA reading up to App.jsx as shots are plotted, so the
  // Sidebar's MOA badge updates in real time instead of only reflecting
  // whatever was saved on the recipe's last range session.
  useEffect(() => {
    onTargetChange?.(target.moa);
  }, [target.moa, onTargetChange]);

  // Same idea for velocity: while a chrono file is imported or shots are
  // typed in manually this session, the HUD cards and Velocity Log should
  // reflect that live data instead of staying frozen on whatever was saved
  // to the recipe's last range session.
  const liveStats = chronoShots && chronoShots.length ? computeVelocityStats(chronoShots) : null;
  const displayAvgVelocity = liveStats ? Math.round(liveStats.avg) : recipe.avgVelocity;
  const displayStdDevFps = liveStats ? Number(liveStats.sd.toFixed(1)) : recipe.stdDevFps;
  const displayExtremeSpread = liveStats ? liveStats.es : recipe.extremeSpread;
  const displayShots = chronoShots && chronoShots.length ? chronoShots : recipe.shots;

  // Fetch the signed-in user's inventory once per real recipe so the
  // Loading Session deduction preview has something to compute against.
  // Not fetched at all for the demo recipe (isRealRecipe false) since
  // there's no real component id to match against anyway.
  useEffect(() => {
    if (!isRealRecipe || !authUser) {
      setInventoryMap({});
      return;
    }
    fetchUserInventoryMap(authUser.id)
      .then(setInventoryMap)
      .catch((err) => console.error('Failed to load inventory for deduction preview', err));
  }, [isRealRecipe, authUser, activeRecipeId]);

  // Fetch this user's firearm profiles for the picker below — not scoped
  // to the recipe's caliber via a query (firearms.js has no such filter),
  // filtered client-side instead in firearmsForRecipe below.
  useEffect(() => {
    if (!isRealRecipe || !authUser) {
      setFirearms([]);
      return;
    }
    fetchUserFirearms(authUser.id)
      .then(setFirearms)
      .catch((err) => console.error('Failed to load firearms for range session', err));
  }, [isRealRecipe, authUser, activeRecipeId]);

  // Only offer firearms that actually match this recipe's caliber —
  // same reasoning as caliber-matched inventory lots: a .223 rifle isn't
  // a meaningful choice for a .308 recipe.
  const firearmsForRecipe = useMemo(
    () => firearms.filter((f) => f.caliber_id === recipe.caliberId),
    [firearms, recipe.caliberId]
  );

  // Default Rounds Fired to however many shots are showing (chrono'd or
  // manually typed) — a reasonable starting guess — but never overwrite it
  // once the user has actually touched the field themselves, and reset
  // both this and the Loading Session form whenever the active recipe
  // changes so switching recipes doesn't carry over stale values.
  useEffect(() => {
    setRoundsFiredEdited(false);
    setRoundsLoaded('');
    setBatchNotes('');
    setBatchStatus('idle');
    setFirearmIdEdited(false);
  }, [activeRecipeId]);

  useEffect(() => {
    if (!roundsFiredEdited) {
      setRoundsFired(displayShots?.length ? String(displayShots.length) : '');
    }
  }, [displayShots?.length, roundsFiredEdited]);

  useEffect(() => {
    if (!firearmIdEdited) {
      setFirearmId(recipe.defaultFirearmId || '');
    }
  }, [recipe.defaultFirearmId, firearmIdEdited]);

  const recipeComponents = useMemo(
    () => ({
      powderId: recipe.powderId,
      powderLabel: recipe.powder,
      chargeGrains: recipe.chargeGrains,
      bulletId: recipe.bulletId,
      bulletLabel: recipe.bullet,
      primerId: recipe.primerId,
      primerLabel: recipe.primer,
      brassId: recipe.brassId,
      brassLabel: recipe.brass,
      // Bullet/brass deduction is caliber-specific — see
      // candidateInventoryLots in lib/inventory.js.
      caliberId: recipe.caliberId,
    }),
    [recipe]
  );

  const batchDeductionPreview = useMemo(
    () => computeBatchDeduction(recipeComponents, inventoryMap, roundsLoaded),
    [recipeComponents, inventoryMap, roundsLoaded]
  );

  // A non-blocking heads-up, not an error — firing more than what's
  // logged as loaded usually just means a loading session from before
  // this feature existed, or ammo from outside the app.
  const roundsFiredNum = Number(roundsFired);
  const exceedsOnHand =
    isRealRecipe &&
    recipe.roundsOnHand != null &&
    Number.isFinite(roundsFiredNum) &&
    roundsFiredNum > recipe.roundsOnHand;

  const handleLogBatch = async () => {
    if (!authUser) return;
    const rounds = Number(roundsLoaded);
    if (!Number.isFinite(rounds) || rounds <= 0) {
      setBatchStatus('error');
      return;
    }
    setBatchStatus('saving');
    try {
      await createLoadBatch({ recipeId: activeRecipeId, userId: authUser.id, roundsLoaded: rounds, notes: batchNotes });

      if (batchDeductionPreview.some((l) => l.tracked)) {
        await applyBatchDeduction(authUser.id, batchDeductionPreview);
        fetchUserInventoryMap(authUser.id).then(setInventoryMap).catch(() => {});
      }

      setRoundsLoaded('');
      setBatchNotes('');
      setBatchStatus('saved');
      onSessionSaved?.(); // refetches the recipe, updating Rounds On Hand
      setTimeout(() => setBatchStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to log loading session', err);
      setBatchStatus('error');
    }
  };

  const handleSave = async () => {
    setSaveError('');

    if (isRealRecipe) {
      // Real recipe: write an actual range_sessions row (+ shot_logs if a
      // chrono file was imported this session). Requires a genuine signed-in
      // user — RLS enforces auth.uid() = user_id, so this fails under the
      // local dev auth bypass unless you're also really signed in.
      if (!authUser) {
        setSaveError('Sign in with a real account to save sessions for a saved recipe.');
        return;
      }
      setSaveState('saving');
      try {
        const stats = chronoShots ? computeVelocityStats(chronoShots) : null;
        await createRangeSession({
          recipeId: activeRecipeId,
          userId: authUser.id,
          distanceYards: recipe.distanceYards,
          groupSizeMoa: target.moa,
          groupInches: target.groupInches,
          avgVelocity: stats?.avg ?? null,
          stdDevFps: stats?.sd ?? null,
          extremeSpread: stats?.es ?? null,
          shots: chronoShots ?? [],
          imageBlob: target.imageBlob,
          roundsFired: Number.isFinite(roundsFiredNum) && roundsFiredNum >= 0 ? roundsFiredNum : null,
          firearmId: firearmId || null,
        });

        setSaveState('saved');
        onSessionSaved?.(); // refetches the recipe, updating Rounds On Hand
        setTimeout(() => setSaveState('idle'), 2000);
      } catch (err) {
        console.error('Failed to save range session', err);
        setSaveError(err.message || 'Failed to save.');
        setSaveState('error');
      }
    } else {
      // Demo recipe: no real recipe_id to attach a session to, so this
      // goes through the offline-queue simulation from Phase 4 instead.
      await saveSession({
        title: recipe.title,
        distanceYards: recipe.distanceYards,
        moa: target.moa,
        groupInches: target.groupInches,
        shotCount: target.shots.length,
        avgVelocity: recipe.avgVelocity,
        stdDevFps: recipe.stdDevFps,
        extremeSpread: recipe.extremeSpread,
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    }
  };

  const visibleTabs = TABS.filter((t) => !t.realOnly || isRealRecipe);

  return (
    <main className="flex-1 p-4">
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="font-mono text-lg font-bold text-slate-100">
          RECIPE DETAIL: {recipe.title}
        </h1>
        <p className="text-xs text-slate-400">Target {recipe.distanceYards}YD</p>
      </div>

      <div className="mb-4 flex gap-2 border-b border-slate-800">
        {/* The explainer icon is a sibling of the tab button, not nested
            inside it — a <button> inside a <button> is invalid HTML and
            browsers handle the click/tap targeting inconsistently. */}
        {visibleTabs.map(({ key, label, icon: Icon, info }) => (
          <div key={key} className="flex items-center">
            <button
              onClick={() => setDashboardTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-xs transition-colors ${
                dashboardTab === key
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
            {info && <InfoTooltip align="left">{info}</InfoTooltip>}
          </div>
        ))}
      </div>

      {/* Each tab's content stays mounted the whole time and is just
          hidden via CSS when another tab is active, rather than being
          conditionally rendered/unmounted — TargetCalculator and
          ChronoImport hold real local state (the loaded photo, plotted
          shots, calibration) that would otherwise be lost every time you
          switched away from Range Day and back. */}
      <div className={dashboardTab === 'overview' ? 'flex flex-col gap-4' : 'hidden'}>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard value={displayAvgVelocity} unit="FPS" label="Avg FPS" />
            <MetricCard value={displayStdDevFps} unit="FPS" label="FPS SD" />
            <MetricCard value={displayExtremeSpread} unit="FPS" label="FPS ES" />
          </div>

          <RecipeChecklist
            items={[
              // Prefer the recipe's linked Firearm Profile (see
              // schema_recipes_v2.sql); fall back to the legacy
              // free-text rifle_model for recipes created before that
              // link existed and never given one, or '—' for a recipe
              // that's never had either.
              //
              // Powder used to be duplicated here too — dropped per the
              // UX audit since it's already shown in Sidebar's Component
              // Specs card; no reason to show the same value twice.
              { label: 'Firearm', value: recipe.firearmLabel ?? recipe.rifleModel ?? '—' },
            ]}
          />

          {!isRealRecipe && (
            <p className="rounded border border-slate-800 bg-panel px-4 py-3 font-mono text-xs text-slate-500">
              This is the built-in demo recipe — Loading Session tracking only applies to your own
              saved recipes. Create one from the Sidebar to try it out.
            </p>
          )}
        </div>

      {isRealRecipe && (
        <div className={dashboardTab === 'loading' ? 'rounded border border-slate-800 bg-panel p-4' : 'hidden'}>
          <h2 className="mb-3 flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-amber-400">
            <Boxes size={14} />
            Log a Loading Session
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            Assembled a batch of this recipe at the bench? Log it here — this is what actually
            consumes powder/bullets/primers from your inventory and counts firings against brass's
            reload-cycle estimate. Currently{' '}
            <span className="text-slate-200">
              {recipe.roundsOnHand != null ? `${recipe.roundsOnHand} rounds` : 'an unknown amount'}
            </span>{' '}
            loaded and ready to shoot.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase text-slate-500">Rounds Loaded</span>
              <input
                type="number"
                step="1"
                min="1"
                value={roundsLoaded}
                onChange={(e) => setRoundsLoaded(e.target.value)}
                className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-mono text-[10px] uppercase text-slate-500">Notes (optional)</span>
              <input
                type="text"
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                placeholder="e.g. lot #, bench notes"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </label>
            <button
              onClick={handleLogBatch}
              disabled={batchStatus === 'saving' || !authUser}
              className="flex items-center gap-1.5 rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {batchStatus === 'saving' ? 'LOGGING…' : batchStatus === 'saved' ? 'LOGGED' : 'LOG BATCH'}
            </button>
          </div>
          {!authUser && (
            <p className="mt-2 font-mono text-[11px] text-amber-400">
              Sign in with a real account to log a loading session.
            </p>
          )}

          {batchDeductionPreview.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-slate-800 pt-3">
              {batchDeductionPreview.map((line, i) =>
                line.kind === 'cycles' ? (
                  <p key={`${line.componentId}-${line.rowId ?? 'untracked'}-${i}`} className="font-mono text-[11px] text-slate-400">
                    <span className="text-slate-200">
                      {line.label}
                      {line.lotCaliber ? ` (${line.lotCaliber})` : ''}
                    </span>{' '}
                    (brass): +{line.totalAmount} firings
                    {line.tracked ? (
                      <>
                        {' '}
                        ({line.currentCycles} → {line.newCycles}
                        {line.maxCycles != null ? ` of ~${line.maxCycles} est. cycles` : ''})
                        {line.nearingRetirement && (
                          <span className="text-amber-400"> — nearing estimated max, consider inspecting/retiring this lot</span>
                        )}
                      </>
                    ) : line.shortfall ? (
                      <span className="text-amber-400"> — no matching lot has room left, skipped</span>
                    ) : (
                      <span className="text-slate-600"> — not tracked in your inventory, skipped</span>
                    )}
                  </p>
                ) : (
                  <p key={`${line.componentId}-${line.rowId ?? 'untracked'}-${i}`} className="font-mono text-[11px] text-slate-400">
                    <span className="text-slate-200">
                      {line.label}
                      {line.lotCaliber ? ` (${line.lotCaliber})` : ''}
                    </span>
                    : −{line.totalAmount} {line.unitLabel}
                    {line.tracked ? (
                      <>
                        {' '}
                        ({line.currentQty} → {Number(line.newQty.toFixed(2))} {line.unitLabel})
                      </>
                    ) : line.shortfall ? (
                      <span className="text-amber-400"> — not enough on hand in any matching lot, skipped</span>
                    ) : (
                      <span className="text-slate-600"> — not tracked in your inventory, skipped</span>
                    )}
                  </p>
                )
              )}
            </div>
          )}

          {batchStatus === 'error' && (
            <p className="mt-2 font-mono text-[11px] text-red-400">Enter a valid Rounds Loaded amount.</p>
          )}
        </div>
      )}

      <div className={dashboardTab === 'range' ? 'flex flex-col gap-4' : 'hidden'}>
          <div className="rounded border border-slate-800 bg-panel p-4">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-amber-400">
              Target Analysis
            </h2>
            <TargetCalculator
              distanceYards={recipe.distanceYards}
              onStateChange={setTarget}
              initialImageUrl={recipe.targetImageUrl}
            />
          </div>

          <VelocityLog shots={displayShots} avgVelocity={displayAvgVelocity} />

          <ChronoImport onImportComplete={setChronoShots} />

          {isRealRecipe && (
            <div className="flex flex-wrap items-end gap-3 rounded border border-slate-800 bg-panel p-4">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-slate-500">Rounds Fired Today</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={roundsFired}
                  onChange={(e) => {
                    setRoundsFired(e.target.value);
                    setRoundsFiredEdited(true);
                  }}
                  className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-slate-500">Firearm (optional)</span>
                <select
                  value={firearmId}
                  onChange={(e) => {
                    setFirearmId(e.target.value);
                    setFirearmIdEdited(true);
                  }}
                  className="w-48 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Not tracked</option>
                  {firearmsForRecipe.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {firearmsForRecipe.length === 0 && (
                  <span className="font-mono text-[10px] text-slate-600">
                    No firearms saved for this caliber yet — add one on the Firearms page.
                  </span>
                )}
              </label>
              <p className="max-w-md text-xs text-slate-400">
                Draws down Rounds On Hand — doesn't touch your component stock, since those were
                already used when you logged a loading session. Picking a firearm also adds these
                rounds to its tracked round count/barrel life.
              </p>
              {exceedsOnHand && (
                <p className="flex items-center gap-1 font-mono text-[11px] text-amber-400">
                  <AlertTriangle size={12} />
                  More than your {recipe.roundsOnHand} rounds on hand — log a loading session if you
                  forgot to, or this may be ammo from outside the app.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="flex items-center gap-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
            >
              <Save size={14} />
              {saveState === 'saving' ? 'SAVING…' : saveState === 'saved' ? 'SAVED' : 'SAVE TO VAULT'}
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
            >
              <Share2 size={14} />
              SHARE RECIPE
            </button>
            {!isRealRecipe && pendingCount > 0 && (
              <span className="font-mono text-[11px] text-slate-500">
                {status === 'syncing' ? 'Syncing' : 'Queued'} {pendingCount} session
                {pendingCount === 1 ? '' : 's'}
                {status === 'queued' ? ' — will sync when back online' : '…'}
              </span>
            )}
            {saveError && <span className="font-mono text-[11px] text-red-400">{saveError}</span>}
          </div>
      </div>

      <TargetExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        imageEl={target.imageEl}
        shots={target.shots}
        moa={target.moa}
        recipe={recipe}
        avgVelocity={displayAvgVelocity}
        stdDevFps={displayStdDevFps}
        extremeSpread={displayExtremeSpread}
      />
    </main>
  );
}
