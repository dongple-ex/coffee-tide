# coffeeTide 문서 인덱스

**커피 한 잔 하면서 오늘을 정리하는 AI 개인 비서**

연동이 없어도 manual/paste로 바로 시작할 수 있는, 연결되면 더 강력해지는 시간 관리 비서입니다.

- **서비스 도메인(예정)**: `coffeeTide.dongple.kr`
- **현재 상태 (2026-07-28)**: MVP(2026-07-11) → Phase 7 브리핑 고도화(07-22) → 개인화 기능(출퇴근 길찾기·단어-앱 바로가기, 07-22~23) → 생산성 도구(퀵 위젯·슬래시 커맨드·워크노트·퇴근 핸드오프, 07-24) → 대용량 저장소(IndexedDB & Google Drive 일자별 백업, 07-27) → **문서 정리 및 피처 브랜치 체계 구축(07-28)**.
- **UI 명칭**: 화면의 AI 도우미는 **"AI 바리스타"** 입니다 (코드·API는 `copilot`).

---

## 📚 정본 문서 읽기 순서 (신규 개발 필독)

1. [`00-current-state.md`](./00-current-state.md)
   - 제품 정본 기획서. 무연동 우선 철학, 데이터 허브, 사용자 흐름, 성공 기준, 필수 요구사항.
2. [`as-built-reference.md`](./as-built-reference.md)
   - **현재 구현 코드 기준** 기술 레퍼런스(API 엔드포인트·환경변수·데이터모델·인증·코드 구조).
3. [`7-backlog.md`](./7-backlog.md)
   - 실행형 백로그. 정본 핵심 기능의 설계 기준.
4. [`source-fix-plan.md`](./source-fix-plan.md)
   - 소스 점검 결과(K1~K13)와 처리 상태 관리 문서.
5. [`8-mobile_strategy.md`](./8-mobile_strategy.md)
   - 모바일 전략 (웹 우선, 하이브리드 앱 방향성).
6. [`hybrid_app_release_guide.md`](./hybrid_app_release_guide.md)
   - Capacitor 기반 하이브리드 앱 출시 가이드.
7. [`phase3_*.md`, `phase5_*.md`, `phase6_*.md`, `phase7_*.md`]
   - 단계별 기능 상세 스펙 (OAuth 연동, Write-back, LLM 산출물, 브리핑 고도화).

---

## 🏛️ 과거 레거시 문서 (`doc/legacy_timepilot/`)

구 프로젝트 명칭("TimePilot") 시절의 초기 단일 채널(Phase 1, Phase 2) 설계 및 브레인스토밍 기록은 역사 참고용으로 [`doc/legacy_timepilot/`](./legacy_timepilot/) 하위에 안전하게 격리 보존되어 있습니다:

- `legacy_timepilot/0-prerequisites.md` ~ `5-validation_log.md` : 초기 Microsoft Graph API 연동 명세
- `legacy_timepilot/phase2_*.md` : 초기 Notion 연동 스펙
- `legacy_timepilot/timepilot_ai_os_architecture.md` : 초창기 AI Work OS 브레인스토밍 장기 비전서
