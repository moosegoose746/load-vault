import { useState } from 'react';
import { Save, Share2 } from 'lucide-react';
import MetricCard from './MetricCard.jsx';
import VelocityLog from './VelocityLog.jsx';
import RecipeChecklist from './RecipeChecklist.jsx';
import TargetCalculator from './TargetCalculator.jsx';
import TargetExportModal from './TargetExportModal.jsx';
import ChronoImport from './ChronoImport.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { createRangeSession } from '../lib/recipes.js';
import { computeVelocityStats } from '../lib/stats.js';

// Section 3: "Main Dashboard Panel — Recipe Detail header, HUD metric
// cards, metadata checklist, velocity log, action bar."
export default function Dashboard({ recipe, activeRecipeId, authUser, onSessionSaved }) {
  const [target, setTarget] = useState({ imageEl: null, shots: [], moa: null, groupInches: null });
  const [chronoShots, setChronoShots] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { saveSession, pendingCount, status } = useSync();
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState('');

  const isRealRecipe = Boolean(activeRecipeId);

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
        });
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
        <MetricCard value={recipe.avgVelocity} unit="FPS" label="Avg FPS" />
        <MetricCard value={recipe.stdDevFps} unit="FPS" label="FPS SD" />
        <MetricCard value={recipe.extremeSpread} unit="FPS" label="FPS ES" />
      </div>

      <RecipeChecklist
        items={[
          { label: 'Rifle', value: recipe.rifleModel },
          { label: 'Powder', value: recipe.powder },
        ]}
      />

      <div className="my-4 rounded border border-slate-800 bg-panel p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-amber-400">
          Target Analysis
        </h2>
        <TargetCalculator distanceYards={recipe.distanceYards} onStateChange={setTarget} />
      </div>

      <div className="mb-4">
        <VelocityLog shots={recipe.shots} avgVelocity={recipe.avgVelocity} />
      </div>

      <div className="mb-4">
        <ChronoImport onImportComplete={setChronoShots} />
      </div>

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
