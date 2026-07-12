# coffeeTide 문서 인덱스

**커피 한 잔 하면서 오늘을 정리하는 AI 개인 비서** (구 TimePilot)

연동이 없어도 manual/paste로 바로 시작할 수 있는, 연결되면 더 강력해지는 시간 관리 비서입니다.

- **서비스 도메인(예정)**: `coffeeTide.dongple.kr`
- **현재 상태**: **MVP 구현 완료 (2026-07-11).** 무연동 코어(G1~G6)와 6종 연동 구조가 이 저장소에 구현되어 있으며, 검증 3종 세트(tsc/lint/build)와 MOCK 런타임 스모크를 통과했습니다. 남은 격차는 [`7-backlog.md`](./7-backlog.md) 참조.

## 핵심 가치
- 무연동 우선 설계
- 자연스러운 업무 입력 (manual, paste)
- AI Copilot + 자동화
- 다중 플랫폼 연결
- 웹 우선 (모바일 전략: [`8-mobile_strategy.md`](./8-mobile_strategy.md))

## 읽기 순서 (신규 작업 전 필독)

1. [`00-current-state.md`](./00-current-state.md)
   - 제품 정본 기획서. 철학, 데이터 허브, 사용자 흐름, 성공 기준, 구현 시 필수 요구사항.
2. [`7-backlog.md`](./7-backlog.md)
   - 실행형 백로그. 특히 **G 항목**(manual/paste 무연동 소스)이 정본 핵심 기능의 설계 기준입니다.
3. [`phase3_implementation_plan.md`](./phase3_implementation_plan.md) → [`phase3_execution_plan.md`](./phase3_execution_plan.md)
   - 독립 게스트 세션, 커넥션 매니저, 선택적 외부 연동 구조.
4. [`phase3_ai_flow_spec.md`](./phase3_ai_flow_spec.md)
   - AI 분류와 Copilot 응답 규칙. 날짜/출처 근거 규칙을 반드시 따릅니다.
5. [`phase5_implementation_plan.md`](./phase5_implementation_plan.md)
   - 완료 처리, 답장 초안 등 양방향 쓰기(write-back) 설계.
6. [`phase6_llm_artifacts_spec.md`](./phase6_llm_artifacts_spec.md)
   - LLM 산출물(Claude/Gemini `MEMORY.md` 등) 수집 + Obsidian 미러링 기획. **미구현**.
7. [`8-mobile_strategy.md`](./8-mobile_strategy.md)
   - 모바일 전략. 기본은 웹으로 진행하며, 로컬 파일 기반 연동의 데스크톱 전용 제약을 정의합니다.
8. [`as-built-reference.md`](./as-built-reference.md)
   - **현재 구현 코드 기준** 기술 레퍼런스(API 엔드포인트·환경변수·데이터모델·인증). "지금 코드가 하는 일"의 정본.

## 문서 명명 규칙

- `0-*.md` ~ `5-*.md`, `implementation_plan.md` : **Phase 1 역사 문서** (Outlook 단일 채널 설계) — 참고용, 현재 설계와 불일치.
- `phase2_*.md` : **Phase 2 역사 문서** (Notion 초기 연동 설계) — 참고용.
- `phase3_*.md`, `phase5_*.md`, `phase6_*.md` : 단계별 설계 문서 — **정본**.
- `00-current-state.md`, `7-backlog.md`, `8-mobile_strategy.md`, `as-built-reference.md` : 살아있는 문서 — 항상 최신 유지.

## 문서 상태

- Phase 1~2 문서(`0~5`, `phase2_*`)는 초기 외부 연동 중심 설계가 포함된 **역사 문서**입니다. 신규 작업의 정본은 `00-current-state.md`와 Phase 3 이후 문서입니다.
- `/api/auth/signin`은 Microsoft OAuth 시작점이 아니라 **게스트 세션** 시작점입니다. Outlook OAuth 시작점은 `/api/auth/outlook`, 콜백은 `/api/auth/outlook/callback`입니다.
- 사용자가 서비스를 연결하지 않아도 수동 입력, 붙여넣기 가져오기, 로컬 문서 폴더를 통해 업무 데이터를 만들 수 있어야 합니다.
- 구 phase4 문서(`phase4_manual_data_fallback_spec.md`, `phase4_execution_plan.md`)는 존재하지 않습니다. manual/paste 무연동 설계는 `00-current-state.md`와 `7-backlog.md`의 G 항목이 정본입니다.
