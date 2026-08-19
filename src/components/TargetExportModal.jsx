import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import QRCode from 'qrcode';

const EXPORT_SIZE = 1080;

// Section 3's Viral Social Overlay Generator: a 1:1 square export card
// with the target image, shot group overlay, MOA badge, velocity HUD,
// and a watermark footer reading "Verified with Precision Load Vault •
// [Recipe QR Code]" — every share is a small ad for the app.
//
// TODO: this currently points the QR code at the app homepage, not the
// specific recipe. Once a real public recipe page exists (routing +
// visibility-aware view, see load_recipes.visibility in the schema),
// switch SHARE_URL below to that recipe's own share URL instead.
const SHARE_URL = 'https://load-vault.vercel.app';

/** Shorten `text` with an ellipsis so it fits within `maxWidth` px at the
 * canvas context's current font — canvas text doesn't wrap or truncate on
 * its own, so long recipe titles/component names need this before being
 * dropped into a fixed-width footer column. */
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

/** Draws a "Label: Value" line where the label (e.g. "Powder:") is dim
 * amber and the value (e.g. "Hodgon H4350") is bold and bright — so the
 * component names are actually legible/scannable at social-post size
 * instead of everything running together in one flat grey line. Drawn as
 * two separate fillText calls sharing a baseline, since canvas has no
 * mixed-style text run. The value is truncated against whatever width is
 * left after the label, so long component names still can't run past
 * `maxWidth`. */
function drawLabeledLine(ctx, label, value, x, y, maxWidth) {
  ctx.font = '18px monospace';
  ctx.fillStyle = '#d97706';
  ctx.fillText(label, x, y);
  const labelWidth = ctx.measureText(label).width;

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(truncateText(ctx, value, maxWidth - labelWidth), x + labelWidth, y);
}

export default function TargetExportModal({
  open,
  onClose,
  imageEl,
  shots,
  moa,
  recipe,
  avgVelocity,
  stdDevFps,
  extremeSpread,
}) {
  const canvasRef = useRef(null);
  const qrImgRef = useRef(null);
  const [qrReady, setQrReady] = useState(false);
  const [pngUrl, setPngUrl] = useState(null);

  // Generate the QR code once on mount and cache it as an Image — it
  // always points at the same URL for now (see SHARE_URL above), so there's
  // no need to regenerate it every time the target/shots/recipe change.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(SHARE_URL, {
      margin: 1,
      width: 200,
      color: { dark: '#121619ff', light: '#fbbf24ff' },
    })
      .then((dataUrl) => {
        if (cancelled) return;
        const img = new Image();
        img.onload = () => {
          qrImgRef.current = img;
          setQrReady(true);
        };
        img.src = dataUrl;
      })
      .catch((err) => console.error('Failed to generate QR code', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Three horizontal bands: a stats header, the target photo, and the
    // watermark footer. The photo is kept perfectly SQUARE (matching the
    // aspect ratio it was plotted at in TargetCalculator's canvas) and
    // centered, rather than stretched to fill a non-square gap — any
    // leftover width becomes plain side margins instead of distorting
    // the image.
    const HEADER_HEIGHT = 230;
    const FOOTER_HEIGHT = 220;
    const PHOTO_SIZE = EXPORT_SIZE - HEADER_HEIGHT - FOOTER_HEIGHT;
    const PHOTO_TOP = HEADER_HEIGHT;
    const PHOTO_LEFT = (EXPORT_SIZE - PHOTO_SIZE) / 2;

    ctx.fillStyle = '#121619';
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

    // --- Header: MOA badge + the three FPS stats, sized to actually be
    // readable on a phone screen at social-post size. ---
    ctx.fillStyle = 'rgba(18, 22, 25, 0.95)';
    ctx.fillRect(0, 0, EXPORT_SIZE, HEADER_HEIGHT);

    const moaBoxWidth = 260;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, moaBoxWidth, HEADER_HEIGHT - 48);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 80px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(moa != null ? moa.toFixed(2) : '—', 44, 132);
    ctx.font = '24px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('MOA', 44, 174);

    const statsX = 24 + moaBoxWidth + 24;
    const statsWidth = EXPORT_SIZE - statsX - 24;
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(statsX, 24, statsWidth, HEADER_HEIGHT - 48);
    // Prefer whatever's live this session (a chrono import/manual entry
    // not yet saved to a range session) over the recipe's last-saved
    // numbers, same as the HUD cards on the Overview tab — otherwise this
    // card would show stale/blank stats right after importing a chrono
    // file but before hitting Save.
    const stats = [
      { label: 'AVG FPS', value: avgVelocity ?? recipe.avgVelocity },
      { label: 'FPS SD', value: stdDevFps ?? recipe.stdDevFps },
      { label: 'FPS ES', value: extremeSpread ?? recipe.extremeSpread },
    ];
    const colWidth = statsWidth / 3;
    ctx.textAlign = 'center';
    stats.forEach((stat, i) => {
      const colCenter = statsX + colWidth * i + colWidth / 2;
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 52px monospace';
      ctx.fillText(stat.value != null ? String(stat.value) : '—', colCenter, 119);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '24px monospace';
      ctx.fillText(stat.label, colCenter, 164);
    });
    ctx.textAlign = 'left';

    // --- Target photo, square and centered ---
    if (imageEl) {
      ctx.drawImage(imageEl, PHOTO_LEFT, PHOTO_TOP, PHOTO_SIZE, PHOTO_SIZE);
    }

    (shots || []).forEach((shot) => {
      const x = PHOTO_LEFT + shot.x * PHOTO_SIZE;
      const y = PHOTO_TOP + shot.y * PHOTO_SIZE;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.stroke();
    });

    // --- Watermark footer — text on the left, a bigger scannable QR code
    // on the right. ---
    const footerTop = EXPORT_SIZE - FOOTER_HEIGHT;
    ctx.fillStyle = 'rgba(18, 22, 25, 0.95)';
    ctx.fillRect(0, footerTop, EXPORT_SIZE, FOOTER_HEIGHT);

    // Watermark block kept small and narrow on purpose — it's branding,
    // not the point of the card. Shrinking it (vs. the original 32px
    // "PRECISION LOAD VAULT") frees up most of the footer's width for the
    // load details below, which are the actually useful info for anyone
    // screenshotting this off social media.
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('Verified with', 24, footerTop + 34);
    ctx.font = 'bold 22px monospace';
    ctx.fillText('PRECISION LOAD VAULT', 24, footerTop + 58);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(SHARE_URL.replace('https://', ''), 24, footerTop + 80);

    const qrSize = FOOTER_HEIGHT - 40;
    const qrX = EXPORT_SIZE - qrSize - 32;
    const qrY = footerTop + 20;

    // Load details, filling the middle gap between the watermark text and
    // the QR code. `loadX` starts right after the (now-narrow) watermark
    // block with a fixed margin, and every line is truncated to
    // `loadMaxWidth` (measured against the actual QR position, with a
    // safety margin) so nothing can ever run into/under the QR code or
    // off the edge of the card, no matter how long a component name is.
    const loadX = 320;
    const loadMaxWidth = qrX - 40 - loadX;
    if (loadMaxWidth > 80) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(truncateText(ctx, recipe.title, loadMaxWidth), loadX, footerTop + 30);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '20px monospace';
      ctx.fillText(truncateText(ctx, recipe.caliber, loadMaxWidth), loadX, footerTop + 52);

      // Labeled component lines, one per line, not just bare values —
      // "Hodgon H4350" on its own doesn't say whether that's the powder
      // or the bullet. Charge weight folds into the Powder line since
      // it's meaningless without knowing which powder it's a charge OF.
      drawLabeledLine(
        ctx,
        'Powder: ',
        `${recipe.chargeGrains ?? '—'}gr ${recipe.powder || '—'}`,
        loadX,
        footerTop + 74,
        loadMaxWidth
      );
      drawLabeledLine(ctx, 'Bullet: ', recipe.bullet || '—', loadX, footerTop + 96, loadMaxWidth);
      drawLabeledLine(ctx, 'Primer: ', recipe.primer || '—', loadX, footerTop + 118, loadMaxWidth);
      drawLabeledLine(ctx, 'Brass: ', recipe.brass || '—', loadX, footerTop + 140, loadMaxWidth);

      if (recipe.coalInches) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '18px monospace';
        ctx.fillText(`COAL ${recipe.coalInches}"`, loadX, footerTop + 162);
      }
    }
    if (qrImgRef.current) {
      ctx.drawImage(qrImgRef.current, qrX, qrY, qrSize, qrSize);
    } else {
      // Still generating — draw a placeholder outline so layout doesn't jump.
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX, qrY, qrSize, qrSize);
    }

    canvas.toBlob((blob) => {
      if (blob) setPngUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    }, 'image/png');
  }, [open, imageEl, shots, moa, recipe, avgVelocity, stdDevFps, extremeSpread, qrReady]);

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
