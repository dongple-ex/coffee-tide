# 06. Gemini Spark · CloudSync · AI Fallback 구현 계획

## 0. 문서 목적

이 문서는 구현 대상의 설계와 수용 기준을 정의한다. Spark 데이터의 안전한 수신, 최근 24시간 자동 브리핑, 클라우드 동기화, AI 장애 시 로컬 응답을 하나의 일관된 흐름으로 완성한다.

## 1. 사용자 경험과 범위

사용자가 **Gemini Spark 24시간 클라우드 브리핑 자동 수신**을 활성화하면 다음을 보장한다.

1. 최근 24시간 안에 수신된 Spark 리포트는 `completed` 상태를 포함해 AI 바리스타 브리핑 최상단에 표시된다.
2. 질문을 입력하지 않아도 브리핑 영역을 열거나 새로고침하면 Spark 자동 브리핑을 확인할 수 있다.
3. Spark 리포트에는 출처 앱, 수신 시각, 요약, 추천 조치를 표시한다.
4. 비활성화한 사용자의 Copilot 요청과 UI에는 Spark 데이터를 포함하지 않는다.
5. Gemini API, 외부 연동 또는 클라우드 DB가 실패해도 로컬 업무 관리와 규칙 기반 브리핑은 계속 동작한다.

표시 형식은 다음으로 고정한다.

```markdown
### ⚡ [Gemini Spark 24시간 자율 비서 답변]
- **[Google Drive] 2026 주간 보고서 요약 완료**
  - 📝 Spark 분석: 핵심 3줄 요약을 완료했습니다.
  - 💡 추천 조치: 수신된 업무 데이터를 확인하세요.
```

## 2. 구현 전제와 결정 사항

| 항목 | 결정 |
|---|---|
| Spark 보관소 | 운영 환경에서는 Supabase 또는 Upstash 중 설정된 서버 저장소를 사용한다. 프로세스 메모리 배열은 개발용 샘플·폴백으로만 쓴다. |
| 로컬 모드 | 현재 코드에는 SQLite가 없으므로 `Guest + localStorage/IndexedDB`로 명시한다. SQLite를 전제로 한 설계는 포함하지 않는다. |
| 실시간 갱신 | 1차 구현은 페이지 진입 및 30초 폴링으로 한다. WebSocket은 서버 이벤트 채널과 재연결 정책이 준비된 뒤 별도 과제로 분리한다. |
| 설정 저장 | 로그인 사용자는 서버 사용자 설정에, Guest는 localStorage에 `sparkEnabled`를 저장한다. 클라이언트 토글만으로 서버 권한을 판단하지 않는다. |
| Copilot UI | 현재 프로젝트에는 `CopilotBriefingWidget.tsx`가 없으므로 `CopilotConversation.tsx`를 자동 브리핑 카드의 렌더링 지점으로 사용한다. |

## 3. 데이터 계약과 보안

### 3.1 Spark 리포트 모델

`SparkBriefingItem`에는 사람이 읽는 시간 문자열과 별도로 비교 가능한 수신 시각을 둔다.

```ts
interface SparkBriefingItem {
  id: string;
  externalId: string; // 공급자 이벤트 ID, 사용자 단위 멱등성 키
  userId: string;
  sourceApp: "Gmail" | "Google Calendar" | "Google Drive" | string;
  title: string;
  summary: string;
  category: "urgent" | "approval_required" | "meeting" | "action_required" | "reference";
  status: "pending" | "completed" | "flagged";
  receivedAt: string; // ISO 8601 UTC
  actionUrl?: string;
}
```

`toUnifiedData` 변환 규칙:

- `source`는 반드시 `"spark"`로 설정하고, 원본 앱은 `sourceApp`에 보관한다.
- `created_at`에는 표시용 문구가 아니라 `receivedAt` ISO 값을 사용한다.
- `status: "completed"`를 보존한다. 일반 할 일 목록에서의 숨김 여부와 Spark 브리핑 포함 여부는 분리한다.
- `receivedAt`이 없거나 파싱할 수 없으면 자동 브리핑에 넣지 않는다.

### 3.2 수신 API

`POST /api/spark/ingest`는 외부 서비스 전용 수신 경로다.

- `Authorization: Bearer <SPARK_INGEST_SECRET>` 또는 서명 헤더를 검증한다. 인증되지 않은 요청은 `401`로 거부한다.
- 요청 본문은 allowlist 스키마로 검증하고 길이 제한과 허용된 `category`·`status` 값만 받는다.
- `(userId, externalId)`를 멱등성 키로 사용한다. 같은 이벤트 재전송은 중복 생성 대신 upsert 한다.
- 수신 조회 API는 로그인 세션과 사용자 소유권을 검증한다. 전역 Spark 목록을 누구나 읽을 수 있게 두지 않는다.
- 원문·토큰·비밀값은 응답이나 로그에 남기지 않는다.

## 4. Spark 자동 브리핑 흐름

```text
외부 Spark 이벤트
  → 인증·스키마·멱등성 검증
  → 사용자별 영속 저장
  → 최근 24시간 Spark 항목 조회
  → sparkEnabled 확인
  → Copilot API에 UnifiedData(source: spark)로 결합
  → CopilotConversation 최상단의 자동 브리핑 카드 렌더링
```

### 4.1 24시간 필터

`getRecentSparkUnifiedItems(now)`를 단일 진입점으로 둔다.

- `now - Date.parse(receivedAt) <= 24시간`인 항목만 반환한다.
- 미래 시각과 잘못된 시각은 제외하고 관측 로그를 남긴다.
- 최신순으로 정렬하고 기본 최대 표시 건수(예: 5건)를 둔다.
- 일반 질문과 자동 브리핑 모두 이 함수를 사용한다. 느슨한 ID 접두사 필터를 중복 구현하지 않는다.

### 4.2 브리핑 엔진과 Gemini

수정 대상:

- `src/lib/ai/fallbackEngine.ts`
- `src/lib/ai/gemini.ts`
- `src/lib/ai/harness.ts`
- `src/app/api/copilot/route.ts`

규칙:

1. `buildSparkAutonomousBriefing(items)`는 최근 Spark 항목이 있으면 고정 헤더를 포함한 Markdown을 반환하고, 없으면 `null`을 반환한다.
2. `copilotBriefing`은 일반 우선순위·직접 질문보다 먼저 Spark 블록을 넣는다.
3. `askCopilot`의 Gemini 컨텍스트는 `source === "spark"` 항목을 `completed` 상태여도 유지한다.
4. 시스템 프롬프트는 Spark 데이터가 있으면 답변의 첫 섹션을 고정 헤더로 작성하도록 지시한다. UI는 모델의 형식 준수 여부와 무관하게 별도 Spark 배지를 표시한다.
5. Copilot API는 사용자 설정이 활성화된 요청에서만 최근 Spark 항목을 결합한다. 질문 없는 자동 브리핑은 LLM 호출 없이 결정적 로컬 렌더링을 우선 사용한다.
6. Spark 데이터와 클라이언트 업무 데이터를 합칠 때 ID 기준으로 중복 제거한다.

### 4.3 UI와 설정

수정 대상:

- `src/app/components/SettingsModal.tsx`
- `src/app/page.tsx`
- `src/app/components/copilot/CopilotConversation.tsx`

요구사항:

- 토글은 `defaultChecked`가 아닌 `checked={sparkEnabled}`를 사용한다.
- 변경 시 상태를 저장하고, 비활성화하면 자동 카드와 Copilot 요청의 Spark 결합을 즉시 중단한다.
- 대시보드 준비 후 활성 사용자에 한해 자동 브리핑을 조회한다. 결과가 없으면 빈 카드나 성공 토스트를 표시하지 않는다.
- 자동 카드는 기존 질의응답보다 항상 위에 렌더링하고 `⚡ Gemini Spark 자율 수신` 배지를 표시한다.
- `SparkBriefingWidget`은 보조 상세 보기로만 사용한다. import만 하고 렌더링하지 않는 상태는 허용하지 않는다.

## 5. CloudSync 설계

### 5.1 지원 계층

현재 구현 기준 지원 계층은 Supabase REST, Upstash Redis REST, Guest 로컬 저장소다. DB 공급자를 찾지 못하면 Guest 모드로 폴백하되, UI에는 `로컬 전용` 상태를 명확히 표시한다. 로그인 사용자의 동기화 실패를 성공처럼 표시해서는 안 된다.

### 5.2 동기화 계약

`UserCloudState`는 `version`, `updatedAt`, `items`, `widgets`, `rules`, `dismissedIds`, `preferences`를 포함한다.

- 저장은 1.5초 디바운스를 유지하되, 언마운트 시 남은 변경을 가능한 범위에서 마지막 저장한다.
- 모든 HTTP 응답의 `ok`를 확인한다. 네트워크 성공만으로 저장 성공 처리하지 않는다.
- Supabase 저장은 사용자 ID로 RLS를 적용하고 서비스 역할 키는 서버에서만 사용한다. `NEXT_PUBLIC_*`에 서비스 역할 키를 넣지 않는다.
- 항목은 ID별 upsert, 위젯·규칙·환경설정은 `updatedAt` 기반의 명시적 충돌 규칙을 사용한다. 단순 전체 덮어쓰기는 금지한다.
- 실패한 저장은 마지막 로컬 스냅샷을 보존하고 `syncing`·`synced`·`guest`·`error` 상태를 구분한다.

## 6. AI 폴백과 장애 처리

| 상황 | 동작 |
|---|---|
| API 키 없음 | 즉시 `fallbackEngine`으로 응답한다. |
| 429 | 쿨다운을 기록하고 해당 기간에는 원격 호출을 생략한다. |
| 네트워크·5xx | 로컬 브리핑으로 폴백하고 재시도는 제한한다. |
| 401·403·404 | 구성 오류로 분류해 반복 호출하지 않고 연결 설정을 안내한다. |
| 빈 응답·파싱 실패 | 로컬 브리핑으로 폴백한다. |

폴백은 실제 데이터에 없는 일정·승인·완료 사실을 만들어 내지 않는다.

## 7. 구현 순서

1. Spark 데이터 모델, 영속 저장소, 수신 API의 인증·스키마·멱등성을 구현한다.
2. `source: "spark"`, ISO 수신 시각, 24시간 필터를 구현하고 단위 테스트한다.
3. Fallback·Gemini·Copilot API에 Spark 결합 및 완료 상태 예외를 반영한다.
4. 설정을 영속화하고 자동 브리핑 카드를 `CopilotConversation` 최상단에 연결한다.
5. CloudSync의 전체 상태 저장, HTTP 오류 처리, 충돌 정책을 보완한다.
6. 관측 로그와 수동·자동 검증을 완료한 뒤 WebSocket 필요성을 재평가한다.

## 8. 검증 계획

### 자동화

```bash
npm run typecheck
npm run lint
npm run build
```

추가 테스트 대상:

- 최근 24시간·24시간 초과·미래·잘못된 수신 시각 필터
- `completed` Spark 항목이 자동 브리핑과 Gemini 컨텍스트에 포함되는지
- Spark 비활성화 시 Copilot API와 UI에서 완전히 제외되는지
- 같은 `externalId` 재수신 시 중복 없이 갱신되는지
- 인증 없는 Spark 수신 요청이 거부되는지
- Supabase·Upstash·Guest 각각의 성공·실패·충돌 상태
- 429, 네트워크 실패, 모델 오류에서 폴백이 응답을 반환하는지

### 수동 확인

1. 인증된 Spark 수신 API로 `completed` 리포트를 주입한다.
2. Spark 토글을 켠 뒤 메인 화면을 새로고침한다.
3. 질문 없이 AI 바리스타 영역 최상단에서 Spark 배지와 고정 헤더를 확인한다.
4. 토글을 끄고 새로고침해 카드와 Spark 데이터가 사라지는지 확인한다.
5. 수신 시각을 24시간 이전으로 바꿔 자동 브리핑에서 제외되는지 확인한다.
6. Gemini 키를 제거하거나 429를 모의해도 일반 브리핑이 응답하는지 확인한다.

## 9. 완료 기준

- Spark 데이터가 사용자별로 인증·멱등성·영속성을 갖고 수신된다.
- 활성 사용자에게만 최근 24시간 Spark 브리핑이 질문 없이 최상단에 노출된다.
- `completed` Spark 리포트가 누락되지 않는다.
- Spark·CloudSync·Gemini 장애가 업무 관리 화면을 막지 않는다.
- typecheck, lint, production build 및 위 검증 시나리오가 모두 통과한다.