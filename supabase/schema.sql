-- coffeeTide Supabase schema
-- Supabase Dashboard > SQL Editor에서 전체를 실행합니다.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  brief_time TEXT DEFAULT '18:00',
  commute_config JSONB,
  dismissed_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS dismissed_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.unified_items (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_app TEXT,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ,
  author JSONB,
  url TEXT,
  category TEXT,
  action_directive TEXT,
  status TEXT DEFAULT 'pending',
  work_note TEXT,
  sub_tasks JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.unified_items
  ADD COLUMN IF NOT EXISTS source_app TEXT;

CREATE TABLE IF NOT EXISTS public.user_widgets (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.user_rules (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  action TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.spark_briefings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'reference',
  source_app TEXT NOT NULL DEFAULT 'Gemini Spark',
  action_url TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, external_id)
);

CREATE INDEX IF NOT EXISTS spark_briefings_user_received_idx
  ON public.spark_briefings (user_id, received_at DESC);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spark_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own items" ON public.unified_items;
DROP POLICY IF EXISTS "Users can insert own items" ON public.unified_items;
DROP POLICY IF EXISTS "Users can update own items" ON public.unified_items;
DROP POLICY IF EXISTS "Users can delete own items" ON public.unified_items;
CREATE POLICY "Users can view own items" ON public.unified_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own items" ON public.unified_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own items" ON public.unified_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own items" ON public.unified_items
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own widgets" ON public.user_widgets;
DROP POLICY IF EXISTS "Users can insert own widgets" ON public.user_widgets;
DROP POLICY IF EXISTS "Users can update own widgets" ON public.user_widgets;
DROP POLICY IF EXISTS "Users can delete own widgets" ON public.user_widgets;
CREATE POLICY "Users can view own widgets" ON public.user_widgets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own widgets" ON public.user_widgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own widgets" ON public.user_widgets
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own widgets" ON public.user_widgets
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own rules" ON public.user_rules;
DROP POLICY IF EXISTS "Users can insert own rules" ON public.user_rules;
DROP POLICY IF EXISTS "Users can update own rules" ON public.user_rules;
DROP POLICY IF EXISTS "Users can delete own rules" ON public.user_rules;
CREATE POLICY "Users can view own rules" ON public.user_rules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rules" ON public.user_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rules" ON public.user_rules
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own rules" ON public.user_rules
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own Spark briefings" ON public.spark_briefings;
CREATE POLICY "Users can view own Spark briefings" ON public.spark_briefings
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unified_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_widgets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_rules TO authenticated;
GRANT SELECT ON public.spark_briefings TO authenticated;
