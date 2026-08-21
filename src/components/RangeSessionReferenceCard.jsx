// "What's on record" for this recipe's range side, shown read-only at the
// top of the Range Day tab — separate from the entry form below it (see
// the Range Day overhaul discussion in the progress log). This used to be
// the job of quietly pre-loading the last saved target photo straight
// into TargetCalculator and letting the Velocity Log fall back to the
// last saved shots whenever nothing had been chrono'd yet — which is
// exactly what made it unclear whether you were looking at history or
// editing it. Now the last session is only ever shown here, and the form
// below always starts genuinely blank.
//
// Shown as two separate lines rather than one, because they can now
// legitimately point at two different sessions: lastFiredAt is the truly
// most recent range trip (Quick Log included), while the group/velocity
// numbers follow lastMeasuredAt, the most recent trip that actually HAS
// a measurement (see mapRecipeRow in lib/recipes.js — a Quick Log session
// used to silently null out these numbers on Overview the moment one got
// logged, since both used to come from "whichever session is newest").
// Collapsing them back into one line would just reintroduce that same
// "wait, is this current?" ambiguity for a different reason.
export default function RangeSessionReferenceCard({ recipe }) {
  // The demo recipe (mockRecipe.js) carries groupSizeMoa/avgVelocity as
  // flat sample values rather than a real lastFiredAt-backed session, so
  // fall back to checking those directly — otherwise the demo would
  // always show "No Range Sessions logged yet" despite having sample
  // data to display.
  const hasAnySession = recipe.lastFiredAt != null || recipe.groupSizeMoa != null || recipe.avgVelocity != null;
  const hasMeasuredSession = recipe.groupSizeMoa != null || recipe.avgVelocity != null;
  // Only worth calling out as a separate line when the two dates actually
  // differ — if the last trip WAS the measured one, showing "last
  // session" and "last measured" separately would just be the same
  // information twice.
  const measuredDiffersFromLastFired =
    hasMeasuredSession && recipe.lastMeasuredAt !== recipe.lastFiredAt;

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-800 bg-panel p-3 sm:flex-row sm:items-center">
      {recipe.targetImageUrl && (
        <img
          src={recipe.targetImageUrl}
          alt="Last measured target"
          className="h-20 w-20 shrink-0 self-start rounded border border-slate-700 object-cover"
        />
      )}
      <div className="flex-1">
        <h2 className="mb-1.5 font-mono text-xs uppercase tracking-widest text-amber-400">
          Last Range Session
        </h2>
        {!hasAnySession ? (
          <p className="font-mono text-xs text-slate-600">No Range Sessions logged yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-slate-300">
              {recipe.lastFiredAt != null && (
                <span className="text-slate-500">{new Date(recipe.lastFiredAt).toLocaleDateString()}</span>
              )}
              {recipe.lastFiredRounds != null && <span>{recipe.lastFiredRounds} rds</span>}
              {recipe.lastFiredWasQuickLog ? (
                <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                  Quick Log
                </span>
              ) : (
                hasMeasuredSession &&
                !measuredDiffersFromLastFired && (
                  <span className="text-amber-400">
                    {recipe.groupSizeMoa != null ? `${recipe.groupSizeMoa.toFixed(2)} MOA` : ''}
                    {recipe.groupSizeInches != null ? ` (${recipe.groupSizeInches.toFixed(2)}")` : ''}
                    {recipe.distanceYards != null ? ` @ ${recipe.distanceYards}yd` : ''}
                  </span>
                )
              )}
              {!measuredDiffersFromLastFired && recipe.avgVelocity != null && (
                <span>
                  {recipe.avgVelocity} fps avg
                  {recipe.stdDevFps != null ? ` · SD ${recipe.stdDevFps}` : ''}
                  {recipe.extremeSpread != null ? ` · ES ${recipe.extremeSpread}` : ''}
                </span>
              )}
            </div>

            {/* Only rendered when the most recent measured group is from
                an EARLIER session than the most recent trip overall (i.e.
                one or more Quick Logs happened since) — makes it explicit
                these numbers aren't from the trip listed above. */}
            {measuredDiffersFromLastFired && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-800 pt-1 font-mono text-xs text-slate-300">
                <span className="text-slate-600">
                  Last measured {recipe.lastMeasuredAt != null ? new Date(recipe.lastMeasuredAt).toLocaleDateString() : ''}:
                </span>
                {recipe.groupSizeMoa != null && (
                  <span className="text-amber-400">
                    {recipe.groupSizeMoa.toFixed(2)} MOA
                    {recipe.groupSizeInches != null ? ` (${recipe.groupSizeInches.toFixed(2)}")` : ''}
                    {recipe.distanceYards != null ? ` @ ${recipe.distanceYards}yd` : ''}
                  </span>
                )}
                {recipe.avgVelocity != null && (
                  <span>
                    {recipe.avgVelocity} fps avg
                    {recipe.stdDevFps != null ? ` · SD ${recipe.stdDevFps}` : ''}
                    {recipe.extremeSpread != null ? ` · ES ${recipe.extremeSpread}` : ''}
                  </span>
                )}
              </div>
            )}

            {!hasMeasuredSession && (
              <span className="font-mono text-xs text-slate-600">No group measured yet.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
