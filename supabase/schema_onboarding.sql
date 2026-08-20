-- Adds a single account-level flag powering the "Getting Started"
-- checklist card (src/components/GettingStartedCard.jsx) — a one-time,
-- dismissible nudge pointing a brand-new account at the suggested setup
-- order (add a firearm, price your inventory, create a recipe).
--
-- Stored on `profiles` (not localStorage) so the card correctly stays
-- dismissed across devices/browsers for the same account, same reasoning
-- as everything else account-level in this app (is_pro, username, etc.).
-- Defaults FALSE for both new signups (the on_auth_user_created trigger's
-- INSERT omits it, so this column default applies) and existing accounts
-- (backfilled to FALSE below) -- existing users will see the card once
-- after this ships; it self-dismisses the moment all three steps are
-- already true for them, which is instant for anyone who's already used
-- the app for real.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
