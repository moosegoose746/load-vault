import { useEffect, useState } from 'react';
import { Check, Download, User, X } from 'lucide-react';
import { downloadExportAsCsvZip, downloadExportAsJson, fetchFullExport } from '../lib/exportData.js';

const inputClass =
  'rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none';

/** Account settings popup — closes the "no settings/profile page exists"
 * gap flagged in the five-persona review (Tier 1, item 3): `updateProfile`
 * in useAuth.js has existed since the auth hook was first built, but
 * nothing ever called it. Opened from a new gear icon in Header.jsx, next
 * to Sign Out.
 *
 * Deliberately kept small and honest about what's real: username (the
 * only genuinely user-editable field on `profiles` right now), email and
 * "member since" as read-only account facts. NOT included: any
 * Pro/plan/billing UI — `profiles.is_pro`/`stripe_customer_id` exist in
 * the schema but have zero Stripe integration behind them anywhere in the
 * app (see the five-persona review's Product Manager finding), and
 * surfacing a "Plan: Free" badge or an upgrade button for a tier that
 * can't actually be purchased yet would be misleading in exactly the way
 * the Sync Status badge just got removed for being. That's a Tier 3
 * "decide first" item, not a settings-page concern until it's resolved.
 *
 * Follows the same modal shell + click-outside-to-close pattern the
 * Workup popups established (backdrop onClick={onClose}, inner panel
 * stops propagation). */
export default function SettingsModal({ open, onClose, user, profile, updateProfile }) {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');
  const [exportStatus, setExportStatus] = useState('idle'); // idle | exporting | error
  const [exportError, setExportError] = useState('');
  const [exportFormat, setExportFormat] = useState('json'); // 'json' | 'csv'

  // Reset/prefill whenever the modal opens (or the underlying profile
  // changes while it's open, e.g. after a save) rather than on every
  // profile object reference change, so a save's own optimistic update
  // doesn't stomp on further in-progress typing.
  useEffect(() => {
    if (!open) return;
    setUsername(profile?.username || '');
    setStatus('idle');
    setError('');
    setExportStatus('idle');
    setExportError('');
    setExportFormat('json');
  }, [open, profile?.username]);

  if (!open) return null;

  const handleExport = async () => {
    if (!user?.id) return;
    setExportStatus('exporting');
    setExportError('');
    try {
      const data = await fetchFullExport(user.id);
      if (exportFormat === 'csv') {
        downloadExportAsCsvZip(data);
      } else {
        downloadExportAsJson(data);
      }
      setExportStatus('idle');
    } catch (err) {
      setExportError(err.message || 'Failed to export.');
      setExportStatus('error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username cannot be empty.');
      return;
    }
    setStatus('saving');
    setError('');
    const { error: updateError } = await updateProfile({ username: username.trim() });
    if (updateError) {
      // profiles.username has a UNIQUE constraint — the most likely real
      // error here is someone else already having that name, so surface
      // that plainly rather than a raw Postgres constraint message.
      const message = /unique|duplicate/i.test(updateError.message || '')
        ? 'That username is already taken.'
        : updateError.message || 'Failed to save.';
      setError(message);
      setStatus('error');
      return;
    }
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded border border-slate-800 bg-panel p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-mono text-sm uppercase tracking-widest text-amber-400">
            <User size={16} />
            Account Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              maxLength={40}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Email</span>
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 font-mono text-sm text-slate-400">
              {user?.email || '—'}
            </div>
            <span className="font-mono text-[10px] text-slate-600">
              Sign-in email can't be changed here — sign in with a different address to switch it.
            </span>
          </label>

          {memberSince && (
            <p className="font-mono text-[11px] text-slate-500">Member since {memberSince}</p>
          )}

          {error && <p className="font-mono text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={status === 'saving'}
            className="mt-1 flex items-center justify-center gap-1.5 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
          >
            {status === 'saved' ? <Check size={14} /> : null}
            {status === 'saving' ? 'SAVING…' : status === 'saved' ? 'SAVED' : 'SAVE CHANGES'}
          </button>
        </form>

        <div className="flex flex-col gap-1.5 border-t border-slate-800 pt-4">
          <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Your Data</span>
          <p className="font-mono text-[10px] text-slate-600">
            Download every firearm, inventory row, recipe, and range session on this account — a personal
            backup, or something to move to another tool. JSON keeps everything in one nested file; CSV
            gives you a .zip of spreadsheet-ready tables (recipes, range sessions, shots, etc.), split the
            same way the data is actually organized.
          </p>
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              onClick={() => setExportFormat('json')}
              className={`flex-1 rounded border px-3 py-1.5 font-mono text-[11px] ${
                exportFormat === 'json'
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => setExportFormat('csv')}
              className={`flex-1 rounded border px-3 py-1.5 font-mono text-[11px] ${
                exportFormat === 'csv'
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              CSV (.zip)
            </button>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportStatus === 'exporting'}
            className="mt-1 flex items-center justify-center gap-1.5 rounded border border-slate-700 px-4 py-2 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-40"
          >
            <Download size={14} />
            {exportStatus === 'exporting' ? 'PREPARING EXPORT…' : `EXPORT MY DATA (${exportFormat.toUpperCase()})`}
          </button>
          {exportError && <p className="font-mono text-xs text-red-400">{exportError}</p>}
        </div>
      </div>
    </div>
  );
}
