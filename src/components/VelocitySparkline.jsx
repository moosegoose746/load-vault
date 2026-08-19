/** Stat-tile sparkline for velocity — plain SVG, no charting library, per
 * the dataviz skill's guidance for "a single current value + trend":
 * single series needs no legend/axis, 2px line, sparse labeling. Two
 * modes:
 *
 * - 'shots' (default): this session's per-shot chrono string, WITH an
 *   SD band (the honest context a reloader actually needs — is this tight
 *   or loose, not just "does the line wiggle") and outlier flagging (any
 *   shot outside ±2 SD gets a distinct marker, since chrono strings
 *   almost always have one weird shot and knowing which one at a glance
 *   is worth more than the raw shape).
 * - 'trend': average velocity per Range Session across the recipe's whole
 *   history — shows real drift (barrel wear, powder lot change) that a
 *   single session's shot-to-shot noise can't. No SD band here since each
 *   point is already an average, not a raw sample.
 *
 * No zero-baseline area fill in either mode — velocity doesn't
 * meaningfully start near zero, so filling down to 0 would misrepresent
 * the trend (dataviz skill, marks-and-anatomy.md). */
export default function VelocitySparkline({ mode = 'shots', shots, avgVelocity, stdDevFps, trend }) {
  const width = 280;
  const height = 56;
  const padY = 8;

  if (mode === 'trend') {
    if (!trend || trend.length < 2) return null;
    const values = trend.map((t) => t.avgVelocity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = trend.map((t, i) => {
      const x = (i / (trend.length - 1)) * width;
      const y = height - padY - ((t.avgVelocity - min) / range) * (height - padY * 2);
      return { x, y, ...t };
    });
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const first = points[0];
    const last = points[points.length - 1];
    const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height + 14}`} preserveAspectRatio="none" className="overflow-visible">
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 4 : 2.5}
            fill="#fbbf24"
            stroke="#0f172a"
            strokeWidth="1.5"
          />
        ))}
        {/* Sparse direct labels — first/last session date + fps only, per
            dataviz guidance (never a number on every point). */}
        <text x={first.x} y={height + 12} fontSize="9" fill="#64748b" textAnchor="start">
          {fmtDate(first.date)} · {Math.round(first.avgVelocity)}
        </text>
        <text x={last.x} y={height + 12} fontSize="9" fill="#94a3b8" textAnchor="end">
          {fmtDate(last.date)} · {Math.round(last.avgVelocity)}
        </text>
      </svg>
    );
  }

  if (!shots || shots.length < 2) return null;

  const min = Math.min(...shots);
  const max = Math.max(...shots);
  const range = max - min || 1;
  const toY = (v) => height - padY - ((v - min) / range) * (height - padY * 2);

  const points = shots.map((v, i) => ({
    x: (i / (shots.length - 1)) * width,
    y: toY(v),
    v,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  // SD band — shaded region ±1 SD around the session average, clipped to
  // the chart's own min/max so it never draws off-canvas for a very tight
  // string. Skipped entirely if avg/SD weren't computed (e.g. a single
  // shot slipped through, or stats genuinely unavailable).
  const hasBand = avgVelocity != null && stdDevFps != null && stdDevFps > 0;
  const bandTopV = hasBand ? Math.min(max, avgVelocity + stdDevFps) : null;
  const bandBottomV = hasBand ? Math.max(min, avgVelocity - stdDevFps) : null;

  // Outlier = more than 2 SD from the session average — a real flyer, not
  // just normal spread.
  const isOutlier = (v) => hasBand && Math.abs(v - avgVelocity) > stdDevFps * 2;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      {hasBand && (
        <rect
          x="0"
          y={toY(bandTopV)}
          width={width}
          height={Math.max(0, toY(bandBottomV) - toY(bandTopV))}
          fill="#fbbf24"
          opacity="0.1"
        />
      )}
      <path d={path} fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(
        (p, i) =>
          i !== points.length - 1 &&
          isOutlier(p.v) && (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill="#f87171" stroke="#0f172a" strokeWidth="1.5" />
          )
      )}
      <circle cx={last.x} cy={last.y} r="4" fill={isOutlier(last.v) ? '#f87171' : '#fbbf24'} stroke="#0f172a" strokeWidth="2" />
    </svg>
  );
}
