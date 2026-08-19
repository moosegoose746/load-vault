import { CheckSquare } from 'lucide-react';

// Section 3: "Component & Rifle Metadata Checklist — Checkbox toggle list
// showing the rifle configuration."
export default function RecipeChecklist({ items }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-slate-800 bg-panel p-3">
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-2 font-mono text-sm">
          <CheckSquare size={16} className="shrink-0 text-emerald-500" />
          <span className="text-slate-400">{label}:</span>
          <span className="text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}
