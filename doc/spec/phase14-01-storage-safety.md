# Phase 14-01. 저장 안전성·가시화 구현

> 상위 로드맵: [`phase14-00-execution-roadmap.md`](./phase14-00-execution-roadmap.md)
> 선행 조건: 없음
> 완료 게이트: Gate A
> 상태: 코드 구현 및 자동 검증 완료, Drive 실연동·모바일 수동 검증 필요

---

## 1. 목표

DB 구조를 확장하기 전에 현재 저장 동작의 잘못된 부분을 고치고, 사용자가 데이터가 어디에 저장되는지 알 수 있게 한다. 이후 Phase의 회귀를 잡을 테스트 기반도 이 단계에서 만든다.

### 완료 후 사용자에게 보장할 내용

- Drive 백업을 끄면 회의록·메모 원문이 Drive에 생성되지 않는다.
- Google 연동 여부와 Drive 백업 설정은 서로 독립적으로 동작한다.
- 현재 구조화 데이터 정본, 브라우저 캐시, Drive 백업 상태를 설정에서 확인할 수 있다.
- 동기화 실패가 발생해도 로컬 업무 입력은 계속되며 실패 사실을 숨기지 않는다.

---

## 2. 범위

### 포함

1. `/api/tasks/extract`의 `saveToDrive` 계약 수정
2. `useCloudSync` 상태를 설정 UI에 노출
3. 데이터·보관 상태 요약 컴포넌트 추가
4. 저장 경로 회귀 테스트 도입
5. 현재 누락 필드와 동기화 교체 위험의 특성화 테스트
6. 문서와 실제 설정 설명의 일치

### 제외

- 신규 Supabase 테이블 생성
- localStorage 업무 데이터 제거
- 오프라인 동기화 구현
- 비용·음성 데이터 영구 저장
- 기존 Drive 파일 일괄 이동 또는 삭제

---

## 3. 현재 원인

클라이언트는 `saveToDrive`를 전달하지만 서버는 `text`만 읽고 `session.googleToken` 존재 여부만 확인한다.

```text
page.tsx
  POST /api/tasks/extract { text, saveToDrive }
        ↓
tasks/extract/route.ts
  { text }만 해석
        ↓
googleToken이 있으면 무조건 Drive 저장
```

또한 `useCloudSync`는 `syncStatus`와 `provider`를 계산하지만 `page.tsx`가 이를 받지 않아 사용자에게 표시하지 못한다.

---

## 4. 구현 계약

### 4.1 `POST /api/tasks/extract`

요청:

```ts
interface ExtractTasksRequest {
  text: string;
  saveToDrive?: boolean;
}
```

응답:

```ts
interface ExtractTasksResponse {
  tasks: UnifiedData[];
  drive: {
    requested: boolean;
    saved: boolean;
    url?: string;
    reason?: "not_requested" | "not_connected" | "auth_expired" | "write_failed";
  };
}
```

규칙:

- `saveToDrive !== true`면 Google 토큰이 있어도 Drive API를 호출하지 않는다.
- `saveToDrive === true`지만 Google 미연동이면 업무 추출은 성공하고 `not_connected`를 반환한다.
- Drive 실패는 업무 추출을 막지 않는다.
- Drive 저장 성공 시에만 `driveUrl`을 항목에 연결한다.
- 원문과 토큰을 서버 로그에 출력하지 않는다.

### 4.2 저장 상태 모델

`useCloudSync` 반환값에 이미 있는 값을 UI까지 전달하고 다음 메타데이터를 추가한다.

```ts
interface DataStorageStatus {
  cloudProvider: "supabase" | "upstash" | "guest";
  syncState: "idle" | "syncing" | "synced" | "error" | "guest";
  lastSyncedAt?: string;
  pendingChanges: number;
  driveConnected: boolean;
  driveBackupEnabled: boolean;
  rawLocalStorageEnabled: boolean;
}
```

Phase 14-01에서 `pendingChanges`는 실제 오프라인 큐가 없으므로 `0` 또는 `unknown`을 명시한다. Phase 14-03에서 실제 값으로 교체한다.

### 4.3 설정 UI

`설정 → 데이터·보관`에 다음을 표시한다.

```text
구조화 데이터  Supabase 동기화됨 · 방금 전
이 기기 캐시    브라우저에 보관 중
Drive 백업      Google 연결됨 · 백업 켜짐
원문 로컬 보관  이 기기에서 켜짐
```

- 저장소별 역할 설명을 한 문장으로 제공한다.
- `동기화됨`과 `Google 연동됨`을 같은 의미로 표시하지 않는다.
- 오류 상태에서는 마지막 성공 시각과 재시도 버튼을 제공한다.
- 게스트에는 `이 브라우저를 지우면 데이터가 사라질 수 있음`을 표시한다.

---

## 5. 예상 수정 파일

| 파일 | 변경 |
|---|---|
| `src/app/api/tasks/extract/route.ts` | 요청 플래그 검사, Drive 결과 계약 반환 |
| `src/app/page.tsx` | 새 응답 처리, 동기화 상태 전달 |
| `src/app/hooks/useCloudSync.ts` | 오류·마지막 성공 시각 상태 추가 |
| `src/app/components/SettingsModal.tsx` | 데이터·보관 섹션 연결 |
| `src/app/components/settings/DataStorageSection.tsx` | 신규 상태 요약 UI |
| `src/lib/types/storage.ts` | 저장 상태·Drive 결과 공통 타입 |
| `src/app/api/tasks/extract/*.test.ts` | Drive 분기 테스트 |
| `package.json`, `vitest.config.ts` | 테스트 명령과 환경 구성 |

파일 배치는 구현 시 실제 컴포넌트 구조를 확인해 조정할 수 있지만 API 계약과 책임은 바꾸지 않는다.

---

## 6. 테스트 기반 도입

### 6.1 도구

- 순수 함수·API 계약: Vitest
- React 상태·컴포넌트가 필요한 경우 React Testing Library
- 모바일 화면·실제 권한: 브라우저 수동 검증 또는 Playwright

추가 스크립트:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### 6.2 필수 자동 테스트

| ID | 조건 | 기대 결과 |
|---|---|---|
| S01 | Google 연결 + `saveToDrive=false` | Drive fetch 0회, 업무 추출 성공 |
| S02 | Google 연결 + `saveToDrive=true` | Drive 저장 1회, URL 반환 |
| S03 | Google 미연동 + `saveToDrive=true` | 업무 추출 성공, `not_connected` |
| S04 | Drive 401/403 | 리프레시 정책 적용 또는 명시 오류, 업무 추출 성공 |
| S05 | Drive 5xx | 업무 추출 성공, `write_failed` |
| S06 | 원문·토큰 포함 요청 | 로그에 민감정보 없음 |
| S07 | Supabase 동기화 성공 | `synced`, 마지막 성공 시각 표시 |
| S08 | 동기화 실패 | 로컬 입력 유지, `error` 표시 |

### 6.3 특성화 테스트

다음은 Phase 14-02/03에서 고칠 현재 동작을 재현하고 `known gap`으로 표시한다.

- Supabase 왕복 시 `rawContent`, `driveUrl`이 손실되는지
- UI의 별도 진행 메모·하위작업과 `manualItems`가 분리되는지
- 클라우드 초기 로딩이 로컬 목록을 교체하는지
- 전체 목록 저장이 누락 ID를 서버에서 삭제하는지

특성화 테스트를 통과시킨다는 의미는 현재 문제를 숨기지 않고 재현 가능하게 만든다는 뜻이다.

---

## 7. 기존 기능 보호 주의사항

- Drive 저장 조건만 수정하고 메모에서 업무를 추출하는 AI·폴백 로직은 변경하지 않는다.
- Drive 실패가 전체 `/api/tasks/extract` 실패로 바뀌지 않게 부분 실패 계약을 유지한다.
- 기존 클라이언트를 위해 전환 기간 동안 최상위 `driveUrl` 응답을 유지한다.
- Google 로그인과 Google 서비스 연동을 같은 상태로 간주하지 않는다.
- 동기화 상태 UI 때문에 새 폴링 타이머나 추가 Gemini 호출을 만들지 않는다.
- 저장 상태를 읽기 위해 OAuth 토큰·Supabase secret을 클라이언트에 노출하지 않는다.
- 게스트 경고를 추가해도 게스트 진입과 빠른 업무 추가를 막지 않는다.
- 특성화 테스트가 현재 문제를 재현한다는 이유로 운영 데이터를 고치거나 삭제하지 않는다.

---

## 8. 구현 순서

1. 테스트 러너와 API fetch 모킹 기반 추가
2. 현재 Drive OFF 실패를 재현하는 테스트 작성
3. 요청·응답 공통 타입 추가
4. 서버의 `saveToDrive` 분기 수정
5. 클라이언트 응답·토스트 수정
6. `useCloudSync` 오류와 마지막 성공 시각 확장
7. 데이터·보관 UI 추가
8. 특성화 테스트와 문서 갱신
9. lint → typecheck → test → build → 모바일 수동 검증

---

## 9. 구현 후 테스트 시나리오와 완료 기준 — Gate A

- [ ] Drive 백업 OFF에서 Drive 네트워크 쓰기가 발생하지 않는지 실연동으로 확인한다.
- [ ] Drive 백업 ON의 성공·미연동·만료·서버 실패를 실연동으로 확인한다.
- [x] 설정에서 Supabase/게스트, Drive, 이 기기 저장을 구분해 볼 수 있다.
- [x] 동기화 실패가 로컬 업무 추가를 막지 않는다.
- [x] `npm run lint`, `typecheck`, `test`, `build`가 통과한다.
- [ ] PC와 모바일에서 설정 화면이 잘리지 않는지 실제 기기로 확인한다.
- [x] 특성화 테스트가 현재 데이터 누락 위험을 문서화한다.
- [x] `01-as-built-reference.md`의 저장 동작을 실제 코드 기준으로 갱신한다.

추가 수동 회귀 시나리오:

- 게스트에서 빠른 업무 추가·완료가 기존과 동일한지
- Google 로그인만 된 상태와 서비스 연동까지 된 상태의 문구가 다른지
- Drive ON/OFF 전환 후 새 요청부터 적용되고 기존 파일을 삭제하지 않는지
- 모바일 설정 화면에서 저장 상태와 스위치가 겹치지 않는지
- Google 토큰 만료 후에도 메모 추출 결과가 생성되는지

---

## 10. 롤백

- UI 상태 섹션은 독립 컴포넌트로 제거할 수 있게 유지한다.
- API 응답은 전환 기간 동안 기존 `driveUrl`도 함께 반환해 구 클라이언트를 보호한다.
- Drive 플래그 수정은 OFF의 의미를 바로잡는 변경이므로 롤백 대상이 아니라 회귀 방지 대상이다.
- 테스트 기반과 타입은 다음 Phase에서도 유지한다.
