import { Check, CloudOff, RefreshCw } from 'lucide-react';

// Section 3: "Sync Status HUD Badge — sticky indicator in the header
// (Synced [Green/Amber], Queued Offline [Pulsing Amber], Syncing [Spinner])."
//
// This is presentational only for Phase 2. Phase 4 (Offline Dexie Sync)
// wires `status` up to navigator.onLine + the IndexedDB queue length.
const STATUS_CONFIG = {
  synced: {
    label: 'Synced',
    icon: Check,
    className: 'border-emerald-600 text-emerald-400 bg-emerald-500/10',
    pulse: false,
  },
  queued: {
    label: 'Queued Offline',
    icon: CloudOff,
    className: 'border-amber-500 text-amber-400 bg-amber-500/10',
    pulse: true,
  },
  syncing: {
    label: 'Syncing',
    icon: RefreshCw,
    className: 'border-amber-500 text-amber-400 bg-amber-500/10',
    pulse: false,
    spin: true,
  },
};

export default function SyncStatusBadge({ status = 'synced' }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.synced;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs ${config.className} ${
        config.pulse ? 'animate-pulse' : ''
      }`}
      role="status"
      aria-label={`Sync status: ${config.label}`}
    >
      <Icon size={13} className={config.spin ? 'animate-spin' : ''} />
      <span>{config.label}</span>
    </div>
  );
}
