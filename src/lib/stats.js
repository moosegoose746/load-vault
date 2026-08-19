// Basic velocity statistics shared by the chrono importer and anywhere
// else a shot string needs summarizing.
export function computeVelocityStats(shots) {
  if (!shots || shots.length === 0) return { avg: null, sd: null, es: null };
  const avg = shots.reduce((sum, v) => sum + v, 0) / shots.length;
  if (shots.length === 1) return { avg, sd: 0, es: 0 };
  const variance = shots.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (shots.length - 1);
  const sd = Math.sqrt(variance);
  const es = Math.max(...shots) - Math.min(...shots);
  return { avg, sd, es };
}
