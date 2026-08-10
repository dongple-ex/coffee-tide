BEGIN;

CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'notion')),
  credentials_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- 토큰은 브라우저용 anon/authenticated 역할에서 직접 읽거나 쓸 수 없다.
-- SUPABASE_SECRET_KEY를 사용하는 coffeeTide 서버만 service-role 권한으로 접근한다.
REVOKE ALL ON public.user_integrations FROM anon, authenticated;

COMMIT;
