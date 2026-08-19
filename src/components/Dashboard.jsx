import { Save, Share2 } from 'lucide-react';
import MetricCard from './MetricCard.jsx';
import VelocityLog from './VelocityLog.jsx';
import RecipeChecklist from './RecipeChecklist.jsx';

// Section 3: "Main Dashboard Panel — Recipe Detail header, HUD metric
// cards, metadata checklist, velocity log, action bar."
// Target Plotting Canvas with Touch Loupe ships in Phase 3
// (<TargetCalculator/>) — this panel reserves the space for it.
export default function Dashboard({ recipe }) {
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

      {/* Reserved for <TargetCalculator/> — Phase 3 */}
      <div className="my-4 flex h-40 items-center justify-center rounded border border-dashed border-slate-700 font-mono text-xs text-slate-600">
        TARGET CANVAS — PHASE 3
      </div>

      <div className="mb-4">
        <VelocityLog shots={recipe.shots} avgVelocity={recipe.avgVelocity} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="flex items-center gap-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10">
          <Save size={14} />
          SAVE TO VAULT
        </button>
        <button className="flex items-center gap-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10">
          <Share2 size={14} />
          SHARE RECIPE
        </button>
      </div>
    </main>
  );
}
