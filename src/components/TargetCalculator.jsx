import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, RotateCcw, Ruler, Upload } from 'lucide-react';
import { compressTargetImage } from '../lib/imageCompression.js';
import { calculatePixelsPerInch, groupSizeInches, inchesToMoa } from '../lib/moaMath.js';

const CANVAS_SIZE = 480; // internal draw resolution; renders responsively via CSS
const LOUPE_SIZE = 120;
const LOUPE_ZOOM = 4;
const LOUPE_OFFSET_Y = 60; // floats above the finger, per Section 3 spec
const REFERENCE_INCHES = 1; // "mark a 1-inch reference distance" per Section 5B

// Section 3's <TargetCalculator/>: HTML5 Canvas with normalized shot
// coordinates, a touch magnifier loupe for precise mobile dot placement,
// and live MOA math. Client-side WebP compression (Section 5A) runs on
// upload before anything is held in memory or (later) sent to Supabase.
export default function TargetCalculator({ distanceYards = 100, onStateChange, initialImageUrl }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const loupeCanvasRef = useRef(null);
  // The compressed Blob for whatever's currently loaded — only set when the
  // user picks a NEW photo this session (not when a saved photo is
  // restored from initialImageUrl below), so Dashboard's save handler only
  // re-uploads a photo when there's actually a new one to upload.
  const imageBlobRef = useRef(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [mode, setMode] = useState('shots'); // 'shots' | 'calibrate'
  const [shots, setShots] = useState([]);
  const [calibration, setCalibration] = useState({ a: null, b: null });
  const [loupe, setLoupe] = useState(null);

  const ppi = calculatePixelsPerInch(calibration.a, calibration.b, CANVAS_SIZE, CANVAS_SIZE, REFERENCE_INCHES);
  const groupInches = groupSizeInches(shots, CANVAS_SIZE, CANVAS_SIZE, ppi);
  const moa = inchesToMoa(groupInches, distanceYards);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (calibration.a) {
      const a = { x: calibration.a.x * CANVAS_SIZE, y: calibration.a.y * CANVAS_SIZE };
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
      ctx.fill();
      if (calibration.b) {
        const b = { x: calibration.b.x * CANVAS_SIZE, y: calibration.b.y * CANVAS_SIZE };
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    shots.forEach((shot) => {
      const x = shot.x * CANVAS_SIZE;
      const y = shot.y * CANVAS_SIZE;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
    });
  }, [shots, calibration]);

  useEffect(() => {
    draw();
  }, [draw, imageLoaded]);

  useEffect(() => {
    onStateChange?.({ imageEl: imgRef.current, imageBlob: imageBlobRef.current, shots, moa, groupInches });
    // imgRef.current only changes when a new image finishes loading, which
    // also flips imageLoaded — included below so this fires at that point too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, moa, groupInches, imageLoaded]);

  // Restore a previously-saved target photo (from the recipe's most recent
  // range session) when one exists and nothing's been loaded yet this
  // session. Only ever runs once per mount — if the user then replaces it
  // with a new upload, this shouldn't fire again just because a re-render
  // happens to pass the same initialImageUrl down again.
  useEffect(() => {
    if (!initialImageUrl || imageLoaded) return;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed so the canvas stays exportable (Share Recipe) — the storage bucket is public
    img.onload = () => {
      imgRef.current = img;
      imageBlobRef.current = null; // a restored photo, not a fresh upload — don't re-upload it verbatim on save
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.warn('Failed to load saved target image', initialImageUrl);
    };
    img.src = initialImageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageUrl]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressTargetImage(file);
    const url = URL.createObjectURL(compressed);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      imageBlobRef.current = compressed;
      setShots([]);
      setCalibration({ a: null, b: null });
      setImageLoaded(true);
    };
    img.src = url;
  };

  const pointFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e) => {
    if (!imageLoaded) return;
    const point = pointFromEvent(e);
    if (mode === 'calibrate') {
      setCalibration((prev) => (!prev.a || (prev.a && prev.b) ? { a: point, b: null } : { ...prev, b: point }));
    } else {
      setShots((prev) => [...prev, point]);
    }
  };

  const handlePointerMove = (e) => {
    if (e.pointerType !== 'touch' || !imageLoaded) {
      if (loupe) setLoupe(null);
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const point = pointFromEvent(e);
    setLoupe({
      screenX: e.clientX - rect.left,
      screenY: e.clientY - rect.top,
      sx: point.x * CANVAS_SIZE - LOUPE_SIZE / (2 * LOUPE_ZOOM),
      sy: point.y * CANVAS_SIZE - LOUPE_SIZE / (2 * LOUPE_ZOOM),
    });
  };

  const handlePointerUp = () => setLoupe(null);

  useEffect(() => {
    if (!loupe || !canvasRef.current || !loupeCanvasRef.current) return;
    const ctx = loupeCanvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      canvasRef.current,
      loupe.sx,
      loupe.sy,
      LOUPE_SIZE / LOUPE_ZOOM,
      LOUPE_SIZE / LOUPE_ZOOM,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE
    );
    ctx.restore();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [loupe]);

  const clearAll = () => {
    setShots([]);
    setCalibration({ a: null, b: null });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400">
          <Upload size={14} />
          {imageLoaded ? 'REPLACE PHOTO' : 'UPLOAD TARGET PHOTO'}
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
        <button
          type="button"
          disabled={!imageLoaded}
          onClick={() => setMode('calibrate')}
          className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs disabled:opacity-40 ${
            mode === 'calibrate'
              ? 'border-sky-400 bg-sky-500/10 text-sky-300'
              : 'border-slate-700 text-slate-300 hover:border-sky-400 hover:text-sky-300'
          }`}
        >
          <Ruler size={14} />
          SET 1&quot; REFERENCE
        </button>
        <button
          type="button"
          disabled={!imageLoaded}
          onClick={() => setMode('shots')}
          className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs disabled:opacity-40 ${
            mode === 'shots'
              ? 'border-amber-500 bg-amber-500/10 text-amber-400'
              : 'border-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-400'
          }`}
        >
          <Crosshair size={14} />
          PLOT SHOTS
        </button>
        <button
          type="button"
          disabled={!shots.length && !calibration.a}
          onClick={clearAll}
          className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-red-500 hover:text-red-400 disabled:opacity-40"
        >
          <RotateCcw size={14} />
          CLEAR
        </button>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[480px]">
        {imageLoaded ? (
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="h-full w-full touch-none rounded border border-slate-700 bg-slate-900"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-700 font-mono text-xs text-slate-600">
            UPLOAD A TARGET PHOTO TO BEGIN
          </div>
        )}

        {loupe && (
          <canvas
            ref={loupeCanvasRef}
            width={LOUPE_SIZE}
            height={LOUPE_SIZE}
            className="pointer-events-none absolute rounded-full border-2 border-amber-500 shadow-lg"
            style={{
              left: loupe.screenX - LOUPE_SIZE / 2,
              top: loupe.screenY - LOUPE_SIZE - LOUPE_OFFSET_Y + LOUPE_SIZE / 2,
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-xs text-slate-400">
        <span>
          Mode: <span className="text-slate-100">{mode === 'calibrate' ? 'Setting 1" reference' : 'Plotting shots'}</span>
        </span>
        <span>
          Shots: <span className="text-slate-100">{shots.length}</span>
        </span>
        <span>
          PPI: <span className="text-slate-100">{ppi ? ppi.toFixed(1) : '—'}</span>
        </span>
        <span>
          Group: <span className="text-slate-100">{groupInches ? `${groupInches.toFixed(3)}"` : '—'}</span>
        </span>
        <span>
          MOA: <span className="text-amber-400">{moa ? moa.toFixed(2) : '—'}</span>
        </span>
      </div>
    </div>
  );
}
