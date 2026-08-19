// Section 3: "Recipe metadata" — plain label/value rows for recipe-level
// details that live outside the component list (currently just the
// linked Firearm). Previously styled as a checkbox list with a
// permanently-"checked" icon next to every row, which read as
// interactive/toggleable when it never was (flagged in the UX audit).
// Restyled to match the plain label/value rows used elsewhere (see
// Sidebar's SpecRow) instead of implying a checklist.
export default function RecipeChecklist({ items }) {
  return (
    <div className="flex flex-col rounded border border-slate-800 bg-panel p-3">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="flex items-center justify-between border-b border-slate-800 py-1.5 last:border-none"
        >
          <span className="text-xs text-slate-400">{label}</span>
          <span className="font-mono text-sm text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}
