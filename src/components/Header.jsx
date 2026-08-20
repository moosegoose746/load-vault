import { useState } from 'react';
import { Beaker, Boxes, Crosshair, Layers, LogOut, Menu, PiggyBank, Scale, Sun, X } from 'lucide-react';
import { useRangeMode } from '../context/RangeModeContext.jsx';

// Section 3: "Hero Header / Navigation Bar — Amber/gold logo, Sync Status
// Badge, Range Mode Toggle, and Mobile Navigation." Also carries the
// Vault/Inventory/Firearms/Workups view switcher — the app has no router, so
// this is a simple local view-state toggle rather than real page
// navigation. Renders one button per view OTHER than the current one
// (so it scales past two views without becoming a single confusing
// toggle button).
//
// NOTE: the Sync Status badge that used to sit here has been removed on
// purpose (see the five-persona project review — Full-Stack Developer
// finding) — it displayed "Synced"/"Queued"/"Syncing" for real saved
// recipes even though `SyncContext.sync()` never actually wrote anything
// to Supabase for them (only the no-longer-relevant demo-recipe path
// exercised it, via a hardcoded `setTimeout`). A status indicator that
// lies is worse than no indicator. `SyncContext`/`SyncProvider` and the
// underlying Dexie/IndexedDB queue (`src/lib/db.js`) are untouched and
// still wrapped around `AppShell` in App.jsx — that plumbing is legitimate
// groundwork for a real offline-sync feature, just not surfaced in the UI
// until a real recipe's Range Session save actually goes through it. See
// the progress log's "Known gaps" for that as a future Tier 2/3 item.
const VIEWS = [
  { key: 'vault', label: 'VAULT', icon: Crosshair },
  { key: 'inventory', label: 'INVENTORY', icon: Boxes },
  { key: 'firearms', label: 'FIREARMS', icon: Layers },
  { key: 'workups', label: 'WORKUPS', icon: Beaker },
  { key: 'compare', label: 'COMPARE', icon: Scale },
];

// Lifetime Money Saved — see fetchLifetimeMoneySaved in lib/recipes.js.
// An account-wide stat (across every recipe with a Comparable Factory
// Price set), so it lives here in the Header rather than the per-recipe
// Sidebar — visible no matter which view (Vault/Inventory/Firearms) the
// user is on. `null` (nothing to show yet — no recipe has a factory
// price/complete pricing) renders nothing at all rather than a
// misleading $0.00.
function LifetimeSavedBadge({ amount }) {
  if (amount == null) return null;
  return (
    <div
      className="flex items-center gap-1.5 rounded border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs text-emerald-300"
      title="Lifetime money saved vs. comparable factory ammo, across every recipe with a factory price set"
    >
      <PiggyBank size={14} />
      <span className="font-bold">${amount.toFixed(2)}</span>
      <span className="hidden text-emerald-400/80 md:inline">SAVED</span>
    </div>
  );
}

export default function Header({ user, onSignOut, view = 'vault', onChangeView, lifetimeSaved }) {
  const { rangeMode, toggleRangeMode } = useRangeMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const otherViews = VIEWS.filter((v) => v.key !== view);

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
          <LifetimeSavedBadge amount={lifetimeSaved} />
          {onChangeView &&
            otherViews.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onChangeView(key)}
                className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
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
          <LifetimeSavedBadge amount={lifetimeSaved} />
          {onChangeView &&
            otherViews.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  onChangeView(key);
                  setMobileOpen(false);
                }}
                className="flex items-center justify-center gap-1.5 rounded border border-slate-700 px-3 py-2 font-mono text-xs text-slate-300"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
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
