# Phase 3: 단계별 세부 개발 계획 (독립 세션 및 커넥션 매니저 개편)

본 파트에서는 Outlook 계정 종속성을 탈피하고, 독립형 로컬 세션 및 다중 플랫폼 개별 연동 관리 시스템으로 coffeTide Phase 3을 전면 개편하기 위한 세부 작업을 단계별로 기술합니다.

---

## 1. 세부 개발 단계 및 소스 파일 맵핑

### Step 1: 독립 세션 로그인 분기 및 Outlook 연동 라우트 이관
*   **목적**: 최초 서비스 진입 시 Microsoft 인증을 강제하지 않고 로컬 독립 게스트 세션을 즉시 발급하며, Outlook 연동 경로는 전용 엔드포인트로 분리합니다.
*   **작업 내용**:
    1. `src/app/api/auth/signin/route.ts` [MODIFY]:
       - Microsoft OAuth 로그인 리다이렉트 대신, 즉시 게스트 계정(`userEmail: "guest@coffetide.dongple.kr"`)으로 암호화 세션 쿠키(`tp_session`)를 발급하고 메인 `/` 로 리다이렉트시킵니다.
    2. `src/app/api/auth/outlook/route.ts` [NEW]:
       - 기존 signin 라우트의 Microsoft OAuth 로그인 URI 생성 및 PKCE verifier 쿠키 굽기 로직을 이관합니다. (Redirect URI: `http://localhost:3000/api/auth/outlook/callback` 또는 연동 맞춤)
    3. `src/app/api/auth/outlook/callback/route.ts` [NEW]:
       - 기존 callback 라우트 로직을 이관합니다. 인증 성공 시, 현재 세션 쿠키(`tp_session`)를 읽어 복호화한 후 `accessToken` 필드에 Microsoft 토큰을 추가 적재하여 세션 쿠키를 갱신 발급하고 메인으로 돌아갑니다.

### Step 2: Notion 연동 API 및 커넥션 관리 UI 구현
*   **목적**: Notion 연동 정보를 세션 쿠키에 업데이트할 수 있는 백엔드 API를 신규 개설하고, 대시보드 내에 개별 서비스를 켜고 끄는 관리 패널을 구현합니다.
*   **작업 내용**:
    1. `src/app/api/auth/notion/route.ts` [NEW]:
       - 클라이언트로부터 `notionToken` 및 `notionDbId`를 POST로 수신합니다.
       - 세션을 복호화하여 Notion 연동 정보를 추가 기입하고 쿠키를 재갱신 발급합니다.
    2. `src/app/page.tsx` [MODIFY]:
       - 로그인 화면 진입 시 "coffeTide 시작하기" 버튼을 노출하여 즉시 대시보드로 진입하게 합니다.
       - Bento Grid 내에 **"🔌 서비스 연동 관리"** 카드를 추가합니다.
         - **Outlook**: 현재 연동 상태(연동됨 / 미연동)와 함께 "연동하기" 버튼(또는 해제 버튼)을 연출합니다.
         - **Notion**: 토큰 및 DB ID 수동 입력 폼을 제공하고 "저장 및 연동" 버튼을 연출합니다.

### Step 3: 백엔드 API 동적 선택적 동기화 구현
*   **목적**: 사용자가 실제로 연동을 완료한 플랫폼의 데이터만 동적으로 조회하도록 API를 리팩토링합니다.
*   **작업 내용**:
    1. `src/app/api/mails/route.ts` [MODIFY]:
       - 복호화된 세션 정보에 `accessToken` (Outlook용)이 존재하는 경우에만 Outlook API 조회를 실행합니다.
       - 복호화된 세션 정보에 `notionAccessToken` (Notion용) 및 `notionDbId`가 존재하는 경우에만 Notion API 조회를 실행합니다.
       - 각 플랫폼의 연동 유무 상태(`connections: { outlook: boolean, notion: boolean }`)를 응답 바디에 함께 실어 반환합니다.

### Step 4: UI 빈 상태(Empty State) 예외 피드백 지원
*   **목적**: 연동된 도구가 아예 없을 때의 화면 가이드를 마련하고, 신규 연동 시 동적 갱신 처리를 매끄럽게 완성합니다.
*   **작업 내용**:
    1. `src/app/page.tsx` [MODIFY]:
       - 연동 상태가 둘 다 `false`인 경우, 대시보드 목록창에 "현재 연동된 협업 도구가 없습니다. 우측 서비스 연동 관리 카드에서 Outlook 또는 Notion을 연결하여 업무 행동 지침을 받아보세요!" 라는 빈 화면(Empty State) 디자인을 노출합니다.
