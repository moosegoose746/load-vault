import { useState } from 'react';
import { AlertTriangle, Plus, Trash2, Upload } from 'lucide-react';
import { parseChronoCSV } from '../lib/parseChronoCSV.js';
import { computeVelocityStats } from '../lib/stats.js';

// Velocity data entry (Section 5C / Phase 4, extended). Accepts a Garmin
// ShotView or LabRadar export, any generic CSV with a velocity column, OR
// manually typed-in shot velocities for chronographs that don't export a
// file (or when you just want to key in a few readings by hand). Reports
// the resulting shot list up via `onImportComplete` so a parent (e.g.
// Dashboard's "Save to Vault") can attach them to a real range session.
export default function ChronoImport({ onImportComplete }) {
  const [mode, setMode] = useState('upload'); // 'upload' | 'manual'
  const [source, setSource] = useState('');
  const [shots, setShots] = useState([]);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');

  const applyShots = (nextShots, nextSource) => {
    setShots(nextShots);
    setSource(nextSource);
    onImportComplete?.(nextShots.length ? nextShots : null);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const text = await file.text();
    const parsed = parseChronoCSV(text);
    if (parsed.success) {
      applyShots(parsed.shots, parsed.source);
    } else {
      setError(parsed.error);
      applyShots([], '');
    }
    e.target.value = ''; // allow re-selecting the same file
  };

  const handleAddManualShot = (e) => {
    e.preventDefault();
    const value = Number(manualInput);
    if (!manualInput || Number.isNaN(value) || value < 200 || value > 6000) {
      setError('Enter a velocity between 200 and 6000 FPS.');
      return;
    }
    setError('');
    applyShots([...shots, Math.round(value)], 'Manual Entry');
    setManualInput('');
  };

  const handleRemoveShot = (index) => {
    const next = shots.filter((_, i) => i !== index);
    applyShots(next, next.length ? source : '');
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
    setManualInput('');
    applyShots([], '');
  };

  const stats = shots.length ? computeVelocityStats(shots) : null;

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-800 bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-amber-400">
          Velocity Data
        </h2>
        <div className="flex overflow-hidden rounded border border-slate-700">
          <button
            type="button"
            onClick={() => switchMode('upload')}
            className={`px-3 py-1.5 font-mono text-xs ${
              mode === 'upload' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            CSV UPLOAD
          </button>
          <button
            type="button"
            onClick={() => switchMode('manual')}
            className={`border-l border-slate-700 px-3 py-1.5 font-mono text-xs ${
              mode === 'manual' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            TYPE MANUALLY
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400">
          <Upload size={14} />
          UPLOAD CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <form onSubmit={handleAddManualShot} className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="e.g. 2745"
            className="w-32 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
          >
            <Plus size={14} />
            ADD SHOT
          </button>
        </form>
      )}

      {error && (
        <p className="flex items-start gap-2 font-mono text-xs text-red-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {shots.length > 0 && stats && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs text-slate-400">
            {source && (
              <>
                Source: <span className="text-slate-100">{source}</span> ·{' '}
              </>
            )}
            {shots.length} shot{shots.length === 1 ? '' : 's'}
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
          <div className="flex flex-wrap gap-1.5">
            {shots.map((v, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-300"
              >
                {v}
                {mode === 'manual' && (
                  <button
                    type="button"
                    onClick={() => handleRemoveShot(i)}
                    className="text-slate-500 hover:text-red-400"
                    aria-label={`Remove shot ${i + 1}`}
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {!shots.length && !error && (
        <p className="font-mono text-[11px] text-slate-600">
          {mode === 'upload'
            ? 'Accepts Garmin ShotView, LabRadar, or any CSV with a velocity/speed/FPS column.'
            : "Type each shot's velocity and press Add Shot (or hit Enter)."}
        </p>
      )}
    </div>
  );
}
