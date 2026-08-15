# 14. CoffeeTide 데이터·저장소·AI 지식 구조 계획

> 상태: 핵심 기반 구현 및 자동 검증 완료 — 원격 Supabase·다중 기기·모바일 검증 진행 중
> 목적: 비용, 음성, 회의록, 문서, 업무를 AI가 안전하게 연결해 활용할 수 있도록 데이터 정본과 저장소 역할을 먼저 확정한다.

---

## 1. 결정 요약

CoffeeTide의 목표 구조는 다음과 같이 고정한다.

1. **Supabase Postgres**는 로그인 사용자의 구조화 데이터 정본이다.
2. **Supabase Storage 비공개 버킷**은 CoffeeTide 내부에서 여러 기기가 함께 사용해야 하는 첨부 원본의 기본 저장소다.
3. **Google Drive**는 사용자가 선택한 원문 백업·외부 문서 연결·내보내기 대상이며, 업무 상태 데이터베이스로 사용하지 않는다.
4. **IndexedDB**는 오프라인 캐시, 동기화 대기열, 사용자가 로컬 전용으로 지정한 원문을 담당한다.
5. **localStorage**에는 테마와 화면 상태처럼 작고 다시 만들 수 있는 UI 설정만 둔다.
6. AI 요약·분류·추출 결과는 원문을 덮어쓰지 않고 별도 파생 데이터로 저장하며 항상 근거를 추적할 수 있어야 한다.
7. 게스트는 로컬 전용으로 동작하고, 로그인할 때 로컬과 클라우드를 덮어쓰기 없이 병합한다.

```text
사용자 입력·외부 연동
        ↓
정규화된 항목(unified_items)
        ├─ 구조화 상세(비용·일정 등)
        ├─ 원문/첨부(content_assets)
        ├─ 항목 간 관계(item_relations)
        └─ AI 파생 결과(ai_artifacts / content_chunks)
        ↓
AI 바리스타 검색·브리핑·행동 초안
        ↓
사용자 확인 후 실제 업무·Calendar·Drive 반영
```

---

## 2. 현재 구현 상태

| 데이터 | 현재 저장 | 문제 |
|---|---|---|
| 직접 입력·붙여넣기 업무 | localStorage + Supabase `unified_items` | 브라우저와 클라우드 중 어느 쪽이 최신인지 버전 기준이 없다. |
| 진행 메모·하위작업 | 별도 localStorage | 다른 기기로 동기화되지 않으며 `unified_items.work_note/sub_tasks`와 실제 UI 상태가 분리돼 있다. |
| 붙여넣기 원문 | `manualItems.rawContent`, 선택 시 IndexedDB, Google Drive | Supabase 어댑터가 `rawContent`를 저장하지 않아 기기 간 복원되지 않는다. |
| Google Drive 링크 | `UnifiedData.driveUrl` | Supabase 어댑터가 저장하지 않아 클라우드 복원 시 사라진다. |
| 회의록 Drive 백업 | Google 연동 시 `CoffeeTide/YYYY-MM-DD/` | 백업 설정값을 서버가 검사하지 않아 설정을 꺼도 저장될 수 있다. |
| 업로드 문서 | 추출 텍스트는 업무 항목, 선택 시 Drive 원본 저장 | 원본 파일과 생성된 업무 사이의 명시적 관계·해시·버전이 없다. |
| Spark 브리핑 | Supabase `spark_briefings` | 일반 업무·문서와의 관계가 제목/본문 수준에 머문다. |
| AI 결과 | 주로 즉시 응답 또는 항목 필드 | 모델, 근거, 입력 버전, 재생성 여부를 추적할 공통 구조가 없다. |

### 2.1 우선 해결해야 할 위험

- 첫 클라우드 로딩이 로컬 배열을 그대로 교체하므로 로그인 전 로컬 데이터와 기존 클라우드 데이터가 충돌할 수 있다.
- 전체 목록 교체형 동기화는 여러 기기에서 동시에 수정할 때 최신 변경을 잃을 수 있다.
- localStorage 약 5MB 한도에 원문이 포함된 업무 전체를 저장한다.
- 원문, AI 요약, 사용자가 수정한 최종본이 한 항목 안에서 구분되지 않는다.
- 삭제가 로컬, Supabase, Drive 원본에 각각 어떤 의미인지 정책이 없다.

---

## 3. 저장소별 책임

### 3.1 Supabase Postgres — 구조화 데이터 정본

다음 데이터는 로그인 사용자의 Supabase를 정본으로 한다.

- 업무, 메모, 회의, 비용, 일정 초안의 공통 메타데이터
- 상태, 마감일, 담당자, 태그, 진행 메모, 하위작업
- 비용 금액·통화·분류·결제수단·발생일
- 항목 간 관계와 AI 파생 결과 메타데이터
- 동기화 버전, 삭제 표식, 생성·수정 이력
- 사용자 저장·AI 처리·원문 보관 정책

모든 테이블은 `user_id` 기준 RLS를 적용한다. 서버 전용 OAuth 토큰과 승인 데이터는 현재처럼 사용자 클라이언트에서 직접 읽을 수 없게 유지한다.

### 3.2 Supabase Storage — 앱 내부 비공개 첨부

다른 PC와 모바일에서 동일하게 접근해야 하는 다음 파일을 저장한다.

- 사용자가 보관을 선택한 영수증 이미지
- 사용자가 보관을 선택한 음성 원본
- Drive에 저장하지 않은 업로드 원본
- AI 처리를 위해 잠시 유지해야 하는 첨부

기본 버킷은 비공개로 하고 `user_id` 경로와 RLS를 적용한다. 음성은 기본적으로 텍스트 변환 후 폐기하며 사용자가 원본 보관을 선택한 경우에만 영구 저장한다.

### 3.3 Google Drive — 사용자 소유 문서 보관소

Google Drive는 다음 용도로 제한한다.

- 회의록·메모 원문의 선택적 마크다운 백업
- 사용자가 승인한 AI 보고서 내보내기
- 기존 Drive 문서를 CoffeeTide 항목에 연결
- 사용자가 장기 보관을 선택한 자료의 미러링

Drive에는 CoffeeTide의 완료 상태, 태그, 관계 그래프를 정본으로 저장하지 않는다. CoffeeTide DB에는 Drive `fileId`, `webViewLink`, `modifiedTime`, 콘텐츠 해시만 보관한다.

### 3.4 IndexedDB — 로컬 캐시와 오프라인 작업

- 정규화 항목의 최근 캐시
- 네트워크 복구 후 서버로 보낼 변경 대기열
- 로컬 전용 원문과 개인 PC 전용 파일 핸들
- 녹음 중인 임시 오디오 조각

브라우저 데이터를 지우면 사라질 수 있다는 사실을 UI에 표시한다. IndexedDB를 로그인 사용자의 유일한 정본으로 사용하지 않는다.

### 3.5 localStorage — UI 설정만

- 테마, 선택 탭, 접힘 상태
- 최근 사용 입력 방식
- 개인정보가 없는 소형 사용자 환경 설정

업무 본문, 회의록 원문, 비용 내역, 음성 데이터는 단계적으로 localStorage에서 제거한다.

---

## 4. 공통 데이터 모델

기존 `unified_items`를 즉시 폐기하지 않고 공통 루트 항목으로 확장한다.

### 4.1 `unified_items` — 모든 자료의 공통 항목

추가할 핵심 필드:

| 필드 | 설명 |
|---|---|
| `item_type` | `task`, `note`, `meeting`, `expense`, `document`, `voice`, `briefing`, `reference` |
| `source_ref` | 외부 원본 식별자 또는 첨부 ID |
| `occurred_at` | 업무 생성일과 별개인 실제 발생 시각 |
| `attributes` | 유형별 보조 구조화 값. 반복 조회가 필요한 값은 전용 테이블로 승격한다. |
| `version` | 낙관적 동시성 제어용 증가 버전 |
| `deleted_at` | 여러 기기에 삭제를 전달하기 위한 tombstone |
| `privacy_scope` | `local_only`, `cloud_private`, `external_allowed` |
| `ai_policy` | `disabled`, `local_only`, `cloud_allowed` |

현재 별도 localStorage에 있는 진행 메모와 하위작업은 `unified_items.work_note/sub_tasks`로 합치고 Supabase와 동기화한다.

### 4.2 `expense_entries` — 비용 구조화 상세

비용은 합계와 기간 조회가 필요하므로 JSON에만 넣지 않고 전용 테이블을 사용한다.

- `item_id`, `user_id`
- `amount`, `currency`
- `merchant`, `expense_category`
- `payment_method`
- `occurred_at`
- `receipt_asset_id`
- `project_item_id`
- `tax_deductible`, `reimbursable`

### 4.3 `content_assets` — 원문과 첨부 위치

- `id`, `user_id`, `item_id`
- `kind`: `document`, `image`, `audio`, `raw_text`
- `provider`: `supabase`, `google_drive`, `local_indexeddb`, `external_url`
- `provider_ref`: Storage 경로 또는 Drive fileId
- `mime_type`, `size_bytes`, `sha256`
- `retention_policy`, `expires_at`
- `created_at`, `deleted_at`

하나의 항목이 로컬 원문과 Drive 백업을 함께 가질 수 있으므로 파일 위치를 업무 필드 하나에 직접 넣지 않는다.

### 4.4 `item_relations` — 자료 간 연관성

- `from_item_id`, `to_item_id`
- `relation_type`
- `created_by`: `user`, `rule`, `ai`
- `confidence`
- `evidence`
- `confirmed_at`

초기 관계 유형:

| 관계 | 예시 |
|---|---|
| `derived_from` | 회의 녹음에서 회의록이 생성됨 |
| `contains_task` | 회의록에서 업무가 추출됨 |
| `expense_for` | 택시 비용이 고객 미팅과 연결됨 |
| `attachment_of` | 영수증이 비용 항목에 연결됨 |
| `follow_up_of` | 후속 업무가 기존 메일에서 생성됨 |
| `related_to` | 사용자가 직접 연관 자료로 지정함 |
| `supersedes` | 수정본이 이전 AI 요약을 대체함 |

AI가 만든 관계는 신뢰도와 근거를 남기며 중요한 연결은 사용자가 확인한다.

### 4.5 `ai_artifacts` — AI 파생 결과와 출처

- `item_id`, `artifact_type`: 요약, 전사, 업무 추출, 비용 추출, 태그, 브리핑
- `content_text`, `content_json`
- `provider`, `model`, `prompt_version`
- `source_hash`, `source_version`
- `status`: `current`, `stale`, `rejected`, `accepted`
- `created_at`, `accepted_at`

원문이 바뀌면 기존 결과를 삭제하지 않고 `stale`로 표시한다. 사용자가 편집해 확정한 값과 AI 초안을 구분한다.

### 4.6 `content_chunks` — 검색용 파생 인덱스

RAG가 필요해지는 단계에서 추가한다.

- 원문 전체를 매 질문마다 모델에 보내지 않는다.
- 문서·회의록을 의미 단위로 분할하고 원본 항목·페이지·시간 구간을 연결한다.
- 로컬 임베딩과 클라우드 임베딩을 구분하고 사용 정책을 기록한다.
- 검색 결과는 사용자, 기간, 자료 유형, 관계를 먼저 필터링한 뒤 유사도를 계산한다.

---

## 5. 수집부터 AI 행동까지의 표준 흐름

```text
1. Capture
   텍스트·음성·파일·메일·Drive·Spark 수신
2. Persist source
   원문 보관 정책 확인 후 asset 저장 또는 즉시 폐기
3. Normalize
   unified_items와 유형별 상세 생성
4. Derive
   전사·요약·업무/비용/일정 후보 생성
5. Relate
   기존 프로젝트·회의·사람·업무와 관계 후보 생성
6. Review
   사용자가 구조화 값과 중요한 관계를 확인
7. Act
   업무 등록, Calendar·Drive 외부 쓰기는 기존 승인 흐름 사용
8. Retrieve
   AI 바리스타가 관계와 근거를 포함해 검색·브리핑
```

AI 응답은 최소한 다음 출처 정보를 포함해야 한다.

- 어떤 항목과 원문을 근거로 사용했는지
- 원문이 로컬 전용인지 클라우드 AI 사용 허용인지
- AI 결과가 최신 원문 버전으로 생성됐는지
- 사용자가 확정한 사실과 AI 추론이 무엇인지

---

## 6. 동기화 정책

### 6.1 로그인과 최초 병합

- 게스트 항목에도 충돌하지 않는 영구 ID를 생성한다.
- 로그인 시 `로컬 덮어쓰기`나 `클라우드 덮어쓰기`를 하지 않는다.
- ID가 같으면 `version`과 `updated_at`을 비교한다.
- ID가 다르고 해시가 같으면 중복 후보로 표시한다.
- 자동 병합이 불가능하면 양쪽 사본을 보존하고 사용자에게 선택을 요청한다.

### 6.2 여러 기기 변경

- 변경 단위 API와 낙관적 버전을 사용한다.
- 삭제는 즉시 물리 삭제하지 않고 tombstone을 먼저 동기화한다.
- 오프라인 변경은 IndexedDB 대기열에 저장했다가 순서대로 재전송한다.
- 전체 목록 읽기 후 없는 항목을 일괄 삭제하는 현재 방식은 단계적으로 제거한다.

### 6.3 상태 표시

설정 또는 데이터 관리 화면에서 다음을 확인할 수 있어야 한다.

- 현재 정본 저장소와 로그인 사용자
- 마지막 동기화 시각과 실패 건수
- 로컬 전용·클라우드 저장·Drive 백업 항목 수
- 오프라인 변경 대기 건수
- AI 처리 허용 범위와 원본 보관 정책

---

## 7. 개인정보와 보존 정책

| 자료 | 기본 정책 |
|---|---|
| 짧은 음성 입력 | 전사 후 원본 즉시 폐기 |
| 음성메모 | 사용자가 `원본 보관`을 선택한 경우만 비공개 Storage 저장 |
| 영수증 | 비용 확인 후 사용자가 보관 여부 선택 |
| 회의록 원문 | Supabase 비공개 또는 로컬 전용 중 선택, Drive 백업은 별도 옵션 |
| AI 전송 | 항목별 `ai_policy`를 검사하고 요청 전에 전송 범위를 표시 |
| 삭제 | DB, Storage, 검색 인덱스는 함께 삭제. Drive 원본 삭제는 별도 사용자 승인 |

사용자는 자신의 구조화 데이터, 원문 위치, AI 파생 결과를 한 번에 내보내고 삭제할 수 있어야 한다.

---

## 8. UI 적용 원칙

### 8.1 빠른 추가

```text
[업무] [메모·회의록] [비용] [더보기]       [마이크]
```

- 마이크는 모든 입력 유형에서 사용하는 공통 입력 수단이다.
- 비용 모드에서는 금액·분류를, 회의 모드에서는 전문·요약·할 일을 추출한다.
- AI가 추출한 값은 입력창과 확인 카드에 먼저 표시하고 자동 확정하지 않는다.

### 8.2 AI 바리스타

- 답변마다 사용한 자료와 연결 관계를 접어서 보여준다.
- `이 회의와 관련된 비용`, `이 업무가 나온 원문`, `이 보고서의 후속 업무`를 이동할 수 있다.
- 원문과 AI 요약을 구분하고 오래된 AI 결과에는 갱신 필요 표시를 한다.

### 8.3 데이터 관리

설정에 `데이터·보관` 영역을 두고 Supabase, Drive, 이 기기의 IndexedDB 역할을 사용자 언어로 설명한다.

---

## 9. 단계별 전환 계획

### Phase 0 — 즉시 안전 보완

구현 문서: [`spec/phase14-01-storage-safety.md`](./spec/phase14-01-storage-safety.md)

- [ ] `/api/tasks/extract`가 `saveToDrive`를 실제로 검사하도록 수정
- [ ] 설정 화면에 현재 저장 위치와 마지막 동기화 상태 표시
- [ ] `rawContent`, `driveUrl`, 진행 메모, 하위작업의 저장 누락 테스트 작성
- [ ] 신규 비용·음성 영구 저장 구현은 Phase 1 결정 전까지 보류

### Phase 1 — 데이터 계약과 마이그레이션

구현 문서: [`spec/phase14-02-data-contract-schema.md`](./spec/phase14-02-data-contract-schema.md)

- [ ] `unified_items` 확장 마이그레이션 작성
- [ ] `expense_entries`, `content_assets`, `item_relations`, `ai_artifacts` 생성
- [ ] RLS, 인덱스, 삭제 정책 검증
- [ ] 기존 localStorage/IndexedDB/Drive 링크의 마이그레이션 경로 작성

### Phase 2 — 동기화 계층 교체

구현 문서: [`spec/phase14-03-sync-offline.md`](./spec/phase14-03-sync-offline.md)

- [ ] 전체 목록 교체형 동기화를 항목 단위 변경 API로 전환
- [ ] IndexedDB 캐시·오프라인 대기열 구현
- [ ] 로그인 최초 병합과 다중 기기 충돌 UI 구현
- [ ] localStorage에서 업무 본문 제거

### Phase 3 — 원문과 관계 관리

구현 문서: [`spec/phase14-04-assets-relations-ai-artifacts.md`](./spec/phase14-04-assets-relations-ai-artifacts.md)

- [ ] 첨부 저장 정책과 Storage 비공개 버킷 구현
- [ ] 문서·회의·업무·비용의 명시적 관계 추가
- [ ] AI 파생 결과의 모델·근거·버전 저장
- [ ] 자료 상세 화면에 연관 항목과 출처 표시

### Phase 4 — 비용·음성 빠른 추가

구현 문서: [`spec/phase14-05-cost-voice-quick-capture.md`](./spec/phase14-05-cost-voice-quick-capture.md)

- [ ] 업무·메모·비용 빠른 추가 메뉴
- [ ] 공통 음성 텍스트 입력
- [ ] 비용 구조화 추출과 확인 카드
- [ ] 회의 녹음 → 전사 → 요약 → 업무 관계 생성

### Phase 5 — AI 지식 검색

구현 문서: [`spec/phase14-06-ai-knowledge-retrieval.md`](./spec/phase14-06-ai-knowledge-retrieval.md)

- [ ] 문서 분할·임베딩 정책 확정
- [ ] 관계·기간·유형 필터를 포함한 검색 구현
- [ ] AI 바리스타 답변의 출처와 최신성 표시
- [ ] 로컬 AI와 Gemini의 동일 데이터 접근 정책 적용

---

## 10. 검증 기준

- [ ] 같은 계정으로 PC와 모바일에서 업무·비용·관계가 동일하게 보인다.
- [ ] 오프라인에서 추가한 항목이 복구 후 중복 없이 동기화된다.
- [ ] Drive 백업을 끄면 Drive API 쓰기가 발생하지 않는다.
- [ ] 원문 보관을 끈 음성은 전사 완료 후 어떤 저장소에도 남지 않는다.
- [ ] `local_only` 자료가 Gemini 요청에 포함되지 않는다.
- [ ] 원문 수정 후 기존 AI 요약이 `stale`로 표시된다.
- [ ] AI 답변에서 사용한 항목과 원문 위치를 확인할 수 있다.
- [ ] 계정 데이터 삭제 시 Supabase DB·Storage·검색 인덱스가 함께 정리된다.
- [ ] Drive 파일 삭제는 별도 승인 없이는 실행되지 않는다.

---

## 11. 구현 전 확정값

| 결정 항목 | 권장값 |
|---|---|
| 로그인 사용자 구조화 데이터 정본 | Supabase Postgres |
| 앱 내부 첨부 기본 저장소 | Supabase Storage 비공개 버킷 |
| Google Drive 역할 | 선택적 백업·연결·내보내기 |
| 로컬 저장 역할 | 캐시·오프라인·명시적 로컬 전용 |
| 음성 원본 기본값 | 전사 후 폐기 |
| AI 결과 | 원문과 분리된 버전 관리 파생 데이터 |
| 중요 AI 관계 | 사용자 확인 후 확정 |
| 외부 쓰기 | 기존 미리보기·1회 승인 흐름 유지 |

이 기준이 확정되면 Phase 0부터 순서대로 구현하며 비용·음성 기능은 같은 데이터 계약 위에 추가한다.
