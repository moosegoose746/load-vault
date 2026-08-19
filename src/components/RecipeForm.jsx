import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  createRecipe,
  updateRecipe,
  fetchRecipeHasHistory,
  fetchCalibers,
  fetchComponentsByType,
} from '../lib/recipes.js';
import { fetchUserFirearms } from '../lib/firearms.js';
import { fetchMatchingWorkup } from '../lib/workups.js';

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none';

function emptyForm() {
  return {
    title: '',
    caliberId: '',
    powderId: '',
    chargeGrains: '',
    bulletId: '',
    primerId: '',
    brassId: '',
    coalInches: '',
    firearmId: '',
    factoryPricePerRound: '',
    notes: '',
  };
}

/** Turns a `mapRecipeRow`-shaped recipe (see lib/recipes.js) into this
 * form's field shape — the reverse of what `handleSubmit` sends back. */
function formFromRecipe(recipe) {
  return {
    title: recipe.title || '',
    caliberId: recipe.caliberId || '',
    powderId: recipe.powderId || '',
    chargeGrains: recipe.chargeGrains != null ? String(recipe.chargeGrains) : '',
    bulletId: recipe.bulletId || '',
    primerId: recipe.primerId || '',
    brassId: recipe.brassId || '',
    coalInches: recipe.coalInches != null ? String(recipe.coalInches) : '',
    firearmId: recipe.firearmId || '',
    factoryPricePerRound: recipe.factoryPricePerRound != null ? String(recipe.factoryPricePerRound) : '',
    notes: recipe.notes || '',
  };
}

const CORE_FIELDS = ['caliberId', 'powderId', 'bulletId', 'primerId', 'brassId', 'chargeGrains'];
// Load Workups match a recipe by its FIVE fixed components only — charge
// weight deliberately isn't part of that (a Workup's whole point is
// testing several charge weights under one otherwise-identical recipe),
// so this is CORE_FIELDS minus chargeGrains. See fetchMatchingWorkup in
// lib/workups.js for the exact-match rule this mirrors.
const WORKUP_MATCH_FIELDS = ['caliberId', 'powderId', 'bulletId', 'primerId', 'brassId'];

// Creates OR edits a real `load_recipes` row in Supabase, depending on
// whether `editingRecipe` is passed. Requires a genuine authenticated
// user (RLS enforces auth.uid() = user_id) — the local VITE_SKIP_AUTH dev
// bypass only skips the sign-in *screen*, it doesn't forge a real
// Supabase session, so this form is disabled when there's no real
// authUser even if the UI otherwise looks signed in.
export default function RecipeForm({ open, onClose, onCreated, onUpdated, authUser, editingRecipe }) {
  const isEditing = Boolean(editingRecipe);

  const [calibers, setCalibers] = useState([]);
  const [powders, setPowders] = useState([]);
  const [bullets, setBullets] = useState([]);
  const [primers, setPrimers] = useState([]);
  const [brass, setBrass] = useState([]);
  const [firearms, setFirearms] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState(emptyForm);

  // The recipe's ORIGINAL core-component values when the form opened, so
  // handleSubmit can tell whether the user actually changed anything
  // that past Loading/Range Session history was based on — see
  // `coreFieldsChanged` below and `updateRecipe` in lib/recipes.js for why
  // that distinction matters (cost figures are computed live from a
  // recipe's CURRENT components, so changing them retroactively changes
  // past cost history too).
  const [initialCore, setInitialCore] = useState(null);
  // Whether this recipe has any Loading Session or Range Session logged
  // at all — only fetched in edit mode, only matters if the user actually
  // changes a core field (see coreFieldsChanged below).
  const [hasHistory, setHasHistory] = useState(false);
  // The Load Workup (if any) this recipe's ORIGINAL components currently
  // match exactly — see fetchMatchingWorkup in lib/workups.js and the
  // "Part of a Load Workup" card on Dashboard.jsx's Overview tab, which
  // is what this same match powers. Only fetched in edit mode; used to
  // warn if a component edit would break that link (see
  // workupLinkWouldBreak below).
  const [linkedWorkup, setLinkedWorkup] = useState(null);
  const [showHistoryWarning, setShowHistoryWarning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    setError('');
    Promise.all([
      fetchCalibers(),
      fetchComponentsByType('powder'),
      fetchComponentsByType('bullet'),
      fetchComponentsByType('primer'),
      fetchComponentsByType('brass'),
      authUser ? fetchUserFirearms(authUser.id) : Promise.resolve([]),
    ])
      .then(([c, p, b, pr, br, f]) => {
        setCalibers(c);
        setPowders(p);
        setBullets(b);
        setPrimers(pr);
        setBrass(br);
        setFirearms(f);
      })
      .catch((err) => setError(err.message || 'Failed to load component options.'))
      .finally(() => setLoadingOptions(false));
  }, [open, authUser]);

  // Reset/prefill the form whenever the modal opens — either a blank
  // form (create) or the recipe's current values (edit). Keyed on
  // `editingRecipe?.id` rather than the whole object so a parent-side
  // refetch of the SAME recipe while the modal happens to still be open
  // doesn't blow away in-progress edits.
  useEffect(() => {
    if (!open) return;
    setError('');
    setShowHistoryWarning(false);
    prevCaliberIdRef.current = '';
    if (editingRecipe) {
      setForm(formFromRecipe(editingRecipe));
      setInitialCore({
        caliberId: editingRecipe.caliberId || '',
        powderId: editingRecipe.powderId || '',
        bulletId: editingRecipe.bulletId || '',
        primerId: editingRecipe.primerId || '',
        brassId: editingRecipe.brassId || '',
        chargeGrains: editingRecipe.chargeGrains != null ? String(editingRecipe.chargeGrains) : '',
      });
      fetchRecipeHasHistory(editingRecipe.id)
        .then(setHasHistory)
        .catch((err) => {
          console.error('Failed to check recipe history', err);
          setHasHistory(false);
        });
      const workupLookup = authUser
        ? fetchMatchingWorkup(authUser.id, {
            caliberId: editingRecipe.caliberId,
            powderId: editingRecipe.powderId,
            bulletId: editingRecipe.bulletId,
            primerId: editingRecipe.primerId,
            brassId: editingRecipe.brassId,
          })
        : Promise.resolve(null);
      workupLookup.then(setLinkedWorkup).catch((err) => {
        console.error('Failed to check for a matching Workup', err);
        setLinkedWorkup(null);
      });
    } else {
      setForm(emptyForm());
      setInitialCore(null);
      setHasHistory(false);
      setLinkedWorkup(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingRecipe?.id]);

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Only offer firearm profiles that actually match the caliber picked
  // above — same reasoning as the Range Day firearm picker (a .223
  // rifle isn't a meaningful choice for a .308 recipe). Reset the
  // selection whenever the user genuinely SWITCHES caliber (a real
  // previous value to a different one) so a mismatched firearm can't be
  // left silently selected underneath — but NOT on the very first
  // '' -> value transition that happens when prefilling an edit, or the
  // recipe's already-linked firearm would get wiped out from under it
  // before the user ever touched anything.
  const firearmsForCaliber = useMemo(
    () => firearms.filter((f) => f.caliber_id === form.caliberId),
    [firearms, form.caliberId]
  );

  const prevCaliberIdRef = useRef('');
  useEffect(() => {
    const prev = prevCaliberIdRef.current;
    prevCaliberIdRef.current = form.caliberId;
    if (prev && prev !== form.caliberId) {
      setForm((f) => (f.firearmId ? { ...f, firearmId: '' } : f));
    }
  }, [form.caliberId]);

  // Did the user actually change any of the fields past history was
  // computed against? Only meaningful in edit mode — a brand new recipe
  // has no history to protect.
  const coreFieldsChanged =
    isEditing && initialCore != null && CORE_FIELDS.some((key) => form[key] !== initialCore[key]);

  // Would this edit break the recipe's link to `linkedWorkup`? Only the
  // five WORKUP_MATCH_FIELDS matter here (not charge weight) — see the
  // constant's own comment. A recipe whose components no longer match
  // exactly stops showing up on that Workup's "part of" card the next
  // time it's checked (see Dashboard.jsx), and — if the new components
  // happen to exactly match some OTHER existing Workup — could silently
  // start showing up there instead, which is worth calling out too.
  const workupLinkWouldBreak =
    isEditing &&
    linkedWorkup != null &&
    initialCore != null &&
    WORKUP_MATCH_FIELDS.some((key) => form[key] !== initialCore[key]);

  const buildFields = () => ({
    title: form.title,
    caliberId: form.caliberId,
    powderId: form.powderId,
    chargeGrains: Number.parseFloat(form.chargeGrains),
    bulletId: form.bulletId,
    primerId: form.primerId,
    brassId: form.brassId,
    coalInches: form.coalInches ? Number.parseFloat(form.coalInches) : null,
    firearmId: form.firearmId,
    factoryPricePerRound: form.factoryPricePerRound ? Number.parseFloat(form.factoryPricePerRound) : null,
    notes: form.notes,
  });

  const performSave = async () => {
    setSubmitting(true);
    setError('');
    try {
      if (isEditing) {
        const saved = await updateRecipe(editingRecipe.id, buildFields());
        onUpdated?.(saved.id);
      } else {
        const saved = await createRecipe(buildFields(), authUser.id);
        onCreated?.(saved.id);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save recipe.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!authUser) {
      setError('You need to be signed in with a real account to save recipes.');
      return;
    }
    if (!form.title || !form.caliberId || !form.chargeGrains) {
      setError('Title, caliber, and charge weight are required.');
      return;
    }
    // Only interrupt with the warning once, and only when at least one of
    // its two reasons actually applies: cost/history retroactively
    // changing, or breaking the recipe's Load Workup link.
    if (isEditing && (hasHistory && coreFieldsChanged || workupLinkWouldBreak) && !showHistoryWarning) {
      setShowHistoryWarning(true);
      return;
    }
    performSave();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-slate-800 bg-panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-widest text-amber-400">
            {isEditing ? 'Edit Recipe' : 'New Recipe'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {!authUser && (
          <p className="rounded border border-amber-600 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-300">
            You're viewing with the local dev auth bypass, not a real signed-in session — recipe
            saving needs a real Supabase account. Sign in for real to use this form.
          </p>
        )}

        {loadingOptions ? (
          <p className="font-mono text-xs text-slate-400">Loading caliber/component options…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="Title">
              <input required value={form.title} onChange={update('title')} className={inputClass} placeholder="140gr ELD-M Comp Match" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
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
              <Field label="Charge Weight (gr)">
                <input
                  required
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.chargeGrains}
                  onChange={update('chargeGrains')}
                  className={inputClass}
                />
              </Field>
            </div>

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

            <div className="grid grid-cols-2 gap-3">
              <Field label="COAL (in)">
                <input type="number" step="0.001" min="0" value={form.coalInches} onChange={update('coalInches')} className={inputClass} />
              </Field>
              <Field label="Firearm (optional)">
                <select
                  value={form.firearmId}
                  onChange={update('firearmId')}
                  disabled={!form.caliberId}
                  className={`${inputClass} disabled:opacity-40`}
                >
                  <option value="">Not linked</option>
                  {firearmsForCaliber.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {!form.caliberId && (
                  <span className="font-mono text-[10px] text-slate-600">Pick a caliber first</span>
                )}
                {form.caliberId && firearmsForCaliber.length === 0 && (
                  <span className="font-mono text-[10px] text-slate-600">
                    No firearms saved for this caliber yet — add one on the Firearms page.
                  </span>
                )}
              </Field>
            </div>

            <Field label="Comparable Factory Price (optional, $/round)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.factoryPricePerRound}
                onChange={update('factoryPricePerRound')}
                className={inputClass}
                placeholder="e.g. 1.25"
              />
              <span className="font-mono text-[10px] text-slate-600">
                What comparable factory ammo costs per round — used to show how much this recipe
                saves you. Leave blank to skip; you can add it later from the Sidebar.
              </span>
            </Field>

            <Field label="Notes">
              <textarea value={form.notes} onChange={update('notes')} rows={2} className={inputClass} />
            </Field>

            {error && <p className="font-mono text-xs text-red-400">{error}</p>}

            {showHistoryWarning ? (
              <div className="flex flex-col gap-2 rounded border border-amber-600 bg-amber-500/10 p-3">
                {hasHistory && coreFieldsChanged && (
                  <p className="flex items-start gap-2 font-mono text-xs leading-relaxed text-amber-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                    This recipe already has Loading Sessions and/or Range Sessions logged. Cost per round
                    and Money Saved are always computed from the recipe's CURRENT components — changing
                    them here will change those figures for the recipe's ENTIRE past history too, not
                    just going forward.
                  </p>
                )}
                {workupLinkWouldBreak && (
                  <p className="flex items-start gap-2 font-mono text-xs leading-relaxed text-amber-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                    This recipe is currently recognized as part of the Load Workup{' '}
                    <span className="font-semibold">"{linkedWorkup?.title}"</span> (its components match that
                    Workup exactly). This change will break that link — it'll stop showing up on that
                    Workup's card, and could start matching a different Workup instead if the new
                    components happen to line up with one.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
                  >
                    {submitting ? 'SAVING…' : 'SAVE ANYWAY'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHistoryWarning(false)}
                    className="rounded border border-slate-700 px-4 py-2 font-mono text-xs text-slate-300 hover:border-slate-500"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="submit"
                disabled={submitting || !authUser}
                className="mt-1 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
              >
                {submitting ? 'SAVING…' : isEditing ? 'SAVE CHANGES' : 'SAVE RECIPE'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
