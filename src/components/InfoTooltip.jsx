import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

// A small "(i)" explainer icon — TAP to toggle open/closed, deliberately
// NOT hover-based. Range Mode implies outdoor/phone use, where there's no
// such thing as "hover," so a hover-only tooltip would just never open
// there. Tapping the icon again, or tapping anywhere else on the page,
// closes it. Used sparingly at the handful of spots flagged in the UX
// audit where a number or field's meaning genuinely isn't obvious at a
// glance (see call sites) — not slapped on everything, since a screen
// full of "(i)" icons would defeat the point.
export default function InfoTooltip({ children, side = 'bottom', align = 'center' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  const verticalClass = side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';
  const horizontalClass =
    align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          // Explainer icons often sit inside clickable rows/cards (a
          // recipe card, a tab button) — stop the tap from also
          // triggering whatever that parent does.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More info"
        aria-expanded={open}
        className={`ml-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:text-amber-400 ${
          open ? 'text-amber-400' : ''
        }`}
      >
        <Info size={13} />
      </button>
      {open && (
        <span
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-30 w-56 ${horizontalClass} ${verticalClass} rounded border border-slate-700 bg-slate-900 p-2.5 font-mono text-[11px] font-normal normal-case leading-snug tracking-normal text-slate-300 shadow-lg shadow-black/40`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
