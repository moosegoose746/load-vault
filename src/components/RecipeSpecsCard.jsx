import InfoTooltip from './InfoTooltip.jsx';

// Moved out of Sidebar.jsx into the Dashboard tabs (see the sidebar
// redesign discussion in the progress log) — the Sidebar's 288px column
// was cramped for a 7-row spec list plus four highlighted stats, and this
// card only ever describes whichever recipe is currently open, so it
// belongs alongside that recipe's own content rather than pinned in a
// persistent side panel. Exported as its own component (rather than
// inlined in Dashboard.jsx) since it's now rendered in two places —
// Overview (the full picture) and Loading Session (a compact reference,
// since that tab was fairly bare on its own) — and should stay visually
// identical in both.

// items-start (not items-center) + a non-wrapping, non-shrinking label is
// deliberate: a long value (e.g. ".223 Remington / 5.56 NATO") wraps to
// two lines, and items-center was pulling the label down to vertically
// center against the now-taller wrapped value instead of staying pinned
// to its first line. text-right on the value keeps wrapped lines readable
// instead of straddling the row's center.
export function SpecRow({ label, value, info }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800 py-2 last:border-none">
      <span className="flex shrink-0 items-center whitespace-nowrap text-xs text-slate-400">
        {label}
        {info && <InfoTooltip align="left">{info}</InfoTooltip>}
      </span>
      <span className="text-right font-mono text-sm text-slate-100">{value}</span>
    </div>
  );
}

export default function RecipeSpecsCard({ recipe }) {
  return (
    <div className="flex flex-col rounded border border-slate-800 bg-panel p-3">
      <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-amber-400">Component Specs</h2>
      {/* Charge Weight right under Powder — it's a property of the powder
          charge, so it reads more naturally directly below it than
          separated by Bullet. The value also doesn't repeat the powder
          name (e.g. "25 gr Hodgon H4350") — that's redundant with the
          Powder row directly above it, just "25 gr" now. */}
      <SpecRow label="Caliber" value={recipe.caliber} />
      <SpecRow label="Powder" value={recipe.powder} />
      <SpecRow label="Charge Weight" value={recipe.chargeGrains != null ? `${recipe.chargeGrains} gr` : '—'} />
      <SpecRow label="Bullet" value={recipe.bullet} />
      <SpecRow label="COAL" value={recipe.coalInches ? `${recipe.coalInches}"` : '—'} />
      <SpecRow label="Primer" value={recipe.primer} />
      <SpecRow label="Brass" value={recipe.brass} />
    </div>
  );
}
