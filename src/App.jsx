import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { RangeModeProvider, useRangeMode } from './context/RangeModeContext.jsx';
import { SyncProvider } from './context/SyncContext.jsx';
import Header from './components/Header.jsx';
import RecipesHomePage from './components/RecipesHomePage.jsx';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './components/Dashboard.jsx';
import RecipeForm from './components/RecipeForm.jsx';
import InventoryPage from './components/InventoryPage.jsx';
import FirearmsPage from './components/FirearmsPage.jsx';
import WorkupsPage from './components/WorkupsPage.jsx';
import ComparePage from './components/ComparePage.jsx';
import ArchivedRecipesModal from './components/ArchivedRecipesModal.jsx';
import PublicRecipePage from './components/PublicRecipePage.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import GettingStartedCard from './components/GettingStartedCard.jsx';
import { mockRecipe } from './data/mockRecipe.js';
import {
  archiveRecipe,
  fetchArchivedRecipes,
  fetchLifetimeMoneySaved,
  fetchRecipeDetail,
  fetchUserRecipes,
  restoreRecipe,
} from './lib/recipes.js';
import { fetchOnboardingProgress } from './lib/onboarding.js';

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

  // 'home' | 'vault' | 'inventory' | 'firearms' | 'workups' | 'compare'.
  // 'home' (the recipe card grid — see RecipesHomePage.jsx) is the
  // default landing view on sign-in now, per the Recipes Home discussion
  // in the progress log; 'vault' (Sidebar + Dashboard for whichever ONE
  // recipe is active) is still what opening/creating/editing a recipe
  // switches to.
  const [view, setView] = useState('home');
  // Deep-link target for the Workups page — set when a recipe's Overview
  // tab's "Part of a Load Workup" card is clicked (see Dashboard.jsx),
  // consumed once by WorkupsPage then cleared.
  const [pendingWorkupId, setPendingWorkupId] = useState(null);
  // Deep-link target for the Compare page — set when the user picks 2+
  // cards on Recipes Home and hits "Compare Selected" (see
  // RecipesHomePage.jsx's select mode). ComparePage reads this once as its
  // initial selection (see its `initialSelectedIds` prop) and is fully
  // unmounted/remounted on every view change, so there's nothing to clear
  // here afterward the way pendingWorkupId needs to be.
  const [compareInitialIds, setCompareInitialIds] = useState([]);
  const [userRecipes, setUserRecipes] = useState([]);
  const [activeRecipeId, setActiveRecipeId] = useState(null); // null = demo recipe
  const [activeRecipe, setActiveRecipe] = useState(mockRecipe);
  const [recipeFormOpen, setRecipeFormOpen] = useState(false);
  // RecipeForm doubles as create/edit — 'edit' shows it pre-filled with
  // the currently active recipe (see Sidebar's pencil button); reset to
  // 'create' whenever it closes so it doesn't accidentally reopen in
  // edit mode later for an unrelated reason.
  const [recipeFormMode, setRecipeFormMode] = useState('create'); // 'create' | 'edit'
  const [recipeError, setRecipeError] = useState('');
  // Archived Recipes modal — see ArchivedRecipesModal.jsx. Fetched lazily
  // (only when the modal is actually opened, not on every app load) since
  // most sessions never touch this view. `archivedRecipes` stays stale
  // between opens within a session (re-fetched fresh each time the modal
  // opens, see the effect below) rather than being cached indefinitely.
  const [archivedModalOpen, setArchivedModalOpen] = useState(false);
  const [archivedRecipes, setArchivedRecipes] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  // Account Settings modal (username edit) — see SettingsModal.jsx. Closes
  // the "no settings page exists" gap from the five-persona review; opened
  // from the new gear icon in Header.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Account-wide "Lifetime Money Saved" — see fetchLifetimeMoneySaved in
  // lib/recipes.js and the LifetimeSavedBadge in Header.jsx. Deliberately
  // separate from activeRecipe/loadActiveRecipe below: this sums across
  // EVERY recipe with a factory price set, not just whichever one is
  // currently open, so it needs its own fetch + refresh.
  const [lifetimeSaved, setLifetimeSaved] = useState(null);
  // "Getting Started" checklist (see GettingStartedCard.jsx) — null while
  // unknown/not applicable (not signed in, already dismissed, or not
  // fetched yet), otherwise { hasFirearm, hasInventory }. `hasRecipe` isn't
  // stored here since userRecipes above already covers it for free.
  const [onboardingProgress, setOnboardingProgress] = useState(null);

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

  // Re-check Getting Started progress whenever the view changes, so
  // stepping over to Firearms/Inventory and back to Recipes picks up
  // anything just added — cheap (two count-only queries), and skipped
  // entirely once the card's been dismissed or auto-completed. Re-fetches
  // per `view` change rather than needing Firearms/InventoryPage to report
  // back up, since neither lifts its state to App.jsx otherwise.
  useEffect(() => {
    if (!auth.user || !auth.profile || auth.profile.onboarding_dismissed) {
      setOnboardingProgress(null);
      return;
    }
    fetchOnboardingProgress(auth.user.id)
      .then(setOnboardingProgress)
      .catch((err) => console.error('Failed to load onboarding progress', err));
  }, [auth.user, auth.profile, view]);

  // Auto-dismiss the checklist for good once all three steps are actually
  // true — a returning/established account with real data shouldn't have
  // to manually close a card that's already fully checked off, and this
  // also covers existing accounts the very first time they load the app
  // after this shipped (see schema_onboarding.sql).
  useEffect(() => {
    if (!onboardingProgress || !auth.profile || auth.profile.onboarding_dismissed) return;
    const allDone = onboardingProgress.hasFirearm && onboardingProgress.hasInventory && userRecipes.length > 0;
    if (allDone) {
      auth.updateProfile({ onboarding_dismissed: true }).catch((err) => {
        console.error('Failed to auto-dismiss onboarding checklist', err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingProgress, userRecipes.length, auth.profile]);

  // Editing from Recipes Home (see RecipesHomePage.jsx) can target a
  // recipe that ISN'T the currently active one — unlike Dashboard's own
  // Edit button, which only ever acts on whichever recipe is already
  // loaded. RecipeForm's `editingRecipe` prop needs the FULL detailed
  // recipe (raw component ids for its selects, not just the lightweight
  // title/caliber/firearm fetchUserRecipes returns for the grid), and
  // that only exists once `activeRecipe` has actually been fetched for
  // the right id. So this makes the recipe active first, then waits (via
  // the effect below) for that fetch to land before opening the form —
  // opening it immediately would show whichever recipe was previously
  // active for a beat. Also used by Dashboard's own Edit button now
  // (always a same-id no-op fast path there, since that recipe's already
  // active), so there's one code path instead of two.
  const [pendingEditRecipeId, setPendingEditRecipeId] = useState(null);
  const handleEditRecipe = useCallback((recipeId) => {
    setPendingEditRecipeId(recipeId);
    setActiveRecipeId(recipeId);
  }, []);
  useEffect(() => {
    if (pendingEditRecipeId && activeRecipe?.id === pendingEditRecipeId) {
      setRecipeFormMode('edit');
      setRecipeFormOpen(true);
      setPendingEditRecipeId(null);
    }
  }, [pendingEditRecipeId, activeRecipe]);

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

  // Re-fetch the archived list every time the modal opens, rather than
  // fetching once and caching — cheap query, and guarantees a recipe
  // deleted in a previous visit to this modal (or in another tab/device)
  // never shows stale.
  useEffect(() => {
    if (!archivedModalOpen || !auth.user) return;
    setArchivedLoading(true);
    fetchArchivedRecipes(auth.user.id)
      .then(setArchivedRecipes)
      .catch((err) => console.error('Failed to load archived recipes', err))
      .finally(() => setArchivedLoading(false));
  }, [archivedModalOpen, auth.user]);

  const handleRestoreRecipe = useCallback(
    async (recipeId) => {
      await restoreRecipe(recipeId);
      // Both lists need updating: the recipe should now appear in the
      // normal switcher, and disappear from the archived list it was
      // just restored from.
      await Promise.all([
        refreshRecipeList(),
        auth.user
          ? fetchArchivedRecipes(auth.user.id)
              .then(setArchivedRecipes)
              .catch((err) => console.error('Failed to refresh archived recipes', err))
          : Promise.resolve(),
      ]);
    },
    [refreshRecipeList, auth.user]
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
        onOpenSettings={() => setSettingsOpen(true)}
        view={view}
        onChangeView={setView}
        lifetimeSaved={lifetimeSaved}
      />
      {user ? (
        view === 'home' ? (
          <>
          {/* Now the first thing a new user sees (Home replaced the old
              default of landing straight in the demo recipe's vault view
              — see the Recipes Home discussion in the progress log), so
              the "Getting Started" checklist moved here from the vault
              view below — it's onboarding content, and this is the new
              front door. */}
          {onboardingProgress && !auth.profile?.onboarding_dismissed && (
            <div className="mx-auto w-full max-w-7xl px-4 pt-4">
              <GettingStartedCard
                hasFirearm={onboardingProgress.hasFirearm}
                hasInventory={onboardingProgress.hasInventory}
                hasRecipe={userRecipes.length > 0}
                onGoTo={setView}
                onDismiss={() => {
                  setOnboardingProgress(null);
                  auth.updateProfile({ onboarding_dismissed: true }).catch((err) => {
                    console.error('Failed to dismiss onboarding checklist', err);
                  });
                }}
              />
            </div>
          )}
          <RecipesHomePage
            userRecipes={userRecipes}
            lifetimeSaved={lifetimeSaved}
            onSelectRecipe={(recipeId) => {
              setActiveRecipeId(recipeId);
              setView('vault');
            }}
            onNewRecipe={() => {
              setRecipeFormMode('create');
              setRecipeFormOpen(true);
            }}
            onEditRecipe={handleEditRecipe}
            onDeleteRecipe={handleDeleteRecipe}
            onViewArchived={() => setArchivedModalOpen(true)}
            onCompareSelected={(ids) => {
              setCompareInitialIds(ids);
              setView('compare');
            }}
          />
          </>
        ) : view === 'inventory' ? (
          <InventoryPage authUser={auth.user} />
        ) : view === 'firearms' ? (
          <FirearmsPage
            authUser={auth.user}
            onSelectRecipe={(recipeId) => {
              setActiveRecipeId(recipeId);
              setView('vault');
            }}
          />
        ) : view === 'workups' ? (
          <WorkupsPage
            authUser={auth.user}
            initialOpenWorkupId={pendingWorkupId}
            onInitialWorkupOpened={() => setPendingWorkupId(null)}
          />
        ) : view === 'compare' ? (
          <ComparePage authUser={auth.user} initialSelectedIds={compareInitialIds} />
        ) : (
          <>
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col sm:flex-row">
            <Sidebar
              recipe={activeRecipe}
              userRecipes={userRecipes}
              activeRecipeId={activeRecipeId}
              onSelectRecipe={setActiveRecipeId}
              onNewRecipe={() => {
                setRecipeFormMode('create');
                setRecipeFormOpen(true);
              }}
              onViewArchived={() => setArchivedModalOpen(true)}
            />
            <Dashboard
              key={activeRecipeId ?? 'demo'}
              recipe={activeRecipe}
              activeRecipeId={activeRecipeId}
              authUser={auth.user}
              onSessionSaved={handleRecipeDataChanged}
              onOpenWorkup={(workupId) => {
                setPendingWorkupId(workupId);
                setView('workups');
              }}
              onEditRecipe={handleEditRecipe}
              onDeleteRecipe={handleDeleteRecipe}
            />
          </div>
          </>
        )
      ) : (
        <SignInGate onSignIn={auth.signInWithEmail} />
      )}

      <RecipeForm
        open={recipeFormOpen}
        editingRecipe={recipeFormMode === 'edit' ? activeRecipe : null}
        // See SafetyBasicsModal.jsx: auto-opens the safety content once,
        // the very first time a brand-new account creates its first
        // recipe. "Zero recipes saved yet" is the trigger — no separate
        // DB flag needed, and it stops auto-showing the moment that's no
        // longer true.
        isFirstRecipe={userRecipes.length === 0}
        onClose={() => {
          setRecipeFormOpen(false);
          setRecipeFormMode('create');
        }}
        onCreated={(newId) => {
          refreshRecipeList();
          refreshLifetimeSaved();
          setActiveRecipeId(newId);
          // Creating a recipe (whether the "New Recipe" button was
          // clicked from Recipes Home or from the Sidebar) clearly means
          // "I want to start filling this out" — jump straight into it
          // rather than leaving them on Home looking at the new card.
          // No-op when already on 'vault' (Sidebar's own New Recipe).
          setView('vault');
        }}
        onUpdated={() => {
          // Unlike onCreated, activeRecipeId doesn't change here — the
          // edited recipe IS the active one already — so explicitly
          // refetch both its detail (title/components/notes/etc. may
          // have changed) and the account-wide lifetime-saved total
          // (factory price or components may have too), plus the recipe
          // list in case the title changed.
          refreshRecipeList();
          handleRecipeDataChanged();
        }}
        authUser={auth.user}
      />

      <ArchivedRecipesModal
        open={archivedModalOpen}
        onClose={() => setArchivedModalOpen(false)}
        archivedRecipes={archivedRecipes}
        loading={archivedLoading}
        onRestore={handleRestoreRecipe}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={auth.user}
        profile={auth.profile}
        updateProfile={auth.updateProfile}
      />

      {recipeError && (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded border border-red-600 bg-red-950 px-4 py-2 font-mono text-xs text-red-300">
          {recipeError}
        </p>
      )}
    </div>
  );
}

// Minimal manual path routing for the ONE route that needs to exist
// outside the normal auth-gated app shell: a public recipe share link
// (see PublicRecipePage.jsx). Deliberately not React Router or any
// routing library — the rest of this app already gets by on a plain
// `view` useState string in AppShell instead of real URLs, and adding a
// whole router dependency for exactly one externally-linkable page would
// be a lot of new surface area for not much gain. `/r/<uuid>` is matched
// directly against window.location.pathname; anything else falls through
// to the normal app. Checked once at module-level render time, not
// reactively — a public recipe link is always a fresh page load (from a
// QR scan or a pasted URL), never a client-side navigation from within
// the app itself, so there's no in-app link that would need this to
// update without a full reload.
const PUBLIC_RECIPE_PATH = /^\/r\/([^/]+)\/?$/;

export default function App() {
  const publicRecipeMatch = window.location.pathname.match(PUBLIC_RECIPE_PATH);
  if (publicRecipeMatch) {
    return <PublicRecipePage recipeId={publicRecipeMatch[1]} />;
  }

  return (
    <RangeModeProvider>
      <SyncProvider>
        <AppShell />
      </SyncProvider>
    </RangeModeProvider>
  );
}
