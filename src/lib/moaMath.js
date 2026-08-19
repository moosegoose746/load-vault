// Normalized canvas coordinate math — Section 5B of the master doc.
//
// Shot and calibration points are stored as {x, y} in the 0.0–1.0 range
// relative to the rendered target image, not raw pixels. That keeps a
// group's geometry correct no matter what size the canvas is actually
// drawn at (mobile vs desktop, thumbnail vs full view) — the same
// normalized points always describe the same physical spot on the target.

/** Pixel distance between two normalized points, for a given render size. */
export function distanceNormalized(a, b, canvasWidth, canvasHeight) {
  const dx = (a.x - b.x) * canvasWidth;
  const dy = (a.y - b.y) * canvasHeight;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Largest pairwise distance among a set of shots — the group's extreme spread. */
export function maxGroupSpreadPixels(shots, canvasWidth, canvasHeight) {
  let max = 0;
  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j < shots.length; j++) {
      const d = distanceNormalized(shots[i], shots[j], canvasWidth, canvasHeight);
      if (d > max) max = d;
    }
  }
  return max;
}

/** Pixels-per-inch from a user-marked reference distance (e.g. a 1" grid square). */
export function calculatePixelsPerInch(pointA, pointB, canvasWidth, canvasHeight, referenceInches) {
  if (!pointA || !pointB || !referenceInches || referenceInches <= 0) return null;
  const pixelDistance = distanceNormalized(pointA, pointB, canvasWidth, canvasHeight);
  return pixelDistance / referenceInches;
}

/** Group size in inches, or null if there isn't enough data yet to measure. */
export function groupSizeInches(shots, canvasWidth, canvasHeight, ppi) {
  if (!ppi || shots.length < 2) return null;
  const spreadPixels = maxGroupSpreadPixels(shots, canvasWidth, canvasHeight);
  return spreadPixels / ppi;
}

/** Group size in inches -> Minute of Angle, per the master doc's formula. */
export function inchesToMoa(inches, distanceYards) {
  if (inches == null || !distanceYards) return null;
  return inches / (1.047 * (distanceYards / 100));
}
