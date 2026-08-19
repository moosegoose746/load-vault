import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';

const EXPORT_SIZE = 1080;

// Section 3's Viral Social Overlay Generator: a 1:1 square export card
// with the target image, shot group overlay, MOA badge, velocity HUD,
// and a watermark footer — every share is a small ad for the app.
export default function TargetExportModal({ open, onClose, imageEl, shots, moa, recipe }) {
  const canvasRef = useRef(null);
  const [pngUrl, setPngUrl] = useState(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#121619';
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

    if (imageEl) {
      ctx.drawImage(imageEl, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
    }

    (shots || []).forEach((shot) => {
      const x = shot.x * EXPORT_SIZE;
      const y = shot.y * EXPORT_SIZE;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.stroke();
    });

    // MOA badge, top-left
    ctx.fillStyle = 'rgba(18, 22, 25, 0.85)';
    ctx.fillRect(24, 24, 220, 100);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 220, 100);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 48px monospace';
    ctx.fillText(moa != null ? moa.toFixed(2) : '—', 44, 84);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('MOA', 44, 108);

    // Velocity HUD, top-right
    ctx.fillStyle = 'rgba(18, 22, 25, 0.85)';
    ctx.fillRect(EXPORT_SIZE - 300, 24, 276, 100);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(EXPORT_SIZE - 300, 24, 276, 100);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`${recipe.avgVelocity} FPS AVG`, EXPORT_SIZE - 284, 60);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`SD ${recipe.stdDevFps}  ES ${recipe.extremeSpread}`, EXPORT_SIZE - 284, 90);

    // Watermark footer
    ctx.fillStyle = 'rgba(18, 22, 25, 0.85)';
    ctx.fillRect(0, EXPORT_SIZE - 60, EXPORT_SIZE, 60);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('Verified with Precision Load Vault', 24, EXPORT_SIZE - 24);

    canvas.toBlob((blob) => {
      if (blob) setPngUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    }, 'image/png');
  }, [open, imageEl, shots, moa, recipe]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full flex-col gap-3 rounded border border-slate-800 bg-panel p-4">
        <div className="flex items-center justify-between gap-8">
          <h2 className="font-mono text-sm uppercase tracking-widest text-amber-400">Share Recipe</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={EXPORT_SIZE}
          height={EXPORT_SIZE}
          className="max-h-[70vh] w-auto self-center rounded border border-slate-800"
        />
        {!imageEl && (
          <p className="text-center font-mono text-xs text-slate-500">
            Upload a target photo above to include it in the share card.
          </p>
        )}
        <a
          href={pngUrl ?? '#'}
          download="precision-load-vault-target.png"
          className={`flex items-center justify-center gap-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10 ${
            pngUrl ? '' : 'pointer-events-none opacity-40'
          }`}
        >
          <Download size={14} />
          DOWNLOAD PNG
        </a>
      </div>
    </div>
  );
}
