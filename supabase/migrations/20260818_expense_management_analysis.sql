-- 20260818_expense_management_analysis.sql
-- 비용 관리·수정·소프트 삭제 RPC 및 인덱스

-- 1. 비용 수정 RPC (낙관적 락 및 원자적 갱신)
CREATE OR REPLACE FUNCTION public.update_expense_with_item(
  p_item_id TEXT,
  p_patch JSONB,
  p_expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_item public.unified_items;
  saved_item public.unified_items;
  saved_expense public.expense_entries;
  new_attrs JSONB;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO target_item
  FROM public.unified_items
  WHERE id = p_item_id
    AND user_id = current_user_id
    AND item_type = 'expense'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found or access denied';
  END IF;

  IF p_expected_version IS NOT NULL AND target_item.version <> p_expected_version THEN
    RAISE EXCEPTION 'version conflict: expected %, found %', p_expected_version, target_item.version;
  END IF;

  new_attrs := COALESCE(target_item.attributes, '{}'::JSONB);
  IF p_patch ? 'amount' THEN
    new_attrs := jsonb_set(new_attrs, '{amount}', to_jsonb(p_patch->>'amount'));
  END IF;
  IF p_patch ? 'currency' THEN
    new_attrs := jsonb_set(new_attrs, '{currency}', to_jsonb(p_patch->>'currency'));
  END IF;
  IF p_patch ? 'category' THEN
    new_attrs := jsonb_set(new_attrs, '{category}', to_jsonb(p_patch->>'category'));
  END IF;
  IF p_patch ? 'merchant' THEN
    new_attrs := jsonb_set(new_attrs, '{merchant}', to_jsonb(p_patch->>'merchant'));
  END IF;

  UPDATE public.unified_items
  SET
    title = COALESCE(p_patch->>'title', title),
    occurred_at = COALESCE((p_patch->>'occurred_at')::TIMESTAMPTZ, occurred_at),
    attributes = new_attrs,
    updated_at = timezone('utc'::text, now()),
    version = target_item.version + 1
  WHERE id = p_item_id
    AND user_id = current_user_id
  RETURNING * INTO saved_item;

  UPDATE public.expense_entries
  SET
    amount = COALESCE((p_patch->>'amount')::NUMERIC, amount),
    currency = COALESCE(p_patch->>'currency', currency),
    merchant = CASE WHEN p_patch ? 'merchant' THEN p_patch->>'merchant' ELSE merchant END,
    category = CASE WHEN p_patch ? 'category' THEN p_patch->>'category' ELSE category END,
    payment_method = CASE WHEN p_patch ? 'payment_method' THEN p_patch->>'payment_method' ELSE payment_method END,
    occurred_at = COALESCE((p_patch->>'occurred_at')::TIMESTAMPTZ, occurred_at)
  WHERE item_id = p_item_id
    AND user_id = current_user_id
  RETURNING * INTO saved_expense;

  RETURN jsonb_build_object('item', to_jsonb(saved_item), 'entry', to_jsonb(saved_expense));
END;
$$;

-- 2. 비용 소프트 삭제 RPC
CREATE OR REPLACE FUNCTION public.soft_delete_expense(
  p_item_id TEXT,
  p_expected_version BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_item public.unified_items;
  saved_item public.unified_items;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO target_item
  FROM public.unified_items
  WHERE id = p_item_id
    AND user_id = current_user_id
    AND item_type = 'expense'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found or already deleted';
  END IF;

  IF p_expected_version IS NOT NULL AND target_item.version <> p_expected_version THEN
    RAISE EXCEPTION 'version conflict: expected %, found %', p_expected_version, target_item.version;
  END IF;

  UPDATE public.unified_items
  SET
    deleted_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now()),
    version = target_item.version + 1
  WHERE id = p_item_id
    AND user_id = current_user_id
  RETURNING * INTO saved_item;

  RETURN jsonb_build_object(
    'success', true,
    'itemId', saved_item.id,
    'deletedAt', saved_item.deleted_at,
    'version', saved_item.version
  );
END;
$$;

-- 3. 권한 부여
GRANT EXECUTE ON FUNCTION public.update_expense_with_item(TEXT, JSONB, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_expense(TEXT, BIGINT) TO authenticated;

-- 4. 복합 인덱스
CREATE INDEX IF NOT EXISTS unified_items_expense_active_occurred_idx
  ON public.unified_items (user_id, occurred_at DESC)
  WHERE item_type = 'expense' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS expense_entries_user_category_currency_idx
  ON public.expense_entries (user_id, category, currency, occurred_at DESC);
