-- Phase 14-02: 공통 데이터 계약·Supabase 스키마 확장 마이그레이션
-- 목적: 업무, 메모, 회의, 문서, 비용, 음성과 AI 결과가 하나의 공통 루트 ID와 버전 규칙을 공유하도록 확장

-- 1. public.unified_items 테이블 전방 호환 컬럼 확장
ALTER TABLE public.unified_items
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

-- 2. public.expense_entries: 비용 구조화 상세 테이블
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
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

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

-- 3. public.content_assets: 첨부·원문 저장 위치 메타데이터
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

-- 4. public.item_relations: 자료 간 명시적·AI 관계 그래프
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

-- 5. public.ai_artifacts: AI 파생 결과 및 출처·버전 추적
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

-- 5.1 동기화 mutation 멱등 처리 영수증
CREATE TABLE IF NOT EXISTS public.sync_mutation_receipts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_id TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, mutation_id)
);

CREATE INDEX IF NOT EXISTS sync_mutation_receipts_created_idx
  ON public.sync_mutation_receipts (user_id, created_at DESC);

-- 6. Row Level Security (RLS) 정책 활성화 및 권한 분리
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_mutation_receipts ENABLE ROW LEVEL SECURITY;

-- 6.1 expense_entries RLS
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

-- 6.2 content_assets RLS
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

-- 6.3 item_relations RLS
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

-- 6.4 ai_artifacts RLS
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

-- 6.5 sync_mutation_receipts RLS
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_expense_with_item(JSONB, JSONB) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_relations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_artifacts TO authenticated;
GRANT SELECT, INSERT ON public.sync_mutation_receipts TO authenticated;
