import { useState } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import { parseChronoCSV } from '../lib/parseChronoCSV.js';
import { computeVelocityStats } from '../lib/stats.js';

// Chrono CSV ingestion (Section 5C / Phase 4 of the execution guide).
// Accepts a Garmin ShotView or LabRadar export, or any generic CSV with a
// velocity column, and shows the parsed shot string with computed stats.
// Reports the parsed shots up via `onImportComplete` so a parent (e.g.
// Dashboard's "Save to Vault") can attach them to a real range session.
export default function ChronoImport({ onImportComplete }) {
  const [result, setResult] = useState(null); // { shots, source } | null
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    const text = await file.text();
    const parsed = parseChronoCSV(text);
    if (parsed.success) {
      setResult(parsed);
      onImportComplete?.(parsed.shots);
    } else {
      setError(parsed.error);
      onImportComplete?.(null);
    }
    e.target.value = ''; // allow re-selecting the same file
  };

  const stats = result ? computeVelocityStats(result.shots) : null;

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-800 bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-widest text-amber-400">
          Chrono CSV Import
        </h2>
        <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400">
          <Upload size={14} />
          UPLOAD CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {error && (
        <p className="flex items-start gap-2 font-mono text-xs text-red-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {result && stats && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs text-slate-400">
            Detected: <span className="text-slate-100">{result.source}</span> · {result.shots.length}{' '}
            shots
          </p>
          <div className="flex flex-wrap gap-4 font-mono text-xs text-slate-400">
            <span>
              Avg: <span className="text-slate-100">{stats.avg.toFixed(1)} FPS</span>
            </span>
            <span>
              SD: <span className="text-slate-100">{stats.sd.toFixed(2)}</span>
            </span>
            <span>
              ES: <span className="text-slate-100">{stats.es}</span>
            </span>
          </div>
          <p className="font-mono text-[11px] text-slate-500">{result.shots.join(', ')} FPS</p>
        </div>
      )}

      {!result && !error && (
        <p className="font-mono text-[11px] text-slate-600">
          Accepts Garmin ShotView, LabRadar, or any CSV with a velocity/speed/FPS column.
        </p>
      )}
    </div>
  );
}
