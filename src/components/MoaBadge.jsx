import { Crosshair } from 'lucide-react';

// Section 3: "Prominent MOA Badge — reticle crosshair badge displaying
// group size (e.g. '0.38 MOA')."
export default function MoaBadge({ moa }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-amber-500 bg-panel px-6 py-4">
      <Crosshair className="text-amber-400" size={28} strokeWidth={1.75} />
      <span className="font-mono text-2xl font-bold text-amber-400">
        {moa != null ? moa.toFixed(2) : '—'}
      </span>
      <span className="font-mono text-[10px] tracking-widest text-slate-400">MOA</span>
    </div>
  );
}
