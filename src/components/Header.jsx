import { useState } from 'react';
import { Boxes, Crosshair, LogOut, Menu, Sun, X } from 'lucide-react';
import SyncStatusBadge from './SyncStatusBadge.jsx';
import { useRangeMode } from '../context/RangeModeContext.jsx';
import { useSync } from '../context/SyncContext.jsx';

// Section 3: "Hero Header / Navigation Bar — Amber/gold logo, Sync Status
// Badge, Range Mode Toggle, and Mobile Navigation." Also carries the
// Vault/Inventory view switcher — the app has no router, so this is a
// simple local view-state toggle rather than real page navigation.
export default function Header({ user, onSignOut, view = 'vault', onChangeView }) {
  const { rangeMode, toggleRangeMode } = useRangeMode();
  const { status: syncStatus } = useSync();
  const [mobileOpen, setMobileOpen] = useState(false);
  const otherView = view === 'vault' ? 'inventory' : 'vault';
  const otherViewLabel = view === 'vault' ? 'INVENTORY' : 'VAULT';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Crosshair className="text-amber-500" size={22} strokeWidth={2.5} />
          <span className="font-mono text-sm font-bold tracking-wider text-amber-400 sm:text-base">
            PRECISION LOAD VAULT
          </span>
        </div>

        {/* Desktop controls */}
        <div className="hidden items-center gap-3 sm:flex">
          <SyncStatusBadge status={syncStatus} />
          {onChangeView && (
            <button
              onClick={() => onChangeView(otherView)}
              className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
            >
              <Boxes size={14} />
              {otherViewLabel}
            </button>
          )}
          <button
            onClick={toggleRangeMode}
            aria-pressed={rangeMode}
            className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
              rangeMode
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : 'border-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-400'
            }`}
          >
            <Sun size={14} />
            RANGE MODE
          </button>
          {user && (
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-red-500 hover:text-red-400"
            >
              <LogOut size={14} />
              SIGN OUT
            </button>
          )}
        </div>

        {/* Mobile nav toggle */}
        <button
          className="text-slate-300 sm:hidden"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="flex flex-col gap-3 border-t border-slate-800 px-4 py-3 sm:hidden">
          <SyncStatusBadge status={syncStatus} />
          {onChangeView && (
            <button
              onClick={() => {
                onChangeView(otherView);
                setMobileOpen(false);
              }}
              className="flex items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-2 font-mono text-xs text-slate-300"
            >
              <Boxes size={14} />
              {otherViewLabel}
            </button>
          )}
          <button
            onClick={toggleRangeMode}
            aria-pressed={rangeMode}
            className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 font-mono text-xs ${
              rangeMode
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : 'border-slate-700 text-slate-300'
            }`}
          >
            <Sun size={14} />
            RANGE MODE
          </button>
          {user && (
            <button
              onClick={onSignOut}
              className="flex items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-2 font-mono text-xs text-slate-300"
            >
              <LogOut size={14} />
              SIGN OUT
            </button>
          )}
        </div>
      )}
    </header>
  );
}
