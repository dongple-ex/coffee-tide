# Phase 14-03. 항목 단위 동기화·오프라인 구현

> 상위 로드맵: [`phase14-00-execution-roadmap.md`](./phase14-00-execution-roadmap.md)
> 선행 조건: Phase 14-02 Gate B 완료
> 완료 게이트: Gate C
> 상태: 동기화 핵심 로직 구현 및 정적 검증 완료, 브라우저·다중 기기 시나리오 필요

---

## 1. 목표

현재 전체 목록 교체 방식의 동기화를 항목 단위 변경 방식으로 전환한다. 로그인 전 게스트 데이터와 기존 클라우드 데이터를 소실 없이 병합하고, 여러 기기 및 오프라인 변경을 안전하게 처리한다.

### 완료 후 보장

- 로그인했다고 로컬 업무가 사라지지 않는다.
- 다른 기기에서 추가한 항목을 현재 기기가 임의로 삭제하지 않는다.
- 오프라인에서 추가·수정한 내용이 네트워크 복구 후 한 번만 반영된다.
- 충돌을 자동으로 숨기지 않고 보존·표시한다.

---

## 2. 현재 문제

```text
GET /api/user/sync
  → cloudState 전체 수신
  → setManualItems(cloudState.items)

POST /api/user/sync
  → 현재 목록 전체 전송
  → 서버 기존 ID 중 전송에 없는 행 삭제
```

이 방식은 다음 상황에서 데이터 유실 가능성이 있다.

- 게스트로 업무를 추가한 뒤 기존 계정으로 로그인
- PC와 모바일에서 동시에 서로 다른 항목 수정
- 오래된 브라우저 탭이 늦게 전체 목록을 저장
- 네트워크 오류로 일부 데이터만 복구된 상태에서 저장

---

## 3. 목표 동기화 모델

### 3.1 클라이언트 변경 단위

```ts
type MutationOperation = "create" | "update" | "delete";

interface SyncMutation {
  mutationId: string;
  deviceId: string;
  itemId: string;
  operation: MutationOperation;
  baseVersion?: number;
  payload?: Partial<WorkspaceItem>;
  clientCreatedAt: string;
}
```

- `mutationId`는 재시도 멱등성 키다.
- `deviceId`는 브라우저 설치 단위의 무작위 ID이며 기기 지문으로 만들지 않는다.
- UPDATE는 마지막으로 읽은 `baseVersion`을 포함한다.
- DELETE는 물리 삭제 대신 `deletedAt`과 새 버전을 생성한다.

### 3.2 API 계약

기존 `/api/user/sync`를 전환 기간 동안 유지하고 신규 계약을 별도 경로에 둔다.

```text
GET  /api/sync/changes?cursor=<opaque>
POST /api/sync/mutations
GET  /api/sync/status
```

변경 조회 응답:

```ts
interface SyncChangesResponse {
  changes: WorkspaceItem[];
  tombstones: Array<{ id: string; version: number; deletedAt: string }>;
  nextCursor: string;
  hasMore: boolean;
}
```

변경 반영 응답:

```ts
interface SyncMutationResult {
  mutationId: string;
  status: "applied" | "duplicate" | "conflict" | "rejected";
  serverItem?: WorkspaceItem;
  errorCode?: string;
}
```

커서는 서버의 `updated_at + user_id + id`를 기반으로 만든 불투명 값이며 클라이언트가 시각만으로 증분 범위를 추측하지 않는다.

---

## 4. IndexedDB 구조

제안 DB: `coffeeTide_workspace_db`

| Store | 키 | 용도 |
|---|---|---|
| `items` | `id` | 마지막으로 병합된 정규화 항목 캐시 |
| `mutations` | `mutationId` | 미전송·재시도 변경 대기열 |
| `conflicts` | `itemId` | 자동 병합 불가 충돌 양쪽 사본 |
| `sync_meta` | 이름 | cursor, deviceId, migrationVersion, lastSyncedAt |
| `local_assets` | `assetId` | 로컬 전용 원문 참조와 임시 첨부 |

규칙:

- 트랜잭션 안에서 로컬 항목 변경과 mutation 추가를 함께 처리한다.
- 서버 applied 응답을 받은 후에만 mutation을 제거한다.
- 재시도 횟수와 마지막 오류를 기록하되 원문을 로그에 넣지 않는다.
- IndexedDB 실패 시 신규 업무를 localStorage 전체 목록으로 되돌리지 않고 사용자에게 저장 실패를 알린다.

---

## 5. 최초 로그인 병합

### 5.1 순서

1. 로컬 항목·진행 메모·하위작업을 새 계약으로 읽는다.
2. 클라우드 전체 기준 스냅샷을 페이지 단위로 받는다.
3. 동일 ID는 버전과 수정 시각을 비교한다.
4. 다른 ID지만 정규화 해시가 같은 항목은 중복 후보로 표시한다.
5. 충돌하지 않는 로컬 항목은 create mutation으로 업로드한다.
6. 충돌 항목은 양쪽 사본을 보존하고 사용자 확인 전 어느 쪽도 삭제하지 않는다.
7. 병합 완료·서버 확인 후 마이그레이션 마커를 기록한다.

### 5.2 자동 병합 허용 범위

- 서로 다른 필드를 수정한 경우만 필드 단위 병합 후보가 될 수 있다.
- `content`, `status`, `workNote`, `subTasks`가 양쪽에서 바뀌었으면 자동 덮어쓰지 않는다.
- 완료와 삭제가 충돌하면 삭제를 자동 우선하지 않는다.
- AI 결과는 원문 충돌 해결에 사용하지 않는다.

### 5.3 충돌 UI

```text
동기화 충돌 1건

이 기기 버전       클라우드 버전
수정 10:32         수정 10:35
[이 기기 유지] [클라우드 유지] [둘 다 보관]
```

모바일에서는 양쪽 내용을 세로 카드로 표시한다.

---

## 6. 쓰기 흐름

```text
사용자 수정
  → IndexedDB item + mutation 원자적 저장
  → UI 즉시 갱신
  → 온라인이면 배치 전송
  → 서버 baseVersion 검사
       ├─ 일치: version +1, applied
       ├─ 이미 처리: duplicate
       └─ 불일치: conflict + 서버 사본
  → applied만 큐 제거
```

- 한 배치는 항목 수와 요청 크기를 제한한다.
- 서버는 mutationId를 사용자 범위에서 일정 기간 보관해 중복 적용을 막는다.
- 재시도는 지수 백오프와 온라인 이벤트를 함께 사용한다.
- 탭 여러 개가 열려 있으면 Web Locks 또는 leader 선출로 한 탭만 전송한다.

---

## 7. 기존 기능 보호 주의사항

- Phase 전환 중 기존 `/api/user/sync`의 전체 삭제 로직을 새 클라이언트와 동시에 사용하지 않는다.
- 새 API 쓰기를 켜기 전에 새 읽기와 IndexedDB 캐시를 검증한다.
- `manualItems` 기반 브리핑·행동 지침 입력 계약은 어댑터로 유지한다.
- Outlook, Gmail, Notion, Spark처럼 외부에서 매번 수집되는 항목을 사용자 정본 항목과 혼합 삭제하지 않는다.
- 완료·보류·dismiss의 의미를 마이그레이션 중 변경하지 않는다.
- 퇴근 핸드오프와 YouTube 연속성 같은 UI 세션 데이터는 업무 동기화 대상에 포함하지 않는다.
- 기존 localStorage 키는 적어도 한 안정화 릴리스 동안 읽기 전용 폴백으로 남긴다.
- 사용자가 직접 삭제하지 않은 항목은 마이그레이션 정리 과정에서 물리 삭제하지 않는다.

---

## 8. 예상 수정 파일

```text
src/app/api/sync/changes/route.ts
src/app/api/sync/mutations/route.ts
src/app/api/sync/status/route.ts
src/lib/sync/contracts.ts
src/lib/sync/server.ts
src/lib/sync/merge.ts
src/lib/browser/workspaceDb.ts
src/lib/browser/mutationQueue.ts
src/app/hooks/useWorkspaceSync.ts
src/app/components/settings/SyncStatusCard.tsx
supabase/migrations/202608xx_incremental_sync.sql
```

기존 `useCloudSync.ts`는 기능 플래그가 안정화될 때까지 레거시 경로로 유지한다.

---

## 9. 구현 순서

1. 병합·충돌 순수 함수와 테스트 작성
2. IndexedDB 래퍼와 트랜잭션 테스트
3. 서버 mutation 멱등성·버전 검사 구현
4. 증분 changes API 구현
5. 읽기 전용 shadow sync로 결과 비교
6. 로컬 변경 대기열 구현
7. 내부 사용자만 신규 쓰기 활성화
8. 최초 로그인 병합 UI 구현
9. 다중 탭·오프라인·다중 기기 검증
10. 전체 목록 쓰기 비활성화
11. 안정화 후 레거시 경로 제거 계획 작성

---

## 10. 구현 후 테스트 시나리오

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| Y01 | 게스트 업무 3건 후 기존 계정 로그인 | 로컬 3건과 클라우드 기존 건 모두 보존 |
| Y02 | 동일 항목을 PC·모바일에서 다른 필드 수정 | 안전 병합 또는 충돌 카드 |
| Y03 | 동일 본문을 양쪽에서 수정 | 자동 덮어쓰기 없이 양쪽 보존 |
| Y04 | 오프라인 업무 추가 후 앱 종료·재접속 | 로컬 표시, 온라인 복구 후 1건 생성 |
| Y05 | 같은 mutation 3회 전송 | 서버 반영 1회, 나머지 duplicate |
| Y06 | 오래된 탭에서 완료 처리 | 최신 버전이면 적용, 아니면 conflict |
| Y07 | 모바일에서 삭제 후 PC 오프라인 수정 | 삭제/수정 충돌을 사용자에게 표시 |
| Y08 | 네트워크가 배치 중간에 끊김 | applied만 제거, 나머지 재시도 |
| Y09 | 두 브라우저 탭 동시 실행 | 중복 전송·중복 토스트 없음 |
| Y10 | 로그아웃 후 게스트 전환 | 이전 사용자 비공개 캐시 화면 노출 없음 |
| Y11 | 기존 브리핑·행동 지침 | 동일 업무 수와 상태로 계산 |
| Y12 | Outlook/Gmail 수집 새로고침 | 정본 업무를 삭제하거나 중복 생성하지 않음 |

### 수동 모바일 검증

- 앱을 백그라운드로 보낸 뒤 다시 열었을 때 큐가 유지되는지
- 네트워크를 Wi-Fi ↔ 모바일 데이터로 바꿔도 중복 저장되지 않는지
- 충돌 카드의 양쪽 내용과 버튼이 작은 화면에서 잘리는지
- 로그아웃 직후 이전 계정 데이터가 잠깐이라도 보이지 않는지

---

## 11. 중단 조건

다음 중 하나라도 발생하면 신규 쓰기 경로를 즉시 끄고 레거시 읽기 모드로 전환한다.

- 사용자 확인 없이 항목 수가 감소
- mutation 재시도로 같은 항목이 반복 생성
- 다른 사용자 데이터가 조회됨
- conflict 응답이 정상 수정으로 잘못 처리됨
- 오프라인 큐 정리 중 미전송 변경이 삭제됨
- 기존 업무 브리핑의 항목 수가 기준과 달라짐

---

## 12. 완료 기준 — Gate C

- [ ] 최초 로그인 병합에서 로컬·클라우드 데이터가 모두 보존되는지 브라우저 E2E로 확인한다.
- [ ] 버전 충돌과 멱등 재시도를 API/IndexedDB 통합 테스트로 검증한다.
- [ ] 오프라인 큐가 브라우저 종료·재실행 후에도 유지되는지 확인한다.
- [x] 전체 목록 교체 삭제 경로가 신규 클라이언트에서 호출되지 않는다.
- [ ] 기존 업무, 완료, 보류, 브리핑, 외부 수집을 브라우저에서 회귀 확인한다.
- [ ] PC·모바일·다중 탭 시나리오를 통과한다.
- [ ] 데이터 수 전후 비교 기록과 롤백 플래그를 준비한다.
- [x] lint, typecheck, test, build가 통과한다.

---

## 13. 롤백

- 서버 API와 신규 컬럼은 유지하고 클라이언트 기능 플래그만 레거시 읽기 모드로 돌린다.
- IndexedDB 큐는 삭제하지 않고 내보낼 수 있게 유지한다.
- 신규 mutation을 기존 전체 목록 POST로 변환해 보내지 않는다.
- 충돌·미전송 항목이 0건임을 확인하기 전 레거시 localStorage 키를 삭제하지 않는다.
