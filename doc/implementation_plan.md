# TimePilot Phase 1 종합 구현 계획서

> ⚠️ **역사 문서 (Phase 1 · TimePilot 시절)** — 본 문서와 `doc/0~5`는 초기 **Phase 1(Microsoft 단일 채널)** 설계 기준이라 현재 coffeTide 정본과 다릅니다. 제품 정본은 **[doc/00-current-state.md](./00-current-state.md)**, 프로토타입 기술 레퍼런스는 **[doc/as-built-reference.md](./as-built-reference.md)**, 개선 백로그는 **[doc/7-backlog.md](./7-backlog.md)** 를 참조하세요.

본 문서는 TimePilot Phase 1(Microsoft OAuth, Graph API 연동 및 최근 메일 조회) 구현을 위한 최상위 마스터 계획서입니다. 세부 설계 및 작업 내용은 파트별 분할 문서로 작성되었으며, 본문 하단의 링크를 통해 참조하실 수 있습니다.

---

## 1. 구현 전 확인 사항 (Pre-implementation Checklist)

개발을 시작하기 전에 반드시 점검하고 확보해야 할 필수 자원 및 설정 목록입니다.

### 1.1 Microsoft Entra ID (Azure Portal) 설정 확보
- [ ] **Azure App Registration 등록**: Azure Portal에 TimePilot 앱이 생성되어 있는지 확인합니다.
- [ ] **Redirect URI 일치 검증**: 등록된 웹 플랫폼의 Redirect URI가 `http://localhost:3000/api/auth/callback`과 완벽히 일치하는지 확인합니다.
- [ ] **조직 관리자 권한 확인 (선택사항)**: 회사/학교 계정을 연동할 때 `Mail.Read` 권한 획득 시 조직 관리자 동의(Admin Consent)가 필수인지 확인합니다. 만약 필요하다면 개인 Microsoft 계정(`outlook.com`, `hotmail.com` 등)으로 먼저 실환경 테스트 계정을 준비합니다.
- [ ] **Client Secret 값 저장**: 앱 등록 시 생성한 클라이언트 암호(Value)의 노출 수명이 아직 유효하고, 임시 보관 중인지 점검합니다. (생성 직후에만 값을 확인할 수 있으므로 분실 시 재발행 필요)

### 1.2 개발 환경 및 보안 키 사전 정의
- [ ] **Node.js 버전 확인**: 로컬 환경의 Node.js 버전이 v18.17.0 이상인지 터미널에서 확인합니다. (`node -v`)
- [ ] **세션 보안 암호화 비밀키 준비**: 세션 쿠키를 서버단에서 안전하게 보호하기 위한 최소 32바이트 길이의 임의의 문자열(`SESSION_ENCRYPTION_SECRET`)을 준비해 둡니다.
- [ ] **로컬 환경 변수 파일 생성**: `.env.local` 파일이 프로젝트 루트 경로에 누락 없이 배치될 수 있도록 사양을 검토합니다.

### 1.3 개발 전략 합의
- [ ] **Mock Mode 적용 계획**: 실제 Microsoft App 등록 절차가 완료되지 않았거나 네트워크 통신이 불가한 개발 초기 상태를 대비하여, `.env.local` 내 `MOCK_MODE=true`로 전환하여 가상 데이터로 화면 설계를 진행할 것인지 결정합니다.

---

## 2. 파트별 세부 기술 명세서 목록

TimePilot Phase 1 구현 계획은 구체적인 기술 영역에 따라 6개의 문서로 세분화되어 있습니다. 아래 링크를 통해 상세 설계를 검토하실 수 있습니다.

*   **[Part 0: 사전 준비 및 가이드라인](./0-prerequisites.md)**: Azure App 등록 가이드, 세션 키 생성법, 샌드박스 설정 요령 포함.
*   **[Part 1: 시스템 아키텍처 및 제어 흐름 명세](./1-architecture_flow.md)**: OAuth 인증(PKCE) 시퀀스 및 메일 동기화/갱신 흐름도 정보 포함.
*   **[Part 2: 데이터 처리 및 정제 명세](./2-data_processing.md)**: 공통 데이터 모델(`UnifiedData`), Graph API 데이터 정규화 매핑 테이블, HTML 본문 텍스트 추출 필터링 알고리즘 및 Mock 데이터 정의.
*   **[Part 3: 외부 연동 규격 및 환경 구성 명세](./3-integration_env.md)**: Microsoft Entra ID 상세 사양, API 엔드포인트 설계서 및 `.env.local` 템플릿 명세.
*   **[Part 4: 단계별 세부 작업 계획](./4-execution_plan.md)**: 패키지 설치 목록 및 Step 1 ~ Step 4까지 생성될 세부 파일별 역할 구성.
*   **[Part 5: 예외 처리 및 검증 로직 명세](./5-validation_log.md)**: 세션 만료, Graph API 429 Too Many Requests 대응 및 통합 테스트 시나리오 정의.
