import { useEffect, useMemo, useState } from 'react';
import { Beaker, Download, Plus, Trash2, X } from 'lucide-react';
import InfoTooltip from './InfoTooltip.jsx';
import WorkupChart from './WorkupChart.jsx';
import {
  addWorkupRung,
  createWorkup,
  deleteWorkup,
  deleteWorkupRung,
  fetchImportCandidateRecipes,
  fetchRecipeRangeSessionsForImport,
  fetchUserWorkups,
  fetchWorkupDetail,
  linkRungToRecipe,
} from '../lib/workups.js';
import { fetchCalibers, fetchComponentsByType } from '../lib/recipes.js';

const inputClass =
  'rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

/** Parses a free-typed chrono string ("2740, 2751 2733\n2748") into an
 * array of fps numbers — same forgiving comma/space/newline-separated
 * format a reloader would paste straight off their chrono's display,
 * rather than requiring a specific delimiter. Non-numeric junk is
 * dropped rather than rejected outright. */
function parseShotString(text) {
  if (!text) return [];
  return text
    .split(/[\s,]+/)
    .map((s) => Number.parseFloat(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function emptyWorkupForm() {
  return { title: '', caliberId: '', powderId: '', bulletId: '', primerId: '', brassId: '', notes: '' };
}

// New Workup — same component-picker pattern as RecipeForm.jsx, minus
// charge weight (that's per-rung, not fixed on the Workup) and plus the
// explanation that everything picked here is what EVERY rung will share.
function WorkupFormModal({ open, onClose, onCreated, authUser }) {
  const [calibers, setCalibers] = useState([]);
  const [powders, setPowders] = useState([]);
  const [bullets, setBullets] = useState([]);
  const [primers, setPrimers] = useState([]);
  const [brass, setBrass] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyWorkupForm());

  useEffect(() => {
    if (!open) return;
    setForm(emptyWorkupForm());
    setError('');
    setLoadingOptions(true);
    Promise.all([
      fetchCalibers(),
      fetchComponentsByType('powder'),
      fetchComponentsByType('bullet'),
      fetchComponentsByType('primer'),
      fetchComponentsByType('brass'),
    ])
      .then(([c, p, b, pr, br]) => {
        setCalibers(c);
        setPowders(p);
        setBullets(b);
        setPrimers(pr);
        setBrass(br);
      })
      .catch((err) => setError(err.message || 'Failed to load component options.'))
      .finally(() => setLoadingOptions(false));
  }, [open]);

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!authUser) {
      setError('You need to be signed in with a real account to save a Workup.');
      return;
    }
    if (!form.title || !form.caliberId) {
      setError('Title and caliber are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const workup = await createWorkup(authUser.id, form);
      onCreated(workup.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save Workup.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-slate-800 bg-panel p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-widest text-amber-400">New Load Workup</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-400">
          A Workup fixes everything EXCEPT charge weight — the components you pick here are what
          every rung (charge weight test point) you add afterward will share. Vary only the charge
          across rungs for a real ladder test.
        </p>

        {!authUser && (
          <p className="rounded border border-amber-600 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-300">
            You're viewing with the local dev auth bypass, not a real signed-in session — Workups
            need a real Supabase account. Sign in for real to use this form.
          </p>
        )}

        {loadingOptions ? (
          <p className="font-mono text-xs text-slate-400">Loading caliber/component options…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="Title">
              <input
                required
                value={form.title}
                onChange={update('title')}
                className={inputClass}
                placeholder="6.5CM 140 ELD-M Workup"
              />
            </Field>

            <Field label="Caliber">
              <select required value={form.caliberId} onChange={update('caliberId')} className={inputClass}>
                <option value="">Select…</option>
                {calibers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Powder">
                <select value={form.powderId} onChange={update('powderId')} className={inputClass}>
                  <option value="">None</option>
                  {powders.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brand} {c.model}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bullet">
                <select value={form.bulletId} onChange={update('bulletId')} className={inputClass}>
                  <option value="">None</option>
                  {bullets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brand} {c.model}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Primer">
                <select value={form.primerId} onChange={update('primerId')} className={inputClass}>
                  <option value="">None</option>
                  {primers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brand} {c.model}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brass">
                <select value={form.brassId} onChange={update('brassId')} className={inputClass}>
                  <option value="">None</option>
                  {brass.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brand} {c.model}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Notes">
              <textarea value={form.notes} onChange={update('notes')} rows={2} className={inputClass} />
            </Field>

            {error && <p className="font-mono text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !authUser}
              className="mt-1 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
            >
              {submitting ? 'SAVING…' : 'SAVE WORKUP'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function emptyRungForm() {
  return { chargeGrains: '', shots: '', avgVelocity: '', stdDevFps: '', extremeSpread: '', groupSizeMoa: '', roundsFired: '', notes: '' };
}

// Add-a-rung form, inline at the bottom of the Workup detail view rather
// than its own modal — adding rungs is the primary repeated action on
// this page (you'll do it once per charge weight tested), so it shouldn't
// need a modal round-trip every time.
function AddRungForm({ workupId, onAdded }) {
  const [form, setForm] = useState(emptyRungForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const parsedShots = useMemo(() => parseShotString(form.shots), [form.shots]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const chargeGrains = Number.parseFloat(form.chargeGrains);
    if (!Number.isFinite(chargeGrains) || chargeGrains <= 0) {
      setError('Enter a valid charge weight.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await addWorkupRung(workupId, {
        chargeGrains,
        shots: parsedShots.length ? parsedShots : null,
        avgVelocity: form.avgVelocity ? Number.parseFloat(form.avgVelocity) : null,
        stdDevFps: form.stdDevFps ? Number.parseFloat(form.stdDevFps) : null,
        extremeSpread: form.extremeSpread ? Number.parseFloat(form.extremeSpread) : null,
        groupSizeMoa: form.groupSizeMoa ? Number.parseFloat(form.groupSizeMoa) : null,
        roundsFired: form.roundsFired ? Number.parseInt(form.roundsFired, 10) : null,
        notes: form.notes,
      });
      setForm(emptyRungForm());
      onAdded();
    } catch (err) {
      setError(err.message || 'Failed to add rung.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded border border-slate-800 bg-slate-900/60 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Charge Weight (gr)">
          <input required type="number" step="0.1" min="0" value={form.chargeGrains} onChange={update('chargeGrains')} className={inputClass} />
        </Field>
        <Field label="Group (MOA)">
          <input type="number" step="0.01" min="0" value={form.groupSizeMoa} onChange={update('groupSizeMoa')} className={inputClass} />
        </Field>
        <Field label="Rounds Fired">
          <input type="number" step="1" min="1" value={form.roundsFired} onChange={update('roundsFired')} className={inputClass} />
        </Field>
      </div>

      <Field label="Shots (fps, comma/space separated — auto-computes Avg/SD/ES below)">
        <textarea
          value={form.shots}
          onChange={update('shots')}
          rows={2}
          className={inputClass}
          placeholder="2740 2751 2733 2748 2745"
        />
        {parsedShots.length > 0 && (
          <span className="font-mono text-[10px] text-emerald-400">{parsedShots.length} shots parsed</span>
        )}
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Avg FPS (if no shots above)">
          <input
            type="number"
            step="1"
            min="0"
            value={form.avgVelocity}
            onChange={update('avgVelocity')}
            disabled={parsedShots.length > 0}
            className={`${inputClass} disabled:opacity-40`}
          />
        </Field>
        <Field label="SD">
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.stdDevFps}
            onChange={update('stdDevFps')}
            disabled={parsedShots.length > 0}
            className={`${inputClass} disabled:opacity-40`}
          />
        </Field>
        <Field label="ES">
          <input
            type="number"
            step="1"
            min="0"
            value={form.extremeSpread}
            onChange={update('extremeSpread')}
            disabled={parsedShots.length > 0}
            className={`${inputClass} disabled:opacity-40`}
          />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <input type="text" value={form.notes} onChange={update('notes')} className={inputClass} placeholder="e.g. slight bolt lift" />
      </Field>

      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
      >
        {submitting ? 'ADDING…' : '+ ADD RUNG'}
      </button>
    </form>
  );
}

/** Import a rung's data straight from a real Recipe + one of its logged
 * Range Sessions, instead of retyping shot/velocity data that's already
 * sitting in the database — the whole point being to eliminate the
 * "manual entry might not match the actual range-day data" risk the
 * user flagged. Three decisions shape this (see the discussion before
 * building): candidate recipes are STRICTLY limited to ones matching
 * this Workup's exact family (fetchImportCandidateRecipes mirrors
 * fetchMatchingWorkup in the other direction) so an unrelated load can't
 * get imported by accident; if a recipe has more than one Range Session
 * logged, the user picks which one rather than silently grabbing the
 * latest; and the pulled-in values land in an editable preview (the same
 * fields/inputs AddRungForm uses) rather than committing sight-unseen,
 * so a bad shot or a typo on the source session can still be caught
 * before it becomes a permanent rung. Confirming both adds the rung AND
 * links it back to its source recipe (linkRungToRecipe) — an imported
 * rung arrives already "graduated," which a manually-typed one doesn't
 * get unless someone links it separately later. */
function ImportRungForm({ workup, userId, onAdded }) {
  const [candidates, setCandidates] = useState(null);
  const [candidatesError, setCandidatesError] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchImportCandidateRecipes(userId, {
      caliberId: workup.caliberId,
      powderId: workup.powderId,
      bulletId: workup.bulletId,
      primerId: workup.primerId,
      brassId: workup.brassId,
    })
      .then(setCandidates)
      .catch((err) => setCandidatesError(err.message || 'Failed to load recipes to import from.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workup.caliberId, workup.powderId, workup.bulletId, workup.primerId, workup.brassId]);

  // Recipe ids already linked to a rung on THIS Workup — shown as an
  // "already imported" hint on their chip so re-importing the same
  // recipe is a deliberate choice (e.g. a corrected range session),
  // not an accidental duplicate rung.
  const importedRecipeIds = useMemo(
    () => new Set(workup.rungs.map((r) => r.recipeId).filter(Boolean)),
    [workup.rungs]
  );

  const parsedShots = useMemo(() => (preview ? parseShotString(preview.shots) : []), [preview]);

  const applySession = (recipe, session) => {
    setSelectedSessionId(session.id);
    setPreview({
      chargeGrains: String(recipe.chargeGrains),
      shots: session.shots.length ? session.shots.join(', ') : '',
      avgVelocity: session.avgVelocity != null ? String(session.avgVelocity) : '',
      stdDevFps: session.stdDevFps != null ? String(session.stdDevFps) : '',
      extremeSpread: session.extremeSpread != null ? String(session.extremeSpread) : '',
      groupSizeMoa: session.groupSizeMoa != null ? String(session.groupSizeMoa) : '',
      roundsFired: session.roundsFired != null ? String(session.roundsFired) : '',
      notes: '',
    });
  };

  const handlePickRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setSessions(null);
    setSelectedSessionId(null);
    setPreview(null);
    setError('');
    setLoadingSessions(true);
    fetchRecipeRangeSessionsForImport(recipe.id)
      .then((list) => {
        setSessions(list);
        if (list.length === 1) applySession(recipe, list[0]);
      })
      .catch((err) => setError(err.message || 'Failed to load that recipe’s Range Sessions.'))
      .finally(() => setLoadingSessions(false));
  };

  const handleBack = () => {
    setSelectedRecipe(null);
    setSessions(null);
    setSelectedSessionId(null);
    setPreview(null);
    setError('');
  };

  const updatePreview = (key) => (e) => setPreview((prev) => ({ ...prev, [key]: e.target.value }));

  const handleConfirm = async (e) => {
    e.preventDefault();
    const chargeGrains = Number.parseFloat(preview.chargeGrains);
    if (!Number.isFinite(chargeGrains) || chargeGrains <= 0) {
      setError('Enter a valid charge weight.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const rung = await addWorkupRung(workup.id, {
        chargeGrains,
        shots: parsedShots.length ? parsedShots : null,
        avgVelocity: preview.avgVelocity ? Number.parseFloat(preview.avgVelocity) : null,
        stdDevFps: preview.stdDevFps ? Number.parseFloat(preview.stdDevFps) : null,
        extremeSpread: preview.extremeSpread ? Number.parseFloat(preview.extremeSpread) : null,
        groupSizeMoa: preview.groupSizeMoa ? Number.parseFloat(preview.groupSizeMoa) : null,
        roundsFired: preview.roundsFired ? Number.parseInt(preview.roundsFired, 10) : null,
        notes: preview.notes,
      });
      await linkRungToRecipe(rung.id, selectedRecipe.id);
      handleBack();
      onAdded();
    } catch (err) {
      setError(err.message || 'Failed to import rung.');
    } finally {
      setSubmitting(false);
    }
  };

  if (candidatesError) {
    return <p className="font-mono text-xs text-red-400">{candidatesError}</p>;
  }

  if (candidates === null) {
    return <p className="font-mono text-xs text-slate-400">Loading recipes to import from…</p>;
  }

  if (candidates.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-3 py-4 text-center font-mono text-xs text-slate-500">
        No other saved recipes match this Workup's exact caliber/powder/bullet/primer/brass yet — once
        you save one at a charge weight you tested, it'll show up here to import from.
      </p>
    );
  }

  // Step 1: pick a candidate recipe.
  if (!selectedRecipe) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] text-slate-500">
          Pick a recipe that matches this Workup's family — its charge weight and logged Range Session
          data will pre-fill a new rung.
        </p>
        <div className="flex flex-wrap gap-2">
          {candidates.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => handlePickRecipe(recipe)}
              className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900/60 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
            >
              {recipe.title}
              <span className="text-slate-500">— {recipe.chargeGrains}gr</span>
              {importedRecipeIds.has(recipe.id) && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                  already imported
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: pick which Range Session (only shown when there's more than
  // one — a single session auto-advances straight to the preview).
  if (!preview) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleBack}
          className="self-start font-mono text-[11px] text-slate-500 hover:text-amber-400"
        >
          ← back to recipes
        </button>
        {loadingSessions && <p className="font-mono text-xs text-slate-400">Loading Range Sessions…</p>}
        {!loadingSessions && sessions && sessions.length === 0 && (
          <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-3 py-4 text-center font-mono text-xs text-slate-500">
            {selectedRecipe.title} has no Range Sessions logged yet — nothing to import from until one is.
          </p>
        )}
        {!loadingSessions && sessions && sessions.length > 1 && (
          <>
            <p className="font-mono text-[11px] text-slate-500">
              {selectedRecipe.title} has {sessions.length} Range Sessions logged — pick which one to import.
            </p>
            <div className="flex flex-col gap-1.5">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => applySession(selectedRecipe, session)}
                  className={`flex items-center justify-between rounded border px-3 py-1.5 text-left font-mono text-xs ${
                    selectedSessionId === session.id
                      ? 'border-amber-500 text-amber-400'
                      : 'border-slate-700 text-slate-300 hover:border-amber-500/60'
                  }`}
                >
                  <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                  <span className="text-slate-500">
                    {session.avgVelocity != null ? `${session.avgVelocity} fps avg` : 'no chrono data'}
                    {session.roundsFired != null ? ` · ${session.roundsFired} rds` : ''}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Step 3: editable preview, pre-filled from the chosen session.
  return (
    <form onSubmit={handleConfirm} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleBack}
        className="self-start font-mono text-[11px] text-slate-500 hover:text-amber-400"
      >
        ← back to recipes
      </button>
      <p className="font-mono text-[11px] text-slate-500">
        Importing from <span className="text-slate-300">{selectedRecipe.title}</span> — review before
        confirming, everything below is editable.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Charge Weight (gr)">
          <input
            required
            type="number"
            step="0.1"
            min="0"
            value={preview.chargeGrains}
            onChange={updatePreview('chargeGrains')}
            className={inputClass}
          />
        </Field>
        <Field label="Group (MOA)">
          <input type="number" step="0.01" min="0" value={preview.groupSizeMoa} onChange={updatePreview('groupSizeMoa')} className={inputClass} />
        </Field>
        <Field label="Rounds Fired">
          <input type="number" step="1" min="1" value={preview.roundsFired} onChange={updatePreview('roundsFired')} className={inputClass} />
        </Field>
      </div>

      <Field label="Shots (fps, comma/space separated — auto-computes Avg/SD/ES below)">
        <textarea value={preview.shots} onChange={updatePreview('shots')} rows={2} className={inputClass} />
        {parsedShots.length > 0 && (
          <span className="font-mono text-[10px] text-emerald-400">{parsedShots.length} shots parsed</span>
        )}
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Avg FPS (if no shots above)">
          <input
            type="number"
            step="1"
            min="0"
            value={preview.avgVelocity}
            onChange={updatePreview('avgVelocity')}
            disabled={parsedShots.length > 0}
            className={`${inputClass} disabled:opacity-40`}
          />
        </Field>
        <Field label="SD">
          <input
            type="number"
            step="0.1"
            min="0"
            value={preview.stdDevFps}
            onChange={updatePreview('stdDevFps')}
            disabled={parsedShots.length > 0}
            className={`${inputClass} disabled:opacity-40`}
          />
        </Field>
        <Field label="ES">
          <input
            type="number"
            step="1"
            min="0"
            value={preview.extremeSpread}
            onChange={updatePreview('extremeSpread')}
            disabled={parsedShots.length > 0}
            className={`${inputClass} disabled:opacity-40`}
          />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <input type="text" value={preview.notes} onChange={updatePreview('notes')} className={inputClass} placeholder="e.g. imported from range day 8/12" />
      </Field>

      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start flex items-center gap-1.5 rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
      >
        <Download size={13} />
        {submitting ? 'IMPORTING…' : 'CONFIRM IMPORT'}
      </button>
    </form>
  );
}

// A right-aligned, tabular-figure numeric cell — reserved for columns of
// numbers that need to line up vertically (per the dataviz skill), unlike
// a standalone value elsewhere in the app.
function NumCell({ children }) {
  return <td className="px-2 py-1.5 text-right font-mono text-xs text-slate-200" style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</td>;
}

function WorkupDetailModal({ open, workupId, authUser, onClose, onDeleted }) {
  const [workup, setWorkup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Manual typing vs. pulling data straight from a matching recipe's
  // Range Session — see ImportRungForm's doc comment for the full
  // reasoning. Defaults to Manual so existing muscle memory doesn't
  // change for anyone who hasn't used Import yet.
  const [addMode, setAddMode] = useState('manual'); // 'manual' | 'import'

  const reload = () => {
    if (!workupId) return;
    setLoading(true);
    fetchWorkupDetail(workupId)
      .then(setWorkup)
      .catch((err) => setError(err.message || 'Failed to load Workup.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !workupId) return;
    setWorkup(null);
    setError('');
    setConfirmingDelete(false);
    setAddMode('manual');
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workupId]);

  const handleDeleteRung = async (rungId) => {
    try {
      await deleteWorkupRung(rungId);
      reload();
    } catch (err) {
      setError(err.message || 'Failed to delete rung.');
    }
  };

  const handleDeleteWorkup = async () => {
    try {
      await deleteWorkup(workupId);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete Workup.');
    }
  };

  if (!open) return null;

  const componentLine = workup
    ? [workup.powder, workup.bullet, workup.primer, workup.brass].filter(Boolean).join(' · ')
    : '';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded border border-amber-500 bg-panel p-5 shadow-[0_0_24px_rgba(245,158,11,0.25)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-mono text-lg font-bold text-amber-400">{workup?.title ?? 'Workup'}</h2>
            {workup && <p className="text-xs text-slate-400">{workup.caliber} — {componentLine || 'no components set'}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {error && <p className="font-mono text-xs text-red-400">{error}</p>}
        {loading && <p className="font-mono text-xs text-slate-400">Loading…</p>}

        {workup && (
          <>
            {workup.notes && <p className="whitespace-pre-wrap text-xs text-slate-400">{workup.notes}</p>}

            <div>
              <h3 className="mb-1.5 flex items-center font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Charge Weight vs. Velocity
                <InfoTooltip align="left">
                  Each amber dot is one rung's average velocity; the smaller dim dots are its individual
                  shots. The dashed line is a fitted trend across rungs — a flat spot (velocity not
                  rising as much as the line predicts) is often a forgiving pressure/harmonic node.
                  Tap a rung's average dot for its full readout.
                </InfoTooltip>
              </h3>
              <WorkupChart rungs={workup.rungs} />
            </div>

            <div>
              <h3 className="mb-1.5 flex items-center font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Rungs
                <InfoTooltip align="left">
                  Each row is one charge weight you've tested — sorted lightest to heaviest, the order
                  you'd actually read a ladder test in. SD = standard deviation, how much shot-to-shot
                  velocity varies (lower = more consistent). ES = extreme spread, the fastest shot minus
                  the slowest, in fps. MOA = minutes of angle, group size adjusted for distance so groups
                  at different ranges are comparable.
                </InfoTooltip>
              </h3>
              {workup.rungs.length === 0 ? (
                <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-3 py-4 text-center font-mono text-xs text-slate-500">
                  No rungs yet — add your first charge weight below.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-slate-800">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-1.5 text-left">Charge</th>
                        <th className="px-2 py-1.5 text-right">Avg FPS</th>
                        <th className="px-2 py-1.5 text-right">SD</th>
                        <th className="px-2 py-1.5 text-right">ES</th>
                        <th className="px-2 py-1.5 text-right">Group</th>
                        <th className="px-2 py-1.5 text-right">Rounds</th>
                        <th className="px-2 py-1.5 text-left">Notes</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {workup.rungs.map((rung) => (
                        <tr key={rung.id} className="border-b border-slate-800/60 last:border-0">
                          <td className="px-2 py-1.5 font-mono text-xs font-semibold text-slate-100">
                            {rung.chargeGrains} gr
                          </td>
                          <NumCell>{rung.avgVelocity ?? '—'}</NumCell>
                          <NumCell>{rung.stdDevFps ?? '—'}</NumCell>
                          <NumCell>{rung.extremeSpread ?? '—'}</NumCell>
                          <NumCell>{rung.groupSizeMoa != null ? rung.groupSizeMoa.toFixed(2) : '—'}</NumCell>
                          <NumCell>{rung.roundsFired ?? '—'}</NumCell>
                          <td className="max-w-[10rem] truncate px-2 py-1.5 font-mono text-xs text-slate-500" title={rung.notes}>
                            {rung.notes || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => handleDeleteRung(rung.id)}
                              className="text-slate-600 hover:text-red-400"
                              title="Delete rung"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setAddMode('manual')}
                  className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
                    addMode === 'manual' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Manual Entry
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('import')}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
                    addMode === 'import' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Download size={11} />
                  Import from Recipe
                </button>
              </div>
              {addMode === 'manual' ? (
                <AddRungForm workupId={workup.id} onAdded={reload} />
              ) : (
                <ImportRungForm workup={workup} userId={authUser?.id} onAdded={reload} />
              )}
            </div>

            <div className="mt-1 flex items-center gap-2 border-t border-slate-800 pt-3">
              {confirmingDelete ? (
                <>
                  <span className="font-mono text-xs text-slate-400">Delete this Workup and all its rungs?</span>
                  <button
                    onClick={handleDeleteWorkup}
                    className="rounded border border-red-600 bg-red-950 px-3 py-1.5 font-mono text-xs text-red-300 hover:bg-red-900"
                  >
                    CONFIRM
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-slate-500"
                  >
                    CANCEL
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 rounded border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
                >
                  <Trash2 size={13} />
                  DELETE WORKUP
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WorkupCard({ workup, onOpen }) {
  const componentLine = [workup.powder, workup.bullet, workup.primer, workup.brass].filter(Boolean).join(' · ');
  return (
    <div
      onClick={() => onOpen(workup)}
      className="flex cursor-pointer flex-col gap-2 rounded border border-amber-500 bg-panel p-4 shadow-[0_0_14px_rgba(245,158,11,0.15)] transition-shadow hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
    >
      <div className="flex items-center gap-2">
        <Beaker size={16} className="shrink-0 text-amber-400" />
        <h3 className="truncate font-mono text-sm font-bold text-amber-400">{workup.title}</h3>
      </div>
      <p className="text-xs text-slate-400">{workup.caliber}</p>
      {componentLine && <p className="truncate text-[11px] text-slate-500">{componentLine}</p>}
    </div>
  );
}

// Section: "Load Workups" — ladder tests / OCW charge workups. See
// lib/workups.js for the full design rationale (a Workup fixes
// caliber/powder/bullet/primer/brass; every rung under it varies only
// charge weight). This first version is deliberately chart-free — just
// create a Workup, add rungs, see them in a table — the
// charge-weight-vs-velocity chart (with a fitted trend line and
// individual shot dots) is a follow-up slice on top of this same data.
export default function WorkupsPage({ authUser, initialOpenWorkupId, onInitialWorkupOpened }) {
  const [workups, setWorkups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [openWorkupId, setOpenWorkupId] = useState(null);

  // Deep-link support — a recipe's Overview tab can jump straight into a
  // specific Workup (see Dashboard.jsx's "Part of a Load Workup" card)
  // without the user having to find it in the list themselves. Consumed
  // once via onInitialWorkupOpened so navigating away and back to Workups
  // normally doesn't keep re-opening it.
  useEffect(() => {
    if (!initialOpenWorkupId) return;
    setOpenWorkupId(initialOpenWorkupId);
    onInitialWorkupOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenWorkupId]);

  const reloadList = () => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    fetchUserWorkups(authUser.id)
      .then(setWorkups)
      .catch((err) => setError(err.message || 'Failed to load Workups.'))
      .finally(() => setLoading(false));
  };

  useEffect(reloadList, [authUser]);

  if (!authUser) {
    return (
      <main className="flex-1 p-4">
        <p className="mx-auto max-w-lg rounded border border-amber-600 bg-amber-500/10 px-4 py-3 text-center font-mono text-xs text-amber-300">
          You're viewing with the local dev auth bypass, not a real signed-in session — Workups are
          saved per real account. Sign in for real to use them.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-mono text-lg font-bold text-slate-100">
            LOAD WORKUPS
            <InfoTooltip>
              A Workup is a charge-weight ladder test — everything except charge weight stays fixed
              across its rungs. Use it to dial in a load before committing to a permanent recipe.
            </InfoTooltip>
          </h1>
          <p className="text-xs text-slate-400">
            Test a range of charge weights with everything else held constant, then compare them side
            by side.
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center justify-center gap-1.5 rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
        >
          <Plus size={14} />
          NEW WORKUP
        </button>
      </div>

      {loading && <p className="font-mono text-xs text-slate-400">Loading…</p>}
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      {!loading && !error && workups.length === 0 && (
        <p className="rounded border border-slate-800 bg-panel px-4 py-6 text-center font-mono text-xs text-slate-500">
          No Workups yet — start one to begin dialing in a charge weight.
        </p>
      )}

      {!loading && !error && workups.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workups.map((w) => (
            <WorkupCard key={w.id} workup={w} onOpen={() => setOpenWorkupId(w.id)} />
          ))}
        </div>
      )}

      <WorkupFormModal
        open={formOpen}
        authUser={authUser}
        onClose={() => setFormOpen(false)}
        onCreated={(newId) => {
          reloadList();
          setOpenWorkupId(newId);
        }}
      />

      <WorkupDetailModal
        open={!!openWorkupId}
        workupId={openWorkupId}
        authUser={authUser}
        onClose={() => setOpenWorkupId(null)}
        onDeleted={reloadList}
      />
    </main>
  );
}
