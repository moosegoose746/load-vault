/** Plain-SVG stat-tile sparkline for per-shot velocity — no charting
 * library, per the dataviz skill's guidance for "a single current value +
 * trend": single series needs no legend/axis, 2px line, no zero-baseline
 * area fill (velocity doesn't meaningfully start near zero, so a fill down
 * to 0 would misrepresent the trend), sparse labeling (endpoints only,
 * never every point). `shots` is the same per-shot velocity_fps array
 * already used by VelocityLog's full table — this just visualizes it. */
export default function VelocitySparkline({ shots }) {
  if (!shots || shots.length < 2) return null;

  const width = 280;
  const height = 48;
  const padY = 6;
  const min = Math.min(...shots);
  const max = Math.max(...shots);
  const range = max - min || 1;

  const points = shots.map((v, i) => {
    const x = (i / (shots.length - 1)) * width;
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return [x, y];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <path d={path} fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4" fill="#fbbf24" stroke="#0f172a" strokeWidth="2" />
    </svg>
  );
}
