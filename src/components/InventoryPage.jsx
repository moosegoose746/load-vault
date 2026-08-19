import { useEffect, useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import {
  deleteInventoryEntry,
  fetchAllComponents,
  fetchUserInventory,
  saveInventoryEntry,
} from '../lib/inventory.js';

const TYPE_LABELS = {
  powder: 'Powder',
  bullet: 'Bullet',
  primer: 'Primer',
  brass: 'Brass',
};

// Powder's package_qty is stored in GRAINS (matching charge_weight_grains
// on a recipe), so the field label needs to say so explicitly — otherwise
// "Package Qty" reads as "how many jugs" instead of "how many grains in
// the container you bought."
const PACKAGE_QTY_UNIT = {
  powder: 'grains',
  bullet: 'count',
  primer: 'count',
  brass: 'count',
};

function emptyDraft() {
  return { unitCost: '', packageQty: '', quantityOnHand: '', reloadCycles: '' };
}

function draftFromEntry(entry) {
  if (!entry) return emptyDraft();
  return {
    unitCost: entry.unit_cost != null ? String(entry.unit_cost) : '',
    packageQty: entry.package_qty != null ? String(entry.package_qty) : '',
    quantityOnHand: entry.quantity_on_hand != null ? String(entry.quantity_on_hand) : '',
    reloadCycles: entry.reload_cycles != null ? String(entry.reload_cycles) : '',
  };
}

// Section 6 of the master doc: "Unit Economics & Inventory Analytics" —
// personal component pricing (never the shared catalog's placeholder
// prices) and stock, used to compute a real Cost-Per-Round on recipes.
// See supabase/schema_inventory.sql and src/lib/inventory.js.
export default function InventoryPage({ authUser }) {
  const [components, setComponents] = useState([]);
  const [inventory, setInventory] = useState({});
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowStatus, setRowStatus] = useState({}); // { [componentId]: 'saving' | 'saved' | 'error' }

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchAllComponents(), fetchUserInventory(authUser.id)])
      .then(([comps, inv]) => {
        setComponents(comps);
        setInventory(inv);
        const nextDrafts = {};
        comps.forEach((c) => {
          nextDrafts[c.id] = draftFromEntry(inv[c.id]);
        });
        setDrafts(nextDrafts);
      })
      .catch((err) => setError(err.message || 'Failed to load inventory.'))
      .finally(() => setLoading(false));
  }, [authUser]);

  const grouped = useMemo(() => {
    const byType = { powder: [], bullet: [], primer: [], brass: [] };
    components.forEach((c) => {
      if (byType[c.type]) byType[c.type].push(c);
    });
    return byType;
  }, [components]);

  const updateDraft = (componentId, field, value) => {
    setDrafts((prev) => ({ ...prev, [componentId]: { ...prev[componentId], [field]: value } }));
  };

  const handleSave = async (componentId) => {
    const draft = drafts[componentId];
    const unitCost = Number.parseFloat(draft.unitCost);
    const packageQty = Number.parseInt(draft.packageQty, 10);
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isInteger(packageQty) || packageQty <= 0) {
      setRowStatus((prev) => ({ ...prev, [componentId]: 'error' }));
      return;
    }
    setRowStatus((prev) => ({ ...prev, [componentId]: 'saving' }));
    try {
      const saved = await saveInventoryEntry(authUser.id, componentId, {
        unitCost,
        packageQty,
        quantityOnHand: draft.quantityOnHand !== '' ? Number.parseFloat(draft.quantityOnHand) : null,
        reloadCycles: draft.reloadCycles !== '' ? Number.parseInt(draft.reloadCycles, 10) : null,
      });
      setInventory((prev) => ({ ...prev, [componentId]: saved }));
      setRowStatus((prev) => ({ ...prev, [componentId]: 'saved' }));
      setTimeout(() => setRowStatus((prev) => ({ ...prev, [componentId]: undefined })), 2000);
    } catch (err) {
      console.error('Failed to save inventory entry', err);
      setRowStatus((prev) => ({ ...prev, [componentId]: 'error' }));
    }
  };

  const handleClear = async (componentId) => {
    try {
      await deleteInventoryEntry(authUser.id, componentId);
      setInventory((prev) => {
        const next = { ...prev };
        delete next[componentId];
        return next;
      });
      setDrafts((prev) => ({ ...prev, [componentId]: emptyDraft() }));
    } catch (err) {
      console.error('Failed to clear inventory entry', err);
    }
  };

  if (!authUser) {
    return (
      <main className="flex-1 p-4">
        <p className="mx-auto max-w-lg rounded border border-amber-600 bg-amber-500/10 px-4 py-3 text-center font-mono text-xs text-amber-300">
          You're viewing with the local dev auth bypass, not a real signed-in session — inventory
          pricing is saved per real account. Sign in for real to manage your inventory.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4">
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="font-mono text-lg font-bold text-slate-100">MY INVENTORY & PRICING</h1>
        <p className="text-xs text-slate-400">
          Enter what YOU actually paid for each component you use — this is personal to your
          account, separate from the shared catalog, and drives the Cost / Round shown on your
          recipes. Leave a component blank if you don't use it or don't want to track its price.
        </p>
      </div>

      {loading && <p className="font-mono text-xs text-slate-400">Loading…</p>}
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      {!loading &&
        !error &&
        Object.entries(TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="mb-6">
            <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-amber-400">{label}</h2>
            <div className="flex flex-col gap-2">
              {grouped[type].length === 0 && (
                <p className="font-mono text-[11px] text-slate-600">No {label.toLowerCase()} components yet.</p>
              )}
              {grouped[type].map((component) => {
                const draft = drafts[component.id] ?? emptyDraft();
                const status = rowStatus[component.id];
                const hasEntry = Boolean(inventory[component.id]);
                return (
                  <div
                    key={component.id}
                    className="flex flex-wrap items-end gap-3 rounded border border-slate-800 bg-panel p-3"
                  >
                    <div className="min-w-[160px] flex-1">
                      <p className="font-mono text-sm text-slate-100">
                        {component.brand} {component.model}
                      </p>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] uppercase text-slate-500">Your Cost ($)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draft.unitCost}
                        onChange={(e) => updateDraft(component.id, 'unitCost', e.target.value)}
                        className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] uppercase text-slate-500">
                        Package Qty ({PACKAGE_QTY_UNIT[type]})
                      </span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={draft.packageQty}
                        onChange={(e) => updateDraft(component.id, 'packageQty', e.target.value)}
                        className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] uppercase text-slate-500">Qty On Hand</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={draft.quantityOnHand}
                        onChange={(e) => updateDraft(component.id, 'quantityOnHand', e.target.value)}
                        placeholder="optional"
                        className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                      />
                    </label>

                    {type === 'brass' && (
                      <label className="flex flex-col gap-1">
                        <span className="font-mono text-[10px] uppercase text-slate-500">Reload Cycles</span>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={draft.reloadCycles}
                          onChange={(e) => updateDraft(component.id, 'reloadCycles', e.target.value)}
                          placeholder="1"
                          className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                        />
                      </label>
                    )}

                    <button
                      onClick={() => handleSave(component.id)}
                      disabled={status === 'saving'}
                      className="flex items-center gap-1.5 rounded border border-amber-500 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      <Check size={14} />
                      {status === 'saving' ? 'SAVING…' : status === 'saved' ? 'SAVED' : 'SAVE'}
                    </button>

                    {hasEntry && (
                      <button
                        onClick={() => handleClear(component.id)}
                        className="flex items-center gap-1.5 rounded border border-slate-800 px-3 py-1.5 font-mono text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                        CLEAR
                      </button>
                    )}

                    {status === 'error' && (
                      <p className="w-full font-mono text-[11px] text-red-400">
                        Enter a valid cost and package quantity to save.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </main>
  );
}
