import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const WIDTH = 520;
const HEIGHT = 300;
const MARGIN = { top: 16, right: 20, bottom: 32, left: 44 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const AMBER = '#fbbf24';
const AMBER_DIM = 'rgba(251, 191, 36, 0.35)';
const RED = '#f87171';
const RED_DIM = 'rgba(248, 113, 113, 0.45)';
const MUTED = '#64748b';
const GRID = '#1e293b';
const SURFACE = '#0f172a';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "Nice" axis tick step — snaps to a 1/2/5×10^n step so the y-axis reads
 * in round numbers (per the dataviz skill's marks-and-anatomy guidance),
 * rather than whatever ugly step the raw min/max happens to produce. */
function niceStep(range, targetCount) {
  const raw = range / targetCount || 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  if (residual > 5) return 10 * magnitude;
  if (residual > 2) return 5 * magnitude;
  if (residual > 1) return 2 * magnitude;
  return magnitude;
}

function niceTicks(min, max, targetCount = 5) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceStep(max - min, targetCount);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = niceMin; t <= niceMax + step * 1e-6; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}

/** Ordinary least-squares fit — the whole point of the chart. A ladder
 * test's flat spots (the forgiving pressure/harmonic nodes reloaders are
 * actually hunting for) only read as flats relative to what a straight
 * line WOULD predict; a raw connect-the-dots line doesn't show that. */
function linearRegression(points) {
  const n = points.length;
  const xMean = points.reduce((s, p) => s + p.x, 0) / n;
  const yMean = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - xMean) * (p.y - yMean), 0);
  const den = points.reduce((s, p) => s + (p.x - xMean) ** 2, 0);
  if (den === 0) return null;
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

function Tooltip({ xPercent, yPercent, children }) {
  const clampedX = Math.min(85, Math.max(15, xPercent));
  const translateX = xPercent < 20 ? '0%' : xPercent > 80 ? '-100%' : '-50%';
  return (
    <div
      className="pointer-events-none absolute z-10 rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] leading-snug text-slate-200 shadow-lg shadow-black/40"
      style={{
        left: `${clampedX}%`,
        top: `${yPercent}%`,
        transform: `translateX(${translateX}) translateY(-115%)`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

/** Charge Weight vs. Velocity — the core ladder-test chart. Per the
 * dataviz skill: a real linear axis on both dimensions (charge weight
 * isn't ordinal here, the actual gr spacing between rungs matters), a
 * fitted trend line as a recessive gray dashed reference (not a data
 * color — it's a computed overlay, not a raw measurement) so deviations
 * from it read as visible dips, EVERY individual shot plotted as a small
 * dim dot (not just each rung's average) so a lone weird chrono reading
 * can't masquerade as a false flat, and the rung average as the bold
 * primary, tappable mark. Tap (not hover — same Range-Mode reasoning as
 * everywhere else in this app) an average for its full readout.
 *
 * Deliberately does NOT auto-flag "the node is here" — where the useful
 * flat actually is is a judgment call a reloader makes by eye, and an
 * algorithmic guess here would be easy to get wrong and easy to over-
 * trust. The chart's job is to make the flat visible, not to name it. */
export default function WorkupChart({ rungs }) {
  const [activeId, setActiveId] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (activeId == null) return;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setActiveId(null);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [activeId]);

  const usable = rungs.filter((r) => r.avgVelocity != null);

  if (usable.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-3 py-6 text-center font-mono text-xs text-slate-500">
        Add a rung with velocity data (shots, or a manual Avg FPS) to see the chart.
      </p>
    );
  }

  const charges = usable.map((r) => r.chargeGrains);
  const allVelocities = usable.flatMap((r) => (r.shots.length ? r.shots : [r.avgVelocity]));

  const chargeMin = Math.min(...charges);
  const chargeMax = Math.max(...charges);
  const chargePad = charges.length > 1 ? (chargeMax - chargeMin) * 0.08 || 0.5 : 0.5;
  const xMin = chargeMin - chargePad;
  const xMax = chargeMax + chargePad;

  const vMin = Math.min(...allVelocities);
  const vMax = Math.max(...allVelocities);
  const vPad = Math.max((vMax - vMin) * 0.15, 15);
  // "Nice" tick values can round OUTSIDE the padded vMin/vMax range (e.g. a
  // ceiling of 2934 rounds up to a 3000 gridline) — if the y-domain used for
  // toY() didn't also expand to cover that, the tick would plot above
  // MARGIN.top and, thanks to overflow-visible, spill into whatever sits
  // above the chart on the page. So: generate ticks first from the padded
  // range, then grow the actual plotted domain to fully contain them.
  const yTicks = niceTicks(vMin - vPad, vMax + vPad, 5);
  const yMin = Math.min(vMin - vPad, yTicks[0]);
  const yMax = Math.max(vMax + vPad, yTicks[yTicks.length - 1]);

  const toX = (c) => MARGIN.left + ((c - xMin) / (xMax - xMin)) * PLOT_W;
  const toY = (v) => MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const fit =
    usable.length >= 2 ? linearRegression(usable.map((r) => ({ x: r.chargeGrains, y: r.avgVelocity }))) : null;

  // "Erratic" flag — a rung whose SD is notably higher (>1.5×) than the
  // median SD across this ladder's other rungs. Purely a statistical
  // comparison within the ladder, not a claim about pressure signs or
  // where the useful node is — deliberately more conservative than that
  // (see the component doc comment). Needs at least 3 rungs with SD data
  // for "median" to mean anything.
  const sdValues = usable.map((r) => r.stdDevFps).filter((v) => v != null);
  const sdMedian = sdValues.length >= 3 ? median(sdValues) : null;
  const isErratic = (r) => sdMedian != null && r.stdDevFps != null && r.stdDevFps > sdMedian * 1.5;
  const anyErratic = usable.some(isErratic);
  const erraticRungs = usable.filter(isErratic);

  const active = activeId != null ? usable.find((r) => r.id === activeId) : null;

  return (
    <div ref={wrapRef}>
      {/* This inner div is its OWN relative positioning context, separate
          from the legend/observations below — the Tooltip's x/y are plotted
          as percentages of this box's exact pixel size (which matches the
          SVG's own aspect ratio 1:1), so extra content stacking below it
          (legend, observations panel) can't skew where the tooltip lands. */}
      <div className="relative">
      <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="overflow-visible">
        {/* Recessive gridlines + y-axis labels, one-step-off-surface gray,
            hairline, solid — never dashed (marks-and-anatomy.md). */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={toY(t)} y2={toY(t)} stroke={GRID} strokeWidth="1" />
            <text x={MARGIN.left - 6} y={toY(t) + 3} fontSize="9" fill={MUTED} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {/* X-axis ticks at each tested charge weight — the domain values
            themselves ARE the meaningful ticks for a ladder chart, not
            generic round-number intervals. */}
        {charges.map((c, i) => (
          <text key={i} x={toX(c)} y={HEIGHT - MARGIN.bottom + 16} fontSize="9" fill={MUTED} textAnchor="middle">
            {c}
          </text>
        ))}
        <text
          x={MARGIN.left + PLOT_W / 2}
          y={HEIGHT - 4}
          fontSize="9"
          fill={MUTED}
          textAnchor="middle"
          className="uppercase tracking-wide"
        >
          charge weight (gr)
        </text>

        {/* Fitted trend line — a computed reference, not raw data, so it
            stays in the recessive gray/dashed treatment (same convention
            as the sparkline's average line) rather than the amber data
            color. Labeled in the caption below the chart instead of
            in-line — an in-chart text label here would collide with a
            real data point for almost any small ladder, since the line
            necessarily ends right at one. */}
        {fit && (
          <line
            x1={toX(chargeMin)}
            y1={toY(fit.slope * chargeMin + fit.intercept)}
            x2={toX(chargeMax)}
            y2={toY(fit.slope * chargeMax + fit.intercept)}
            stroke={MUTED}
            strokeWidth="1.5"
            strokeDasharray="4,3"
          />
        )}

        {/* Spread whiskers — min-to-max shot range per rung, drawn behind
            the dots. Lets the MAGNITUDE of a rung's spread read at a
            glance without counting individual dots; an "erratic" rung
            (SD notably above this ladder's median) renders in red instead
            of the default muted gray. */}
        {usable.map((r) => {
          if (r.shots.length < 2) return null;
          const x = toX(r.chargeGrains);
          const yMinV = toY(Math.min(...r.shots));
          const yMaxV = toY(Math.max(...r.shots));
          const color = isErratic(r) ? RED : MUTED;
          const opacity = isErratic(r) ? 0.6 : 0.35;
          return (
            <g key={`whisker-${r.id}`}>
              <line x1={x} x2={x} y1={yMaxV} y2={yMinV} stroke={color} strokeWidth="1.5" opacity={opacity} />
              <line x1={x - 4} x2={x + 4} y1={yMaxV} y2={yMaxV} stroke={color} strokeWidth="1.5" opacity={opacity} />
              <line x1={x - 4} x2={x + 4} y1={yMinV} y2={yMinV} stroke={color} strokeWidth="1.5" opacity={opacity} />
            </g>
          );
        })}

        {/* Individual shots — small, dim, non-interactive context so a
            lone weird reading is visible as spread rather than hidden
            inside an average. */}
        {usable.flatMap((r) => {
          const dotColor = isErratic(r) ? RED_DIM : AMBER_DIM;
          return r.shots.map((v, i) => <circle key={`${r.id}-${i}`} cx={toX(r.chargeGrains)} cy={toY(v)} r="2.5" fill={dotColor} />);
        })}

        {/* Rung averages — the primary, bold, tappable mark. */}
        {usable.map((r) => {
          const isActive = activeId === r.id;
          const erratic = isErratic(r);
          return (
            <g key={r.id}>
              <circle
                cx={toX(r.chargeGrains)}
                cy={toY(r.avgVelocity)}
                r={isActive ? 6 : 5}
                fill={erratic ? RED : AMBER}
                stroke={SURFACE}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <circle
                cx={toX(r.chargeGrains)}
                cy={toY(r.avgVelocity)}
                r="14"
                fill="transparent"
                onClick={() => setActiveId((prev) => (prev === r.id ? null : r.id))}
                className="cursor-pointer"
              />
            </g>
          );
        })}
      </svg>

      {active && (
        <Tooltip
          xPercent={(toX(active.chargeGrains) / WIDTH) * 100}
          yPercent={(toY(active.avgVelocity) / HEIGHT) * 100}
        >
          <div className="font-mono font-semibold text-slate-100">{active.chargeGrains} gr</div>
          <div>
            <span className="text-slate-400">avg </span>
            <span className="font-mono text-slate-100">{active.avgVelocity} fps</span>
            {active.stdDevFps != null && <span className="text-slate-400"> · SD {active.stdDevFps}</span>}
            {active.extremeSpread != null && <span className="text-slate-400"> · ES {active.extremeSpread}</span>}
          </div>
          {fit && usable.length >= 3 && (() => {
            const predicted = fit.slope * active.chargeGrains + fit.intercept;
            const delta = active.avgVelocity - predicted;
            const rounded = Math.round(delta);
            // Deliberately neutral color, not red/green — a rung sitting
            // BELOW the trend is often the desirable flat/node reloaders are
            // hunting for, so "deviates from trend" isn't inherently bad.
            // This just names the number the chart already implies, it
            // doesn't editorialize on it.
            return (
              <div className="text-slate-400">
                {Math.abs(rounded) < 1 ? (
                  <span>on trend</span>
                ) : (
                  <span>
                    <span className="font-mono text-slate-200">
                      {rounded > 0 ? '+' : ''}
                      {rounded} fps
                    </span>{' '}
                    {rounded > 0 ? 'above' : 'below'} trend
                  </span>
                )}
              </div>
            );
          })()}
          {(active.groupSizeMoa != null || active.roundsFired != null) && (
            <div className="text-slate-400">
              {active.groupSizeMoa != null && <span>{active.groupSizeMoa.toFixed(2)} MOA</span>}
              {active.groupSizeMoa != null && active.roundsFired != null && <span> · </span>}
              {active.roundsFired != null && <span>{active.roundsFired} rds</span>}
            </div>
          )}
          {active.notes && <div className="max-w-[14rem] whitespace-normal text-slate-500">{active.notes}</div>}
        </Tooltip>
      )}
      </div>

      {/* Caption/legend — outside the SVG so it never has to fight with
          data marks for space, and can grow/wrap freely. Line keys, not
          boxes, per the dataviz skill's tooltip/legend guidance. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> rung average (tap for detail)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400/40" /> individual shot
        </span>
        {fit && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3 border-t border-dashed border-slate-500" /> fitted trend
          </span>
        )}
        {anyErratic && (
          <span className="flex items-center gap-1 text-red-400">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" /> spread notably higher than this ladder's median
          </span>
        )}
      </div>

      {/* Observations — purely descriptive, statistically-derived facts
          about THIS ladder (never a verdict on any specific charge, never
          the word "safe"/"unsafe", never a suggestion of what to load
          next). Amber/warning-styled only when something is actually
          flagged; otherwise a neutral, muted box so the disclaimer doesn't
          cry wolf on a clean ladder. Always visible — per-rung nudges are
          conditional, the safety disclaimer at the bottom is not. */}
      <div
        className={`mt-2 flex gap-2 rounded border px-3 py-2 text-xs leading-relaxed ${
          erraticRungs.length > 0
            ? 'border-amber-600 bg-amber-500/10 text-amber-200'
            : 'border-slate-700 bg-slate-900/40 text-slate-400'
        }`}
      >
        {erraticRungs.length > 0 && (
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
        )}
        <div className="space-y-1.5">
          {erraticRungs.map((r) => (
            <p key={r.id}>
              <span className="font-mono font-semibold">{r.chargeGrains} gr</span> has the widest shot-to-shot
              spread in this ladder (SD {r.stdDevFps} fps vs. a {sdMedian} fps median across the other rungs).
              Inconsistent velocity at a single charge can be an early sign of a pressure-sensitive spot — check
              for pressure signs (flattened or cratered primers, hard bolt lift, ejector marks) and consider
              testing smaller increments around this charge before drawing conclusions from the average alone.
            </p>
          ))}
          <p className={erraticRungs.length > 0 ? 'text-amber-300/70' : ''}>
            Always work up loads in small increments, stay at or below your load manual's published maximum, and
            watch for pressure signs as you go. These are automatic statistical observations, not a safety
            verdict — never load based on velocity data alone.
          </p>
        </div>
      </div>

      {usable.length === 1 && (
        <p className="mt-1 text-center font-mono text-[10px] text-slate-600">
          Add another rung to see a trend line.
        </p>
      )}
    </div>
  );
}
