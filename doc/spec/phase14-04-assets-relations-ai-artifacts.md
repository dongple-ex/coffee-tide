# Phase 14-04. 원문·첨부·자료 관계·AI 파생 결과 구현

> 상위 로드맵: [`phase14-00-execution-roadmap.md`](./phase14-00-execution-roadmap.md)
> 선행 조건: Phase 14-03 Gate C 완료
> 완료 게이트: Gate D
> 상태: 데이터 계약·API·조회 패널 구현 완료, Storage/Drive/모바일 E2E 검증 필요

---

## 1. 목표

문서, 회의록, 음성, 영수증 같은 원문이 어떤 항목을 만들었고 AI가 무엇을 추출했는지 추적 가능한 구조를 구현한다. 원문과 AI 결과를 업무 본문에 복사해 섞지 않는다.

### 완료 후 사용자 경험

- 업무에서 `이 업무가 나온 회의록`을 열 수 있다.
- 회의록에서 추출된 업무와 관련 비용을 함께 볼 수 있다.
- AI 요약의 근거 원문, 모델, 생성 시각, 최신 여부를 확인할 수 있다.
- Drive 파일과 CoffeeTide 비공개 첨부의 역할이 구분된다.

---

## 2. 범위

### 포함

- Supabase Storage 비공개 버킷과 자산 API
- `content_assets` 메타데이터 생성·조회·삭제
- Drive 파일 ID 기반 연결
- `item_relations` CRUD와 관계 확인 흐름
- `ai_artifacts` 저장·stale·accepted 상태
- 기존 업로드·붙여넣기 파이프라인의 출처 연결
- 항목 상세의 원문·연관 자료·AI 결과 UI

### 제외

- 음성 녹음 UI와 비용 UI
- 벡터 임베딩·RAG
- Drive 파일 자동 삭제
- AI가 관계를 자동 확정하는 기능

---

## 3. 자산 저장 정책

### 3.1 공급자 선택

| 조건 | provider | 설명 |
|---|---|---|
| 앱에서 여러 기기 사용, 사용자 보관 선택 | `supabase` | 비공개 Storage |
| 사용자가 Drive 백업·연결 선택 | `google_drive` | Drive fileId 참조 |
| 명시적 로컬 전용 | `local_indexeddb` | 현재 기기에서만 접근 |
| 외부 서비스 원문 URL | `external_url` | 인증·만료 상태 별도 표시 |

같은 원문이 Storage와 Drive에 모두 있어도 하나를 정본 위치로 지정하고 나머지는 mirror 관계로 표시한다.

### 3.2 비공개 Storage 경로

```text
private-assets/<user_id>/<asset_id>/<sanitized-filename>
```

- 브라우저가 임의 사용자 ID 경로에 업로드하지 못하도록 세션과 경로 첫 구간을 검증한다.
- 다운로드는 짧은 수명의 signed URL을 요청 시 생성한다.
- DB에는 signed URL을 저장하지 않는다.
- 파일명은 표시용이며 실제 식별자는 assetId다.
- MIME은 확장자만 신뢰하지 않고 서버에서 검사한다.

### 3.3 자산 API

```text
POST   /api/assets/initiate
POST   /api/assets/:id/complete
GET    /api/assets/:id
GET    /api/assets/:id/download
DELETE /api/assets/:id
```

작은 원문은 서버 프록시 업로드, 큰 파일은 제한된 signed upload를 사용할 수 있다. 어떤 방식이든 `complete` 단계에서 크기·해시·소유자를 검증한 뒤 자산을 활성화한다.

---

## 4. Drive 연결

- Drive 저장 응답에서 `fileId`, `webViewLink`, `modifiedTime`, 해시를 받는다.
- 기존 `driveUrl`만 있는 항목은 Phase 14-02의 외부 URL 자산으로 유지한다.
- 사용자가 다시 Google을 연결하면 fileId 확인을 제안하되 자동으로 광범위한 Drive 검색을 하지 않는다.
- Drive 토큰 만료는 자산 삭제가 아니라 `temporarily_unavailable` 상태다.
- Drive 파일 삭제는 CoffeeTide 항목 삭제와 분리하고 별도 승인을 요구한다.

---

## 5. 자료 관계 서비스

### 5.1 API

```text
GET    /api/items/:id/relations
POST   /api/items/:id/relations
PATCH  /api/relations/:relationId/confirm
DELETE /api/relations/:relationId
```

### 5.2 관계 생성 주체

- `user`: 즉시 확정
- `rule`: 결정적 규칙과 evidence를 남기고 정책에 따라 확정
- `ai`: 기본 미확정, confidence와 근거 표시

### 5.3 관계 생성 규칙

- 회의록에서 업무를 확정하면 `contains_task`를 만든다.
- 원문에서 파생된 메모·업무에는 `derived_from`을 만든다.
- 영수증을 비용에 연결하면 `attachment_of`를 만든다.
- 비용을 프로젝트/회의에 연결하면 `expense_for`를 만든다.
- 사용자가 직접 연결하면 `related_to`를 만든다.
- 동일 관계를 중복 생성하지 않는다.

---

## 6. AI 파생 결과 수명주기

```text
생성 current
  ├─ 사용자 채택 → accepted
  ├─ 사용자 거절 → rejected
  └─ 원본 version/hash 변경 → stale
```

규칙:

- AI 결과 생성 시 사용한 모든 source item/asset과 버전을 기록한다.
- 원본 수정 트랜잭션은 관련 `current` 결과를 `stale`로 표시한다.
- `accepted`는 사용자가 채택했다는 의미이지 원본 수정 후에도 최신이라는 뜻은 아니다.
- AI 결과를 다시 생성해도 이전 결과를 즉시 물리 삭제하지 않는다.
- 모델 응답 원문 전체가 필요하지 않으면 구조화 결과만 저장한다.
- 프롬프트에 민감정보가 들어간 경우 로그·감사 데이터에는 해시와 메타데이터만 남긴다.

---

## 7. 기존 파이프라인 전환

### 7.1 메모·회의록 붙여넣기

```text
원문 저장 정책 확인
  → raw_text asset 생성
  → note/meeting item 생성
  → task_extract artifact 생성
  → 사용자 확인한 task 생성
  → contains_task + derived_from 관계
  → 선택 시 Drive mirror asset
```

### 7.2 문서 업로드

```text
파일 asset
  → 파서 결과 document item
  → 페이지/시트/슬라이드 출처 메타데이터
  → 요약·업무 추출 artifact
  → 확정된 항목과 relation
```

기존 `/api/upload` 응답은 전환 기간 동안 `doc`를 유지하면서 `asset`, `relations`, `artifacts`를 추가한다.

### 7.3 Spark·메일·외부 문서

- 외부 시스템 ID를 `sourceRef`로 저장한다.
- 본문 복사본의 보관 정책과 원본 링크를 구분한다.
- 수집 재실행 시 같은 외부 항목을 중복 생성하지 않는다.
- 외부 항목에서 생성한 로컬 업무만 사용자 정본으로 저장한다.

---

## 8. UI 구성

항목 상세 또는 워크노트 영역에 세 그룹을 둔다.

```text
원문·첨부  2
  회의록 원문 · 이 앱에 비공개 보관
  Drive 백업 · Google Drive

연관 자료  3
  후속 업무 2 · 관련 비용 1

AI 분석
  회의 요약 · 최신
  업무 추출 · 원문 변경으로 갱신 필요
```

- 저장소 아이콘보다 사용자 언어로 위치를 표시한다.
- AI 결과와 원문을 같은 배경/배지로 표현하지 않는다.
- 모바일에서는 각 그룹을 접을 수 있다.
- 원문 접근 실패가 전체 항목 화면을 막지 않는다.

---

## 9. 기존 기능 보호 주의사항

- `/api/upload`와 `/api/tasks/extract`의 기존 업무 생성 결과를 갑자기 제거하지 않는다.
- `rawContent`와 `driveUrl`은 자산 전환이 검증될 때까지 이중 읽기한다.
- 기존 Drive 파일을 새 폴더로 이동·이름 변경·삭제하지 않는다.
- 외부 메일·Notion·Spark 항목을 자산 정리 작업에서 삭제하지 않는다.
- 자산 업로드 실패가 업무 추가·메모 추출을 막지 않도록 부분 실패 원칙을 유지한다.
- AI 결과 저장 실패가 사용자 확정 업무 저장을 롤백하지 않도록 트랜잭션 경계를 분리한다.
- 원문 수정으로 `stale` 처리할 때 사용자 확정 업무 상태를 되돌리지 않는다.
- 기존 AI 바리스타 응답 형식은 출처 블록을 추가하되 답변 본문 계약을 유지한다.

---

## 10. 예상 수정 파일

```text
supabase/migrations/202608xx_private_assets.sql
src/app/api/assets/**
src/app/api/items/[id]/relations/**
src/app/api/relations/**
src/lib/assets/**
src/lib/relations/**
src/lib/ai/artifacts.ts
src/app/api/upload/route.ts
src/app/api/tasks/extract/route.ts
src/app/components/TaskItemCard.tsx
src/app/components/item/SourceAndRelationsPanel.tsx
```

---

## 11. 구현 순서

1. Storage 버킷·RLS·signed URL 테스트
2. 자산 메타데이터 API와 해시 검증
3. Drive fileId 계약 보완
4. 관계 CRUD와 중복 방지
5. AI artifact 생성·stale 전환
6. `/api/upload` shadow 자산 생성
7. `/api/tasks/extract` shadow 자산·관계 생성
8. 기존 응답과 새 데이터 결과 비교
9. 항목 상세 UI 노출
10. 안정화 후 새 자산 읽기를 기본으로 전환

---

## 12. 구현 후 테스트 시나리오

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| A01 | 비공개 문서 업로드 | 본인 signed URL만 접근 가능 |
| A02 | 사용자 B가 사용자 A asset ID 요청 | 404 또는 권한 거부 |
| A03 | 업로드 완료 전 중단 | 미완료 메타데이터 정리, 업무 영향 없음 |
| A04 | 같은 파일 재업로드 | 해시 기반 중복 후보, 임의 덮어쓰기 없음 |
| A05 | Drive 연결 만료 | 항목 유지, 원문 일시 접근 불가 표시 |
| A06 | 회의록에서 업무 2건 확정 | 관계 2건, 중복 없음 |
| A07 | AI 관계 후보 거절 | 관계 비활성/삭제, 원문·업무 유지 |
| A08 | 원문 수정 | 기존 current artifact가 stale |
| A09 | AI 분석 실패 | 원문·업무 저장 성공, 재시도 가능 |
| A10 | 자산 삭제 | DB·Storage 정리, Drive는 별도 확인 |
| A11 | 기존 `rawContent` 항목 열기 | 새 자산이 없어도 원문 표시 |
| A12 | 기존 Drive 링크 항목 열기 | 링크 유지, 강제 fileId 변환 없음 |
| A13 | 문서 PDF 페이지 출처 | 파생 업무에서 원본 페이지 추적 가능 |
| A14 | 모바일 긴 파일명·다수 관계 | 레이아웃 잘림 없이 접기 가능 |

---

## 13. 중단 조건

- 비공개 자산에 인증 없는 공개 URL 생성
- 다른 사용자 자산 또는 관계 조회 가능
- 기존 업로드·붙여넣기 업무가 생성되지 않음
- Drive 실패가 전체 입력 실패로 전파됨
- 원문 수정이 사용자 확정 업무를 삭제·초기화함
- stale 처리 없이 과거 AI 결과를 최신으로 노출함

---

## 14. 완료 기준 — Gate D

- [ ] 원문 → 파생 항목 → 관계 → AI 결과의 전체 흐름을 E2E로 검증한다.
- [ ] 비공개 Storage RLS와 signed URL 만료를 두 사용자 계정으로 검증한다.
- [ ] Drive 연결과 앱 내부 첨부가 UI·데이터에서 구분되는지 실연동으로 확인한다.
- [x] AI 결과의 provider, model, source version/hash, status가 저장된다.
- [ ] 원문 변경 mutation과 AI artifact stale 갱신을 실제 저장 경로에 연결한다.
- [ ] 기존 업로드·붙여넣기·외부 수집 기능을 브라우저에서 회귀 확인한다.
- [ ] 모바일·PC 원문/관계 패널을 실제 기기로 검증한다.
- [x] lint, typecheck, test, build가 통과한다.

---

## 15. 롤백

- 새 자산·관계 UI를 기능 플래그로 숨기고 기존 `rawContent/driveUrl` 읽기를 유지한다.
- 새 테이블과 Storage 파일은 롤백 중 삭제하지 않는다.
- shadow 생성 데이터는 읽기 전환 전까지 사용자 화면 정본으로 취급하지 않는다.
- 잘못 생성된 AI 관계만 주체·배치 ID 기준으로 비활성화하며 사용자 관계는 건드리지 않는다.
