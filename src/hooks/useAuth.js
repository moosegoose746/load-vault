import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * useAuth — session + profile state for Precision Load Vault.
 *
 * Wraps Supabase Auth (magic-link email, no password infra to run) and
 * keeps the matching `profiles` row (username, is_pro, stripe_customer_id,
 * onboarding_dismissed) in sync so components can read plan/onboarding
 * status without a second fetch.
 *
 * A `profiles` row is created automatically by the `on_auth_user_created`
 * trigger in supabase/schema.sql the moment a user first confirms sign-in.
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, is_pro, stripe_customer_id, created_at, onboarding_dismissed')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('useAuth: failed to load profile', profileError);
      setError(profileError);
      return;
    }
    setProfile(data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Restore any existing session on first mount.
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) return;
      setSession(initialSession);
      loadProfile(initialSession?.user?.id).finally(() => {
        if (isMounted) setLoading(false);
      });
    });

    // React to sign-in / sign-out / token refresh anywhere in the app,
    // including magic-link redirects landing back on the site.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      loadProfile(newSession?.user?.id);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  /** Sends a magic link. No password to store, reset, or leak. */
  const signInWithEmail = useCallback(async (email) => {
    if (!email) return { error: new Error('Email is required') };
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (signInError) setError(signInError);
    return { error: signInError };
  }, []);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError);
    setSession(null);
    setProfile(null);
    return { error: signOutError };
  }, []);

  /** Patch the caller's own profile row (username, etc). RLS restricts this to auth.uid() = id. */
  const updateProfile = useCallback(
    async (updates) => {
      if (!session?.user?.id) return { error: new Error('Not signed in') };
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', session.user.id)
        .select()
        .maybeSingle();

      if (updateError) {
        setError(updateError);
        return { error: updateError };
      }
      setProfile(data);
      return { data };
    },
    [session?.user?.id]
  );

  return {
    session,
    user: session?.user ?? null,
    profile,
    isPro: profile?.is_pro ?? false,
    loading,
    error,
    signInWithEmail,
    signOut,
    updateProfile,
  };
}
