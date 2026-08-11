BEGIN;

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

COMMIT;
