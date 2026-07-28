# Phase 3: 예외 처리 및 검증 로직 명세

본 파트에서는 AI Action Engine 연동 후 외부 API 장애, 요금 제한, 형식 불일치 등 런타임 예외를 안전하게 격리하고 검증하기 위한 절차를 정의합니다.

## 1. AI API 예외 상황 발생 시나리오 및 서버/클라이언트 대응 로직

### 1.1 Gemini API Key 불일치 또는 할당량 초과 (HTTP 401 / 429)
-   **발생 원인**: API Key가 설정되지 않았거나, 만료되었거나, 요청 한도(Rate Limit)를 초과한 경우.
-   **서버 처리**:
    - AI 호출 구간을 `try-catch` 블록으로 격리합니다.
    - API 호출 실패 시 즉시 로그 시스템에 경고(`[Warning] Gemini API unavailable. Falling back to local rules.`)를 출력하고, 자동으로 `src/lib/ai/fallbackEngine.ts` 의 **로컬 규칙 분류 및 요약 모듈**을 호출하여 처리합니다.
    - 응답 데이터에 `ai_fallback: true` 플래그를 실어 보내 서버 통신이 실패하더라도 정상적인 로컬 수준의 데이터 분류 및 요약을 수행하여 가용성을 보장합니다.

### 1.2 LLM 출력 JSON 파싱 실패 (Parsing Exception)
-   **발생 원인**: JSON Output Mode를 지시했음에도 불구하고, LLM이 예외적으로 마크다운 코드 블록(```json ... ```) 또는 가공 텍스트를 섞어 응답을 반환하여 `JSON.parse()` 시 에러가 나는 경우.
-   **서버 처리**:
    - LLM 응답 텍스트에 포함될 수 있는 백틱(`` ` ``) 또는 불필요한 줄바꿈 등의 정규식 정제 전처리 함수를 작성합니다.
    - 정제 후에도 파싱이 깨지는 비정상 응답의 경우, 전체를 실패 처리하지 않고 즉시 로컬 정규식 분류 규칙으로 대체하여 데이터를 복구합니다.

---

## 2. 세부 검증 시나리오 및 통합 테스트 절차

### Scenario A: API Key 미등록 시 Local Fallback 검증
*   **검증 환경**: `.env.local` 에 `GEMINI_API_KEY` 값을 입력하지 않고 `MOCK_MODE=true` 로 설정.
*   **순서**:
    1. `npm run dev` 로 개발 서버 기동.
    2. `/api/mails` 호출 시 로깅창에 `Gemini API unavailable. Falling back to local rules.` 로그가 정상 출력되는지 확인.
    3. 대시보드 화면상에서 수신된 5건의 메일/노션 데이터가 로컬 분류 규칙(Regex)에 의해 `urgent`, `approval_required` 등으로 깨짐 없이 매핑되는지 검증.
    4. Copilot 질문창에 "오늘 할 일 요약해줘" 입력 시, 로컬 규칙 엔진이 반환한 4개 섹션(최우선 업무, 리스크 등)의 텍스트 리포트가 화면에 매끄럽게 출력되는지 검증.

### Scenario B: 실환경 Gemini API 연동 동작 검증
*   **검증 환경**: `.env.local` 에 올바른 `GEMINI_API_KEY` 입력 완료 상태 및 `MOCK_MODE=false` 로 연동.
*   **순서**:
    1. 대시보드 새로고침 시 `/api/mails` API를 거쳐 각 메일과 노션 데이터에 대해 AI가 판단한 `actionDirective` (1줄 지침 요약) 속성이 정상 부여되어 화면 카드 하단에 노출되는지 확인.
    2. Copilot 채팅창에 기획서에 없는 복잡한 문장(예: "이번 주에 마감인 노션 태스크 중에서 이메일이랑 겹치는 내용 있어?")으로 질의.
    3. 개발자 도구 Network 탭에서 `/api/copilot` 호출 시 Gemini 모델(`gemini-2.5-flash`)이 컨텍스트 데이터를 정확하게 학습하여 비즈니스 어조로 상세 분석 결과를 반환하는지 검증.
