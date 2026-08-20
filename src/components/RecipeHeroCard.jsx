import { Crosshair } from 'lucide-react';

// Overview's two headline numbers — group size and velocity consistency —
// merged into one card instead of a tall MOA badge stacked above a
// separate row of three FPS cards (see the Overview-length discussion in
// the progress log). MOA sits on the left as its own little block (same
// icon/number/label MoaBadge.jsx uses); the three FPS stats compact into
// a row on the right, sharing the outer border instead of each getting
// their own. Roughly halves the vertical space the old two-piece layout
// took while showing the exact same numbers.
//
// Deliberately NOT a variant of MoaBadge.jsx — that component is also used
// as-is on the Public Recipe page, where there's no FPS data to show next
// to it (a stranger viewing a shared recipe doesn't get Cost/Round-
// adjacent stats either). Keeping MoaBadge single-purpose there and
// building this as its own component avoids threading FPS-related
// conditionals into a component that has a second, simpler job elsewhere.
function HeroStat({ value, unit, label }) {
  const hasValue = value != null;
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className="font-mono text-xl font-bold text-slate-100">
        {hasValue ? value : '—'}
        {hasValue && unit && <span className="ml-1 text-xs font-normal text-slate-400">{unit}</span>}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400">{label}</span>
    </div>
  );
}

export default function RecipeHeroCard({ moa, distanceYards, avgVelocity, stdDevFps, extremeSpread }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-amber-500 bg-panel p-4 sm:flex-row">
      <div className="flex flex-col items-center justify-center gap-1 border-b border-slate-800 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
        <Crosshair className="text-amber-400" size={26} strokeWidth={1.75} />
        <span className="font-mono text-2xl font-bold text-amber-400">{moa != null ? moa.toFixed(2) : '—'}</span>
        <span className="font-mono text-[10px] tracking-widest text-slate-400">
          {moa != null && distanceYards != null ? `MOA @ ${distanceYards}YD` : 'MOA'}
        </span>
      </div>
      <div className="grid w-full flex-1 grid-cols-3 gap-3 sm:w-auto">
        <HeroStat value={avgVelocity} unit="FPS" label="Avg FPS" />
        <HeroStat value={stdDevFps} unit="FPS" label="FPS SD" />
        <HeroStat value={extremeSpread} unit="FPS" label="FPS ES" />
      </div>
    </div>
  );
}
