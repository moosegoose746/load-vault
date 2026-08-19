-- Precision Load Vault — Production Schema
-- Run this once inside the Supabase SQL Editor for a fresh project.
-- Source: Master Blueprint, Section 4.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Tied to Supabase Auth)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  is_pro BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. CALIBERS TABLE
CREATE TABLE public.calibers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- e.g. "6.5 Creedmoor", ".308 Winchester"
  category TEXT DEFAULT 'Rifle'
);

-- 3. COMPONENTS TABLE (With Soft Deletes & Unit Costs)
CREATE TABLE public.components (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('powder', 'bullet', 'primer', 'brass')),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  unit_cost NUMERIC(6,2), -- Purchase price for inventory calculation
  package_qty INT, -- Total units in package (e.g. 100 bullets, 7000 grains per lb)
  affiliate_url TEXT,
  in_stock BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. LOAD RECIPES TABLE (With Granular Visibility)
CREATE TABLE public.load_recipes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
  title TEXT NOT NULL,
  caliber_id UUID REFERENCES public.calibers(id) ON DELETE RESTRICT NOT NULL,
  powder_id UUID REFERENCES public.components(id) ON DELETE SET NULL,
  charge_weight_grains NUMERIC(5,2) NOT NULL CHECK (charge_weight_grains > 0),
  bullet_id UUID REFERENCES public.components(id) ON DELETE SET NULL,
  primer_id UUID REFERENCES public.components(id) ON DELETE SET NULL,
  brass_id UUID REFERENCES public.components(id) ON DELETE SET NULL,
  coal_inches NUMERIC(4,3) CHECK (coal_inches > 0),
  rifle_model TEXT,
  notes TEXT,
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'unlisted', 'private')),
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. RANGE SESSIONS TABLE
CREATE TABLE public.range_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recipe_id UUID REFERENCES public.load_recipes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  distance_yards INT DEFAULT 100 CHECK (distance_yards > 0),
  group_size_moa NUMERIC(4,2),
  group_size_inches NUMERIC(4,3),
  avg_velocity_fps INT,
  std_dev_fps NUMERIC(4,1),
  extreme_spread_fps INT,
  target_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. SHOT LOGS TABLE
CREATE TABLE public.shot_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES public.range_sessions(id) ON DELETE CASCADE NOT NULL,
  shot_number INT NOT NULL,
  velocity_fps INT NOT NULL CHECK (velocity_fps > 0)
);

-- PERFORMANCE INDEXES (Keeps free-tier queries fast)
CREATE INDEX idx_recipes_user_id ON public.load_recipes(user_id);
CREATE INDEX idx_recipes_caliber_id ON public.load_recipes(caliber_id);
CREATE INDEX idx_recipes_visibility ON public.load_recipes(visibility) WHERE visibility = 'public';
CREATE INDEX idx_range_sessions_recipe_id ON public.range_sessions(recipe_id);
CREATE INDEX idx_shot_logs_session_id ON public.shot_logs(session_id);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.range_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Calibers and components are shared reference/lookup data (dropdown
-- options), not user-owned rows. Everyone — including anonymous
-- visitors browsing public recipes — needs to read them, but only the
-- service_role key (which bypasses RLS entirely) should write to them,
-- so there is deliberately no INSERT/UPDATE/DELETE policy here.
CREATE POLICY "Calibers viewable by everyone" ON public.calibers FOR SELECT USING (true);
CREATE POLICY "Components viewable by everyone" ON public.components FOR SELECT USING (is_deleted = FALSE);

CREATE POLICY "Public and unlisted recipes viewable" ON public.load_recipes
  FOR SELECT USING (visibility IN ('public', 'unlisted') AND is_archived = FALSE);
CREATE POLICY "Users manage own recipes" ON public.load_recipes FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own range sessions" ON public.range_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own shot logs" ON public.shot_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.range_sessions WHERE id = shot_logs.session_id AND user_id = auth.uid())
);

-- AUTOMATIC STORAGE CLEANUP TRIGGER (Saves storage quota)
CREATE OR REPLACE FUNCTION public.delete_old_target_image()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.target_image_url IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.target_image_url <> NEW.target_image_url) THEN
    PERFORM storage.delete('target-images', regexp_replace(OLD.target_image_url, '.*target-images/', ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_delete_target_image
  BEFORE DELETE OR UPDATE ON public.range_sessions
  FOR EACH ROW EXECUTE FUNCTION public.delete_old_target_image();

-- STORAGE BUCKET SECURITY
INSERT INTO storage.buckets (id, name, public) VALUES ('target-images', 'target-images', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Authenticated users can upload targets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'target-images' AND auth.role() = 'authenticated');
CREATE POLICY "Public target image access" ON storage.objects FOR SELECT USING (bucket_id = 'target-images');

-- SEED BASELINE CALIBERS (Zero friction for new users)
INSERT INTO public.calibers (name, category) VALUES
  ('6.5 Creedmoor', 'Rifle'),
  ('.308 Winchester', 'Rifle'),
  ('.223 Remington / 5.56 NATO', 'Rifle'),
  ('.300 Winchester Magnum', 'Rifle'),
  ('6mm Creedmoor', 'Rifle'),
  ('9mm Luger', 'Handgun'),
  ('.45 ACP', 'Handgun')
ON CONFLICT (name) DO NOTHING;

-- AUTO-CREATE PROFILE ROW ON SIGNUP
-- The schema above defines profiles but nothing in Section 4 populates
-- them automatically. useAuth() expects a profile row to exist as soon
-- as a user signs up, so this trigger fills that gap.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
