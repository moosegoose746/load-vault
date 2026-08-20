import { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { fetchPublicRecipeDetail } from '../lib/recipes.js';
import MoaBadge from './MoaBadge.jsx';

/** The `/r/:id` public share page — see App.jsx's manual path routing
 * above this component's own mount point (there's no React Router in this
 * app; a single lightweight check on window.location.pathname decides
 * whether to render this instead of the normal auth-gated app shell). No
 * sign-in required to view this page: it exists specifically so a stranger
 * who scans the QR code on a shared TargetExportModal card, or clicks a
 * "Copy public link" URL (see RecipeForm.jsx), lands somewhere real
 * instead of the app's bare homepage — this was the actual gap flagged in
 * the "Tier 1" review (the QR code used to always point at the homepage,
 * because this page didn't exist).
 *
 * Renders read-only spec + latest-session stats via
 * fetchPublicRecipeDetail (the anonymous-safe query — no cost/inventory
 * data, since that's the viewer's own private business, not the
 * recipe-owner's to broadcast). Injects Schema.org Recipe JSON-LD into the
 * document head for the SEO angle the master blueprint called for — note
 * this is a client-side SPA injection, not true server-side rendering, so
 * it helps crawlers that execute JS (Googlebot does) but isn't as strong a
 * signal as a real SSR/static-generated page would be; a reasonable v1,
 * worth revisiting if organic search traffic ever becomes a real growth
 * lever worth investing further in. */
export default function PublicRecipePage({ recipeId }) {
  const [recipe, setRecipe] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | not-found

  useEffect(() => {
    let cancelled = false;
    fetchPublicRecipeDetail(recipeId)
      .then((detail) => {
        if (cancelled) return;
        setRecipe(detail);
        setStatus('ready');
      })
      .catch((err) => {
        // A private/archived/nonexistent recipe id all fail the RLS-backed
        // query the same way (0 rows -> .single() error) — deliberately
        // not distinguished from a genuinely missing id, see
        // fetchPublicRecipeDetail's own comment for why.
        console.error('Failed to load public recipe', err);
        if (!cancelled) setStatus('not-found');
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  useEffect(() => {
    if (!recipe) return;
    const ingredients = [
      recipe.chargeGrains != null && recipe.powder ? `${recipe.chargeGrains} Grains ${recipe.powder}` : null,
      recipe.bullet ? `${recipe.bullet} Bullet` : null,
      recipe.primer ? `${recipe.primer} Primer` : null,
      recipe.brass ? `${recipe.brass} Brass` : null,
      recipe.coalInches != null ? `${recipe.coalInches} inch COAL` : null,
    ].filter(Boolean);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: recipe.title,
      author: { '@type': 'Person', name: recipe.authorUsername },
      description: `${recipe.caliber} load recipe${
        recipe.groupSizeMoa != null ? ` — ${recipe.groupSizeMoa.toFixed(2)} MOA` : ''
      }, tracked with Precision Load Vault.`,
      recipeCategory: 'Ammunition Reloading Data',
      recipeIngredient: ingredients,
      datePublished: recipe.createdAt,
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    document.title = `${recipe.title} — Precision Load Vault`;
    return () => {
      document.head.removeChild(script);
    };
  }, [recipe]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas font-mono text-amber-400">
        Loading recipe…
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6 text-center text-slate-100">
        <Crosshair className="text-slate-600" size={32} />
        <h1 className="font-mono text-lg text-slate-300">Recipe not found</h1>
        <p className="max-w-sm font-mono text-xs text-slate-500">
          This link doesn't point at a recipe that's public or unlisted — it may have been made
          private, deleted, or the link is mistyped.
        </p>
        <a
          href="/"
          className="mt-2 rounded border border-amber-500 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
        >
          GO TO PRECISION LOAD VAULT
        </a>
      </div>
    );
  }

  const Row = ({ label, value }) =>
    value ? (
      <div className="flex items-center justify-between border-b border-slate-800 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
        <span className="font-mono text-sm text-slate-100">{value}</span>
      </div>
    ) : null;

  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-10 text-slate-100">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-amber-400">
            Precision Load Vault
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-slate-600">
            {recipe.visibility === 'public' ? 'Public Recipe' : 'Shared Recipe'}
          </span>
        </div>

        <div className="rounded border border-slate-800 bg-panel p-5">
          <h1 className="font-mono text-lg font-bold text-slate-100">{recipe.title}</h1>
          <p className="mb-4 font-mono text-xs text-slate-500">
            {recipe.caliber} · shared by {recipe.authorUsername}
          </p>

          {recipe.targetImageUrl && (
            <img
              src={recipe.targetImageUrl}
              alt="Target"
              className="mb-4 w-full rounded border border-slate-800"
            />
          )}

          <div className="mb-4 flex items-center gap-4">
            <MoaBadge moa={recipe.groupSizeMoa} />
            <div className="grid flex-1 grid-cols-2 gap-2 font-mono text-xs">
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
                <div className="text-slate-100">{recipe.avgVelocity ?? '—'}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg FPS</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
                <div className="text-slate-100">{recipe.stdDevFps ?? '—'}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">FPS SD</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
                <div className="text-slate-100">{recipe.extremeSpread ?? '—'}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">FPS ES</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center">
                <div className="text-slate-100">{recipe.distanceYards ?? '—'}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Yards</div>
              </div>
            </div>
          </div>

          <Row label="Powder" value={recipe.powder} />
          <Row label="Charge Weight" value={recipe.chargeGrains != null ? `${recipe.chargeGrains} gr` : null} />
          <Row label="Bullet" value={recipe.bullet} />
          <Row label="COAL" value={recipe.coalInches != null ? `${recipe.coalInches}"` : null} />
          <Row label="Primer" value={recipe.primer} />
          <Row label="Brass" value={recipe.brass} />

          {recipe.notes && (
            <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-slate-500">Notes</p>
              <p className="font-mono text-xs leading-relaxed text-slate-300">{recipe.notes}</p>
            </div>
          )}

          <p className="mt-4 rounded border border-amber-600 bg-amber-500/10 px-3 py-2 font-mono text-[10px] leading-relaxed text-amber-200">
            Reloading data shared by another user, not verified by Precision Load Vault. Always
            start with a reduced load and work up carefully, watching for pressure signs — never
            treat someone else's recipe as safe in your firearm without doing your own load
            development.
          </p>
        </div>

        <div className="mt-4 text-center">
          <a href="/" className="font-mono text-xs text-amber-500 hover:text-amber-400">
            Build your own vault at Precision Load Vault →
          </a>
        </div>
      </div>
    </div>
  );
}
