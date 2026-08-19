// Section 3: "Velocity Log Data Table — Compact table showing Shot Number,
// Velocity (FPS), and Variance Difference."
export default function VelocityLog({ shots, avgVelocity }) {
  return (
    <div className="rounded border border-slate-800 bg-panel">
      <h3 className="border-b border-slate-800 px-3 py-2 font-mono text-xs uppercase tracking-widest text-amber-400">
        Velocity Log
      </h3>
      <ul className="max-h-48 divide-y divide-slate-800 overflow-y-auto font-mono text-sm">
        {shots.map((fps, i) => {
          const diff = fps - avgVelocity;
          const sign = diff >= 0 ? '+' : '';
          return (
            <li key={i} className="flex items-center justify-between px-3 py-1.5">
              <span className="text-slate-400">Shot #{i + 1}</span>
              <span className="text-slate-100">
                {fps} FPS{' '}
                <span className={diff < 0 ? 'text-amber-400' : 'text-slate-500'}>
                  ({sign}
                  {diff.toFixed(2)})
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
