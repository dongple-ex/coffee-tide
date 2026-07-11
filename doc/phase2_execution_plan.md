# Phase 2: 단계별 세부 개발 계획

> ⚠️ **역사 문서 (Phase 2 · TimePilot 시절)** — Notion 초기 연동 설계 기록입니다. 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 Phase 3 이후 문서.

본 파트에서는 TimePilot Phase 2 (Notion Adapter 연동 및 UI 결합) 구현을 완수하기 위해 실행해야 할 작업을 단계별로 분할하고 구체적으로 작성해야 할 소스 파일 경로와 목적을 정의합니다.

## 1. 초기 패키지 설치 의존성
- **`@notionhq/client`**: Notion API 호출을 위한 공식 SDK 라이브러리.

---

## 2. 세부 개발 단계 및 소스 파일 맵핑

### Step 1: Notion 자격 증명 연동 및 세션 데이터 확장
*   **목적**: Notion OAuth 또는 API Key를 수용할 수 있도록 환경 변수와 쿠키 세션 데이터 구조를 확장합니다.
*   **작업 내용**:
    *   `src/lib/auth/session.ts` 의 `SessionData` 인터페이스에 `notionAccessToken` 필드 추가.
    *   `.env.local` 및 `.env.example`에 `NOTION_INTEGRATION_TOKEN` 및 `NOTION_DATABASE_ID` 추가 (수동 내부 통합 테스트용).
    *   사용자 프로필 상단이나 설정 영역에 "Notion DB 연동" 입력 폼 제공 (수동으로 Database ID를 입력할 수 있도록 보조 UI 지원).

### Step 2: Notion Adapter 구현 (with Unified Model 매핑)
*   **목적**: `BaseAdapter` 인터페이스를 확장 구현하여 Notion Database로부터 미완료 페이지 목록을 가져오고 HTML 정제/속성 병합 필터를 거쳐 `UnifiedData` 형태로 가공하는 기능을 작성합니다.
*   **파일 생성 및 역할**:
    1. `src/lib/adapters/notion.ts` [NEW]:
       - `@notionhq/client`를 사용하여 Notion 클라이언트를 빌드.
       - `fetchRecent(limit)` 호출 시 지정된 `NOTION_DATABASE_ID`의 데이터베이스에 대해 미완료 상태 필터를 넣어 Query를 수행.
       - Query 결과를 돌며 `properties`에서 Title, Status, Author 등을 파싱하여 `UnifiedData` 구조로 변환.
    2. `src/lib/mocks/mails.ts` [MODIFY]:
       - `MOCK_NOTION_PAGES` 데이터를 하단에 추가 정의하고 팩토리에서 활용 가능하게 수출(export).
    3. `src/lib/adapters/factory.ts` [MODIFY]:
       - 사용자가 Notion 토큰/DB 정보를 설정했거나 Mock 모드인 상황에 맞춰 `NotionAdapter`와 `MockNotionAdapter` 중 적합한 클래스를 반환하도록 팩토리 변경.

### Step 3: 백엔드 API Route 다중 플랫폼 지원 확장
*   **목적**: 기존 `/api/mails` 경로를 다중 소스 지원용인 `/api/tasks` 또는 통합 `/api/mails` 형태로 고도화하여, Outlook 데이터와 Notion 데이터를 동시에 병렬 비동기 조회(`Promise.all`) 및 정합 정렬 처리하도록 리팩토링합니다.
*   **파일 생성 및 역할**:
    1. `src/app/api/mails/route.ts` [MODIFY]:
       - 세션 정보로부터 Microsoft 토큰과 Notion 토큰을 각각 추출.
       - Outlook 어댑터와 Notion 어댑터를 동시에 초기화.
       - `Promise.all([outlookAdapter.fetchRecent(), notionAdapter.fetchRecent()])`를 수행하여 리스트를 병합.
       - 병합된 `UnifiedData[]` 배열을 `created_at` 시간 기준 내림차순(최신순)으로 정렬하여 클라이언트에 일괄 응답.

### Step 4: UI Bento Grid 컴포넌트의 Notion 소스 지원
*   **목적**: Notion에서 수신된 할 일 항목을 대시보드 Bento Grid의 "행동 지침" 및 "전체 목록" 카드에 자연스럽게 렌더링하고, 소스 뱃지(`notion`용 로고 또는 스타일)를 연동합니다.
*   **파일 생성 및 역할**:
    1. `src/app/page.tsx` [MODIFY]:
       - 렌더링 카드 내 `mail.source === 'notion'` 분기 처리.
       - 노션 카드 아이콘 또는 스타일 적용.
    2. `src/app/page.module.css` [MODIFY]:
       - Notion의 시그니처 색상을 반영한 뱃지 스타일(`.badge_notion` 등) 정의.
