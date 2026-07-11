# TimePilot Phase 2 종합 구현 계획서: Notion Adapter 연동

> ⚠️ **역사 문서 (Phase 2 · TimePilot 시절)** — Notion 초기 연동 설계 기록입니다. 현행 설계에서 Notion 연동은 `.env` 고정이 아니라 커넥션 매니저를 통한 세션 저장 방식입니다([`phase3_execution_plan.md`](./phase3_execution_plan.md) 참조). 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 Phase 3 이후 문서.

본 문서는 TimePilot Phase 2(Notion Adapter 연동 및 다중 소스 통합 대시보드 구축) 구현을 위한 최상위 마스터 계획서입니다. 세부 설계 및 작업 내용은 파트별 분할 문서로 작성되었으며, 본문 하단의 링크를 통해 참조하실 수 있습니다.

---

## 1. 구현 전 확인 사항 (Pre-implementation Checklist)

개발을 시작하기 전에 반드시 점검하고 확보해야 할 필수 자원 및 설정 목록입니다.

### 1.1 Notion API 사전 등록 요건
- [ ] **Notion API 통합(Integration) 생성**: [Notion Developers](https://developers.notion.com/) 포털에 로그인하여 `TimePilot`용 신규 Internal/Public Integration을 생성합니다.
- [ ] **데이터베이스 공유(Connection) 설정**: 연동하고자 하는 Notion 워크스페이스 내 특정 데이터베이스(예: Task DB)를 열고, 우측 상단 `...` 버튼 클릭 -> `커넥션 추가`에서 방금 생성한 `TimePilot` 앱을 추가 및 승인합니다.
- [ ] **Integration Token 복사**: 노션 포털에서 발급한 `Internal Integration Token` (프라이빗 연동 토큰)을 복사하여 준비합니다. -> `.env.local`의 `NOTION_INTEGRATION_TOKEN`
- [ ] **Database ID 획득**: 연동할 노션 데이터베이스의 URL에서 고유 UUID 형식의 ID를 획득하여 준비합니다. (URL 예시: `https://notion.so/{workspace_name}/{database_id}?v=...` 에서 `database_id` 영역 추출) -> `.env.local`의 `NOTION_DATABASE_ID`

### 1.2 로컬 개발 설정 및 환경 점검
- [ ] **npm 패키지 설치 준비**: Notion 공식 SDK 클라이언트 패키지(`@notionhq/client`)를 로컬 워크스페이스에 설치할 수 있도록 준비합니다.
- [ ] **환경 변수 템플릿 확장**: `.env.local` 에 노션 관련 필수 암호 변수를 안전하게 보관할 수 있는지 사전 구조를 마련합니다.

---

## 2. 파트별 세부 기술 명세서 목록

TimePilot Phase 2 구현 계획은 구체적인 기술 영역에 따라 4개의 문서로 세분화되어 있습니다. 아래 링크를 통해 상세 설계를 검토하실 수 있습니다.

*   **[Part 2-1: Notion API 연동 규격 및 데이터 매핑 명세](./phase2_notion_spec.md)**: OAuth 인증 방식, Notion 데이터 스펙 및 Unified Data Model 매핑 규칙 정보 포함.
*   **[Part 2-2: 단계별 세부 개발 계획](./phase2_execution_plan.md)**: 패키지 설치, 파일별 역할 구성 및 Step 1 ~ Step 4까지의 개발 순서 정의.
*   **[Part 2-3: 예외 처리 및 검증 로직 명세](./phase2_validation_log.md)**: Notion API 인증 오류(401/403), 속성 누락 예외 상황 대응 및 Mock/실환경 통합 테스트 시나리오 정의.
