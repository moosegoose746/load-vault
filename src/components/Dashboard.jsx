import { useEffect, useMemo, useState } from 'react';
import { Boxes, Save, Share2 } from 'lucide-react';
import MetricCard from './MetricCard.jsx';
import VelocityLog from './VelocityLog.jsx';
import RecipeChecklist from './RecipeChecklist.jsx';
import TargetCalculator from './TargetCalculator.jsx';
import TargetExportModal from './TargetExportModal.jsx';
import ChronoImport from './ChronoImport.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { createRangeSession } from '../lib/recipes.js';
import { computeVelocityStats } from '../lib/stats.js';
import { applySessionDeduction, computeSessionDeduction, fetchUserInventoryMap } from '../lib/inventory.js';

// Section 3: "Main Dashboard Panel — Recipe Detail header, HUD metric
// cards, metadata checklist, velocity log, action bar."
export default function Dashboard({ recipe, activeRecipeId, authUser, onSessionSaved, onTargetChange }) {
  const [target, setTarget] = useState({ imageEl: null, imageBlob: null, shots: [], moa: null, groupInches: null });
  const [chronoShots, setChronoShots] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { saveSession, pendingCount, status } = useSync();
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState('');

  // Auto-deduct-on-save: a separate, editable "Total Rounds Fired" count
  // (NOT the same as the number of chrono'd shots — plenty of range days
  // include sighters/warm-ups that never got a velocity reading, or shots
  // that just weren't logged), a per-session opt-out, and the fetched
  // inventory rows needed to preview the deduction before it's written.
  const [inventoryMap, setInventoryMap] = useState({});
  const [roundsFired, setRoundsFired] = useState('');
  const [roundsFiredEdited, setRoundsFiredEdited] = useState(false);
  const [deductEnabled, setDeductEnabled] = useState(true);
  const [deductionResult, setDeductionResult] = useState(null); // { succeeded, failed } after a save

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
  // deduction preview has something to compute against. Not fetched at all
  // for the demo recipe (isRealRecipe false) since there's no real
  // component id to match against anyway.
  useEffect(() => {
    if (!isRealRecipe || !authUser) {
      setInventoryMap({});
      return;
    }
    fetchUserInventoryMap(authUser.id)
      .then(setInventoryMap)
      .catch((err) => console.error('Failed to load inventory for deduction preview', err));
  }, [isRealRecipe, authUser, activeRecipeId]);

  // Default Rounds Fired to however many shots are showing (chrono'd or
  // manually typed) — a reasonable starting guess — but never overwrite it
  // once the user has actually touched the field themselves, and reset the
  // "touched" flag whenever the active recipe changes so switching recipes
  // doesn't carry over a stale count.
  useEffect(() => {
    setRoundsFiredEdited(false);
    setDeductionResult(null);
  }, [activeRecipeId]);

  useEffect(() => {
    if (!roundsFiredEdited) {
      setRoundsFired(displayShots?.length ? String(displayShots.length) : '');
    }
  }, [displayShots?.length, roundsFiredEdited]);

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
    }),
    [recipe]
  );

  const deductionPreview = useMemo(
    () => (deductEnabled ? computeSessionDeduction(recipeComponents, inventoryMap, roundsFired) : []),
    [deductEnabled, recipeComponents, inventoryMap, roundsFired]
  );

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
        });

        // Deduction happens AFTER the session itself is confirmed saved —
        // if this part fails, the range session is still logged; only the
        // inventory numbers might be stale, which is recoverable by hand.
        if (deductEnabled && deductionPreview.some((l) => l.tracked)) {
          const result = await applySessionDeduction(authUser.id, deductionPreview);
          setDeductionResult(result);
          fetchUserInventoryMap(authUser.id).then(setInventoryMap).catch(() => {});
        } else {
          setDeductionResult(null);
        }

        setSaveState('saved');
        onSessionSaved?.();
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

  return (
    <main className="flex-1 p-4">
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="font-mono text-lg font-bold text-slate-100">
          RECIPE DETAIL: {recipe.title}
        </h1>
        <p className="text-xs text-slate-400">Target {recipe.distanceYards}YD</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <MetricCard value={displayAvgVelocity} unit="FPS" label="Avg FPS" />
        <MetricCard value={displayStdDevFps} unit="FPS" label="FPS SD" />
        <MetricCard value={displayExtremeSpread} unit="FPS" label="FPS ES" />
      </div>

      <RecipeChecklist
        items={[
          { label: 'Firearm', value: recipe.rifleModel },
          { label: 'Powder', value: recipe.powder },
        ]}
      />

      <div className="my-4 rounded border border-slate-800 bg-panel p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-amber-400">
          Target Analysis
        </h2>
        <TargetCalculator
          distanceYards={recipe.distanceYards}
          onStateChange={setTarget}
          initialImageUrl={recipe.targetImageUrl}
        />
      </div>

      <div className="mb-4">
        <VelocityLog shots={displayShots} avgVelocity={displayAvgVelocity} />
      </div>

      <div className="mb-4">
        <ChronoImport onImportComplete={setChronoShots} />
      </div>

      {isRealRecipe && (
        <div className="mb-4 rounded border border-slate-800 bg-panel p-4">
          <h2 className="mb-3 flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-amber-400">
            <Boxes size={14} />
            Inventory Deduction
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            How many rounds did you actually fire today? This can be different from the number of
            chrono'd shots above — include sighters, warm-ups, or anything you didn't log a
            velocity for. Powder/bullets/primers get subtracted from your on-hand stock; brass
            instead logs firings against its estimated reload-cycle count, since you keep the
            cases to reload.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-slate-500">Total Rounds Fired</span>
              <input
                type="number"
                step="1"
                min="0"
                value={roundsFired}
                onChange={(e) => {
                  setRoundsFired(e.target.value);
                  setRoundsFiredEdited(true);
                }}
                className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <input
                type="checkbox"
                checked={deductEnabled}
                onChange={(e) => setDeductEnabled(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Deduct from my inventory on save
            </label>
          </div>

          {deductEnabled && deductionPreview.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-slate-800 pt-3">
              {deductionPreview.map((line) =>
                line.kind === 'cycles' ? (
                  <p key={line.componentId} className="font-mono text-[11px] text-slate-400">
                    <span className="text-slate-200">{line.label}</span> (brass): +{line.totalAmount} firings
                    {line.tracked ? (
                      <>
                        {' '}
                        ({line.currentCycles} → {line.newCycles}
                        {line.maxCycles != null ? ` of ~${line.maxCycles} est. cycles` : ''})
                        {line.nearingRetirement && (
                          <span className="text-amber-400"> — nearing estimated max, consider inspecting/retiring this batch</span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-600"> — not tracked in your inventory, skipped</span>
                    )}
                  </p>
                ) : (
                  <p key={line.componentId} className="font-mono text-[11px] text-slate-400">
                    <span className="text-slate-200">{line.label}</span>: −{line.totalAmount} {line.unitLabel}
                    {line.tracked ? (
                      <>
                        {' '}
                        ({line.currentQty} → {Number(line.newQty.toFixed(2))} {line.unitLabel})
                      </>
                    ) : (
                      <span className="text-slate-600"> — not tracked in your inventory, skipped</span>
                    )}
                  </p>
                )
              )}
            </div>
          )}

          {deductionResult && (
            <p className="mt-3 font-mono text-[11px] text-emerald-400">
              Inventory updated for {deductionResult.succeeded} component
              {deductionResult.succeeded === 1 ? '' : 's'}
              {deductionResult.failed > 0 && (
                <span className="text-red-400"> ({deductionResult.failed} failed to update)</span>
              )}
              .
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

      <TargetExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        imageEl={target.imageEl}
        shots={target.shots}
        moa={target.moa}
        recipe={recipe}
      />
    </main>
  );
}
