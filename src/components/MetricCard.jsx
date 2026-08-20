import InfoTooltip from './InfoTooltip.jsx';

// Section 3: "Key Metrics Grid (HUD Cards) — Average Velocity, Standard
// Deviation, Extreme Spread." Monospaced numerals per the typography spec.
// `info` is optional — only the recipe-economics cards (Cost/Round,
// Loadable From Stock, etc.) pass one; the plain FPS row above them
// doesn't need the explainer.
export default function MetricCard({ value, unit, label, info }) {
  const hasValue = value != null;
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 rounded border border-slate-800 bg-panel px-3 py-4">
      <span className="font-mono text-2xl font-bold text-slate-100">
        {hasValue ? value : '—'}
        {hasValue && unit && <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span>}
      </span>
      <span className="flex items-center font-mono text-[10px] uppercase tracking-widest text-amber-400">
        {label}
        {info && <InfoTooltip align="left">{info}</InfoTooltip>}
      </span>
    </div>
  );
}
