-- ========================================================
-- coffeeTide Supabase Schema Definition
-- Supabase Dashboard -> SQL Editor 에서 전체 복사 후 Run 실행
-- ========================================================

-- 1. 사용자 프로필 테이블
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  brief_time TEXT DEFAULT '18:00',
  commute_config JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Unified Data (할 일, 메모, 마이그레이션 항목) 테이블
CREATE TABLE IF NOT EXISTS public.unified_items (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  created_at TEXT,
  author JSONB,
  url TEXT,
  category TEXT,
  action_directive TEXT,
  status TEXT DEFAULT 'pending',
  work_note TEXT,
  sub_tasks JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- 3. 커스텀 뉴스/유튜브 위젯 설정 테이블
CREATE TABLE IF NOT EXISTS public.user_widgets (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  depth TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- 4. 자동화 규칙(Automation Rules) 테이블
CREATE TABLE IF NOT EXISTS public.user_rules (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  action TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- ========================================================
-- Row Level Security (RLS) 보안 정책 설정
-- 로그인한 사용자 본인 데이터만 CRUD 허용
-- ========================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rules ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);

-- Items Policies
CREATE POLICY "Users can view own items" ON public.unified_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own items" ON public.unified_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own items" ON public.unified_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own items" ON public.unified_items FOR DELETE USING (auth.uid() = user_id);

-- Widgets Policies
CREATE POLICY "Users can view own widgets" ON public.user_widgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own widgets" ON public.user_widgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own widgets" ON public.user_widgets FOR DELETE USING (auth.uid() = user_id);

-- Rules Policies
CREATE POLICY "Users can view own rules" ON public.user_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rules" ON public.user_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own rules" ON public.user_rules FOR DELETE USING (auth.uid() = user_id);
