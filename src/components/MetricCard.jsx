// Section 3: "Key Metrics Grid (HUD Cards) — Average Velocity, Standard
// Deviation, Extreme Spread." Monospaced numerals per the typography spec.
export default function MetricCard({ value, unit, label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 rounded border border-slate-800 bg-panel px-3 py-4">
      <span className="font-mono text-2xl font-bold text-slate-100">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span>}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
        {label}
      </span>
    </div>
  );
}
