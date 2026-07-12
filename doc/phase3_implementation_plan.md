# coffeeTide Phase 3 종합 구현 계획서: AI Action Engine & 독립 세션 개편

본 문서는 coffeeTide Phase 3(AI Action Engine 및 AI 비서 Copilot MVP 구현) 구현을 위한 최상위 마스터 계획서입니다. 
지적해주신 **"Outlook 비종속형 독립 세션 및 개별 커넥션 관리자(Connection Settings)"** 설계를 반영하여 아키텍처를 전면 리팩토링합니다.

---

## 1. 아키텍처 개선 핵심 (Outlook 필수 조건 해제)

기존 로그인 흐름은 Microsoft OAuth 계정이 로그인 및 세션 생성의 필수 조건으로 묶여 있어, Outlook을 쓰지 않는 사용자가 Notion 등 다른 도구만 연동하려는 시나리오를 충족하지 못했습니다. 이를 개선하여 **독립형 게스트/로컬 로그인 및 개별 플랫폼 연동 구조**로 변경합니다.

```
                  ┌────────────── [ coffeeTide 시작 ] ──────────────┐
                  │               (게스트 세션 발급)               │
                  ▼                                                ▼
         [ 🔌 Outlook 커넥션 ]                             [ 🔌 Notion 커넥션 ]
      - OAuth 로그인 / 연동                              - API Key & DB ID 수동 입력
      - 세션에 outlookToken 저장                         - 세션에 notionToken 저장
                  │                                                │
                  └───────────────► [ 통합 데이터 API ] ◄───────────┘
                                    - 활성화된 토큰만 선택 조회
                                    - 동적 AI 분류 및 대시보드 렌더링
```

### 1.1 변경 사항 요약
1.  **독립 세션 도입**: 첫 화면에서 즉시 게스트/로컬 세션을 생성하고 로그인 처리하여 대시보드로 바로 진입합니다.
2.  **커넥션 매니저 UI 개설**: 대시보드 내에 Outlook과 Notion의 연동 상태를 개별적으로 활성화/비활성화하고 인증할 수 있는 UI 폼(설정 카드)을 제공합니다.
3.  **API 동적 반응성**: `/api/mails` 호출 시 세션에 담긴 연동 상태에 따라 Outlook 및 Notion 조회를 동적으로 선택 실행합니다. (연동 정보가 없으면 예외 대신 비어있는 대시보드와 가이드 노출)

---

## 2. 구현 전 확인 사항 (Pre-implementation Checklist)

- [ ] **Gemini API Key 발급**: [Google AI Studio](https://aistudio.google.com/)에서 API 키를 획득하여 `.env.local`의 `GEMINI_API_KEY`에 등록합니다.
- [ ] **환경 변수 유효성 점검**: 로컬 `.env.local` 파일이 정상 복사되어 있는지 확인합니다.

---

## 3. 파트별 세부 기술 명세서 목록

*   **[Part 3-1: AI Action Engine 및 AI 비서 기술 명세](./phase3_ai_flow_spec.md)**: AI 처리 아키텍처, JSON Output Mode 시스템 프롬프트 엔지니어링 및 Copilot 브리핑 프롬프트 명세서 포함.
*   **[Part 3-2: 단계별 세부 작업 계획](./phase3_execution_plan.md)**: 패키지 설치, 파일별 역할 구성 및 Step 1 ~ Step 4까지의 개발 순서 정의.
*   **[Part 3-3: 예외 처리 및 검증 로직 명세](./phase3_validation_log.md)**: Gemini API 401/429 에러 복구용 로컬 Fallback 규칙 설계, JSON 파싱 예외 처리 및 테스트 시나리오 정의.
