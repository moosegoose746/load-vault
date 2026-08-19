import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import {
  addInventoryEntry,
  deleteInventoryEntry,
  fetchAllComponents,
  fetchUserInventoryRows,
  updateInventoryEntry,
} from '../lib/inventory.js';

const TYPE_LABELS = { powder: 'Powder', bullet: 'Bullet', primer: 'Primer', brass: 'Brass' };
const TYPE_OPTIONS = Object.entries(TYPE_LABELS);

// Powder's package_qty is stored in GRAINS (matching charge_weight_grains
// on a recipe), so the column header needs to say so explicitly —
// otherwise "Package Qty" reads as "how many jugs" instead of "how many
// grains in the container you bought."
const PACKAGE_QTY_UNIT = { powder: 'grains', bullet: 'count', primer: 'count', brass: 'count' };

const CUSTOM_VALUE = '__custom__';

function draftFromRow(row) {
  return {
    unitCost: row.unit_cost != null ? String(row.unit_cost) : '',
    packageQty: row.package_qty != null ? String(row.package_qty) : '',
    quantityOnHand: row.quantity_on_hand != null ? String(row.quantity_on_hand) : '',
    reloadCycles: row.reload_cycles != null ? String(row.reload_cycles) : '',
  };
}

function emptyNewRow() {
  return {
    type: 'powder',
    componentId: '',
    customName: '',
    unitCost: '',
    packageQty: '',
    quantityOnHand: '',
    reloadCycles: '',
  };
}

const inputClass =
  'w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none';

// Section 6 of the master doc: "Unit Economics & Inventory Analytics" —
// personal component pricing (never the shared catalog's placeholder
// prices) and stock, laid out as a spreadsheet-style table. Each row is
// either a shared catalog component (picked from a dropdown) or a fully
// custom, private-to-you component typed in by hand — see
// supabase/schema_inventory.sql for how the two are distinguished, and
// src/lib/inventory.js for the data layer.
export default function InventoryPage({ authUser }) {
  const [components, setComponents] = useState([]);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowStatus, setRowStatus] = useState({}); // { [rowId]: 'saving' | 'saved' | 'error' }
  const [newRow, setNewRow] = useState(emptyNewRow());
  const [addStatus, setAddStatus] = useState('idle'); // idle | saving | error

  const load = () => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchAllComponents(), fetchUserInventoryRows(authUser.id)])
      .then(([comps, invRows]) => {
        setComponents(comps);
        setRows(invRows);
        const nextDrafts = {};
        invRows.forEach((row) => {
          nextDrafts[row.id] = draftFromRow(row);
        });
        setDrafts(nextDrafts);
      })
      .catch((err) => setError(err.message || 'Failed to load inventory.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [authUser]);

  // Catalog components already in the table (for this type) shouldn't show
  // up again in the "add a row" dropdown — one row per catalog component,
  // enforced by the DB's partial unique index too.
  const usedComponentIds = useMemo(
    () => new Set(rows.filter((r) => r.component_id).map((r) => r.component_id)),
    [rows]
  );

  const availableComponents = useMemo(
    () => components.filter((c) => c.type === newRow.type && !usedComponentIds.has(c.id)),
    [components, newRow.type, usedComponentIds]
  );

  const updateDraft = (rowId, field, value) => {
    setDrafts((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [field]: value } }));
  };

  const parseDraft = (draft) => {
    const unitCost = Number.parseFloat(draft.unitCost);
    const packageQty = Number.parseInt(draft.packageQty, 10);
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isInteger(packageQty) || packageQty <= 0) {
      return null;
    }
    return {
      unitCost,
      packageQty,
      quantityOnHand: draft.quantityOnHand !== '' ? Number.parseFloat(draft.quantityOnHand) : null,
      reloadCycles: draft.reloadCycles !== '' ? Number.parseInt(draft.reloadCycles, 10) : null,
    };
  };

  const handleSaveRow = async (row) => {
    const parsed = parseDraft(drafts[row.id] ?? draftFromRow(row));
    if (!parsed) {
      setRowStatus((prev) => ({ ...prev, [row.id]: 'error' }));
      return;
    }
    setRowStatus((prev) => ({ ...prev, [row.id]: 'saving' }));
    try {
      const saved = await updateInventoryEntry(row.id, parsed);
      setRows((prev) => prev.map((r) => (r.id === row.id ? saved : r)));
      setRowStatus((prev) => ({ ...prev, [row.id]: 'saved' }));
      setTimeout(() => setRowStatus((prev) => ({ ...prev, [row.id]: undefined })), 2000);
    } catch (err) {
      console.error('Failed to save inventory entry', err);
      setRowStatus((prev) => ({ ...prev, [row.id]: 'error' }));
    }
  };

  const handleDeleteRow = async (rowId) => {
    try {
      await deleteInventoryEntry(rowId);
      setRows((prev) => prev.filter((r) => r.id !== rowId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    } catch (err) {
      console.error('Failed to delete inventory entry', err);
    }
  };

  const handleAddRow = async () => {
    const isCustom = newRow.componentId === CUSTOM_VALUE;
    if (isCustom && !newRow.customName.trim()) {
      setAddStatus('error');
      return;
    }
    if (!isCustom && !newRow.componentId) {
      setAddStatus('error');
      return;
    }
    const parsed = parseDraft(newRow);
    if (!parsed) {
      setAddStatus('error');
      return;
    }
    setAddStatus('saving');
    try {
      const saved = await addInventoryEntry(authUser.id, {
        componentId: isCustom ? null : newRow.componentId,
        customName: isCustom ? newRow.customName.trim() : null,
        customType: isCustom ? newRow.type : null,
        ...parsed,
      });
      setRows((prev) => [...prev, saved]);
      setDrafts((prev) => ({ ...prev, [saved.id]: draftFromRow(saved) }));
      setNewRow(emptyNewRow());
      setAddStatus('idle');
    } catch (err) {
      console.error('Failed to add inventory entry', err);
      setAddStatus('error');
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
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="font-mono text-lg font-bold text-slate-100">MY INVENTORY & PRICING</h1>
        <p className="text-xs text-slate-400">
          Enter what YOU actually paid for each component you use — this is personal to your
          account, separate from the shared catalog, and drives the Cost / Round shown on your
          recipes. Pick a component from the catalog below, or add your own if it isn't listed.
        </p>
      </div>

      {loading && <p className="font-mono text-xs text-slate-400">Loading…</p>}
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full min-w-[820px] border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-panel text-left text-[10px] uppercase tracking-widest text-slate-500">
                <th className="px-3 py-2">Component</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Your Cost ($)</th>
                <th className="px-3 py-2">Package Qty</th>
                <th className="px-3 py-2">Qty On Hand</th>
                <th className="px-3 py-2">Reload Cycles</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-xs text-slate-600">
                    No inventory yet — add a row below to start tracking your own pricing.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const displayType = row.component?.type ?? row.custom_type;
                const displayName = row.component
                  ? `${row.component.brand} ${row.component.model}`
                  : row.custom_name;
                const draft = drafts[row.id] ?? draftFromRow(row);
                const status = rowStatus[row.id];
                return (
                  <tr key={row.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-3 py-2 align-top">
                      <span className="text-slate-100">{displayName}</span>
                      {!row.component && (
                        <span className="ml-2 rounded border border-slate-700 px-1.5 py-0.5 text-[9px] uppercase text-slate-500">
                          custom
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-400">{TYPE_LABELS[displayType]}</td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draft.unitCost}
                        onChange={(e) => updateDraft(row.id, 'unitCost', e.target.value)}
                        className={`${inputClass} w-24`}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={draft.packageQty}
                          onChange={(e) => updateDraft(row.id, 'packageQty', e.target.value)}
                          className={`${inputClass} w-20`}
                        />
                        <span className="text-[10px] text-slate-500">{PACKAGE_QTY_UNIT[displayType]}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="optional"
                        value={draft.quantityOnHand}
                        onChange={(e) => updateDraft(row.id, 'quantityOnHand', e.target.value)}
                        className={`${inputClass} w-24`}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      {displayType === 'brass' ? (
                        <input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="1"
                          value={draft.reloadCycles}
                          onChange={(e) => updateDraft(row.id, 'reloadCycles', e.target.value)}
                          className={`${inputClass} w-20`}
                        />
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveRow(row)}
                          disabled={status === 'saving'}
                          className="flex items-center gap-1 rounded border border-amber-500 px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                          title="Save"
                        >
                          <Check size={13} />
                          {status === 'saving' ? '…' : status === 'saved' ? 'OK' : ''}
                        </button>
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="flex items-center gap-1 rounded border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {status === 'error' && (
                        <p className="mt-1 whitespace-nowrap text-[10px] text-red-400">Invalid cost/qty</p>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Add-row */}
              <tr className="bg-panel/60">
                <td className="px-3 py-2 align-top">
                  {newRow.componentId === CUSTOM_VALUE ? (
                    <input
                      type="text"
                      placeholder="Type your own component name"
                      value={newRow.customName}
                      onChange={(e) => setNewRow((prev) => ({ ...prev, customName: e.target.value }))}
                      className={inputClass}
                    />
                  ) : (
                    <select
                      value={newRow.componentId}
                      onChange={(e) => setNewRow((prev) => ({ ...prev, componentId: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="">Select component…</option>
                      {availableComponents.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.brand} {c.model}
                        </option>
                      ))}
                      <option value={CUSTOM_VALUE}>+ Type your own…</option>
                    </select>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={newRow.type}
                    onChange={(e) =>
                      setNewRow((prev) => ({ ...prev, type: e.target.value, componentId: '' }))
                    }
                    className={inputClass}
                  >
                    {TYPE_OPTIONS.map(([type, label]) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 align-top">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newRow.unitCost}
                    onChange={(e) => setNewRow((prev) => ({ ...prev, unitCost: e.target.value }))}
                    className={`${inputClass} w-24`}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="0"
                      value={newRow.packageQty}
                      onChange={(e) => setNewRow((prev) => ({ ...prev, packageQty: e.target.value }))}
                      className={`${inputClass} w-20`}
                    />
                    <span className="text-[10px] text-slate-500">{PACKAGE_QTY_UNIT[newRow.type]}</span>
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="optional"
                    value={newRow.quantityOnHand}
                    onChange={(e) => setNewRow((prev) => ({ ...prev, quantityOnHand: e.target.value }))}
                    className={`${inputClass} w-24`}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  {newRow.type === 'brass' ? (
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="1"
                      value={newRow.reloadCycles}
                      onChange={(e) => setNewRow((prev) => ({ ...prev, reloadCycles: e.target.value }))}
                      className={`${inputClass} w-20`}
                    />
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <button
                    onClick={handleAddRow}
                    disabled={addStatus === 'saving'}
                    className="flex items-center gap-1 rounded border border-amber-500 px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    <Plus size={13} />
                    {addStatus === 'saving' ? 'ADDING…' : 'ADD'}
                  </button>
                  {addStatus === 'error' && (
                    <p className="mt-1 whitespace-nowrap text-[10px] text-red-400">
                      Pick/name a component and a valid cost + qty
                    </p>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-600">
        Custom components (marked "custom") are private to your account and used for your own
        cost tracking — they won't appear in the New Recipe form or affect a recipe's Cost/Round
        unless the same component also exists in the shared catalog.
      </p>
    </main>
  );
}
