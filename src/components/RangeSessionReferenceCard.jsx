// "What's on record" for this recipe's range side, shown read-only at the
// top of the Range Day tab — separate from the entry form below it (see
// the Range Day overhaul discussion in the progress log). This used to be
// the job of quietly pre-loading the last saved target photo straight
// into TargetCalculator and letting the Velocity Log fall back to the
// last saved shots whenever nothing had been chrono'd yet — which is
// exactly what made it unclear whether you were looking at history or
// editing it. Now the last session is only ever shown here, and the form
// below always starts genuinely blank.
export default function RangeSessionReferenceCard({ recipe }) {
  // The demo recipe (mockRecipe.js) carries groupSizeMoa/avgVelocity as
  // flat sample values rather than a real lastFiredAt-backed session, so
  // fall back to checking those directly — otherwise the demo would
  // always show "No Range Sessions logged yet" despite having sample
  // data to display.
  const hasAnySession = recipe.lastFiredAt != null || recipe.groupSizeMoa != null || recipe.avgVelocity != null;

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-800 bg-panel p-3 sm:flex-row sm:items-center">
      {recipe.targetImageUrl && (
        <img
          src={recipe.targetImageUrl}
          alt="Last target"
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
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-slate-300">
            {recipe.lastFiredAt != null && (
              <span className="text-slate-500">{new Date(recipe.lastFiredAt).toLocaleDateString()}</span>
            )}
            {recipe.lastFiredRounds != null && <span>{recipe.lastFiredRounds} rds</span>}
            {recipe.groupSizeMoa != null ? (
              <span className="text-amber-400">
                {recipe.groupSizeMoa.toFixed(2)} MOA
                {recipe.groupSizeInches != null ? ` (${recipe.groupSizeInches.toFixed(2)}")` : ''}
                {recipe.distanceYards != null ? ` @ ${recipe.distanceYards}yd` : ''}
              </span>
            ) : (
              <span className="text-slate-600">No group measured (Quick Log)</span>
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
      </div>
    </div>
  );
}
