# Part 1: 시스템 아키텍처 및 제어 흐름 명세

> ⚠️ **역사 문서 (Phase 1 · TimePilot 시절)** — 초기 Microsoft 단일 채널 설계 기록으로, 현재 coffeTide 정본과 다릅니다. 특히 `/api/auth/signin`은 현행 설계에서 **게스트 세션** 시작점이며(MS OAuth 아님), `/api/auth/callback`은 미사용입니다. 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 Phase 3 이후 문서.

본 파트에서는 TimePilot Phase 1의 시스템 구조 및 제어 흐름(로그인 인증, 메일 수신)을 상세히 다룹니다.

## 1. OAuth 2.0 Authorization Code Flow with PKCE

Microsoft Entra ID 인증 절차 시 안전한 연동을 위해 PKCE(Proof Key for Code Exchange) 방식을 적용합니다.

### 1.1 인증 시퀀스 흐름
```mermaid
sequenceDiagram
    autonumber
    actor User as 사용자 (브라우저)
    participant NextApp as Next.js 프론트엔드 (Client)
    participant AuthAPI as Next.js API (/api/auth/*)
    participant Session as 세션 관리 (Encrypted Cookie)
    participant MSAL as MS Entra ID (OAuth Provider)

    User->>NextApp: "로그인" 버튼 클릭
    NextApp->>AuthAPI: GET /api/auth/signin 요청
    Note over AuthAPI: 1. PKCE Code Verifier & Code Challenge 생성<br/>2. State 파라미터 생성 (CSRF 방지)<br/>3. Verifier는 임시 세션 쿠키에 보관
    AuthAPI-->>NextApp: Microsoft 로그인 URI로 Redirect 응답
    NextApp-->>User: Microsoft ID 로그인 페이지 노출
    User->>MSAL: 자격 증명 입력 및 로그인 완료 (권한 동의)
    MSAL-->>NextApp: Redirect to Callback URI<br/>?code={auth_code}&state={state}
    NextApp->>AuthAPI: GET /api/auth/callback?code={auth_code}&state={state} 요청
    Note over AuthAPI: 1. 임시 세션에서 State 및 Verifier 검증<br/>2. MSAL에 Authorization Code + Verifier로 Access/Refresh Token 교환 요청
    AuthAPI->>MSAL: POST /token (code, verifier, client_id, client_secret)
    MSAL-->>AuthAPI: Access Token & Refresh Token & id_token 반환
    Note over AuthAPI: 1. 토큰 데이터 암호화 (AES-256-GCM)<br/>2. Secure, HttpOnly Session Cookie 생성
    AuthAPI->>Session: 세션 쿠키 저장
    AuthAPI-->>NextApp: 메인 대시보드(/)로 Redirect
    NextApp-->>User: 로그인 완료된 대시보드 화면 노출
```

---

## 2. 데이터 동기화 및 갱신 제어 흐름

사용자가 메인 화면에 진입하여 최근 메일을 동기화하고, 백엔드 서버에서 세션 토큰 수명을 검사하여 유효하게 가공하는 상세 제어 구조입니다.

### 2.1 메일 동기화 시퀀스 흐름
```mermaid
sequenceDiagram
    autonumber
    actor User as 사용자 (브라우저)
    participant NextApp as Next.js 프론트엔드 (Client)
    participant MailAPI as Next.js API (/api/mails)
    participant Session as 세션 관리 (Encrypted Cookie)
    participant Adapter as Outlook Adapter
    participant Graph as Microsoft Graph API
    participant MSAL as MS Entra ID (OAuth Provider)

    User->>NextApp: 대시보드 페이지 로드
    NextApp->>MailAPI: GET /api/mails
    MailAPI->>Session: 세션 쿠키 읽기 (Access Token, Expiry, Refresh Token 추출)
    Note over MailAPI: 토큰 만료 여부 확인 (현재 시간 vs Expiry)
    alt 토큰 만료됨 (Expired)
        Note over MailAPI: Refresh Token을 활용한 토큰 갱신 시도
        MailAPI->>MSAL: POST /token (grant_type=refresh_token, refresh_token)
        MSAL-->>MailAPI: 신규 Access & Refresh Token 반환
        Note over MailAPI: 새로운 토큰으로 세션 쿠키 재갱신 및 암호화 저장
        MailAPI->>Session: 갱신된 세션 저장
    end
    MailAPI->>Adapter: OutlookAdapter(accessToken) 인스턴스 생성
    MailAPI->>Adapter: fetchRecent(limit=10) 호출
    Adapter->>Graph: GET /me/mailFolders/inbox/messages (Query Params 적용)
    Graph-->>Adapter: Raw JSON (Message Resource List) 반환
    Note over Adapter: mapGraphMessageToUnified() 실행<br/>1. HTML 태그 정제 및 본문 텍스트 추출<br/>2. 공통 데이터 모델(UnifiedData) 매핑
    Adapter-->>MailAPI: UnifiedData[] 반환
    MailAPI-->>NextApp: JSON Response (UnifiedData[])
    NextApp-->>User: 정제된 최근 메일 리스트 렌더링
```
