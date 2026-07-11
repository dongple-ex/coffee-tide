# Phase 2: 예외 처리 및 검증 로직 명세

> ⚠️ **역사 문서 (Phase 2 · TimePilot 시절)** — Notion 초기 연동 설계 기록입니다. 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 Phase 3 이후 문서.

본 파트에서는 Notion API 연동 개발 이후 안정적인 예외 차단 및 정상 데이터 파싱을 입증하기 위한 오작동 대응 전략 및 검증 절차를 정의합니다.

## 1. Notion API 예외 상황 발생 시나리오 및 서버/클라이언트 대응 로직

### 1.1 유효하지 않은 API 토큰 또는 권한 부재 (HTTP 401 / 403)
-   **발생 원인**: 사용자가 연동을 임의 해제했거나 잘못된 Integration Token을 설정한 경우.
-   **서버 처리**:
    - 어댑터 내에서 Notion API 호출 중 `401 Unauthorized` 또는 `403 Forbidden` 발생 시, 해당 플랫폼 오류를 시스템 로그에 남기되 전체 서버 크래시를 방지하기 위해 `try-catch` 블록으로 예외를 격리합니다.
    - 에러가 발생한 Notion 파트의 데이터는 빈 배열 `[]`로 응답에 주입하고, 에러 플래그(`notion_error: true`)를 JSON 응답에 실어 반환합니다.
-   **클라이언트 처리**:
    - 대시보드 화면 상단 또는 노션 목록 위젯 내에 "Notion 권한 인증이 유효하지 않습니다. 연동 설정을 확인해 주세요." 라는 복구 가이드 문구와 설정 입력창을 노출합니다.

### 1.2 대상 데이터베이스를 찾을 수 없음 (HTTP 404)
-   **발생 원인**: 데이터베이스가 삭제되었거나 TimePilot 통합에 공유(Share) 설정이 해제된 경우.
-   **서버 처리**:
    - `object_not_found` 에러가 떨어지면 빈 리스트를 리턴하고 로그에 오류 내용을 상세히 기록합니다.
-   **클라이언트 처리**:
    - 사용자에게 "지정된 Notion 데이터베이스를 찾을 수 없습니다. 데이터베이스 ID를 다시 확인하거나 Notion 페이지 우측 상단에서 TimePilot 커넥션이 허용되어 있는지 확인해 주세요."라고 안내 모달을 띄웁니다.

### 1.3 사용자 지정 속성 누락 또는 스키마 변경 (Parsing Error)
-   **발생 원인**: Notion 데이터베이스 내에 필수적인 'Status' 또는 'Due Date' 속성 명칭이 사용자에 의해 수정되거나 삭제된 경우.
-   **서버 처리**:
    - `determineCategory` 함수 및 `mapNotionPageToUnified` 수행 시 속성이 존재하지 않더라도 `null-safe` 접근 제어자(`?.`) 및 Fallback 기본값을 사용하여 가공 도중 JavaScript 런타임 크래시가 나지 않도록 방어 로직을 작성합니다.
    - 예: `properties.Status?.status?.name || 'To Do'`

---

## 2. 세부 검증 시나리오 및 통합 테스트 절차

### Scenario A: Mock Mode Notion 연동 및 Bento Grid UI 검증
*   **검증 환경**: `.env.local` 에 `MOCK_MODE=true` 로 설정.
*   **순서**:
    1. `npm run dev` 실행 후 브라우저로 `http://localhost:3000` 진입.
    2. 로그인 성공 후 대시보드 메인 화면에 진입하여 Outlook 이메일 카드(기존 3건) 외에 노션 할 일 항목(`MOCK_NOTION_PAGES` 2건)이 리스트에 함께 로드되는지 확인.
    3. Notion에서 가져온 카드 상단에 `notion` 소스 구분 뱃지가 Notion 고유의 컬러 테마로 정상 표시되는지 검증.
    4. "오늘 뭐 해야 해?" AI Copilot 입력 창에 입력 시, Outlook 메일과 Notion 태스크가 통합 요약되어 우선순위별로 정상 나열되는지 결과 텍스트 검사.

### Scenario B: Notion API 실환경 연동 및 권한 승인 통합 검증
*   **검증 환경**: `.env.local` 에 `MOCK_MODE=false` 및 유효한 Notion Integration Token / Database ID 설정 상태.
*   **순서**:
    1. Next.js 개발 서버 기동 후 대시보드 접속.
    2. 개발자 도구의 Network 탭을 열고 `/api/mails` 호출 시 실제 Notion API 통신(`POST /databases/.../query`)이 발생하며 정상 응답코드(200)와 실제 Notion 페이지 목록이 잘 정제되어 반환되는지 확인.
    3. Notion 앱에 들어가 임의의 신규 페이지를 연동된 데이터베이스에 생성하고 마감일을 오늘로 수립.
    4. TimePilot 브라우저 화면을 새로고침하여 방금 생성한 노션 카드가 대시보드의 '오늘 해야 할 행동 지침'에 최상단으로 실시간 로드되는지 최종 검증.
