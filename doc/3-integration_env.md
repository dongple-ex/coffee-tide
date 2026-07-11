# Part 3: 외부 연동 규격 및 환경 구성 명세

> ⚠️ **역사 문서 (Phase 1 · TimePilot 시절)** — 초기 Microsoft 단일 채널 설계 기록으로, 현재 coffeTide 정본과 다릅니다. 특히 본문의 `/api/auth/signin`(MS OAuth 시작점)·`/api/auth/callback`(콜백) 설명은 현행 설계와 **정반대**입니다: 현행은 `signin`=게스트 세션 발급, Outlook OAuth=`/api/auth/outlook` → `/api/auth/outlook/callback`. 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 [`as-built-reference.md`](./as-built-reference.md).

본 파트에서는 Microsoft Entra ID (구 Azure AD) 연동 스펙과 설정 정보, 그리고 이를 제어하기 위한 API Endpoint 정의를 설명합니다.

## 1. Microsoft Entra ID App Registration 규격

MS Graph API에 안전하게 연결하기 위하여 Microsoft Azure Portal에서 생성해야 하는 애플리케이션 등록 스펙입니다.

| 항목 | 설정값 및 설명 | 비고 |
| :--- | :--- | :--- |
| **애플리케이션 유형** | `Web` | 서버 기반 인증 코드 흐름용 |
| **지원되는 계정 유형** | `Multitenant and Personal Microsoft accounts` (`common`) | 일반 Hotmail, Outlook 및 회사 계정 허용 |
| **Redirect URI** | `http://localhost:3000/api/auth/callback` | 인증 코드 전송 수신 경로 |
| **Client Credentials** | Client Secret 생성 필요 (보안 문자열 값 보관 필수) | 만료 기간은 최소 6개월 이상 권장 |
| **필수 API 권한 (Scope)** | `User.Read` (Delegated) - 로그인 및 기본 프로필 획득<br/>`Mail.Read` (Delegated) - 편지함 메시지 읽기<br/>`offline_access` - Refresh Token 획득을 위해 필수 | 동의(Consent) 팝업 제공됨 |

---

## 2. API Endpoints 설계

인증 및 데이터 조회를 처리하는 백엔드 API 명세서입니다.

### 2.1 `/api/auth/signin`
- **Method**: `GET`
- **Description**: MSAL 로그인 시도 엔드포인트. 로그인 URI를 계산하고 사용자 브라우저를 해당 주소로 리다이렉트합니다.
- **쿠키 처리**: 인증 유효성을 위한 `pkce_verifier` 및 `csrf_state` 임시 세션 쿠키를 HttpOnly 형태로 굽습니다.

### 2.2 `/api/auth/callback`
- **Method**: `GET`
- **Query Params**: `code` (인증 코드), `state` (CSRF 검증용)
- **Description**: MSAL로부터 인증 완료 후 복귀 주소. 코드를 사용하여 Access Token/Refresh Token으로 교환합니다.
- **쿠키 처리**: 획득한 토큰을 암호화하여 장기 보관용 HttpOnly 세션 쿠키(`tp_session`)에 보관하고 메인 화면으로 리다이렉트 처리합니다.

### 2.3 `/api/auth/signout`
- **Method**: `GET`
- **Description**: 로컬 세션을 완전히 파괴합니다.
- **쿠키 처리**: `tp_session` 쿠키를 만료(`maxAge: 0`)시킵니다.

### 2.4 `/api/mails`
- **Method**: `GET`
- **Description**: 현재 세션 토큰으로 Outlook API에서 이메일 목록을 조회해 공통 데이터로 변환 후 반환합니다.
- **Response Format**: `UnifiedData[]`
- **Error Response**: 세션이 만료된 경우 `401 Unauthorized`, API 장애 시 `500 Internal Server Error`

---

## 3. 환경 변수 템플릿 (`.env.local`)

프로젝트 루트 폴더에 위치해야 할 설정 정보 템플릿입니다.

```bash
# ==============================================================================
# TimePilot Local Environment Variables
# ==============================================================================

# [API MODE]
# true 설정 시 실제 MS 로그인 및 API 통신 없이 Mock 데이터로 동작하여 신속한 UI 테스트가 가능합니다.
MOCK_MODE=false

# [Microsoft Entra ID App Credentials]
# Azure Portal -> App Registrations에서 발급받은 값을 기록합니다.
NEXT_PUBLIC_MS_CLIENT_ID=your_client_id_here
MS_CLIENT_SECRET=your_client_secret_here
MS_TENANT_ID=common
NEXT_PUBLIC_MS_REDIRECT_URI=http://localhost:3000/api/auth/callback

# [Security & Cookie Session]
# 세션 쿠키 암호화(AES-256-GCM)에 사용할 32바이트(256비트) 길이의 무작위 비밀키입니다.
# Windows PowerShell 예시: [Convert]::ToBase64String((1..32 | % { [byte](Get-Random -Min 0 -Max 256) }))
SESSION_ENCRYPTION_SECRET=min_32_characters_random_secret_key_here
```
