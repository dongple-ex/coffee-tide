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

-- 외부 서비스 OAuth/Integration 자격정보. 값은 애플리케이션 서버에서 AES-256-GCM으로
-- 암호화한 뒤 저장하며 service-role 서버에서만 접근한다.
CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'notion')),
  credentials_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX IF NOT EXISTS spark_briefings_user_received_idx
  ON public.spark_briefings (user_id, received_at DESC);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spark_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

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

-- user_integrations는 클라이언트 접근 정책을 만들지 않는다. service-role 서버만 사용한다.
REVOKE ALL ON public.user_integrations FROM anon, authenticated;

-- Cloud Tool Phase D: 외부 쓰기 승인·멱등성·감사·분산 호출 제한.
-- 원문 입력과 OAuth 토큰은 저장하지 않고 해시/메타데이터만 저장한다.
CREATE TABLE IF NOT EXISTS public.cloud_tool_approvals (
  token_hash TEXT PRIMARY KEY,
  actor_hash TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.cloud_tool_idempotency (
  actor_hash TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  approval_token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  result JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (actor_hash, tool_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.cloud_tool_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  actor_hash TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  tool_version INTEGER NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('read_only', 'draft', 'external_write')),
  success BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.cloud_tool_rate_windows (
  actor_hash TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (actor_hash, tool_id, window_started_at)
);

CREATE INDEX IF NOT EXISTS cloud_tool_approvals_expiry_idx
  ON public.cloud_tool_approvals (expires_at);
CREATE INDEX IF NOT EXISTS cloud_tool_audit_actor_created_idx
  ON public.cloud_tool_audit (actor_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS cloud_tool_rate_updated_idx
  ON public.cloud_tool_rate_windows (updated_at);

CREATE OR REPLACE FUNCTION public.claim_cloud_tool_rate_limit(
  p_actor_hash TEXT,
  p_tool_id TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window := to_timestamp(
    floor(extract(epoch FROM timezone('utc'::text, now())) / p_window_seconds) * p_window_seconds
  );
  INSERT INTO public.cloud_tool_rate_windows (
    actor_hash, tool_id, window_started_at, call_count, updated_at
  ) VALUES (
    p_actor_hash, p_tool_id, v_window, 1, timezone('utc'::text, now())
  )
  ON CONFLICT (actor_hash, tool_id, window_started_at)
  DO UPDATE SET
    call_count = public.cloud_tool_rate_windows.call_count + 1,
    updated_at = timezone('utc'::text, now())
  RETURNING call_count INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;

ALTER TABLE public.cloud_tool_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_tool_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_tool_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_tool_rate_windows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cloud_tool_approvals FROM anon, authenticated;
REVOKE ALL ON public.cloud_tool_idempotency FROM anon, authenticated;
REVOKE ALL ON public.cloud_tool_audit FROM anon, authenticated;
REVOKE ALL ON public.cloud_tool_rate_windows FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_cloud_tool_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cloud_tool_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;
