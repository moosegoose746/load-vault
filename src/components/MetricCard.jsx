import InfoTooltip from './InfoTooltip.jsx';

// Section 3: "Key Metrics Grid (HUD Cards) — Average Velocity, Standard
// Deviation, Extreme Spread." Monospaced numerals per the typography spec.
// `info` is optional — only the recipe-economics cards (Cost/Round,
// Loadable From Stock, etc.) pass one; the plain FPS row above them
// doesn't need the explainer.
//
// `variant="saved"` is the one exception to the standard slate/amber
// look — same emerald treatment MoneySavedCard.jsx and the header's
// LifetimeSavedBadge already use for a "money saved" figure specifically,
// so a Total Saved stat reads as the same kind of good-news number
// wherever it shows up (a recipe's own Overview, Recipes Home's totals
// row, or a card in the grid) instead of blending into the default amber
// styling every other stat uses.
export default function MetricCard({ value, unit, label, info, variant }) {
  const hasValue = value != null;
  const isSaved = variant === 'saved';
  return (
    <div
      className={`flex flex-col items-center justify-center gap-0.5 rounded border px-3 py-4 ${
        isSaved ? 'border-emerald-700/60 bg-emerald-500/10' : 'border-slate-800 bg-panel'
      }`}
    >
      <span className={`font-mono text-2xl font-bold ${isSaved ? 'text-emerald-300' : 'text-slate-100'}`}>
        {hasValue ? value : '—'}
        {hasValue && unit && (
          <span className={`ml-1 text-sm font-normal ${isSaved ? 'text-emerald-400/80' : 'text-slate-400'}`}>
            {unit}
          </span>
        )}
      </span>
      <span
        className={`flex items-center font-mono text-[10px] uppercase tracking-widest ${
          isSaved ? 'text-emerald-400' : 'text-amber-400'
        }`}
      >
        {label}
        {info && <InfoTooltip align="left">{info}</InfoTooltip>}
      </span>
    </div>
  );
}
