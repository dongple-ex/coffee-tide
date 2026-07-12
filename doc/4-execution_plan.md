# Part 4: 단계별 세부 작업 계획

> ⚠️ **역사 문서 (Phase 1 · TimePilot 시절)** — 초기 Microsoft 단일 채널 설계 기록으로, 현재 coffeeTide 정본과 다릅니다. 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 Phase 3 이후 문서.

본 파트에서는 TimePilot Phase 1을 완수하기 위해 실행해야 할 작업을 단계별로 분할하고 구체적으로 작성해야 할 소스 파일 경로와 목적을 정의합니다.

## 1. 초기 패키지 설치 의존성
프로젝트 시작 시 가장 먼저 설치해야 할 라이브러리 목록입니다.
- **`@azure/msal-node`**: 서버 사이드 Microsoft OAuth 처리를 위함.
- **`@microsoft/microsoft-graph-client`**: Graph API 호출 전용 SDK 클라이언트.
- **`@microsoft/microsoft-graph-types`**: Graph API 리소스 타입 정의.

---

## 2. 세부 개발 단계 및 소스 파일 맵핑

### Step 1: 프로젝트 구조 초기화 및 글로벌 스타일 시스템 구축
- **목적**: Next.js 프로젝트를 생성하고, Tailwind CSS 설정을 배제한 상태에서 CSS 변수를 사용하여 고급 다크 모드 UI 기본 프레임을 작성합니다.
- **파일 생성 및 역할**:
  1. `src/app/globals.css` [NEW]:
     - 다크 테마 컬러(배경 `#0a0e17`, 메인 카드 `#131924`, 네온 블루 포인트 `#00d2ff`) 및 기본 리셋 CSS 선언.
  2. `src/app/layout.tsx` [MODIFY]:
     - 폰트 최적화(Google Outfit 폰트 등 적용) 및 글로벌 스타일 로드.
  3. `src/app/page.module.css` [NEW]:
     - 대시보드 컴포넌트 배치용 Bento Grid 구조 및 호버 애니메이션 스타일링.

### Step 2: MSAL 인증 모듈 및 암호화 세션 구현
- **목적**: Microsoft Entra ID와 통신하여 획득한 세션 토큰 정보를 노출되지 않도록 서버단에서 대칭키 암호화(AES-256-GCM)하여 쿠키 형태로 굽는 기능을 작성합니다.
- **파일 생성 및 역할**:
  1. `src/lib/auth/session.ts` [NEW]:
     - `node:crypto` 모듈을 이용하여 쿠키에 들어갈 세션 객체를 암호화(Encrypt)/복호화(Decrypt)하는 유틸리티.
  2. `src/lib/auth/msal.ts` [NEW]:
     - `ConfidentialClientApplication` 인스턴스 생성 및 Microsoft OAuth 파라미터 구성.
  3. `src/app/api/auth/signin/route.ts` [NEW]:
     - PKCE code verifier와 state를 생성해 쿠키에 임시 저장하고 MSAL 로그인 주소로 리다이렉트 처리.
  4. `src/app/api/auth/callback/route.ts` [NEW]:
     - 로그인 응답을 받아 코드 및 state를 검증하고 토큰을 획득, 암호화하여 `tp_session` 쿠키에 저장.
  5. `src/app/api/auth/signout/route.ts` [NEW]:
     - 세션 쿠키를 무효화하여 로그아웃 처리.

### Step 3: Base Adapter 및 Outlook Adapter 개발 (Unified Model 매핑)
- **목적**: 타 플랫폼 연동에 유연하게 대응할 수 있도록 어댑터 구조를 추상화하고, Graph API로부터 데이터를 받아 HTML 태그를 정제하여 `UnifiedData` 모델로 가공하는 팩토리를 완성합니다.
- **파일 생성 및 역할**:
  1. `src/lib/types/unified.ts` [NEW]:
     - `UnifiedData`, `UnifiedAuthor` 인터페이스 정의.
  2. `src/lib/mocks/mails.ts` [NEW]:
     - UI 단독 개발 검증용 Mock 메일 리스트 정의.
  3. `src/lib/adapters/base.ts` [NEW]:
     - `BaseAdapter` 인터페이스 정의 (`fetchRecent(limit: number): Promise<UnifiedData[]>` 포함).
  4. `src/lib/adapters/outlook.ts` [NEW]:
     - Graph Client를 이용해 편지함의 최신 메일을 조회하고 HTML 마크업 제거 필터링 후 반환하는 `OutlookAdapter` 구현.
  5. `src/lib/adapters/factory.ts` [NEW]:
     - `process.env.MOCK_MODE` 값에 맞춰 실제 Outlook 혹은 Mock 어댑터를 반환하는 `AdapterFactory` 클래스.

### Step 4: API 엔드포인트 연동 및 대시보드 메인 화면 구현
- **목적**: `/api/mails`를 구현하고, 프론트엔드 대시보드 화면에 통합하여 로그인 상태에 따른 UI 분기 및 메일 목록 출력을 연결합니다.
- **파일 생성 및 역할**:
  1. `src/app/api/mails/route.ts` [NEW]:
     - 세션 검증 후 적합한 어댑터를 호출하여 가공된 Unified Data List를 JSON으로 반환하는 라우트.
  2. `src/app/page.tsx` [MODIFY]:
     - 로그인 전 Welcome 화면과 로그인 후 Bento Grid 대시보드 화면 렌더링.
     - 메일 카드, 통계 위젯(읽지 않아도 된 메일 수, 절약된 시간), AI 요약 프롬프트박스 구현.
