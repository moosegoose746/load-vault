-- Migration for Firearm Profiles — run once in the Supabase SQL Editor.
-- Additive only: new `firearms` table, one new nullable column on the
-- existing `range_sessions` table, plus a new storage bucket. Nothing
-- here touches or removes any existing data.
--
-- Design notes (see discussion with the user):
-- - One caliber per firearm profile (a rebarrel to a different caliber
--   means creating a new profile, not editing this one).
-- - Firearm is picked per RANGE SESSION, not locked to a recipe — a
--   single recipe might get tested across more than one rifle, and a
--   rifle accumulates rounds across many different recipes over its
--   life. That's why `firearm_id` lands on `range_sessions`, not
--   `load_recipes`. Round count / barrel life are computed the same way
--   Rounds On Hand already is: derived fresh from real session history,
--   never a stored mutable counter.
-- - `starting_round_count` covers a used firearm bought with unknown
--   prior history — added on top of the app-tracked total, same idea as
--   an odometer reading.
-- - `estimated_barrel_life` mirrors the brass reload_cycles pattern
--   exactly: an optional estimate compared against the real count, with
--   a "nearing end of life" warning once it's approached.

CREATE TABLE public.firearms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  caliber_id UUID REFERENCES public.calibers(id) ON DELETE RESTRICT NOT NULL,
  make TEXT,
  model TEXT,
  optic TEXT,
  barrel_length_inches NUMERIC(4,2) CHECK (barrel_length_inches IS NULL OR barrel_length_inches > 0),
  twist_rate TEXT,
  starting_round_count INT NOT NULL DEFAULT 0 CHECK (starting_round_count >= 0),
  estimated_barrel_life INT CHECK (estimated_barrel_life IS NULL OR estimated_barrel_life > 0),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_firearms_user_id ON public.firearms(user_id);

ALTER TABLE public.range_sessions
  ADD COLUMN IF NOT EXISTS firearm_id UUID REFERENCES public.firearms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_range_sessions_firearm_id ON public.range_sessions(firearm_id);

ALTER TABLE public.firearms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own firearms" ON public.firearms FOR ALL USING (auth.uid() = user_id);

-- Same storage-cleanup pattern as target-images (see schema.sql) — delete
-- the old photo from storage whenever a firearm's photo_url changes or
-- the firearm itself is deleted, so removed/replaced photos don't sit
-- around eating into the storage quota.
CREATE OR REPLACE FUNCTION public.delete_old_firearm_photo()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.photo_url IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.photo_url <> NEW.photo_url) THEN
    PERFORM storage.delete('firearm-images', regexp_replace(OLD.photo_url, '.*firearm-images/', ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_delete_firearm_photo
  BEFORE DELETE OR UPDATE ON public.firearms
  FOR EACH ROW EXECUTE FUNCTION public.delete_old_firearm_photo();

INSERT INTO storage.buckets (id, name, public) VALUES ('firearm-images', 'firearm-images', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Authenticated users can upload firearm photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'firearm-images' AND auth.role() = 'authenticated');
CREATE POLICY "Public firearm photo access" ON storage.objects FOR SELECT USING (bucket_id = 'firearm-images');
