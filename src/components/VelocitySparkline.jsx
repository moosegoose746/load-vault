import { useEffect, useRef, useState } from 'react';

const WIDTH = 280;
const AMBER = '#fbbf24';
const RED = '#f87171';
const MUTED = '#64748b';
const SURFACE = '#0f172a';

/** Where a text label anchors so it doesn't run off the left/right edge of
 * the chart — mirrors the same "measure before you place it" instinct as
 * InfoTooltip's align prop, just simpler since these are single short
 * strings, not a whole popover. */
function edgeAwareAnchor(x) {
  if (x < 30) return 'start';
  if (x > WIDTH - 30) return 'end';
  return 'middle';
}

/** Tooltip clamped to stay inside the card — positioned in the SAME
 * percentage space as the SVG's viewBox (the SVG is width:100%, so an x
 * coordinate in viewBox units maps directly to a % of the rendered
 * width). Values lead, label follows, per the dataviz skill's tooltip
 * hierarchy (interaction.md). */
function Tooltip({ xPercent, children }) {
  const clamped = Math.min(88, Math.max(12, xPercent));
  const translate = xPercent < 15 ? '0%' : xPercent > 85 ? '-100%' : '-50%';
  return (
    <div
      className="pointer-events-none absolute -top-1 z-10 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] leading-tight text-slate-200 shadow-lg shadow-black/40"
      style={{ left: `${clamped}%`, transform: `translateX(${translate}) translateY(-100%)`, whiteSpace: 'nowrap' }}
    >
      {children}
    </div>
  );
}

/** Stat-tile sparkline for velocity — plain SVG, no charting library, per
 * the dataviz skill. Unlike a bare decorative sparkline, this one carries
 * a real plot a reloader would actually reference, so per the skill's
 * interaction rules it ships a tap-to-inspect layer by default rather
 * than as an upgrade: tap any point for its exact value (tap, not hover —
 * same reasoning as InfoTooltip elsewhere in this app, Range Mode implies
 * outdoor/phone use). Two modes:
 *
 * - 'shots' (default): this session's per-shot chrono string. A dashed
 *   average-velocity reference line (labeled) replaces the earlier
 *   near-invisible shaded SD band — a direct line reads far more clearly
 *   at this size than a 10%-opacity fill. Min/max are direct-labeled
 *   (label the extreme, per the skill), shot numbers get sparse ticks
 *   along the bottom, and any shot beyond ±2 SD from the average is
 *   flagged as an outlier (distinct color, bigger when tapped).
 * - 'trend': average velocity per Range Session across the recipe's whole
 *   history — shows real drift (barrel wear, powder lot change) a single
 *   session's shot-to-shot noise can't. Same tap-for-value treatment,
 *   keyed by session date instead of shot number.
 *
 * No zero-baseline area fill in either mode — velocity doesn't
 * meaningfully start near zero, so filling down to 0 would misrepresent
 * the trend (dataviz skill, marks-and-anatomy.md). */
export default function VelocitySparkline({ mode = 'shots', shots, avgVelocity, stdDevFps, trend }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const wrapRef = useRef(null);

  // Reset the open tooltip whenever the underlying data actually changes
  // (switching modes, a new session saved) — an index from the old
  // dataset pointing at nothing/the wrong shot is worse than no tooltip.
  useEffect(() => {
    setActiveIndex(null);
  }, [mode, shots, trend]);

  // Tap-to-toggle, not hover — same reasoning as InfoTooltip elsewhere in
  // this app: Range Mode implies outdoor/phone use, where hover doesn't
  // exist. Tapping a point opens its readout; tapping it again, or
  // tapping anywhere else, closes it.
  const toggleActive = (i) => setActiveIndex((prev) => (prev === i ? null : i));

  useEffect(() => {
    if (activeIndex == null) return;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setActiveIndex(null);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [activeIndex]);

  if (mode === 'trend') {
    if (!trend || trend.length < 2) return null;

    const height = 56;
    const plotTop = 14;
    const plotBottom = height - 4;
    const values = trend.map((t) => t.avgVelocity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const toY = (v) => plotBottom - ((v - min) / range) * (plotBottom - plotTop);

    const points = trend.map((t, i) => ({
      x: trend.length > 1 ? (i / (trend.length - 1)) * WIDTH : WIDTH / 2,
      y: toY(t.avgVelocity),
      ...t,
    }));
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const active = activeIndex != null ? points[activeIndex] : null;

    return (
      <div className="relative" ref={wrapRef}>
        <svg width="100%" viewBox={`0 0 ${WIDTH} ${height + 16}`} preserveAspectRatio="none" className="overflow-visible">
          <path d={path} fill="none" stroke={AMBER} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {active && <line x1={active.x} x2={active.x} y1={plotTop - 6} y2={plotBottom} stroke={MUTED} strokeWidth="1" strokeDasharray="2,2" />}

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={activeIndex === i ? 5 : i === points.length - 1 ? 4 : 2.5}
                fill={AMBER}
                stroke={SURFACE}
                strokeWidth={activeIndex === i ? 2.5 : 1.5}
              />
              {/* Invisible, larger tap/hover target — a 5px dot is not a
                  reliable hit target on its own (interaction.md). */}
              <circle
                cx={p.x}
                cy={p.y}
                r="12"
                fill="transparent"
                onClick={() => toggleActive(i)}
                className="cursor-pointer"
              />
            </g>
          ))}

          {/* Sparse direct labels — first/last session date + fps only. */}
          <text x={points[0].x} y="10" fontSize="9" fill={MUTED} textAnchor={edgeAwareAnchor(points[0].x)}>
            {fmtDate(points[0].date)}
          </text>
          <text x={points[points.length - 1].x} y="10" fontSize="9" fill="#94a3b8" textAnchor={edgeAwareAnchor(points[points.length - 1].x)}>
            {fmtDate(points[points.length - 1].date)}
          </text>
        </svg>
        {active && (
          <Tooltip xPercent={(active.x / WIDTH) * 100}>
            <span className="text-slate-400">{fmtDate(active.date)}: </span>
            <span className="font-mono font-semibold text-slate-100">{Math.round(active.avgVelocity)} fps</span>
          </Tooltip>
        )}
      </div>
    );
  }

  if (!shots || shots.length < 2) return null;

  const height = 56;
  const plotTop = 14; // room for the max-value label above the line
  const plotBottom = height - 14; // room for shot-number ticks below
  const min = Math.min(...shots);
  const max = Math.max(...shots);
  const range = max - min || 1;
  const toY = (v) => plotBottom - ((v - min) / range) * (plotBottom - plotTop);

  const points = shots.map((v, i) => ({
    x: shots.length > 1 ? (i / (shots.length - 1)) * WIDTH : WIDTH / 2,
    y: toY(v),
    v,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const hasAvg = avgVelocity != null;
  const avgY = hasAvg ? toY(avgVelocity) : null;
  const isOutlier = (v) => avgVelocity != null && stdDevFps != null && stdDevFps > 0 && Math.abs(v - avgVelocity) > stdDevFps * 2;

  // Direct-label the extremes (label the endpoint/extreme, never every
  // point — dataviz skill). Ties resolve to the first occurrence.
  const maxIndex = points.findIndex((p) => p.v === max);
  const minIndex = points.findIndex((p) => p.v === min);

  // Sparse shot-number ticks — every point if there are few, otherwise a
  // fixed handful evenly spaced (always including the first and last).
  const tickIndices =
    points.length <= 8
      ? points.map((_, i) => i)
      : Array.from(new Set([0, ...Array.from({ length: 5 }, (_, k) => Math.round((k * (points.length - 1)) / 5)), points.length - 1]));

  const active = activeIndex != null ? points[activeIndex] : null;

  return (
    <div className="relative" ref={wrapRef}>
      <svg width="100%" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        {hasAvg && (
          <>
            <line x1="0" x2={WIDTH} y1={avgY} y2={avgY} stroke={MUTED} strokeWidth="1" strokeDasharray="3,3" />
            <text x="2" y={avgY - 3} fontSize="8" fill={MUTED}>
              avg {Math.round(avgVelocity)}
            </text>
          </>
        )}

        <path d={path} fill="none" stroke={AMBER} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {active && <line x1={active.x} x2={active.x} y1={plotTop - 6} y2={plotBottom + 6} stroke={MUTED} strokeWidth="1" strokeDasharray="2,2" />}

        {/* Extreme labels — placed opposite the average line so they don't
            collide with it. */}
        <text x={points[maxIndex].x} y={toY(max) - 5} fontSize="8" fill="#94a3b8" textAnchor={edgeAwareAnchor(points[maxIndex].x)}>
          {max}
        </text>
        {minIndex !== maxIndex && (
          <text x={points[minIndex].x} y={toY(min) - 5} fontSize="8" fill="#94a3b8" textAnchor={edgeAwareAnchor(points[minIndex].x)}>
            {min}
          </text>
        )}

        {/* Sparse shot-number ticks along the bottom. */}
        {tickIndices.map((i) => (
          <text key={i} x={points[i].x} y={height - 1} fontSize="7" fill={MUTED} textAnchor={edgeAwareAnchor(points[i].x)}>
            {i + 1}
          </text>
        ))}

        {points.map((p, i) => {
          const outlier = isOutlier(p.v);
          const isActive = activeIndex === i;
          return (
            <g key={i}>
              {(outlier || isActive || i === points.length - 1) && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 5 : 4}
                  fill={outlier ? RED : AMBER}
                  stroke={SURFACE}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              )}
              {/* Invisible, larger tap/hover hit target for every shot,
                  not just the ones with a visible marker — the whole
                  point is being able to identify any shot, not just
                  flagged ones (interaction.md: hit target > mark). */}
              <circle
                cx={p.x}
                cy={p.y}
                r="12"
                fill="transparent"
                onClick={() => toggleActive(i)}
                className="cursor-pointer"
              />
            </g>
          );
        })}
      </svg>
      {active && (
        <Tooltip xPercent={(active.x / WIDTH) * 100}>
          <span className="text-slate-400">Shot {activeIndex + 1}: </span>
          <span className="font-mono font-semibold text-slate-100">{active.v} fps</span>
          {hasAvg && (
            <span className={active.v - avgVelocity >= 0 ? 'text-emerald-400' : 'text-sky-400'}>
              {' '}
              ({active.v - avgVelocity >= 0 ? '+' : ''}
              {Math.round(active.v - avgVelocity)})
            </span>
          )}
          {isOutlier(active.v) && <span className="text-red-400"> · flyer</span>}
        </Tooltip>
      )}
    </div>
  );
}
