import { Crosshair } from 'lucide-react';

// Section 3: "Prominent MOA Badge — reticle crosshair badge displaying
// group size (e.g. '0.38 MOA')." MOA is distance-dependent, so a bare
// "MOA" label is meaningless on its own — same reasoning as the export
// card (see TargetExportModal.jsx's "MOA @ {distanceYards}YD"), which
// this now matches instead of just saying "MOA". `distanceYards` is
// optional (falls back to the plain label) since not every caller has it
// handy, e.g. a moment before any range session has ever been logged.
export default function MoaBadge({ moa, distanceYards }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-amber-500 bg-panel px-6 py-4">
      <Crosshair className="text-amber-400" size={28} strokeWidth={1.75} />
      <span className="font-mono text-2xl font-bold text-amber-400">
        {moa != null ? moa.toFixed(2) : '—'}
      </span>
      <span className="font-mono text-[10px] tracking-widest text-slate-400">
        {moa != null && distanceYards != null ? `MOA @ ${distanceYards}YD` : 'MOA'}
      </span>
    </div>
  );
}
