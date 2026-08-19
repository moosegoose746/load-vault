import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { createRecipe, fetchCalibers, fetchComponentsByType } from '../lib/recipes.js';

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

// Creates a real `load_recipes` row in Supabase. Requires a genuine
// authenticated user (RLS enforces auth.uid() = user_id) — the local
// VITE_SKIP_AUTH dev bypass only skips the sign-in *screen*, it doesn't
// forge a real Supabase session, so this form is disabled when there's
// no real authUser even if the UI otherwise looks signed in.
export default function RecipeForm({ open, onClose, onCreated, authUser }) {
  const [calibers, setCalibers] = useState([]);
  const [powders, setPowders] = useState([]);
  const [bullets, setBullets] = useState([]);
  const [primers, setPrimers] = useState([]);
  const [brass, setBrass] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    caliberId: '',
    powderId: '',
    chargeGrains: '',
    bulletId: '',
    primerId: '',
    brassId: '',
    coalInches: '',
    rifleModel: '',
    notes: '',
  });

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
      setError('You need to be signed in with a real account to save recipes.');
      return;
    }
    if (!form.title || !form.caliberId || !form.chargeGrains) {
      setError('Title, caliber, and charge weight are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const recipe = await createRecipe(
        {
          title: form.title,
          caliberId: form.caliberId,
          powderId: form.powderId,
          chargeGrains: Number.parseFloat(form.chargeGrains),
          bulletId: form.bulletId,
          primerId: form.primerId,
          brassId: form.brassId,
          coalInches: form.coalInches ? Number.parseFloat(form.coalInches) : null,
          rifleModel: form.rifleModel,
          notes: form.notes,
        },
        authUser.id
      );
      onCreated(recipe.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save recipe.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-slate-800 bg-panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-widest text-amber-400">New Recipe</h2>
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
              <Field label="Rifle">
                <input value={form.rifleModel} onChange={update('rifleModel')} className={inputClass} placeholder='Bergara B-14 (24" bbl)' />
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
              {submitting ? 'SAVING…' : 'SAVE RECIPE'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
