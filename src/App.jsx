import { useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { RangeModeProvider, useRangeMode } from './context/RangeModeContext.jsx';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './components/Dashboard.jsx';
import { mockRecipe } from './data/mockRecipe.js';

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
const DEV_SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';
const DEV_USER = { id: 'dev-local-user', email: 'dev@localhost' };

function AppShell() {
  const auth = useAuth();
  const { rangeMode } = useRangeMode();

  const user = DEV_SKIP_AUTH ? auth.user ?? DEV_USER : auth.user;
  const loading = DEV_SKIP_AUTH ? false : auth.loading;

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
        rangeMode ? 'text-lg' : ''
      }`}
    >
      {DEV_SKIP_AUTH && (
        <div className="bg-red-900/60 px-4 py-1 text-center font-mono text-[11px] tracking-wide text-red-200">
          DEV MODE — AUTH BYPASSED (local only, set by VITE_SKIP_AUTH in .env)
        </div>
      )}
      <Header user={user} onSignOut={auth.signOut} />
      {user ? (
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col sm:flex-row">
          <Sidebar recipe={mockRecipe} />
          <Dashboard recipe={mockRecipe} />
        </div>
      ) : (
        <SignInGate onSignIn={auth.signInWithEmail} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <RangeModeProvider>
      <AppShell />
    </RangeModeProvider>
  );
}
