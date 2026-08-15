-- Phase 14 신뢰성 보강 증분 마이그레이션
-- 20260814_data_knowledge_foundation.sql을 이미 적용한 환경에서도 이 파일만 추가 실행할 수 있다.

CREATE TABLE IF NOT EXISTS public.sync_mutation_receipts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_id TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, mutation_id)
);

CREATE INDEX IF NOT EXISTS sync_mutation_receipts_created_idx
  ON public.sync_mutation_receipts (user_id, created_at DESC);

ALTER TABLE public.sync_mutation_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sync mutation receipts" ON public.sync_mutation_receipts;
DROP POLICY IF EXISTS "Users can insert own sync mutation receipts" ON public.sync_mutation_receipts;
CREATE POLICY "Users can view own sync mutation receipts" ON public.sync_mutation_receipts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync mutation receipts" ON public.sync_mutation_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.sync_mutation_receipts TO authenticated;

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

GRANT EXECUTE ON FUNCTION public.create_expense_with_item(JSONB, JSONB) TO authenticated;
