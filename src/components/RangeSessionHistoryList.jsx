// The range-day counterpart to LoadingHistoryList — every Range Session
// logged for this recipe, newest first. Unlike a Loading Session, a row
// here might be a Quick Log entry (rounds fired only, no target/chrono
// data) rather than a full measured session, so each row is tagged
// "Quick Log" whenever it has neither a group size nor a velocity reading
// rather than assuming every row has the full picture. Group size shows
// both MOA and inches together (see the Range Day discussion in the
// progress log — a bare MOA number means nothing without knowing it's
// paired with a distance, and plenty of shooters think in inches first).
export default function RangeSessionHistoryList({ history, loading }) {
  const lifetimeRoundsFired = history
    ? history.reduce((sum, s) => sum + (s.rounds_fired || 0), 0)
    : 0;

  if (loading) {
    return <p className="py-6 text-center font-mono text-xs text-slate-400">Loading history…</p>;
  }

  if (!history || history.length === 0) {
    return (
      <p className="py-6 text-center font-mono text-xs text-slate-500">No Range Sessions logged yet.</p>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
        <span className="text-slate-500">Lifetime rounds fired</span>
        <span className="font-mono text-sm font-semibold text-slate-100">{lifetimeRoundsFired}</span>
      </div>
      <div className="flex flex-col gap-2">
        {history.map((s) => {
          const isQuickLog = s.group_size_moa == null && s.avg_velocity_fps == null;
          return (
            <div
              key={s.id}
              className="flex items-start justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-xs"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-100">
                    {s.rounds_fired != null ? `${s.rounds_fired} rds` : '— rds'}
                  </span>
                  <span className="text-slate-500">{new Date(s.created_at).toLocaleDateString()}</span>
                  {isQuickLog ? (
                    <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                      Quick Log
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-amber-400">
                      {s.group_size_moa != null ? `${s.group_size_moa.toFixed(2)} MOA` : '—'}
                      {s.group_size_inches != null ? ` (${s.group_size_inches.toFixed(2)}")` : ''}
                      {s.distance_yards != null ? ` @ ${s.distance_yards}yd` : ''}
                    </span>
                  )}
                </div>
                {!isQuickLog && s.avg_velocity_fps != null && (
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    {s.avg_velocity_fps} fps avg
                    {s.std_dev_fps != null ? ` · SD ${s.std_dev_fps}` : ''}
                    {s.extreme_spread_fps != null ? ` · ES ${s.extreme_spread_fps}` : ''}
                  </p>
                )}
                {s.notes && <p className="mt-1 truncate text-slate-400">{s.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
