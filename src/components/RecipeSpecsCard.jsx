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
//
// No border-b here anymore — this used to be a single stacked column
// where a bottom border under every row (last one excepted) read as a
// clean divided list. Once the rows moved into a 2-column grid below, that
// same border trick left an odd half-drawn line under whichever row
// landed at the bottom of the shorter column (an uneven number of specs
// doesn't split evenly into two equal-length columns). Spacing from the
// grid's own gap does the same visual separation job without that
// asymmetry.
export function SpecRow({ label, value, info }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
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
      {/* 2 columns instead of one long stacked list — same 7 pieces of
          info, roughly 40% shorter top-to-bottom. Paired so each row keeps
          a sensible grouping: Charge Weight next to Powder's row (it's a
          property of the charge, reads naturally beside it), Bullet/COAL
          together (both about the projectile), Primer/Brass together.
          Brass ends up alone on the last row since 7 is odd — left as-is
          rather than forcing an 8th filler item. */}
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <SpecRow label="Caliber" value={recipe.caliber} />
        <SpecRow label="Powder" value={recipe.powder} />
        <SpecRow label="Charge Weight" value={recipe.chargeGrains != null ? `${recipe.chargeGrains} gr` : '—'} />
        <SpecRow label="Bullet" value={recipe.bullet} />
        <SpecRow label="COAL" value={recipe.coalInches ? `${recipe.coalInches}"` : '—'} />
        <SpecRow label="Primer" value={recipe.primer} />
        <SpecRow label="Brass" value={recipe.brass} />
      </div>
    </div>
  );
}
