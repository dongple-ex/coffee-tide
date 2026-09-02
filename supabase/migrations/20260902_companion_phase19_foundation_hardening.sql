-- =============================================================================
-- CoffeeTide Phase 19-0: Companion 신뢰 경계 및 삭제 정책 보정
-- 주의: 로컬 마이그레이션 정의이며 명시적 승인 전에는 원격 DB에 실행하지 않습니다.
-- =============================================================================

-- unified_items.id가 TEXT이므로 원본 항목 참조도 TEXT로 맞춘다.
ALTER TABLE IF EXISTS public.companion_events
  ALTER COLUMN source_item_id TYPE TEXT USING source_item_id::TEXT;

CREATE TABLE IF NOT EXISTS public.companion_deletion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('all', 'persona', 'growth', 'memories')),
  persona_id TEXT DEFAULT NULL,
  preserve_relationship BOOLEAN NOT NULL DEFAULT TRUE,
  confirm_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  deleted_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_code TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  CHECK ((scope = 'persona' AND persona_id IS NOT NULL) OR (scope <> 'persona' AND persona_id IS NULL))
);

ALTER TABLE public.companion_deletion_jobs
  ADD COLUMN IF NOT EXISTS preserve_relationship BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_companion_deletion_jobs_user_created
  ON public.companion_deletion_jobs(user_id, created_at DESC);

ALTER TABLE public.companion_deletion_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own companion deletion jobs"
  ON public.companion_deletion_jobs;
CREATE POLICY "Users can view their own companion deletion jobs"
  ON public.companion_deletion_jobs
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.companion_deletion_jobs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.companion_deletion_jobs FROM anon, authenticated;

-- 이벤트 원장과 파생 관계 프로필을 한 트랜잭션으로 적용한다.
-- 프로필 버전이 달라지면 전체 트랜잭션을 롤백하고 서버가 최신 원장으로 재계산한다.
CREATE OR REPLACE FUNCTION public.apply_companion_event_and_profile(
  p_user_id UUID,
  p_expected_profile_version INTEGER,
  p_event JSONB,
  p_profile JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_persona_id TEXT := p_event->>'persona_id';
  v_current_version INTEGER;
  v_profile_exists BOOLEAN := FALSE;
  v_inserted INTEGER := 0;
  v_profile JSONB;
BEGIN
  IF p_user_id IS NULL
    OR v_persona_id IS NULL
    OR v_persona_id = ''
    OR v_persona_id IS DISTINCT FROM (p_profile->>'persona_id')
    OR p_expected_profile_version < 1 THEN
    RAISE EXCEPTION 'invalid_companion_event_profile_arguments';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::TEXT || ':' || v_persona_id, 0)
  );

  SELECT version
  INTO v_current_version
  FROM public.companion_profiles
  WHERE user_id = p_user_id AND persona_id = v_persona_id
  FOR UPDATE;
  v_profile_exists := FOUND;

  IF (v_profile_exists AND v_current_version <> p_expected_profile_version)
    OR (NOT v_profile_exists AND p_expected_profile_version <> 1) THEN
    RAISE EXCEPTION 'companion_profile_version_conflict';
  END IF;

  INSERT INTO public.companion_events (
    id,
    user_id,
    persona_id,
    event_type,
    authority,
    source_item_id,
    source_version,
    source_receipt_id,
    idempotency_key,
    payload,
    bond_delta,
    policy_version,
    credited_day,
    credited_timezone,
    occurred_at
  ) VALUES (
    (p_event->>'id')::UUID,
    p_user_id,
    v_persona_id,
    p_event->>'event_type',
    p_event->>'authority',
    NULLIF(p_event->>'source_item_id', ''),
    NULLIF(p_event->>'source_version', '')::INTEGER,
    NULLIF(p_event->>'source_receipt_id', ''),
    p_event->>'idempotency_key',
    COALESCE(p_event->'payload', '{}'::JSONB),
    COALESCE((p_event->>'bond_delta')::INTEGER, 0),
    p_event->>'policy_version',
    (p_event->>'credited_day')::DATE,
    p_event->>'credited_timezone',
    (p_event->>'occurred_at')::TIMESTAMPTZ
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    IF NOT v_profile_exists THEN
      INSERT INTO public.companion_profiles (
        user_id,
        persona_id,
        bond_exp,
        relationship_level,
        current_mode,
        mode_expires_at,
        preferred_address,
        last_interaction_at,
        completed_tasks_count,
        history_deleted_at,
        version,
        updated_at
      ) VALUES (
        p_user_id,
        v_persona_id,
        (p_profile->>'bond_exp')::INTEGER,
        (p_profile->>'relationship_level')::INTEGER,
        p_profile->>'current_mode',
        NULLIF(p_profile->>'mode_expires_at', '')::TIMESTAMPTZ,
        NULLIF(p_profile->>'preferred_address', ''),
        (p_profile->>'last_interaction_at')::TIMESTAMPTZ,
        (p_profile->>'completed_tasks_count')::INTEGER,
        NULLIF(p_profile->>'history_deleted_at', '')::TIMESTAMPTZ,
        p_expected_profile_version + 1,
        NOW()
      );
    END IF;
    SELECT to_jsonb(cp)
    INTO v_profile
    FROM public.companion_profiles cp
    WHERE cp.user_id = p_user_id AND cp.persona_id = v_persona_id;
    RETURN jsonb_build_object(
      'recorded', FALSE,
      'bond_delta', 0,
      'profile', v_profile
    );
  END IF;

  IF v_profile_exists THEN
    UPDATE public.companion_profiles
    SET bond_exp = (p_profile->>'bond_exp')::INTEGER,
        relationship_level = (p_profile->>'relationship_level')::INTEGER,
        current_mode = p_profile->>'current_mode',
        mode_expires_at = NULLIF(p_profile->>'mode_expires_at', '')::TIMESTAMPTZ,
        preferred_address = NULLIF(p_profile->>'preferred_address', ''),
        last_interaction_at = (p_profile->>'last_interaction_at')::TIMESTAMPTZ,
        completed_tasks_count = (p_profile->>'completed_tasks_count')::INTEGER,
        history_deleted_at = NULLIF(p_profile->>'history_deleted_at', '')::TIMESTAMPTZ,
        version = p_expected_profile_version + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id AND persona_id = v_persona_id;
  ELSE
    INSERT INTO public.companion_profiles (
      user_id,
      persona_id,
      bond_exp,
      relationship_level,
      current_mode,
      mode_expires_at,
      preferred_address,
      last_interaction_at,
      completed_tasks_count,
      history_deleted_at,
      version,
      updated_at
    ) VALUES (
      p_user_id,
      v_persona_id,
      (p_profile->>'bond_exp')::INTEGER,
      (p_profile->>'relationship_level')::INTEGER,
      p_profile->>'current_mode',
      NULLIF(p_profile->>'mode_expires_at', '')::TIMESTAMPTZ,
      NULLIF(p_profile->>'preferred_address', ''),
      (p_profile->>'last_interaction_at')::TIMESTAMPTZ,
      (p_profile->>'completed_tasks_count')::INTEGER,
      NULLIF(p_profile->>'history_deleted_at', '')::TIMESTAMPTZ,
      p_expected_profile_version + 1,
      NOW()
    );
  END IF;

  SELECT to_jsonb(cp)
  INTO v_profile
  FROM public.companion_profiles cp
  WHERE cp.user_id = p_user_id AND cp.persona_id = v_persona_id;

  RETURN jsonb_build_object(
    'recorded', TRUE,
    'bond_delta', COALESCE((p_event->>'bond_delta')::INTEGER, 0),
    'profile', v_profile
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_companion_event_and_profile(UUID, INTEGER, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_companion_event_and_profile(UUID, INTEGER, JSONB, JSONB)
  TO service_role;

-- 단일 기억 삭제와 tombstone 생성을 같은 트랜잭션에서 처리한다.
CREATE OR REPLACE FUNCTION public.delete_companion_memory(
  p_user_id UUID,
  p_memory_id UUID,
  p_key_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_version BIGINT := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
BEGIN
  IF p_user_id IS NULL OR p_memory_id IS NULL OR p_key_hash IS NULL OR p_key_hash = '' THEN
    RAISE EXCEPTION 'invalid_delete_companion_memory_arguments';
  END IF;

  DELETE FROM public.companion_memories
  WHERE user_id = p_user_id AND id = p_memory_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO public.companion_deletion_tombstones (
      user_id,
      resource_type,
      resource_key_hash,
      deletion_version,
      deleted_at,
      expires_at
    ) VALUES (
      p_user_id,
      'memory',
      p_key_hash,
      v_version,
      NOW(),
      NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (user_id, resource_key_hash) DO UPDATE SET
      deletion_version = EXCLUDED.deletion_version,
      deleted_at = EXCLUDED.deleted_at,
      expires_at = EXCLUDED.expires_at;
  END IF;

  IF v_deleted > 0 THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.companion_deletion_tombstones
    WHERE user_id = p_user_id
      AND resource_type = 'memory'
      AND resource_key_hash = p_key_hash
      AND expires_at > NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_companion_memory(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_companion_memory(UUID, UUID, TEXT)
  TO service_role;

-- 삭제 job을 검증한 서버(service_role)만 호출한다. 함수 전체가 단일 트랜잭션이다.
DROP FUNCTION IF EXISTS public.delete_companion_data(UUID, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.delete_companion_data(
  p_job_id UUID,
  p_user_id UUID,
  p_scope TEXT,
  p_persona_id TEXT DEFAULT NULL,
  p_preserve_relationship BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_memories INTEGER := 0;
  v_events INTEGER := 0;
  v_profiles INTEGER := 0;
  v_snapshots INTEGER := 0;
  v_episodes INTEGER := 0;
  v_transitions INTEGER := 0;
  v_claimed INTEGER := 0;
  v_counts JSONB;
  v_version BIGINT := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
BEGIN
  IF p_scope NOT IN ('all', 'persona', 'growth', 'memories') THEN
    RAISE EXCEPTION 'invalid_companion_deletion_scope';
  END IF;
  IF p_scope = 'persona' AND (p_persona_id IS NULL OR p_persona_id = '') THEN
    RAISE EXCEPTION 'persona_id_required';
  END IF;
  UPDATE public.companion_deletion_jobs
  SET status = 'in_progress', started_at = NOW()
  WHERE id = p_job_id
    AND user_id = p_user_id
    AND scope = p_scope
    AND persona_id IS NOT DISTINCT FROM p_persona_id
    AND preserve_relationship = p_preserve_relationship
    AND status = 'pending'
    AND expires_at > NOW();
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed <> 1 THEN
    RAISE EXCEPTION 'invalid_companion_deletion_job';
  END IF;

  IF p_scope IN ('all', 'memories', 'persona') THEN
    INSERT INTO public.companion_deletion_tombstones (
      user_id,
      resource_type,
      resource_key_hash,
      deletion_version,
      deleted_at,
      expires_at
    )
    SELECT
      user_id,
      'memory',
      'hash_' || md5(user_id::TEXT || ':' || id::TEXT),
      v_version,
      NOW(),
      NOW() + INTERVAL '30 days'
    FROM public.companion_memories
    WHERE user_id = p_user_id
      AND (p_scope <> 'persona' OR persona_scope = p_persona_id)
    ON CONFLICT (user_id, resource_key_hash) DO UPDATE SET
      deletion_version = EXCLUDED.deletion_version,
      deleted_at = EXCLUDED.deleted_at,
      expires_at = EXCLUDED.expires_at;

    DELETE FROM public.companion_memories
    WHERE user_id = p_user_id
      AND (p_scope <> 'persona' OR persona_scope = p_persona_id);
    GET DIAGNOSTICS v_memories = ROW_COUNT;
  END IF;

  IF p_scope IN ('all', 'growth', 'persona') THEN
    DELETE FROM public.companion_events
    WHERE user_id = p_user_id
      AND (p_scope <> 'persona' OR persona_id = p_persona_id);
    GET DIAGNOSTICS v_events = ROW_COUNT;
  END IF;

  IF p_scope IN ('all', 'persona') OR (p_scope = 'growth' AND NOT p_preserve_relationship) THEN
    DELETE FROM public.companion_episodes
    WHERE user_id = p_user_id
      AND (p_scope <> 'persona' OR persona_id = p_persona_id);
    GET DIAGNOSTICS v_episodes = ROW_COUNT;

    DELETE FROM public.companion_transitions
    WHERE user_id = p_user_id
      AND (p_scope <> 'persona' OR persona_id = p_persona_id);
    GET DIAGNOSTICS v_transitions = ROW_COUNT;

    DELETE FROM public.companion_profiles
    WHERE user_id = p_user_id
      AND (p_scope <> 'persona' OR persona_id = p_persona_id);
    GET DIAGNOSTICS v_profiles = ROW_COUNT;
  ELSIF p_scope = 'growth' AND p_preserve_relationship THEN
    UPDATE public.companion_profiles
    SET history_deleted_at = NOW(),
        version = version + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  IF p_scope IN ('all', 'growth') THEN
    DELETE FROM public.growth_snapshots WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_snapshots = ROW_COUNT;
  END IF;

  IF p_scope IN ('all', 'growth', 'persona') THEN
    INSERT INTO public.companion_deletion_tombstones (
      user_id,
      resource_type,
      resource_key_hash,
      deletion_version,
      deleted_at,
      expires_at
    ) VALUES (
      p_user_id,
      CASE WHEN p_scope = 'all' THEN 'all'
           WHEN p_scope = 'growth' THEN 'growth'
           ELSE 'profile' END,
      'hash_' || md5(p_user_id::TEXT || ':' || p_scope || ':' || COALESCE(p_persona_id, 'all')),
      v_version,
      NOW(),
      NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (user_id, resource_key_hash) DO UPDATE SET
      deletion_version = EXCLUDED.deletion_version,
      deleted_at = EXCLUDED.deleted_at,
      expires_at = EXCLUDED.expires_at;
  END IF;

  v_counts := jsonb_build_object(
    'memories', v_memories,
    'events', v_events,
    'profiles', v_profiles,
    'snapshots', v_snapshots,
    'episodes', v_episodes,
    'transitions', v_transitions
  );

  UPDATE public.companion_deletion_jobs
  SET status = 'completed',
      deleted_counts = v_counts,
      completed_at = NOW(),
      confirm_token_hash = 'consumed'
  WHERE id = p_job_id AND user_id = p_user_id;

  RETURN v_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_companion_data(UUID, UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_companion_data(UUID, UUID, TEXT, TEXT, BOOLEAN)
  TO service_role;
