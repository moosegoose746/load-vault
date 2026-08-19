import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { RangeModeProvider, useRangeMode } from './context/RangeModeContext.jsx';
import { SyncProvider } from './context/SyncContext.jsx';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './components/Dashboard.jsx';
import RecipeForm from './components/RecipeForm.jsx';
import InventoryPage from './components/InventoryPage.jsx';
import FirearmsPage from './components/FirearmsPage.jsx';
import { mockRecipe } from './data/mockRecipe.js';
import {
  archiveRecipe,
  fetchLifetimeMoneySaved,
  fetchRecipeDetail,
  fetchUserRecipes,
} from './lib/recipes.js';

// An on-page form rather than window.prompt() — native browser dialogs
// get silently swallowed inside some embedded preview panels (e.g. VS
// Code's Simple Browser), which made the old sign-in button look broken.
function SignInGate({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    const { error } = await onSignIn(email);
    if (error) {
      setErrorMessage(error.message || String(error));
      setStatus('error');
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-mono text-2xl font-bold text-amber-400">PRECISION LOAD VAULT</h1>
      <p className="max-w-sm text-sm text-slate-400">
        Sign in to save load recipes and range sessions to your vault.
      </p>

      {status === 'sent' ? (
        <p className="max-w-sm font-mono text-sm text-emerald-400">
          Check your inbox for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded border border-amber-500 px-4 py-2 font-mono text-sm text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {status === 'sending' ? 'SENDING LINK…' : 'SIGN IN WITH EMAIL'}
          </button>
          {status === 'error' && (
            <p className="font-mono text-xs text-red-400">{errorMessage}</p>
          )}
        </form>
      )}
    </div>
  );
}

// Dev-only auth bypass, gated behind a local .env flag — never set this in
// Vercel's environment variables, only in your own .env file, or it would
// disable auth on the live site too. Lets you skip the magic-link round
// trip while iterating on everything past the sign-in screen.
//
// Important: this only bypasses the sign-in *screen*. `auth.user` (the
// real Supabase session) stays null unless you actually sign in for real,
// so anything that writes to Supabase (RecipeForm, real range-session
// saves) still needs a genuine session — see `authUser` passed below.
const DEV_SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';
const DEV_USER = { id: 'dev-local-user', email: 'dev@localhost' };

function AppShell() {
  const auth = useAuth();
  const { rangeMode } = useRangeMode();

  const user = DEV_SKIP_AUTH ? auth.user ?? DEV_USER : auth.user;
  const loading = DEV_SKIP_AUTH ? false : auth.loading;

  const [view, setView] = useState('vault'); // 'vault' | 'inventory' | 'firearms'
  const [userRecipes, setUserRecipes] = useState([]);
  const [activeRecipeId, setActiveRecipeId] = useState(null); // null = demo recipe
  const [activeRecipe, setActiveRecipe] = useState(mockRecipe);
  const [recipeFormOpen, setRecipeFormOpen] = useState(false);
  const [recipeError, setRecipeError] = useState('');
  // Live MOA reading from the Target Analysis section (Dashboard), lifted up
  // here so the Sidebar's MOA badge can reflect shots being plotted right
  // now, not just whatever was saved on the recipe's last range session.
  const [liveMoa, setLiveMoa] = useState(null);
  // Account-wide "Lifetime Money Saved" — see fetchLifetimeMoneySaved in
  // lib/recipes.js and the LifetimeSavedBadge in Header.jsx. Deliberately
  // separate from activeRecipe/loadActiveRecipe below: this sums across
  // EVERY recipe with a factory price set, not just whichever one is
  // currently open, so it needs its own fetch + refresh.
  const [lifetimeSaved, setLifetimeSaved] = useState(null);

  const refreshRecipeList = useCallback(async () => {
    if (!auth.user) return;
    try {
      const list = await fetchUserRecipes(auth.user.id);
      setUserRecipes(list);
    } catch (err) {
      console.error('Failed to load recipe list', err);
    }
  }, [auth.user]);

  const loadActiveRecipe = useCallback(async () => {
    if (!activeRecipeId) {
      setActiveRecipe(mockRecipe);
      return;
    }
    try {
      // auth.user?.id is passed so cost-per-round can be computed from the
      // signed-in user's own saved inventory pricing — see
      // fetchRecipeDetail / calculateCostPerRound in lib/recipes.js.
      const detail = await fetchRecipeDetail(activeRecipeId, auth.user?.id);
      setActiveRecipe(detail);
      setRecipeError('');
    } catch (err) {
      console.error('Failed to load recipe', err);
      setRecipeError('Failed to load that recipe.');
      setActiveRecipe(mockRecipe);
    }
  }, [activeRecipeId, auth.user]);

  const refreshLifetimeSaved = useCallback(async () => {
    if (!auth.user) return;
    try {
      const { total } = await fetchLifetimeMoneySaved(auth.user.id);
      setLifetimeSaved(total);
    } catch (err) {
      console.error('Failed to load lifetime money saved', err);
    }
  }, [auth.user]);

  // Fires after anything that could change either the active recipe's
  // numbers OR the account-wide lifetime-saved total: a Loading Session
  // logged, a range session saved, or a factory price set/edited (see
  // Dashboard's onSessionSaved and Sidebar's onRecipeUpdated below). Both
  // refreshes happen together since any of those events can move both
  // numbers at once.
  const handleRecipeDataChanged = useCallback(async () => {
    await Promise.all([loadActiveRecipe(), refreshLifetimeSaved()]);
  }, [loadActiveRecipe, refreshLifetimeSaved]);

  useEffect(() => {
    refreshRecipeList();
  }, [refreshRecipeList]);

  useEffect(() => {
    loadActiveRecipe();
  }, [loadActiveRecipe]);

  useEffect(() => {
    refreshLifetimeSaved();
  }, [refreshLifetimeSaved]);

  // Reset the live MOA reading whenever the active recipe changes, so
  // switching recipes doesn't leave a stale reading from the previous one
  // showing in the badge.
  useEffect(() => {
    setLiveMoa(null);
  }, [activeRecipeId]);

  const handleDeleteRecipe = useCallback(
    async (recipeId) => {
      try {
        await archiveRecipe(recipeId);
        if (activeRecipeId === recipeId) {
          setActiveRecipeId(null);
        }
        await refreshRecipeList();
      } catch (err) {
        console.error('Failed to delete recipe', err);
        setRecipeError('Failed to delete that recipe.');
      }
    },
    [activeRecipeId, refreshRecipeList]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-amber-400">
        Loading Vault…
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-screen flex-col bg-canvas text-slate-100 ${
        rangeMode ? 'range-mode' : ''
      }`}
    >
      {DEV_SKIP_AUTH && (
        <div className="bg-red-900/60 px-4 py-1 text-center font-mono text-[11px] tracking-wide text-red-200">
          DEV MODE — AUTH BYPASSED (local only, set by VITE_SKIP_AUTH in .env)
        </div>
      )}
      <Header
        user={user}
        onSignOut={auth.signOut}
        view={view}
        onChangeView={setView}
        lifetimeSaved={lifetimeSaved}
      />
      {user ? (
        view === 'inventory' ? (
          <InventoryPage authUser={auth.user} />
        ) : view === 'firearms' ? (
          <FirearmsPage authUser={auth.user} />
        ) : (
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col sm:flex-row">
            <Sidebar
              recipe={activeRecipe}
              userRecipes={userRecipes}
              activeRecipeId={activeRecipeId}
              onSelectRecipe={setActiveRecipeId}
              onNewRecipe={() => setRecipeFormOpen(true)}
              onDeleteRecipe={handleDeleteRecipe}
              onRecipeUpdated={handleRecipeDataChanged}
              liveMoa={liveMoa}
            />
            <Dashboard
              key={activeRecipeId ?? 'demo'}
              recipe={activeRecipe}
              activeRecipeId={activeRecipeId}
              authUser={auth.user}
              onSessionSaved={handleRecipeDataChanged}
              onTargetChange={setLiveMoa}
            />
          </div>
        )
      ) : (
        <SignInGate onSignIn={auth.signInWithEmail} />
      )}

      <RecipeForm
        open={recipeFormOpen}
        onClose={() => setRecipeFormOpen(false)}
        onCreated={(newId) => {
          refreshRecipeList();
          refreshLifetimeSaved();
          setActiveRecipeId(newId);
        }}
        authUser={auth.user}
      />

      {recipeError && (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded border border-red-600 bg-red-950 px-4 py-2 font-mono text-xs text-red-300">
          {recipeError}
        </p>
      )}
    </div>
  );
}

export default function App() {
  return (
    <RangeModeProvider>
      <SyncProvider>
        <AppShell />
      </SyncProvider>
    </RangeModeProvider>
  );
}
