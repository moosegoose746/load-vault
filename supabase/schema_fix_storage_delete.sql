-- Fix: photo-cleanup triggers on `firearms` and `range_sessions` were
-- trying to delete Storage objects directly from SQL. The first attempt
-- called a nonexistent `storage.delete(bucket, path)` function; a
-- follow-up attempt deleted straight from `storage.objects`, which
-- Supabase actively blocks ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead."). Neither approach can ever
-- work from a database trigger on this platform -- Storage cleanup has
-- to happen from application code using the real Storage API, which is
-- what `deleteFirearmPhoto` in src/lib/firearms.js now does.
--
-- This migration removes both triggers (and their now-dead functions)
-- so a firearm or range session with a photo can be deleted/updated
-- normally again. Safe to run any number of times.

DROP TRIGGER IF EXISTS trigger_delete_firearm_photo ON public.firearms;
DROP FUNCTION IF EXISTS public.delete_old_firearm_photo();

DROP TRIGGER IF EXISTS trigger_delete_target_image ON public.range_sessions;
DROP FUNCTION IF EXISTS public.delete_old_target_image();
