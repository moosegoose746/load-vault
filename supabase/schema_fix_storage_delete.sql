-- Fix: photo-cleanup triggers were calling `storage.delete(bucket, path)`,
-- which is not a real Postgres/Supabase function. That made the BEFORE
-- DELETE trigger throw and roll back the whole delete any time the row
-- being deleted (a firearm, or a range session) had a photo attached --
-- this is why "delete firearm" failed specifically for firearms with a
-- photo, and would have hit the same problem for range sessions with a
-- target photo once one was ever hard-deleted.
--
-- The correct way to remove a Storage object from SQL is to delete its
-- row from storage.objects directly (that table is the source of truth
-- Storage reads from), not call a nonexistent helper function.
--
-- Safe to run any number of times -- CREATE OR REPLACE just swaps the
-- function body, the triggers themselves are untouched.

CREATE OR REPLACE FUNCTION public.delete_old_firearm_photo()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.photo_url IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.photo_url <> NEW.photo_url) THEN
    DELETE FROM storage.objects
      WHERE bucket_id = 'firearm-images'
        AND name = regexp_replace(OLD.photo_url, '.*firearm-images/', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_old_target_image()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.target_image_url IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.target_image_url <> NEW.target_image_url) THEN
    DELETE FROM storage.objects
      WHERE bucket_id = 'target-images'
        AND name = regexp_replace(OLD.target_image_url, '.*target-images/', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
