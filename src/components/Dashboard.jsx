import { useState } from 'react';
import { Save, Share2 } from 'lucide-react';
import MetricCard from './MetricCard.jsx';
import VelocityLog from './VelocityLog.jsx';
import RecipeChecklist from './RecipeChecklist.jsx';
import TargetCalculator from './TargetCalculator.jsx';
import TargetExportModal from './TargetExportModal.jsx';
import ChronoImport from './ChronoImport.jsx';
import { useSync } from '../context/SyncContext.jsx';

// Section 3: "Main Dashboard Panel — Recipe Detail header, HUD metric
// cards, metadata checklist, velocity log, action bar."
export default function Dashboard({ recipe }) {
  const [target, setTarget] = useState({ imageEl: null, shots: [], moa: null, groupInches: null });
  const [exportOpen, setExportOpen] = useState(false);
  const { saveSession, pendingCount, status } = useSync();
  const [justSaved, setJustSaved] = useState(false);

  const handleSave = async () => {
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
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
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
        <ChronoImport />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
        >
          <Save size={14} />
          {justSaved ? 'SAVED' : 'SAVE TO VAULT'}
        </button>
        <button
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
        >
          <Share2 size={14} />
          SHARE RECIPE
        </button>
        {pendingCount > 0 && (
          <span className="font-mono text-[11px] text-slate-500">
            {status === 'syncing' ? 'Syncing' : 'Queued'} {pendingCount} session
            {pendingCount === 1 ? '' : 's'}
            {status === 'queued' ? ' — will sync when back online' : '…'}
          </span>
        )}
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
