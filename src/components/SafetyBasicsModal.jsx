import { ShieldAlert, X } from 'lucide-react';

/** Reloading Safety Basics — a small popup of general safety principles,
 * not app-specific instructions. Deliberately NOT a full reloading course
 * and deliberately NOT sourced from any one publisher's proprietary data
 * (see the shelved "premade recipes" phase in the progress log for why
 * that distinction matters) — this is the same handful of principles that
 * are genuinely universal across every major manual and safety
 * organization (SAAMI, NRA reloading guidance, and the safety-preface
 * language every publisher repeats in some form), written in plain
 * language rather than quoted from any single source.
 *
 * Two call sites, both opening this same component (see the five-persona
 * review's Tier 2 "safety basics" item and the discussion that scoped it
 * down from a standalone public page to just this):
 *   1. A quiet, always-visible text link on RecipeForm and WorkupsPage
 *      (near where a charge weight actually gets entered), for anyone who
 *      wants to revisit it.
 *   2. Auto-opened once, the first time a brand-new account (zero saved
 *      recipes) opens "New Recipe" — see the `autoShow` handling in
 *      RecipeForm.jsx. After that first recipe exists, it never
 *      auto-opens again; only the quiet link remains.
 *
 * A standalone public-facing page (for organic search / SEO reach) was
 * explicitly discussed and deferred — if that's ever wanted, this same
 * content can be wrapped in a public route later (same pattern as
 * PublicRecipePage.jsx) without rebuilding anything here. */

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-mono text-xs font-bold uppercase tracking-wide text-amber-400">{title}</h3>
      <p className="font-mono text-xs leading-relaxed text-slate-300">{children}</p>
    </div>
  );
}

export default function SafetyBasicsModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-slate-800 bg-panel p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-mono text-sm uppercase tracking-widest text-amber-400">
            <ShieldAlert size={16} />
            Reloading Safety Basics
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="rounded border border-amber-600 bg-amber-500/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-amber-200">
          Precision Load Vault is a tracking tool, not a substitute for a real reloading manual or
          hands-on instruction. If you're new to reloading, get a current manual from a major powder
          or bullet manufacturer and, ideally, learn your first few sessions alongside someone
          experienced before loading on your own.
        </p>

        <Section title="Never exceed a published maximum charge">
          Every publisher's maximum load was pressure-tested in a lab for that EXACT combination of
          case, primer, powder, and bullet. Exceeding it — even by a little — risks a dangerous
          pressure spike, not just a slightly hotter round.
        </Section>

        <Section title="Start low and work up">
          Begin at or below the published starting load, then increase in small increments,
          checking for pressure signs after every step. Never jump straight to a maximum load,
          even if a smaller charge worked fine in someone else's data.
        </Section>

        <Section title="Watch for pressure signs">
          Flattened or cratered primers, a stiff or sticky bolt lift, ejector-mark bright spots on
          the case head, and unusually shortened case life are all signs a load is running too hot.
          Stop and back off if you see any of them — don't wait for a more obvious failure.
        </Section>

        <Section title="Exact components matter">
          Swapping a bullet, primer, or brass brand — even at the same weight or type — can change
          pressure at the same charge weight. Published data is only valid for the exact
          combination it was tested with; treat any substitution as a reason to start over from a
          reduced load.
        </Section>

        <Section title="Never mix or substitute powders">
          Don't combine two different powders, regardless of type or brand, and don't substitute
          one powder for another using a "similar burn rate" as a shortcut. Use only the powders and
          charge weights listed in your source data.
        </Section>

        <Section title="Handle and store components safely">
          Keep powder and primers in their original containers, stored separately from each other
          and away from heat and open flame. Never leave powder sitting in a measure or hopper for
          extended periods.
        </Section>

        <Section title="One load, double-checked">
          Double-check your scale's charge weight against your data before every session, and
          verify you're using the load recipe you think you are — a mixed-up recipe is one of the
          easiest ways to end up with the wrong charge in a case.
        </Section>
      </div>
    </div>
  );
}
