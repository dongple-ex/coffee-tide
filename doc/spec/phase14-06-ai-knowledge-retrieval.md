# Phase 14-06. 관계·근거 기반 AI 지식 검색 구현

> 상위 로드맵: [`phase14-00-execution-roadmap.md`](./phase14-00-execution-roadmap.md)
> 선행 조건: Phase 14-05 Gate E 완료
> 완료 게이트: Gate F
> 상태: 정책 필터·관계/키워드 검색·근거 UI 구현 완료, 벡터/통합/모바일 검증 필요

---

## 1. 목표

AI 바리스타가 업무, 회의록, 문서, 비용, Spark 브리핑을 무작정 한 번에 모델로 보내지 않고 사용자 권한·개인정보 정책·자료 관계·최신성을 먼저 검사한 뒤 필요한 근거만 사용하도록 한다.

### 완료 후 가능한 질문

- `어제 고객 회의에서 나온 후속 업무 알려줘`
- `이 프로젝트와 관련된 비용을 정리해줘`
- `이 업무가 어디에서 나온 건지 보여줘`
- `지난주 회의와 Drive 보고서를 같이 보고 진행 상황 알려줘`
- `내 로컬 전용 문서는 외부 AI에 보내지 말고 요약해줘`

---

## 2. 범위

### 포함

- 개인정보 정책을 먼저 적용하는 검색 서비스
- 키워드·기간·유형·관계 기반 1차 검색
- 문서 chunk와 출처 위치
- 임베딩 공급자 추상화와 선택적 벡터 검색
- AI 바리스타 컨텍스트 빌더 교체
- 답변 근거·추론·최신성 UI
- AI artifact stale 처리와 재생성
- 로컬 AI·Gemini·규칙 엔진 공통 검색 계약

### 제외

- 인터넷 전체 검색 엔진
- 사용자 간 지식 공유
- 모델 학습·파인튜닝
- 무제한 원문 컨텍스트 전송
- AI의 자동 외부 쓰기 권한 확대

---

## 3. 검색 파이프라인

```text
질문
  → 사용자·세션 확인
  → 질문 의도·기간·자료 유형 파싱
  → privacy_scope / ai_policy 필터
  → 명시 관계 탐색
  → 키워드·Postgres FTS 검색
  → 필요할 때만 벡터 유사도 검색
  → 중복 제거·최신 버전 선택
  → 출처 포함 컨텍스트 패키지
  → 허용된 AI 공급자 또는 규칙 폴백
  → 근거·추론 구분 응답
```

정책 필터는 임베딩 검색과 모델 호출보다 먼저 실행한다.

---

## 4. 단계별 검색 전략

### 4.1 1단계 — 관계·메타데이터·키워드

벡터 DB를 먼저 도입하지 않는다.

- `item_relations` 직접 연결
- 제목·본문·태그의 Postgres full-text search
- `item_type`, `occurred_at`, 상태, 프로젝트 필터
- 외부 sourceRef와 사용자 확정 관계

이 경로는 빠르고 설명 가능하며 임베딩 공급자 장애에도 동작한다.

### 4.2 2단계 — 콘텐츠 chunk

```ts
interface ContentChunk {
  id: string;
  userId: string;
  itemId: string;
  assetId?: string;
  ordinal: number;
  text: string;
  sourceLocation: {
    page?: number;
    sheet?: string;
    slide?: number;
    startSeconds?: number;
    endSeconds?: number;
  };
  sourceHash: string;
  sourceVersion: number;
  privacyScope: PrivacyScope;
  aiPolicy: AiPolicy;
}
```

- PDF 페이지, Excel 시트·범위, PowerPoint 슬라이드, 음성 시간 구간을 보존한다.
- 원문 변경 시 이전 chunk를 비활성화하고 새 버전을 생성한다.
- 작은 업무 제목처럼 chunk가 불필요한 항목은 직접 검색한다.

### 4.3 3단계 — 선택적 임베딩

- `embedding` capability가 있는 공급자만 사용한다.
- `local_only` chunk는 로컬 임베딩만 허용한다.
- `cloud_private`의 클라우드 임베딩은 사용자 설정과 공급자 정책을 따른다.
- 공급자·모델·차원·sourceHash를 저장해 다른 모델 벡터를 혼합하지 않는다.
- 벡터 검색 결과도 사용자·정책 SQL 필터를 반드시 거친다.
- 임베딩이 없거나 실패하면 관계·FTS 결과로 폴백한다.

---

## 5. 검색 API 계약

```text
POST /api/knowledge/search
POST /api/knowledge/context
POST /api/knowledge/reindex
GET  /api/knowledge/status
```

검색 요청:

```ts
interface KnowledgeSearchRequest {
  query: string;
  itemTypes?: WorkspaceItemType[];
  from?: string;
  to?: string;
  relatedTo?: string;
  limit?: number;
  executionPolicy: "local_only" | "local_first" | "cloud_allowed";
}
```

검색 결과:

```ts
interface KnowledgeEvidence {
  itemId: string;
  assetId?: string;
  chunkId?: string;
  title: string;
  excerpt: string;
  sourceLocation?: ContentChunk["sourceLocation"];
  relationPath?: string[];
  sourceVersion: number;
  updatedAt: string;
  score: number;
  scoreReason: "relation" | "keyword" | "vector" | "recency";
}
```

서버는 사용자가 요청한 `limit`을 상한 정책 안에서 제한하고 컨텍스트 전체 크기도 제한한다.

---

## 6. AI 바리스타 컨텍스트 계약

모델에 전달하는 구조:

```ts
interface GroundedContextPackage {
  question: string;
  evidence: KnowledgeEvidence[];
  structuredFacts: Array<{
    key: string;
    value: string;
    itemId: string;
    userConfirmed: boolean;
  }>;
  excluded: Array<{
    reason: "privacy" | "stale" | "unavailable" | "limit";
    count: number;
  }>;
}
```

시스템 규칙:

- evidence에 없는 사실을 CoffeeTide 저장 사실처럼 단정하지 않는다.
- 사용자 확정값과 AI 추론을 구분한다.
- stale artifact는 근거로 사용하지 않거나 오래된 결과라고 명시한다.
- 답변 항목마다 최소 하나의 내부 출처 ID를 연결한다.
- 관련 자료가 없으면 일반 조언과 저장 자료 기반 답변을 구분한다.
- Spark 브리핑은 우선 노출 규칙을 유지하되 다른 자료와 연결할 때 출처를 표시한다.

---

## 7. 답변 UI

```text
AI 바리스타 답변

이번 주 고객 미팅 후속 업무는 3건입니다.
...

근거 자료 3
  8월 12일 고객 회의록 · 결정사항 2
  Drive 주간 보고서 · 3페이지
  택시비 18,500원 · 고객 미팅과 연결

AI 추론
  일정 지연 가능성은 현재 자료를 바탕으로 추정했습니다.
```

- 출처를 누르면 관련 항목과 원문 위치를 연다.
- 접근할 수 없는 로컬 전용 원문은 `이 기기에서만 열 수 있음`으로 표시한다.
- 근거와 AI 추론의 시각적 스타일을 구분한다.
- 모바일에서 출처 목록은 접을 수 있다.

---

## 8. 재색인과 최신성

- 항목·자산 version/hash 변경 이벤트가 재색인 대상을 만든다.
- 재색인은 멱등 작업 ID를 사용한다.
- 새 인덱스 성공 전 기존 인덱스를 삭제하지 않는다.
- 원문 삭제 시 검색 인덱스를 비활성화하고 후속 정리한다.
- 상태 화면에서 대기·성공·실패·마지막 색인 시각을 확인한다.
- 대량 재색인은 사용자 요청이나 유지보수 작업으로 제한하고 일반 화면 요청에서 실행하지 않는다.

---

## 9. 기존 기능 보호 주의사항

- 기존 AI 바리스타의 `/tools`, `/tool finance`, Calendar/Drive 승인형 도구를 검색 파이프라인과 혼합하지 않는다.
- Cloud Tool Registry의 정적 허용 목록과 1회 승인 정책을 유지한다.
- 검색 결과가 없거나 인덱스가 실패해도 기존 규칙 기반 브리핑이 동작해야 한다.
- Spark 최신 브리핑 상단 노출 규칙을 제거하지 않는다.
- Outlook·Gmail·Notion 수집 요청 수와 폴링 주기를 검색 때문에 늘리지 않는다.
- 검색을 위해 모든 원문을 Gemini로 선전송하지 않는다.
- 비용 통계는 AI 요약값이 아니라 구조화된 `expense_entries`를 사용한다.
- stale AI 요약을 최신 원문 대신 사용하지 않는다.
- 답변 출처 UI 추가로 기존 Q&A 접기·미읽음·탭 알림 동작이 깨지지 않게 한다.
- 검색 장애를 전체 `/api/copilot` 500 오류로 전파하지 않고 제한된 컨텍스트/폴백으로 처리한다.

---

## 10. 예상 수정 파일

```text
supabase/migrations/202608xx_knowledge_search.sql
src/app/api/knowledge/**
src/lib/knowledge/contracts.ts
src/lib/knowledge/policy.ts
src/lib/knowledge/search.ts
src/lib/knowledge/chunker.ts
src/lib/knowledge/indexer.ts
src/lib/ai/contextBuilder.ts
src/lib/ai/providers/**
src/app/api/copilot/route.ts
src/app/components/copilot/EvidencePanel.tsx
src/app/components/copilot/CopilotConversation.tsx
```

---

## 11. 구현 순서

1. 정책 필터와 유출 방지 테스트
2. 관계·메타데이터·FTS 검색 구현
3. 출처 위치를 포함한 chunker 구현
4. 인덱스 상태·재색인 큐 구현
5. 로컬·클라우드 임베딩 공급자 계약 추가
6. 선택적 벡터 검색과 키워드 폴백
7. GroundedContextPackage 생성
8. `/api/copilot` shadow 컨텍스트 비교
9. 내부 사용자에게 근거 패널 노출
10. 기존 브리핑·Cloud Tool·Spark 회귀 검증
11. 새 컨텍스트 경로 기본 활성화

---

## 12. 구현 후 테스트 시나리오

### 12.1 검색 정확성·출처

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| K01 | 회의에서 나온 후속 업무 질문 | 회의→업무 관계와 원문 출처 표시 |
| K02 | 프로젝트 관련 비용 질문 | 구조화 비용 합계와 관계 근거 사용 |
| K03 | PDF 특정 내용 질문 | 페이지 위치 포함 출처 |
| K04 | 음성메모 내용 질문 | 전사 시간 구간 또는 전사 artifact 출처 |
| K05 | 원문 수정 후 동일 질문 | stale 결과 제외, 최신 버전 사용 |
| K06 | 근거 없는 질문 | 저장 사실처럼 단정하지 않음 |

### 12.2 개인정보·권한

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| P01 | 사용자 B가 사용자 A itemId로 검색 | 결과 0 또는 권한 거부 |
| P02 | `local_only` + Gemini 경로 | 자료 제외 또는 로컬 공급자 사용 |
| P03 | `ai_policy=disabled` | chunk/임베딩/모델 컨텍스트 모두 제외 |
| P04 | 로컬 전용 원문이 다른 기기에 없음 | 메타데이터만 표시, 원문 유출 없음 |
| P05 | 삭제된 항목 | 검색·답변에 미노출 |

### 12.3 기존 기능 회귀

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| R01 | 질문 없는 기본 브리핑 | 기존 섹션과 Spark 우선 노출 유지 |
| R02 | `/tools`, `/tool finance` | Registry 실행과 결과 동일 |
| R03 | Calendar 생성 명령 | 미리보기·승인·멱등 흐름 유지 |
| R04 | Drive 보고서 저장 | 사용자 승인 전 쓰기 없음 |
| R05 | Gemini 키 없음 | 규칙/로컬 폴백으로 응답 |
| R06 | 검색 DB 장애 | 기존 제한 컨텍스트 또는 폴백 답변 |
| R07 | Q&A 접기·미읽음 탭 효과 | 기존 UI 상태 정상 |
| R08 | 모바일 근거 패널 | 본문 가림·가로 스크롤 없음 |

### 12.4 성능

- 일반 질문에서 전체 원문을 읽지 않는지
- 검색 결과와 모델 컨텍스트 상한이 적용되는지
- 같은 sourceHash를 반복 임베딩하지 않는지
- 인덱싱 실패가 사용자 입력 응답을 장시간 막지 않는지
- 대량 자료에서도 사용자·기간 필터가 벡터 계산보다 먼저 적용되는지

---

## 13. 중단 조건

- 다른 사용자의 제목·excerpt·벡터가 노출됨
- `local_only` 원문이 클라우드 AI로 전송됨
- 근거 없는 모델 문장을 저장 사실로 표시함
- stale 결과가 최신으로 표시됨
- 검색 장애로 기본 브리핑·Cloud Tool이 중단됨
- 컨텍스트 증가로 기존 응답 시간·비용 상한을 크게 초과함
- 출처 클릭이 잘못된 사용자 또는 원문 위치를 엶

---

## 14. 완료 기준 — Gate F

- [ ] 벡터 검색을 도입할 경우 관계·키워드 검색과 같은 정책 계약에 연결한다. (현재 관계·키워드만 구현)
- [ ] 답변에서 근거 항목·원문 위치·최신성을 E2E로 확인한다.
- [x] 사용자·privacyScope·aiPolicy 필터가 검색 전에 적용된다.
- [ ] 로컬 전용 자료의 외부 전송 차단을 서버 통합 테스트로 증명한다.
- [ ] stale·삭제·접근 불가 자료가 최신 근거로 사용되지 않는지 통합 테스트한다.
- [ ] 검색 장애 시 기존 AI 바리스타와 규칙 폴백을 브라우저에서 확인한다.
- [ ] Cloud Tool, Spark, Q&A UI 브라우저 회귀 테스트를 통과한다.
- [x] 성능·컨텍스트·모델 호출 상한이 적용된다.
- [ ] 모바일 검증을 통과한다. (`lint`, `typecheck`, `test`, `build`는 2026-08-15 통과)

---

## 15. 롤백

- 새 검색 경로를 기능 플래그로 끄고 기존 컨텍스트 빌더로 전환한다.
- 생성된 chunk·embedding은 비활성화하되 즉시 삭제하지 않는다.
- 관계·AI artifact 정본 데이터는 검색 롤백과 무관하게 보존한다.
- Cloud Tool Registry와 외부 쓰기 경로는 검색 롤백의 영향을 받지 않도록 분리한다.
