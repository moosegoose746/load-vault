import MoaBadge from './MoaBadge.jsx';

// Section 3: "Left Sidebar (Specs & Filter Panel) — Prominent MOA Badge,
// Dropdown Selectors (Caliber/Powder/Bullet), Quick Spec List."
//
// Dropdown options are hardcoded placeholders for now; Phase 3+ swaps
// these for live `calibers`/`components` queries against Supabase.
const CALIBERS = ['6.5 Creedmoor', '.308 Winchester', '.223 Remington / 5.56 NATO'];
const POWDERS = ['H4350', 'Varget', 'H4831SC'];
const BULLETS = ['140gr ELD-M', '175gr SMK', '168gr ELD-M'];

function FilterSelect({ label, options, value }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <select
        defaultValue={value}
        className="rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function SpecRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 py-1.5 last:border-none">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-sm text-slate-100">{value}</span>
    </div>
  );
}

export default function Sidebar({ recipe }) {
  return (
    <aside className="flex w-full flex-col gap-6 border-slate-800 p-4 sm:w-72 sm:border-r">
      <MoaBadge moa={recipe.groupSizeMoa} />

      <div className="flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-amber-400">
          Search &amp; Component Specs
        </h2>
        <FilterSelect label="Caliber" options={CALIBERS} value={recipe.caliber} />
        <FilterSelect label="Powder" options={POWDERS} value={recipe.powder} />
        <FilterSelect label="Bullet" options={BULLETS} value={recipe.bullet} />
      </div>

      <div className="flex flex-col rounded border border-slate-800 bg-panel p-3">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-amber-400">
          Specs Summary
        </h2>
        <SpecRow label="Charge Weight" value={`${recipe.chargeGrains} gr ${recipe.powder}`} />
        <SpecRow label="COAL" value={`${recipe.coalInches}"`} />
        <SpecRow label="Primer" value={recipe.primer} />
        <SpecRow label="Brass" value={recipe.brass} />
        <SpecRow label="Cost / Round" value={`$${recipe.costPerRound.toFixed(2)}`} />
      </div>
    </aside>
  );
}
