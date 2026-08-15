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
  item_type TEXT NOT NULL DEFAULT 'task',
  source_ref TEXT,
  occurred_at TIMESTAMPTZ,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_content TEXT,
  drive_url TEXT,
  version BIGINT NOT NULL DEFAULT 1,
  privacy_scope TEXT NOT NULL DEFAULT 'cloud_private',
  ai_policy TEXT NOT NULL DEFAULT 'cloud_allowed',
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.unified_items
  ADD COLUMN IF NOT EXISTS source_app TEXT,
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_content TEXT,
  ADD COLUMN IF NOT EXISTS drive_url TEXT,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS privacy_scope TEXT NOT NULL DEFAULT 'cloud_private',
  ADD COLUMN IF NOT EXISTS ai_policy TEXT NOT NULL DEFAULT 'cloud_allowed',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS unified_items_user_type_idx
  ON public.unified_items (user_id, item_type);

CREATE INDEX IF NOT EXISTS unified_items_user_updated_idx
  ON public.unified_items (user_id, updated_at DESC);

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

-- 외부 서비스 OAuth/Integration 자격정보
CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'notion')),
  credentials_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, provider)
);

-- Phase 14-02: 비용 구조화 상세 테이블
CREATE TABLE IF NOT EXISTS public.expense_entries (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  merchant TEXT,
  category TEXT,
  payment_method TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  receipt_asset_id UUID,
  project_item_id TEXT,
  tax_deductible BOOLEAN NOT NULL DEFAULT false,
  reimbursable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id, item_id) REFERENCES public.unified_items(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS expense_entries_user_occurred_idx
  ON public.expense_entries (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS expense_entries_user_cat_occurred_idx
  ON public.expense_entries (user_id, category, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.create_expense_with_item(p_item JSONB, p_expense JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  saved_item public.unified_items;
  saved_expense public.expense_entries;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  INSERT INTO public.unified_items (
    id, user_id, source, source_app, title, content, created_at, author, url,
    category, action_directive, status, work_note, sub_tasks, item_type,
    source_ref, occurred_at, attributes, raw_content, drive_url, version,
    privacy_scope, ai_policy, deleted_at, updated_at
  ) VALUES (
    p_item->>'id', current_user_id, p_item->>'source', p_item->>'source_app',
    p_item->>'title', p_item->>'content', (p_item->>'created_at')::TIMESTAMPTZ,
    COALESCE(p_item->'author', '{}'::JSONB), p_item->>'url', p_item->>'category',
    p_item->>'action_directive', COALESCE(p_item->>'status', 'pending'),
    p_item->>'work_note', p_item->'sub_tasks', COALESCE(p_item->>'item_type', 'expense'),
    p_item->>'source_ref', (p_item->>'occurred_at')::TIMESTAMPTZ,
    COALESCE(p_item->'attributes', '{}'::JSONB), p_item->>'raw_content',
    p_item->>'drive_url', COALESCE((p_item->>'version')::BIGINT, 1),
    COALESCE(p_item->>'privacy_scope', 'cloud_private'),
    COALESCE(p_item->>'ai_policy', 'cloud_allowed'),
    NULLIF(p_item->>'deleted_at', '')::TIMESTAMPTZ,
    COALESCE((p_item->>'updated_at')::TIMESTAMPTZ, timezone('utc'::text, now()))
  ) RETURNING * INTO saved_item;
  INSERT INTO public.expense_entries (
    user_id, item_id, amount, currency, merchant, category, payment_method,
    occurred_at, receipt_asset_id, project_item_id, tax_deductible, reimbursable
  ) VALUES (
    current_user_id, p_expense->>'item_id', (p_expense->>'amount')::NUMERIC,
    COALESCE(p_expense->>'currency', 'KRW'), p_expense->>'merchant',
    p_expense->>'category', p_expense->>'payment_method',
    (p_expense->>'occurred_at')::TIMESTAMPTZ,
    NULLIF(p_expense->>'receipt_asset_id', '')::UUID, p_expense->>'project_item_id',
    COALESCE((p_expense->>'tax_deductible')::BOOLEAN, false),
    COALESCE((p_expense->>'reimbursable')::BOOLEAN, false)
  ) RETURNING * INTO saved_expense;
  RETURN jsonb_build_object('item', to_jsonb(saved_item), 'entry', to_jsonb(saved_expense));
END;
$$;

-- Phase 14-02: 첨부·원문 저장 위치 메타데이터
CREATE TABLE IF NOT EXISTS public.content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('document', 'image', 'audio', 'raw_text')),
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'google_drive', 'local_indexeddb', 'external_url')),
  provider_ref TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  retention_policy TEXT NOT NULL DEFAULT 'user_kept' CHECK (retention_policy IN ('transient', 'user_kept', 'source_owned', 'local_only')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (user_id, item_id) REFERENCES public.unified_items(user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, provider, provider_ref)
);

CREATE INDEX IF NOT EXISTS content_assets_user_item_idx
  ON public.content_assets (user_id, item_id);

-- Phase 14-02: 자료 간 명시적·AI 관계 그래프
CREATE TABLE IF NOT EXISTS public.item_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_item_id TEXT NOT NULL,
  to_item_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'rule', 'ai')),
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (user_id, from_item_id) REFERENCES public.unified_items(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, to_item_id) REFERENCES public.unified_items(user_id, id) ON DELETE CASCADE,
  CHECK (from_item_id <> to_item_id)
);

CREATE INDEX IF NOT EXISTS item_relations_user_from_idx
  ON public.item_relations (user_id, from_item_id);

CREATE INDEX IF NOT EXISTS item_relations_user_to_idx
  ON public.item_relations (user_id, to_item_id);

-- Phase 14-02: AI 파생 결과 및 출처·버전 추적
CREATE TABLE IF NOT EXISTS public.ai_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('transcription', 'summary', 'task_extract', 'expense_extract', 'tags', 'briefing')),
  content_text TEXT,
  content_json JSONB,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT,
  source_hash TEXT,
  source_version INTEGER,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'stale', 'rejected', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  accepted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (user_id, item_id) REFERENCES public.unified_items(user_id, id) ON DELETE CASCADE,
  CHECK (content_text IS NOT NULL OR content_json IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ai_artifacts_user_item_type_idx
  ON public.ai_artifacts (user_id, item_id, artifact_type, status);

CREATE TABLE IF NOT EXISTS public.sync_mutation_receipts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_id TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, mutation_id)
);

CREATE INDEX IF NOT EXISTS sync_mutation_receipts_created_idx
  ON public.sync_mutation_receipts (user_id, created_at DESC);

-- Row Level Security (RLS) 활성화
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spark_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_mutation_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

DROP POLICY IF EXISTS "Users can view own spark briefings" ON public.spark_briefings;
CREATE POLICY "Users can view own spark briefings" ON public.spark_briefings
  FOR SELECT USING (auth.uid() = user_id);

-- expense_entries RLS
DROP POLICY IF EXISTS "Users can view own expense entries" ON public.expense_entries;
DROP POLICY IF EXISTS "Users can insert own expense entries" ON public.expense_entries;
DROP POLICY IF EXISTS "Users can update own expense entries" ON public.expense_entries;
DROP POLICY IF EXISTS "Users can delete own expense entries" ON public.expense_entries;
CREATE POLICY "Users can view own expense entries" ON public.expense_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own expense entries" ON public.expense_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own expense entries" ON public.expense_entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own expense entries" ON public.expense_entries
  FOR DELETE USING (auth.uid() = user_id);

-- content_assets RLS
DROP POLICY IF EXISTS "Users can view own content assets" ON public.content_assets;
DROP POLICY IF EXISTS "Users can insert own content assets" ON public.content_assets;
DROP POLICY IF EXISTS "Users can update own content assets" ON public.content_assets;
DROP POLICY IF EXISTS "Users can delete own content assets" ON public.content_assets;
CREATE POLICY "Users can view own content assets" ON public.content_assets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own content assets" ON public.content_assets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own content assets" ON public.content_assets
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own content assets" ON public.content_assets
  FOR DELETE USING (auth.uid() = user_id);

-- item_relations RLS
DROP POLICY IF EXISTS "Users can view own item relations" ON public.item_relations;
DROP POLICY IF EXISTS "Users can insert own item relations" ON public.item_relations;
DROP POLICY IF EXISTS "Users can update own item relations" ON public.item_relations;
DROP POLICY IF EXISTS "Users can delete own item relations" ON public.item_relations;
CREATE POLICY "Users can view own item relations" ON public.item_relations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own item relations" ON public.item_relations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own item relations" ON public.item_relations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own item relations" ON public.item_relations
  FOR DELETE USING (auth.uid() = user_id);

-- ai_artifacts RLS
DROP POLICY IF EXISTS "Users can view own ai artifacts" ON public.ai_artifacts;
DROP POLICY IF EXISTS "Users can insert own ai artifacts" ON public.ai_artifacts;
DROP POLICY IF EXISTS "Users can update own ai artifacts" ON public.ai_artifacts;
DROP POLICY IF EXISTS "Users can delete own ai artifacts" ON public.ai_artifacts;
CREATE POLICY "Users can view own ai artifacts" ON public.ai_artifacts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai artifacts" ON public.ai_artifacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai artifacts" ON public.ai_artifacts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own ai artifacts" ON public.ai_artifacts
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own sync mutation receipts" ON public.sync_mutation_receipts;
DROP POLICY IF EXISTS "Users can insert own sync mutation receipts" ON public.sync_mutation_receipts;
CREATE POLICY "Users can view own sync mutation receipts" ON public.sync_mutation_receipts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync mutation receipts" ON public.sync_mutation_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. Storage 비공개 버킷 및 RLS 정책
INSERT INTO storage.buckets (id, name, public)
VALUES ('private-assets', 'private-assets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can only access own private storage assets" ON storage.objects;
CREATE POLICY "Users can only access own private storage assets" ON storage.objects
  FOR ALL USING (
    bucket_id = 'private-assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );


-- 권한 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unified_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_widgets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_rules TO authenticated;
GRANT SELECT ON public.spark_briefings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_expense_with_item(JSONB, JSONB) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_relations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_artifacts TO authenticated;
GRANT SELECT, INSERT ON public.sync_mutation_receipts TO authenticated;

-- user_integrations는 클라이언트 접근 불가 (service-role만 사용)
REVOKE ALL ON public.user_integrations FROM anon, authenticated;

-- Cloud Tool Phase D 테이블
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
