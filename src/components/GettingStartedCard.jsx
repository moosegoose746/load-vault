import { Check, Circle, X } from 'lucide-react';

// The three steps in the order they actually depend on each other (see
// the onboarding discussion in the progress log): a recipe's Cost/Round
// only means anything once Inventory has real pricing, and a recipe can
// only link to a Firearm profile that already exists — so Firearm and
// Inventory come before Recipe here, even though a user is free to ignore
// the order and jump straight to "New Recipe" if they want to.
const STEPS = [
  { key: 'firearm', label: 'Add a firearm', view: 'firearms' },
  { key: 'inventory', label: 'Price your inventory', view: 'inventory' },
  { key: 'recipe', label: 'Create your first recipe', view: 'vault' },
];

/** One-time dismissible "Getting Started" nudge for a brand-new account —
 * see the five-persona review's onboarding discussion. Deliberately the
 * floor option (a skippable checklist, not a guided tour or an enforced
 * order): a user can click straight into "New Recipe" and ignore this
 * entirely, it's just pointing at a sensible order for anyone who wants
 * one. Each step becomes a checkmark once its data actually exists
 * (`hasFirearm`/`hasInventory` from fetchOnboardingProgress, `hasRecipe`
 * from App.jsx's already-loaded userRecipes) — App.jsx auto-dismisses
 * this (sets profiles.onboarding_dismissed) the moment all three are
 * true, so it never lingers once someone's actually set up. */
export default function GettingStartedCard({ hasFirearm, hasInventory, hasRecipe, onGoTo, onDismiss }) {
  const done = { firearm: hasFirearm, inventory: hasInventory, recipe: hasRecipe };

  return (
    <div className="mb-4 rounded border border-amber-600 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-xs uppercase tracking-widest text-amber-400">Getting Started</h2>
          <p className="mt-0.5 text-xs text-slate-500">A suggested order to set things up — entirely optional.</p>
        </div>
        <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-slate-500 hover:text-slate-300">
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {STEPS.map((step) => (
          <button
            key={step.key}
            type="button"
            onClick={() => onGoTo(step.view)}
            disabled={done[step.key]}
            className={`flex items-center gap-2.5 rounded border px-3 py-2 text-left transition-colors ${
              done[step.key]
                ? 'cursor-default border-slate-800 bg-slate-900/40'
                : 'border-slate-700 bg-slate-900/60 hover:border-amber-500'
            }`}
          >
            {done[step.key] ? (
              <Check size={16} className="shrink-0 text-emerald-400" />
            ) : (
              <Circle size={16} className="shrink-0 text-slate-600" />
            )}
            <span className={`font-mono text-xs ${done[step.key] ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
              {step.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
