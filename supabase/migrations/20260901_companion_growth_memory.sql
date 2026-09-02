-- ==============================================================================
-- CoffeeTide Phase 17: AI 컴패니언 성장·기억·관계 시스템 스키마 (v1.0)
-- 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §10
-- 주의: 이 파일은 로컬 마이그레이션 정의 파일이며 사용자의 명시적 승인 전까지 원격 DB에 실행하지 않습니다.
-- ==============================================================================

-- 1. user_profiles 테이블에 컴패니언 활성화 설정 필드 추가 (안전한 IF NOT EXISTS 컬럼 추가)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS companion_growth_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS companion_test_cohort TEXT DEFAULT NULL;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS companion_consent_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS companion_paused_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS companion_terms_version TEXT DEFAULT '2026-09-01';
  END IF;
END $$;

-- 2. companion_profiles (캐릭터별 관계 및 현재 모드)
CREATE TABLE IF NOT EXISTS companion_profiles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  bond_exp INTEGER NOT NULL DEFAULT 0 CHECK (bond_exp >= 0),
  relationship_level INTEGER NOT NULL DEFAULT 1 CHECK (relationship_level BETWEEN 1 AND 5),
  current_mode TEXT NOT NULL DEFAULT 'momentum',
  mode_expires_at TIMESTAMPTZ DEFAULT NULL,
  preferred_address TEXT DEFAULT NULL,
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_tasks_count INTEGER NOT NULL DEFAULT 0,
  history_deleted_at TIMESTAMPTZ DEFAULT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, persona_id)
);

-- 3. companion_events (서버 권위 기반 이벤트 원장)
CREATE TABLE IF NOT EXISTS companion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  authority TEXT NOT NULL CHECK (authority IN ('server_domain', 'server_receipt', 'local_provisional', 'legacy_import', 'diagnostic')),
  source_item_id UUID DEFAULT NULL,
  source_version INTEGER DEFAULT NULL,
  source_receipt_id TEXT DEFAULT NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  bond_delta INTEGER NOT NULL DEFAULT 0,
  policy_version TEXT NOT NULL DEFAULT '2026-09-01',
  credited_day DATE NOT NULL,
  credited_timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_companion_events_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_companion_events_user_day ON companion_events(user_id, credited_day);
CREATE INDEX IF NOT EXISTS idx_companion_events_persona ON companion_events(user_id, persona_id);

-- 4. companion_memories (장기 기억 및 선호)
CREATE TABLE IF NOT EXISTS companion_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_scope TEXT NOT NULL DEFAULT 'shared',
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'work_style', 'commitment', 'boundary')),
  content_text TEXT NOT NULL,
  content_json JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'active', 'rejected', 'expired', 'deleted')),
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50,
  user_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'restricted')),
  source_refs JSONB NOT NULL DEFAULT '[]'::JSONB,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  last_recalled_at TIMESTAMPTZ DEFAULT NULL,
  recall_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companion_memories_user_status ON companion_memories(user_id, status);

-- 5. companion_episodes (세션 / 일일 에피소드 요약)
CREATE TABLE IF NOT EXISTS companion_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  event_refs JSONB NOT NULL DEFAULT '[]'::JSONB,
  item_refs JSONB NOT NULL DEFAULT '[]'::JSONB,
  provider TEXT DEFAULT NULL,
  model TEXT DEFAULT NULL,
  prompt_version TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'stale', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. growth_snapshots (계정 공통 4축 성장 스냅샷)
CREATE TABLE IF NOT EXISTS growth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  insights JSONB NOT NULL DEFAULT '[]'::JSONB,
  experiment JSONB DEFAULT NULL,
  evidence_event_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  accepted_at TIMESTAMPTZ DEFAULT NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. companion_transitions (관계 단계 전이 기록)
CREATE TABLE IF NOT EXISTS companion_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  trigger_event_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  scene_key TEXT NOT NULL,
  shown_at TIMESTAMPTZ DEFAULT NULL,
  replayed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. companion_deletion_tombstones (내용 없는 30일 동기화 안전 tombstone)
CREATE TABLE IF NOT EXISTS companion_deletion_tombstones (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('memory', 'profile', 'growth', 'all')),
  resource_key_hash TEXT NOT NULL,
  deletion_version BIGINT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  PRIMARY KEY (user_id, resource_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_companion_tombstones_expires ON companion_deletion_tombstones(expires_at);

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- ==============================================================================

ALTER TABLE companion_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_deletion_tombstones ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view their own companion profiles" ON companion_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own companion profiles" ON companion_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Events: ⚠️ 클라이언트의 직접 INSERT/UPDATE/DELETE 차단 (SELECT만 허용)
CREATE POLICY "Users can view their own companion events" ON companion_events
  FOR SELECT USING (auth.uid() = user_id);
-- (INSERT/UPDATE/DELETE는 Service Role / Server Domain RPC에서만 수행)

-- Memories
CREATE POLICY "Users can view their own memories" ON companion_memories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update/delete their own memories" ON companion_memories
  FOR ALL USING (auth.uid() = user_id);

-- Episodes
CREATE POLICY "Users can view their own episodes" ON companion_episodes
  FOR SELECT USING (auth.uid() = user_id);

-- Growth Snapshots
CREATE POLICY "Users can view their own growth snapshots" ON growth_snapshots
  FOR SELECT USING (auth.uid() = user_id);

-- Transitions
CREATE POLICY "Users can view their own transitions" ON companion_transitions
  FOR SELECT USING (auth.uid() = user_id);

-- Tombstones
CREATE POLICY "Users can view their own deletion tombstones" ON companion_deletion_tombstones
  FOR SELECT USING (auth.uid() = user_id);
