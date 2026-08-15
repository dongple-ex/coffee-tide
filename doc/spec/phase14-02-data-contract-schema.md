# Phase 14-02. 공통 데이터 계약·Supabase 스키마 구현

> 상위 로드맵: [`phase14-00-execution-roadmap.md`](./phase14-00-execution-roadmap.md)
> 선행 조건: Phase 14-01 Gate A 완료
> 완료 게이트: Gate B
> 상태: 스키마·매퍼 구현 및 로컬 자동 검증 완료, 원격 DB 적용 검증 필요

---

## 1. 목표

업무, 메모, 회의, 문서, 비용, 음성과 AI 결과가 같은 ID·권한·버전 규칙을 사용하도록 데이터 계약을 확정한다. 기존 `unified_items`를 호환성 있게 확장하고 신규 관계형 테이블을 추가한다.

### 완료 후 보장

- 기존 업무와 새 비용·음성 항목이 하나의 공통 루트 ID로 연결된다.
- 원문 위치, 관계, AI 결과를 별도 테이블로 표현할 수 있다.
- Supabase 왕복 시 현재 `UnifiedData` 필드가 손실되지 않는다.
- 구 버전 화면은 새 스키마에서도 기존 업무를 계속 읽고 쓸 수 있다.

---

## 2. 범위

### 포함

- TypeScript 공통 데이터 타입 확장
- `unified_items` 전방 호환 컬럼 추가
- `expense_entries`, `content_assets`, `item_relations`, `ai_artifacts` 테이블
- RLS·외래키·인덱스·제약조건
- DB 행 ↔ 애플리케이션 타입 매퍼 분리
- 스키마 왕복·RLS 테스트
- 기존 로컬 데이터 마이그레이션 명세

### 제외

- 항목 단위 동기화 API 전환
- 실제 파일 업로드와 Storage 버킷
- 음성 녹음 UI
- 임베딩과 RAG
- 운영 데이터의 즉시 백필·삭제

---

## 3. TypeScript 계약

### 3.1 공통 항목

```ts
type WorkspaceItemType =
  | "task"
  | "note"
  | "meeting"
  | "expense"
  | "document"
  | "voice"
  | "briefing"
  | "reference";

type PrivacyScope = "local_only" | "cloud_private" | "external_allowed";
type AiPolicy = "disabled" | "local_only" | "cloud_allowed";

interface WorkspaceItem extends UnifiedData {
  itemType: WorkspaceItemType;
  sourceRef?: string;
  occurredAt?: string;
  attributes?: Record<string, unknown>;
  version: number;
  deletedAt?: string;
  privacyScope: PrivacyScope;
  aiPolicy: AiPolicy;
  updatedAt: string;
}
```

호환 규칙:

- 기존 항목의 `itemType` 기본값은 `task` 또는 소스 기반 결정값이다.
- 기존 `id: string`을 유지하고 신규 ID는 UUID 문자열을 사용한다.
- `created_at`은 외부 호환을 위해 즉시 제거하지 않고 `createdAt` 변환 경계에서 매핑한다.
- 알 수 없는 `attributes`는 읽기·쓰기 왕복에서 버리지 않는다.
- DB 타입과 UI 타입 사이 변환은 `syncAdapter.ts` 안의 임의 캐스팅이 아니라 전용 매퍼에서 수행한다.

### 3.2 비용

```ts
interface ExpenseEntry {
  itemId: string;
  amount: string;
  currency: string;
  merchant?: string;
  category?: string;
  paymentMethod?: string;
  occurredAt: string;
  receiptAssetId?: string;
  projectItemId?: string;
  taxDeductible: boolean;
  reimbursable: boolean;
}
```

금액은 JavaScript 부동소수점 오차를 피하기 위해 API에서 문자열로 전달하고 DB에서 `NUMERIC`으로 저장한다.

### 3.3 원문·관계·AI 결과

공통 타입은 각각 `ContentAsset`, `ItemRelation`, `AiArtifact`로 분리한다. 모든 타입에 `userId`를 클라이언트가 임의 지정하지 않으며 서버 세션에서 주입한다.

---

## 4. Supabase 마이그레이션

제안 파일:

```text
supabase/migrations/20260814_data_knowledge_foundation.sql
```

### 4.1 `unified_items` 확장

```sql
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
```

제약조건은 기존 잘못된 값으로 마이그레이션이 막히지 않도록 컬럼 추가와 데이터 점검 후 별도 구문으로 적용한다.

### 4.2 `expense_entries`

```text
PK: (user_id, item_id)
FK: (user_id, item_id) → unified_items(user_id, id)
amount: NUMERIC(18, 4), amount >= 0
currency: TEXT, ISO 4217 대문자 3자
occurred_at: TIMESTAMPTZ
receipt_asset_id: UUID nullable
project_item_id: TEXT nullable
```

사용자·발생일 인덱스와 사용자·분류·발생일 인덱스를 추가한다.

### 4.3 `content_assets`

```text
id: UUID PK
user_id: UUID
item_id: TEXT
kind: document | image | audio | raw_text
provider: supabase | google_drive | local_indexeddb | external_url
provider_ref: TEXT
mime_type, size_bytes, sha256
retention_policy: transient | user_kept | source_owned | local_only
expires_at, created_at, deleted_at
```

- `provider_ref`는 공급자 내부 식별자이며 비공개 Storage의 공개 URL을 저장하지 않는다.
- 동일 사용자의 `(provider, provider_ref)` 중복을 방지한다.
- `local_indexeddb` 자산은 다른 기기에서 원문 접근이 불가능하다는 상태를 허용한다.

### 4.4 `item_relations`

```text
id: UUID PK
user_id: UUID
from_item_id: TEXT
to_item_id: TEXT
relation_type: TEXT
created_by: user | rule | ai
confidence: REAL, 0~1
evidence: JSONB
confirmed_at, created_at, deleted_at
```

- 자기 자신을 향하는 관계는 `related_to`에서 금지한다.
- 동일 방향·동일 유형의 활성 관계는 중복 생성하지 않는다.
- 역방향 의미가 필요한 관계는 조회 계층에서 해석하고 무조건 두 행을 만들지 않는다.

### 4.5 `ai_artifacts`

```text
id: UUID PK
user_id: UUID
item_id: TEXT
artifact_type: transcription | summary | task_extract | expense_extract | tags | briefing
content_text: TEXT nullable
content_json: JSONB nullable
provider, model, prompt_version
source_hash, source_version
status: current | stale | rejected | accepted
created_at, accepted_at, deleted_at
```

`content_text`와 `content_json` 중 하나 이상이 있어야 한다. 사용자·항목·종류·상태 조회 인덱스를 추가한다.

---

## 5. RLS와 권한

모든 신규 테이블에 다음 원칙을 적용한다.

- `SELECT/INSERT/UPDATE/DELETE`: `auth.uid() = user_id`
- INSERT의 `WITH CHECK`와 UPDATE의 `USING/WITH CHECK`를 모두 설정
- 다른 사용자의 `item_id`를 참조하는 행은 복합 외래키로 차단
- `service_role` 이외의 사용자가 OAuth 자격정보와 감사 테이블을 읽지 못하는 기존 정책 유지
- soft delete 행도 본인만 조회 가능하며 기본 API에서는 제외

RLS 테스트는 사용자 A, 사용자 B, anon, service 역할을 분리해 수행한다.

---

## 6. 매퍼와 저장 계약

예상 파일:

```text
src/lib/data/contracts.ts
src/lib/data/mappers.ts
src/lib/data/validation.ts
src/lib/db/syncAdapter.ts
src/lib/types/unified.ts
```

규칙:

- DB snake_case와 앱 camelCase 변환을 한곳에서 수행한다.
- 읽기 시 기본값을 적용하되 원본 값 손실을 숨기지 않는다.
- 쓰기 전 런타임 검증을 수행한다.
- `rawContent`, `driveUrl`, `workNote`, `subTasks`, `attributes`를 왕복 보존한다.
- 사용자 ID, 버전 증가, 삭제 시각은 서버가 신뢰 경계를 가진다.
- 잘못된 enum 값은 조용히 다른 값으로 치환하지 않고 격리 또는 오류로 기록한다.

---

## 7. 기존 데이터 전환

### 7.1 DB 기본값

- 기존 `unified_items`는 기본 `item_type='task'`, `version=1`로 유지한다.
- `source='paste'`이며 회의·메모 성격이 분명한 항목은 구현 코드가 읽을 때만 추론하고 DB 일괄 변경은 하지 않는다.
- 기존 `driveUrl`은 클라이언트 localStorage에만 있을 수 있으므로 로그인 최초 병합 때 자산으로 변환한다.

### 7.2 로컬 상태

- `LS_WORK_NOTES`와 `LS_SUB_TASKS`를 항목 필드로 병합하는 변환 함수를 작성한다.
- 변환 성공 전 기존 키를 삭제하지 않는다.
- 마이그레이션 마커와 항목 수·해시를 저장한다.
- 서버 동기화 성공 후에도 한 릴리스 동안 읽기 폴백을 유지한다.

### 7.3 Drive 링크

- `driveUrl`만 있는 기존 항목은 우선 `external_url` 자산으로 생성한다.
- 후속 Google 조회로 fileId가 확인된 경우에만 provider를 `google_drive`로 승격한다.
- URL 문자열을 파싱해 fileId를 추측하지 않는다.

---

## 8. 예상 수정 파일

| 영역 | 파일 |
|---|---|
| DB | `supabase/migrations/20260814_data_knowledge_foundation.sql`, `supabase/schema.sql` |
| 타입 | `src/lib/types/unified.ts`, `src/lib/data/contracts.ts` |
| 검증·매퍼 | `src/lib/data/validation.ts`, `src/lib/data/mappers.ts` |
| 동기화 호환 | `src/lib/db/syncAdapter.ts`, `src/app/api/user/sync/route.ts` |
| 로컬 변환 | `src/lib/browser/localDataMigration.ts` |
| 테스트 | `src/lib/data/*.test.ts`, `src/lib/db/*.test.ts` |

---

## 9. 기존 기능 보호 주의사항

- `unified_items`와 기존 컬럼을 즉시 이름 변경하거나 삭제하지 않는다.
- 새 NOT NULL 컬럼은 기존 행이 읽힐 수 있는 안전한 기본값과 함께 추가한다.
- 마이그레이션 전후 사용자 수·항목 수·상태별 건수를 기록한다.
- 새 매퍼가 알 수 없는 필드를 버리지 않도록 왕복 테스트를 먼저 작성한다.
- `source`, `category`, `status`의 기존 의미를 새 `itemType`과 혼용해 변경하지 않는다.
- Spark, 외부 메일, 로컬 문서처럼 앱 정본이 아닌 수집 항목을 일괄 백필하지 않는다.
- RLS 정책 교체 중 잠시라도 테이블을 공개 상태로 두지 않는다.
- Supabase SQL 실행 실패 시 일부 적용된 객체를 확인한 뒤 재실행하며 DROP으로 되돌리지 않는다.
- 로컬 진행 메모·하위작업은 서버 반영 확인 전 기존 키에서 삭제하지 않는다.
- 새 테이블이 비어 있어도 기존 업무·브리핑·Cloud Tool이 계속 동작해야 한다.

---

## 10. 구현 순서

1. TypeScript 계약과 런타임 검증 테스트 작성
2. 전방 호환 SQL 작성
3. 빈 DB 적용·재실행 멱등성 검사
4. 기존 스키마 복제본에 적용 검사
5. RLS와 외래키 공격 테스트
6. 매퍼 구현과 왕복 테스트
7. `syncAdapter`를 새 매퍼로 교체
8. localStorage 진행 메모·하위작업 변환기 작성
9. `schema.sql`과 `01-as-built-reference.md` 갱신
10. 사용자가 Supabase SQL Editor에서 마이그레이션 실행
11. 적용 후 테이블·정책·기존 업무 건수 확인

---

## 11. 구현 후 테스트 시나리오

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| D01 | 기존 DB에 마이그레이션 2회 실행 | 오류 없이 동일 스키마 |
| D02 | 구 형식 업무 행 읽기 | 기본값 적용 후 정상 표시 |
| D03 | 새 형식 항목 DB 왕복 | 모든 필드 보존 |
| D04 | `rawContent`, `driveUrl` 왕복 | 손실 없음 |
| D05 | 진행 메모·하위작업 로컬 변환 | 항목에 병합, 기존 키 유지 |
| D06 | 사용자 B가 사용자 A 자산 조회 | RLS 거부 |
| D07 | 사용자 A 항목에 사용자 B 관계 생성 | 외래키/RLS 거부 |
| D08 | 음수 비용·잘못된 통화 | 검증 거부 |
| D09 | AI 결과에 내용 없음 | CHECK 또는 검증 거부 |
| D10 | soft delete 항목 기본 조회 | 결과에서 제외 |

추가 기존 기능 회귀 시나리오:

- 기존 계정 로그인 후 업무·상태·작성자·출처 건수가 마이그레이션 전과 같은지
- 빠른 업무 추가 후 구 UI와 새 매퍼가 같은 항목을 표시하는지
- Outlook/Gmail/Notion/Spark 항목의 배지와 링크가 유지되는지
- 진행 메모·하위작업 수정 후 새로고침·다른 기기에서 값이 보존되는지
- 기존 Cloud Tool 업무 요약이 새 `item_type` 때문에 비용·문서를 업무로 계산하지 않는지
- 마이그레이션이 적용되지 않은 로컬 개발 환경에서 명시적 오류 또는 레거시 폴백이 동작하는지

---

## 12. 완료 기준 — Gate B

- [ ] 마이그레이션을 빈 DB와 기존 DB에 각각 두 번 적용해 멱등성을 확인한다.
- [ ] 신규 테이블·컬럼·RLS·인덱스를 Supabase 원격 DB에서 확인한다.
- [ ] 서로 다른 두 사용자 세션으로 RLS 차단을 증명한다.
- [x] 구 형식과 새 형식 항목을 모두 읽는다.
- [x] 현재 `UnifiedData`의 저장 대상 필드가 왕복 보존된다.
- [x] 기존 로컬 진행 메모·하위작업 변환기가 비파괴적으로 동작한다.
- [x] lint, typecheck, test, build가 통과한다.
- [ ] 운영 적용 전후 기존 사용자·항목 건수를 기록한다.

---

## 13. 롤백

- 신규 컬럼과 테이블은 구 클라이언트가 무시할 수 있으므로 즉시 DROP하지 않는다.
- 앱 문제가 있으면 새 매퍼 기능 플래그를 끄고 기존 읽기 경로로 전환한다.
- 이미 기록된 신규 데이터는 보존하고 수정 배포 후 다시 연결한다.
- 운영 테이블 DROP, 데이터 역변환, Storage 삭제는 별도 승인 없이는 수행하지 않는다.
