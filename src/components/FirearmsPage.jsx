import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, Plus, Target, Trash2, X } from 'lucide-react';
import InfoTooltip from './InfoTooltip.jsx';
import {
  barrelLifePercentUsed,
  createFirearm,
  deleteFirearm,
  fetchFirearmStats,
  fetchRoundsFiredByFirearm,
  fetchUserFirearms,
  isNearingBarrelLife,
  totalRoundsForFirearm,
  updateFirearm,
} from '../lib/firearms.js';
import { fetchCalibers } from '../lib/recipes.js';

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

function emptyForm() {
  return {
    name: '',
    caliberId: '',
    make: '',
    model: '',
    optic: '',
    barrelLengthInches: '',
    twistRate: '',
    startingRoundCount: '',
    estimatedBarrelLife: '',
    notes: '',
  };
}

function formFromFirearm(firearm) {
  return {
    name: firearm.name || '',
    caliberId: firearm.caliber_id || '',
    make: firearm.make || '',
    model: firearm.model || '',
    optic: firearm.optic || '',
    barrelLengthInches: firearm.barrel_length_inches != null ? String(firearm.barrel_length_inches) : '',
    twistRate: firearm.twist_rate || '',
    startingRoundCount: firearm.starting_round_count != null ? String(firearm.starting_round_count) : '0',
    estimatedBarrelLife: firearm.estimated_barrel_life != null ? String(firearm.estimated_barrel_life) : '',
    notes: firearm.notes || '',
  };
}

// Add/edit modal — same visual pattern as RecipeForm.jsx. `firearm` is
// null when creating a new profile, or an existing row when editing.
function FirearmFormModal({ open, firearm, calibers, authUser, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm());
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(firearm ? formFromFirearm(firearm) : emptyForm());
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setError('');
  }, [open, firearm]);

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const currentPhotoUrl = !removePhoto && !photoPreview ? firearm?.photo_url : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!authUser) {
      setError('You need to be signed in with a real account to save firearm profiles.');
      return;
    }
    if (!form.name.trim() || !form.caliberId) {
      setError('Name and caliber are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const fields = {
        name: form.name.trim(),
        caliberId: form.caliberId,
        make: form.make.trim(),
        model: form.model.trim(),
        optic: form.optic.trim(),
        barrelLengthInches: form.barrelLengthInches ? Number.parseFloat(form.barrelLengthInches) : null,
        twistRate: form.twistRate.trim(),
        startingRoundCount: form.startingRoundCount ? Number.parseInt(form.startingRoundCount, 10) : 0,
        estimatedBarrelLife: form.estimatedBarrelLife ? Number.parseInt(form.estimatedBarrelLife, 10) : null,
        notes: form.notes.trim(),
      };
      const saved = firearm
        ? await updateFirearm(firearm.id, { ...fields, existingPhotoUrl: firearm.photo_url }, authUser.id, photoFile, removePhoto)
        : await createFirearm(authUser.id, fields, photoFile);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save firearm profile.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-slate-800 bg-panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-widest text-amber-400">
            {firearm ? 'Edit Firearm' : 'New Firearm'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {!authUser && (
          <p className="rounded border border-amber-600 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-300">
            You're viewing with the local dev auth bypass, not a real signed-in session — firearm
            profiles need a real Supabase account. Sign in for real to use this form.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-900">
              {photoPreview || currentPhotoUrl ? (
                <img src={photoPreview || currentPhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera size={22} className="text-slate-600" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="cursor-pointer rounded border border-slate-700 px-3 py-1.5 text-center font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400">
                {currentPhotoUrl || photoPreview ? 'CHANGE PHOTO' : 'ADD PHOTO'}
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </label>
              {(currentPhotoUrl || photoPreview) && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreview(null);
                    setRemovePhoto(true);
                  }}
                  className="font-mono text-[11px] text-slate-500 hover:text-red-400"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <Field label="Name">
            <input required value={form.name} onChange={update('name')} className={inputClass} placeholder="Bench Rifle" />
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
            <Field label="Make">
              <input value={form.make} onChange={update('make')} className={inputClass} placeholder="Remington" />
            </Field>
            <Field label="Model">
              <input value={form.model} onChange={update('model')} className={inputClass} placeholder="700" />
            </Field>
          </div>

          <Field label="Optic">
            <input value={form.optic} onChange={update('optic')} className={inputClass} placeholder="Vortex Viper PST 5-25x50" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Barrel Length (in)">
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.barrelLengthInches}
                onChange={update('barrelLengthInches')}
                className={inputClass}
              />
            </Field>
            <Field label="Twist Rate">
              <input value={form.twistRate} onChange={update('twistRate')} className={inputClass} placeholder="1:8" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting Round Count">
              <input
                type="number"
                step="1"
                min="0"
                value={form.startingRoundCount}
                onChange={update('startingRoundCount')}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field label="Est. Barrel Life (rounds)">
              <input
                type="number"
                step="1"
                min="1"
                value={form.estimatedBarrelLife}
                onChange={update('estimatedBarrelLife')}
                className={inputClass}
                placeholder="optional"
              />
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
            {submitting ? 'SAVING…' : firearm ? 'SAVE CHANGES' : 'SAVE FIREARM'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Read-only detail view, opened by clicking a card — bigger photo plus
// the "fun stats" from fetchFirearmStats (best group, sessions logged,
// which recipes have been fired through it). Fetched lazily on open
// rather than up front for every card on the page, since it's a couple
// of extra queries per firearm that most visits to this page won't need.
function FirearmDetailModal({ open, firearm, roundsFiredByFirearm, onClose, onEdit, onSelectRecipe }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !firearm) return;
    setStats(null);
    setLoading(true);
    setError('');
    fetchFirearmStats(firearm.id)
      .then(setStats)
      .catch((err) => setError(err.message || 'Failed to load stats.'))
      .finally(() => setLoading(false));
  }, [open, firearm]);

  if (!open || !firearm) return null;

  const totalRounds = totalRoundsForFirearm(firearm, roundsFiredByFirearm);
  const percentUsed = barrelLifePercentUsed(firearm, totalRounds);
  const nearing = isNearingBarrelLife(firearm, totalRounds);
  const detailLine = [firearm.make, firearm.model].filter(Boolean).join(' ');
  const barrelLine = [
    firearm.barrel_length_inches ? `${firearm.barrel_length_inches}" barrel` : null,
    firearm.twist_rate ? `${firearm.twist_rate} twist` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-amber-500 bg-panel p-5 shadow-[0_0_24px_rgba(245,158,11,0.25)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-mono text-lg font-bold text-amber-400">{firearm.name}</h2>
            <p className="text-xs text-slate-400">{firearm.caliber?.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex h-72 w-full items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-900">
          {firearm.photo_url ? (
            <img src={firearm.photo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <Camera size={40} className="text-slate-600" />
          )}
        </div>

        {(detailLine || firearm.optic || barrelLine) && (
          <div className="flex flex-col gap-0.5 text-xs text-slate-400">
            {detailLine && <p>{detailLine}</p>}
            {firearm.optic && <p>{firearm.optic}</p>}
            {barrelLine && <p>{barrelLine}</p>}
          </div>
        )}

        <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Rounds Fired
              <InfoTooltip align="left">
                Starting Round Count (if you set one for a used firearm) plus every round logged
                through this firearm on a saved range session. Barrel life below is your own
                estimate — this app has no way to actually measure throat erosion, it's just
                tracking rounds fired against whatever number you entered.
              </InfoTooltip>
            </span>
            <span className="font-mono text-sm text-slate-100">{totalRounds}</span>
          </div>
          {percentUsed != null && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${nearing ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                {percentUsed}% of ~{firearm.estimated_barrel_life} est. barrel life
              </p>
              {nearing && (
                <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-amber-400">
                  <AlertTriangle size={10} />
                  Nearing estimated barrel life — keep an eye on accuracy/throat erosion
                </p>
              )}
            </div>
          )}
        </div>

        {loading && <p className="font-mono text-xs text-slate-400">Loading stats…</p>}
        {error && <p className="font-mono text-xs text-red-400">{error}</p>}

        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Range Sessions</span>
              <p className="mt-1 font-mono text-lg text-slate-100">{stats.sessionCount}</p>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Best Group</span>
              <p className="mt-1 flex items-center gap-1 font-mono text-lg text-slate-100">
                <Target size={14} className="text-amber-400" />
                {stats.bestGroupMoa != null ? `${stats.bestGroupMoa.toFixed(2)} MOA` : '—'}
              </p>
            </div>
          </div>
        )}

        {stats && stats.recipesUsed.length > 0 && (
          <div>
            <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Recipes Fired Through This Firearm
            </h3>
            <div className="flex flex-col gap-1">
              {stats.recipesUsed.map((r) =>
                onSelectRecipe ? (
                  <button
                    key={r.recipeId}
                    type="button"
                    onClick={() => onSelectRecipe(r.recipeId)}
                    className="flex items-center justify-between text-left text-xs text-slate-400 hover:text-amber-400"
                  >
                    <span className="truncate underline decoration-slate-700 underline-offset-2 hover:decoration-amber-400">
                      {r.title}
                    </span>
                    <span className="font-mono text-slate-300">{r.rounds} rounds</span>
                  </button>
                ) : (
                  <div key={r.recipeId} className="flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate">{r.title}</span>
                    <span className="font-mono text-slate-300">{r.rounds} rounds</span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {firearm.notes && (
          <div>
            <h3 className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Notes</h3>
            <p className="whitespace-pre-wrap text-xs text-slate-400">{firearm.notes}</p>
          </div>
        )}

        <button
          onClick={() => onEdit(firearm)}
          className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
        >
          EDIT
        </button>
      </div>
    </div>
  );
}

function FirearmCard({ firearm, roundsFiredByFirearm, onOpen, onEdit, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const totalRounds = totalRoundsForFirearm(firearm, roundsFiredByFirearm);
  const percentUsed = barrelLifePercentUsed(firearm, totalRounds);
  const nearing = isNearingBarrelLife(firearm, totalRounds);

  const detailLine = [firearm.make, firearm.model].filter(Boolean).join(' ');
  const barrelLine = [
    firearm.barrel_length_inches ? `${firearm.barrel_length_inches}" barrel` : null,
    firearm.twist_rate ? `${firearm.twist_rate} twist` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      onClick={() => onOpen(firearm)}
      className="flex cursor-pointer flex-col gap-3 rounded border border-amber-500 bg-panel p-4 shadow-[0_0_14px_rgba(245,158,11,0.15)] transition-shadow hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-900">
          {firearm.photo_url ? (
            <img src={firearm.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera size={20} className="text-slate-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-sm font-bold text-amber-400">{firearm.name}</h3>
          <p className="text-xs text-slate-400">{firearm.caliber?.name}</p>
          {detailLine && <p className="text-xs text-slate-500">{detailLine}</p>}
        </div>
      </div>

      {(firearm.optic || barrelLine) && (
        <div className="flex flex-col gap-0.5 text-[11px] text-slate-500">
          {firearm.optic && <p>{firearm.optic}</p>}
          {barrelLine && <p>{barrelLine}</p>}
        </div>
      )}

      <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Rounds Fired
            <InfoTooltip align="left">
              Starting Round Count (if you set one for a used firearm) plus every round logged
              through this firearm on a saved range session. Barrel life below is your own
              estimate — this app has no way to actually measure throat erosion, it's just
              tracking rounds fired against whatever number you entered.
            </InfoTooltip>
          </span>
          <span className="font-mono text-sm text-slate-100">{totalRounds}</span>
        </div>
        {percentUsed != null && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${nearing ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              {percentUsed}% of ~{firearm.estimated_barrel_life} est. barrel life
            </p>
            {nearing && (
              <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-amber-400">
                <AlertTriangle size={10} />
                Nearing estimated barrel life — keep an eye on accuracy/throat erosion
              </p>
            )}
          </div>
        )}
      </div>

      {firearm.notes && <p className="whitespace-pre-wrap text-xs text-slate-500">{firearm.notes}</p>}

      <div className="mt-auto flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(firearm);
          }}
          className="flex-1 rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400"
        >
          EDIT
        </button>
        {confirmingDelete ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(firearm.id);
              }}
              className="rounded border border-red-600 bg-red-950 px-3 py-1.5 font-mono text-xs text-red-300 hover:bg-red-900"
            >
              CONFIRM
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingDelete(false);
              }}
              className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-slate-500"
            >
              CANCEL
            </button>
          </>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmingDelete(true);
            }}
            className="rounded border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// Section: "My Firearms" — profiles for each of the user's guns, mainly
// to drive automated round-count/barrel-life tracking (see
// supabase/schema_firearms.sql and lib/firearms.js for the full design).
// Firearm is picked per Range Session on Dashboard, not here — this page
// is just for creating/viewing/editing the profiles themselves.
export default function FirearmsPage({ authUser, onSelectRecipe }) {
  const [firearms, setFirearms] = useState([]);
  const [roundsFiredByFirearm, setRoundsFiredByFirearm] = useState({});
  const [calibers, setCalibers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingFirearm, setEditingFirearm] = useState(null);
  const [viewingFirearm, setViewingFirearm] = useState(null);

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchUserFirearms(authUser.id), fetchRoundsFiredByFirearm(authUser.id), fetchCalibers()])
      .then(([f, rounds, cals]) => {
        setFirearms(f);
        setRoundsFiredByFirearm(rounds);
        setCalibers(cals);
      })
      .catch((err) => setError(err.message || 'Failed to load firearms.'))
      .finally(() => setLoading(false));
  }, [authUser]);

  const sortedFirearms = useMemo(() => firearms, [firearms]);

  const handleSaved = (saved) => {
    setFirearms((prev) => {
      const exists = prev.some((f) => f.id === saved.id);
      return exists ? prev.map((f) => (f.id === saved.id ? saved : f)) : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    setViewingFirearm((prev) => (prev && prev.id === saved.id ? saved : prev));
  };

  const handleDelete = async (firearmId) => {
    try {
      await deleteFirearm(firearmId);
      setFirearms((prev) => prev.filter((f) => f.id !== firearmId));
    } catch (err) {
      console.error('Failed to delete firearm', err);
      setError('Failed to delete that firearm.');
    }
  };

  if (!authUser) {
    return (
      <main className="flex-1 p-4">
        <p className="mx-auto max-w-lg rounded border border-amber-600 bg-amber-500/10 px-4 py-3 text-center font-mono text-xs text-amber-300">
          You're viewing with the local dev auth bypass, not a real signed-in session — firearm
          profiles are saved per real account. Sign in for real to manage your firearms.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold text-slate-100">MY FIREARMS</h1>
          <p className="text-xs text-slate-400">
            Round count and barrel life are tracked automatically from range sessions you log
            against each firearm — see the Firearm picker when saving a range session.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingFirearm(null);
            setFormOpen(true);
          }}
          className="flex items-center justify-center gap-1.5 rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
        >
          <Plus size={14} />
          ADD FIREARM
        </button>
      </div>

      {loading && <p className="font-mono text-xs text-slate-400">Loading…</p>}
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      {!loading && !error && sortedFirearms.length === 0 && (
        <p className="rounded border border-slate-800 bg-panel px-4 py-6 text-center font-mono text-xs text-slate-500">
          No firearms yet — add one to start tracking round count and barrel life.
        </p>
      )}

      {!loading && !error && sortedFirearms.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedFirearms.map((firearm) => (
            <FirearmCard
              key={firearm.id}
              firearm={firearm}
              roundsFiredByFirearm={roundsFiredByFirearm}
              onOpen={(f) => setViewingFirearm(f)}
              onEdit={(f) => {
                setEditingFirearm(f);
                setFormOpen(true);
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <FirearmDetailModal
        open={!!viewingFirearm}
        firearm={viewingFirearm}
        roundsFiredByFirearm={roundsFiredByFirearm}
        onClose={() => setViewingFirearm(null)}
        onEdit={(f) => {
          setViewingFirearm(null);
          setEditingFirearm(f);
          setFormOpen(true);
        }}
        onSelectRecipe={
          onSelectRecipe
            ? (recipeId) => {
                setViewingFirearm(null);
                onSelectRecipe(recipeId);
              }
            : undefined
        }
      />

      <FirearmFormModal
        open={formOpen}
        firearm={editingFirearm}
        calibers={calibers}
        authUser={authUser}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </main>
  );
}
