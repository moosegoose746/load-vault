import { useAuth } from './hooks/useAuth.js';

// Phase 1 placeholder shell — Phase 2 replaces this with the full
// app shell (Sync HUD, Range Mode toggle, dashboard) per Section 3.
export default function App() {
  const { user, profile, loading, signInWithEmail, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono text-amber-400">
        Loading Vault…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-amber-400">Precision Load Vault</h1>
      {user ? (
        <div className="text-center space-y-2">
          <p className="font-mono text-sm text-slate-300">
            Signed in as {profile?.username ?? user.email}
          </p>
          <button
            onClick={signOut}
            className="border border-amber-500 text-amber-400 px-4 py-2 rounded hover:bg-amber-500/10"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <button
          onClick={() => signInWithEmail(prompt('Email:'))}
          className="border border-amber-500 text-amber-400 px-4 py-2 rounded hover:bg-amber-500/10"
        >
          Sign In With Email
        </button>
      )}
    </div>
  );
}
