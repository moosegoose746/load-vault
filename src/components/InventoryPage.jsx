import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import {
  GRAINS_PER_LB,
  addInventoryEntry,
  deleteInventoryEntry,
  fetchAllComponents,
  fetchUserInventoryRows,
  isBrassNearingRetirement,
  isLowStock,
  updateInventoryEntry,
} from '../lib/inventory.js';

// Powder is bought by the pound but metered out by the grain (matching a
// recipe's charge_weight_grains), so its section tracks Container Weight
// in lbs and shows a computed Cost/Grain — everything else (bullets,
// primers, brass) is bought and used in whole units, so it tracks a plain
// count instead. Internally `package_qty`/`quantity_on_hand` are always
// stored in the same base unit the recipe math uses (grains for powder,
// count for everything else); only the powder section's inputs convert
// to/from lbs for display, right here.
const SECTIONS = [
  { type: 'powder', label: 'Powder', isPowder: true, hasCaliber: false, hasPrimerSize: false },
  { type: 'bullet', label: 'Bullet', isPowder: false, hasCaliber: true, hasPrimerSize: false },
  { type: 'primer', label: 'Primer', isPowder: false, hasCaliber: false, hasPrimerSize: true },
  { type: 'brass', label: 'Brass', isPowder: false, hasCaliber: true, hasPrimerSize: false },
];

// Standard SAAMI primer sizes — a plain dropdown covers the vast majority
// of cases; "Other" reveals a text input for anything unusual.
const PRIMER_SIZES = [
  'Small Pistol',
  'Small Pistol Magnum',
  'Large Pistol',
  'Large Pistol Magnum',
  'Small Rifle',
  'Small Rifle Magnum',
  'Large Rifle',
  'Large Rifle Magnum',
  '209 Shotshell',
];
const PRIMER_OTHER = '__other__';

const CUSTOM_VALUE = '__custom__';

const inputClass =
  'w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none';

// Powder's lbs display is derived by dividing a grains value by 7000, which
// produces long floating-point tails (e.g. 500/7000 = 0.07142857142857142)
// that don't mean anything at that precision for a real-world scale.
// Rounding to 3 decimal places (roughly a tenth of a grain) keeps the
// number readable without losing anything a reloader would actually use.
const POWDER_DECIMALS = 3;

function draftFromRow(row, isPowder) {
  const packageQty = row.package_qty != null ? (isPowder ? row.package_qty / GRAINS_PER_LB : row.package_qty) : '';
  const quantityOnHand =
    row.quantity_on_hand != null ? (isPowder ? row.quantity_on_hand / GRAINS_PER_LB : row.quantity_on_hand) : '';
  return {
    unitCost: row.unit_cost != null ? String(row.unit_cost) : '',
    packageQty: packageQty !== '' ? String(isPowder ? Number(packageQty.toFixed(POWDER_DECIMALS)) : packageQty) : '',
    quantityOnHand:
      quantityOnHand !== '' ? String(isPowder ? Number(quantityOnHand.toFixed(POWDER_DECIMALS)) : quantityOnHand) : '',
    reloadCycles: row.reload_cycles != null ? String(row.reload_cycles) : '',
    cyclesUsed: row.cycles_used != null ? String(row.cycles_used) : '0',
    caliber: row.caliber || '',
    primerSize: row.primer_size || '',
  };
}

function emptyDraft() {
  return { unitCost: '', packageQty: '', quantityOnHand: '', reloadCycles: '', cyclesUsed: '', caliber: '', primerSize: '' };
}

function emptyNewRow() {
  return { componentId: '', customName: '', ...emptyDraft() };
}

/** Parse a draft's typed values into base-unit numbers ready to save
 * (converting lbs -> grains for powder). Returns null if the required
 * fields (cost, package qty) aren't valid. */
function parseDraft(draft, isPowder) {
  const unitCost = Number.parseFloat(draft.unitCost);
  const packageQtyRaw = Number.parseFloat(draft.packageQty);
  if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(packageQtyRaw) || packageQtyRaw <= 0) {
    return null;
  }
  const packageQty = isPowder ? Math.round(packageQtyRaw * GRAINS_PER_LB) : Math.round(packageQtyRaw);
  const quantityOnHandRaw = draft.quantityOnHand !== '' ? Number.parseFloat(draft.quantityOnHand) : null;
  const quantityOnHand =
    quantityOnHandRaw != null ? Math.round((isPowder ? quantityOnHandRaw * GRAINS_PER_LB : quantityOnHandRaw) * 100) / 100 : null;
  return {
    unitCost,
    packageQty,
    quantityOnHand,
    reloadCycles: draft.reloadCycles !== '' ? Number.parseInt(draft.reloadCycles, 10) : null,
    cyclesUsed: draft.cyclesUsed !== '' && draft.cyclesUsed != null ? Number.parseInt(draft.cyclesUsed, 10) : 0,
    caliber: draft.caliber?.trim() || null,
    primerSize: draft.primerSize && draft.primerSize !== PRIMER_OTHER ? draft.primerSize.trim() || null : null,
  };
}

function formatCostPerUnit(unitCost, packageQty, isPowder) {
  if (!unitCost || !packageQty) return '—';
  const perUnit = unitCost / packageQty;
  return `$${perUnit.toFixed(isPowder ? 4 : 3)}`;
}

// Section 6 of the master doc: "Unit Economics & Inventory Analytics" —
// personal component pricing (never the shared catalog's placeholder
// prices) and stock, grouped by component type so each section's columns
// can match how that type is actually bought and used. Each section is
// its own small spreadsheet with its own "add a row" control — pick a
// catalog component, or type in your own if it isn't listed. See
// supabase/schema_inventory.sql and src/lib/inventory.js.
export default function InventoryPage({ authUser }) {
  const [components, setComponents] = useState([]);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowStatus, setRowStatus] = useState({}); // { [rowId]: 'saving' | 'saved' | 'error' }
  const [newRows, setNewRows] = useState({ powder: emptyNewRow(), bullet: emptyNewRow(), primer: emptyNewRow(), brass: emptyNewRow() });
  const [addStatus, setAddStatus] = useState({});

  useEffect(() => {
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
          const isPowder = (row.component?.type ?? row.custom_type) === 'powder';
          nextDrafts[row.id] = draftFromRow(row, isPowder);
        });
        setDrafts(nextDrafts);
      })
      .catch((err) => setError(err.message || 'Failed to load inventory.'))
      .finally(() => setLoading(false));
  }, [authUser]);

  const usedComponentIds = useMemo(
    () => new Set(rows.filter((r) => r.component_id).map((r) => r.component_id)),
    [rows]
  );

  const rowsByType = useMemo(() => {
    const byType = { powder: [], bullet: [], primer: [], brass: [] };
    rows.forEach((row) => {
      const type = row.component?.type ?? row.custom_type;
      if (byType[type]) byType[type].push(row);
    });
    return byType;
  }, [rows]);

  const availableComponentsByType = useMemo(() => {
    const byType = { powder: [], bullet: [], primer: [], brass: [] };
    components.forEach((c) => {
      if (byType[c.type] && !usedComponentIds.has(c.id)) byType[c.type].push(c);
    });
    return byType;
  }, [components, usedComponentIds]);

  const updateDraft = (rowId, field, value) => {
    setDrafts((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [field]: value } }));
  };

  const handleSaveRow = async (row) => {
    const isPowder = (row.component?.type ?? row.custom_type) === 'powder';
    const parsed = parseDraft(drafts[row.id] ?? draftFromRow(row, isPowder), isPowder);
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

  const handleAddRow = async (type) => {
    const isPowder = type === 'powder';
    const newRow = newRows[type];
    const isCustom = newRow.componentId === CUSTOM_VALUE;
    if (isCustom && !newRow.customName.trim()) {
      setAddStatus((prev) => ({ ...prev, [type]: 'error' }));
      return;
    }
    if (!isCustom && !newRow.componentId) {
      setAddStatus((prev) => ({ ...prev, [type]: 'error' }));
      return;
    }
    const parsed = parseDraft(newRow, isPowder);
    if (!parsed) {
      setAddStatus((prev) => ({ ...prev, [type]: 'error' }));
      return;
    }
    setAddStatus((prev) => ({ ...prev, [type]: 'saving' }));
    try {
      const saved = await addInventoryEntry(authUser.id, {
        componentId: isCustom ? null : newRow.componentId,
        customName: isCustom ? newRow.customName.trim() : null,
        customType: isCustom ? type : null,
        ...parsed,
      });
      setRows((prev) => [...prev, saved]);
      setDrafts((prev) => ({ ...prev, [saved.id]: draftFromRow(saved, isPowder) }));
      setNewRows((prev) => ({ ...prev, [type]: emptyNewRow() }));
      setAddStatus((prev) => ({ ...prev, [type]: 'idle' }));
    } catch (err) {
      console.error('Failed to add inventory entry', err);
      setAddStatus((prev) => ({ ...prev, [type]: 'error' }));
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
          Purchase Price is what you paid for the whole package (a jug of powder, a box of
          primers) — Cost/Grain and Cost/Unit are worked out for you. This is personal to your
          account, separate from the shared catalog, and drives the Cost / Round shown on your
          recipes.
        </p>
      </div>

      {loading && <p className="font-mono text-xs text-slate-400">Loading…</p>}
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      {!loading &&
        !error &&
        SECTIONS.map(({ type, label, isPowder, hasCaliber, hasPrimerSize }) => {
          const sectionRows = rowsByType[type];
          const newRow = newRows[type];
          const status = addStatus[type];
          const colCount = 5 + (hasCaliber ? 1 : 0) + (hasPrimerSize ? 1 : 0) + (type === 'brass' ? 2 : 0);
          return (
            <div key={type} className="mb-8">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-amber-400">{label}</h2>
              <div className="overflow-x-auto rounded border border-slate-800">
                <table className="w-full min-w-[760px] border-collapse font-mono text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-panel text-left text-[10px] uppercase tracking-widest text-slate-500">
                      <th className="px-3 py-2">Component</th>
                      {hasCaliber && <th className="px-3 py-2">Caliber</th>}
                      {hasPrimerSize && <th className="px-3 py-2">Primer Size</th>}
                      <th className="px-3 py-2">Purchase Price ($)</th>
                      <th className="px-3 py-2">{isPowder ? 'Container Weight (lbs)' : 'Qty per Package'}</th>
                      <th className="px-3 py-2">{isPowder ? 'Cost/Grain' : 'Cost/Unit'}</th>
                      <th className="px-3 py-2">Qty On Hand{isPowder ? ' (lbs)' : ''}</th>
                      {type === 'brass' && (
                        <>
                          <th className="px-3 py-2">Reload Cycles (est.)</th>
                          <th className="px-3 py-2">Cycles Used</th>
                        </>
                      )}
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.length === 0 && (
                      <tr>
                        <td colSpan={colCount} className="px-3 py-3 text-center text-xs text-slate-600">
                          No {label.toLowerCase()} tracked yet.
                        </td>
                      </tr>
                    )}
                    {sectionRows.map((row) => {
                      const displayName = row.component ? `${row.component.brand} ${row.component.model}` : row.custom_name;
                      const draft = drafts[row.id] ?? draftFromRow(row, isPowder);
                      const rstatus = rowStatus[row.id];
                      const lowStock = isLowStock(row);
                      const nearingRetirement = type === 'brass' && isBrassNearingRetirement(row);
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
                          {hasCaliber && (
                            <td className="px-3 py-2 align-top">
                              <input
                                type="text"
                                placeholder="e.g. 6.5 Creedmoor"
                                value={draft.caliber}
                                onChange={(e) => updateDraft(row.id, 'caliber', e.target.value)}
                                className={`${inputClass} w-32`}
                              />
                            </td>
                          )}
                          {hasPrimerSize && (
                            <td className="px-3 py-2 align-top">
                              <select
                                value={PRIMER_SIZES.includes(draft.primerSize) ? draft.primerSize : draft.primerSize ? PRIMER_OTHER : ''}
                                onChange={(e) => updateDraft(row.id, 'primerSize', e.target.value === PRIMER_OTHER ? PRIMER_OTHER : e.target.value)}
                                className={`${inputClass} w-36`}
                              >
                                <option value="">Select…</option>
                                {PRIMER_SIZES.map((size) => (
                                  <option key={size} value={size}>
                                    {size}
                                  </option>
                                ))}
                                <option value={PRIMER_OTHER}>Other…</option>
                              </select>
                              {draft.primerSize && !PRIMER_SIZES.includes(draft.primerSize) && (
                                <input
                                  type="text"
                                  placeholder="Custom primer size"
                                  value={draft.primerSize === PRIMER_OTHER ? '' : draft.primerSize}
                                  onChange={(e) => updateDraft(row.id, 'primerSize', e.target.value)}
                                  className={`${inputClass} mt-1 w-36`}
                                />
                              )}
                            </td>
                          )}
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
                            <input
                              type="number"
                              step={isPowder ? '0.1' : '1'}
                              min={isPowder ? '0.1' : '1'}
                              value={draft.packageQty}
                              onChange={(e) => updateDraft(row.id, 'packageQty', e.target.value)}
                              className={`${inputClass} w-24`}
                            />
                          </td>
                          <td className="px-3 py-2 align-top text-slate-400">
                            {formatCostPerUnit(
                              Number.parseFloat(draft.unitCost),
                              isPowder
                                ? Number.parseFloat(draft.packageQty) * GRAINS_PER_LB
                                : Number.parseFloat(draft.packageQty),
                              isPowder
                            )}
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
                            {lowStock && (
                              <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-[10px] text-amber-400">
                                <AlertTriangle size={10} />
                                Running low
                              </p>
                            )}
                          </td>
                          {type === 'brass' && (
                            <>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  placeholder="1"
                                  value={draft.reloadCycles}
                                  onChange={(e) => updateDraft(row.id, 'reloadCycles', e.target.value)}
                                  className={`${inputClass} w-20`}
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={draft.cyclesUsed}
                                  onChange={(e) => updateDraft(row.id, 'cyclesUsed', e.target.value)}
                                  className={`${inputClass} w-20`}
                                />
                                {nearingRetirement && (
                                  <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-[10px] text-amber-400">
                                    <AlertTriangle size={10} />
                                    Nearing max — inspect/retire
                                  </p>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSaveRow(row)}
                                disabled={rstatus === 'saving'}
                                className="flex items-center gap-1 rounded border border-amber-500 px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                                title="Save"
                              >
                                <Check size={13} />
                                {rstatus === 'saving' ? '…' : rstatus === 'saved' ? 'OK' : ''}
                              </button>
                              <button
                                onClick={() => handleDeleteRow(row.id)}
                                className="flex items-center gap-1 rounded border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            {rstatus === 'error' && (
                              <p className="mt-1 whitespace-nowrap text-[10px] text-red-400">Invalid cost/qty</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Add-row for this section */}
                    <tr className="bg-panel/60">
                      <td className="px-3 py-2 align-top">
                        {newRow.componentId === CUSTOM_VALUE ? (
                          <input
                            type="text"
                            placeholder={`Type your own ${label.toLowerCase()} name`}
                            value={newRow.customName}
                            onChange={(e) =>
                              setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], customName: e.target.value } }))
                            }
                            className={inputClass}
                          />
                        ) : (
                          <select
                            value={newRow.componentId}
                            onChange={(e) =>
                              setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], componentId: e.target.value } }))
                            }
                            className={inputClass}
                          >
                            <option value="">Select {label.toLowerCase()}…</option>
                            {availableComponentsByType[type].map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.brand} {c.model}
                              </option>
                            ))}
                            <option value={CUSTOM_VALUE}>+ Type your own…</option>
                          </select>
                        )}
                      </td>
                      {hasCaliber && (
                        <td className="px-3 py-2 align-top">
                          <input
                            type="text"
                            placeholder="e.g. 6.5 Creedmoor"
                            value={newRow.caliber}
                            onChange={(e) => setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], caliber: e.target.value } }))}
                            className={`${inputClass} w-32`}
                          />
                        </td>
                      )}
                      {hasPrimerSize && (
                        <td className="px-3 py-2 align-top">
                          <select
                            value={
                              PRIMER_SIZES.includes(newRow.primerSize) ? newRow.primerSize : newRow.primerSize ? PRIMER_OTHER : ''
                            }
                            onChange={(e) =>
                              setNewRows((prev) => ({
                                ...prev,
                                [type]: { ...prev[type], primerSize: e.target.value === PRIMER_OTHER ? PRIMER_OTHER : e.target.value },
                              }))
                            }
                            className={`${inputClass} w-36`}
                          >
                            <option value="">Select…</option>
                            {PRIMER_SIZES.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                            <option value={PRIMER_OTHER}>Other…</option>
                          </select>
                          {newRow.primerSize && !PRIMER_SIZES.includes(newRow.primerSize) && (
                            <input
                              type="text"
                              placeholder="Custom primer size"
                              value={newRow.primerSize === PRIMER_OTHER ? '' : newRow.primerSize}
                              onChange={(e) =>
                                setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], primerSize: e.target.value } }))
                              }
                              className={`${inputClass} mt-1 w-36`}
                            />
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={newRow.unitCost}
                          onChange={(e) => setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], unitCost: e.target.value } }))}
                          className={`${inputClass} w-24`}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          step={isPowder ? '0.1' : '1'}
                          min={isPowder ? '0.1' : '1'}
                          placeholder="0"
                          value={newRow.packageQty}
                          onChange={(e) => setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], packageQty: e.target.value } }))}
                          className={`${inputClass} w-24`}
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-slate-600">—</td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="optional"
                          value={newRow.quantityOnHand}
                          onChange={(e) =>
                            setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], quantityOnHand: e.target.value } }))
                          }
                          className={`${inputClass} w-24`}
                        />
                      </td>
                      {type === 'brass' && (
                        <>
                          <td className="px-3 py-2 align-top">
                            <input
                              type="number"
                              step="1"
                              min="1"
                              placeholder="1"
                              value={newRow.reloadCycles}
                              onChange={(e) =>
                                setNewRows((prev) => ({ ...prev, [type]: { ...prev[type], reloadCycles: e.target.value } }))
                              }
                              className={`${inputClass} w-20`}
                            />
                          </td>
                          <td className="px-3 py-2 align-top text-slate-600">0</td>
                        </>
                      )}
                      <td className="px-3 py-2 align-top">
                        <button
                          onClick={() => handleAddRow(type)}
                          disabled={status === 'saving'}
                          className="flex items-center gap-1 rounded border border-amber-500 px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                        >
                          <Plus size={13} />
                          {status === 'saving' ? '…' : 'ADD'}
                        </button>
                        {status === 'error' && (
                          <p className="mt-1 whitespace-nowrap text-[10px] text-red-400">Check the fields above</p>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

      <p className="mt-1 text-[11px] text-slate-600">
        Custom components (marked "custom") are private to your account and used for your own
        cost tracking — they won't appear in the New Recipe form or affect a recipe's Cost/Round
        unless the same component also exists in the shared catalog.
      </p>
    </main>
  );
}
