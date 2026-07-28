# coffeeTide 문서 인덱스

**커피 한 잔 하면서 오늘을 정리하는 AI 개인 비서**

연동이 없어도 manual/paste로 바로 시작할 수 있는, 연결되면 더 강력해지는 시간 관리 비서입니다.

- **서비스 도메인(예정)**: `coffeeTide.dongple.kr`
- **현재 상태 (2026-07-28)**: MVP(2026-07-11) → Phase 7 브리핑 고도화(07-22) → 개인화 기능(출퇴근 길찾기·단어-앱 바로가기, 07-22~23) → 생산성 도구(퀵 위젯·슬래시 커맨드·워크노트·퇴근 핸드오프, 07-24) → 대용량 저장소(IndexedDB & Google Drive 일자별 백업, 07-27) → **문서 체계 정리(문서명 통일·`spec/` 분리) 및 피처 브랜치 체계 구축(07-28)**.
- **UI 명칭**: 화면의 AI 도우미는 **"AI 바리스타"** 입니다 (코드·API는 `copilot`).

---

## 📁 문서 구조

```
doc/
├── README.md                        문서 인덱스 (이 문서)
├── 00-product-spec.md               제품 정본 기획서
├── 01-as-built-reference.md         구현 기준 기술 레퍼런스
├── 02-backlog.md                    실행형 백로그 (A~L 항목)
├── 03-source-fix-plan.md            소스 점검 계획 (K 항목)
├── 04-mobile-strategy.md            모바일 전략
├── 05-hybrid-app-release-guide.md   하이브리드 앱 출시 가이드
├── spec/                            단계별 기능 상세 스펙 (phaseN)
└── legacy_timepilot/                구 TimePilot 시절 역사 문서
```

**파일명 규칙**

- 정본 문서: `NN-kebab-case.md` — **번호 순서 = 읽기 순서**. 새 정본 문서는 다음 번호를 이어서 부여합니다.
- 기능 스펙: `spec/phaseN-topic.md` — 기능이 도입된 단계(phase) 번호 + 주제.
- 역사 문서: `legacy_timepilot/` 하위에 원본명 그대로 보존 (참고 전용, 수정하지 않음).

---

## 📚 정본 문서 읽기 순서 (신규 개발 필독)

1. [`00-product-spec.md`](./00-product-spec.md)
   - 제품 정본 기획서. 무연동 우선 철학, 데이터 허브, 사용자 흐름, 성공 기준, 필수 요구사항.
2. [`01-as-built-reference.md`](./01-as-built-reference.md)
   - **현재 구현 코드 기준** 기술 레퍼런스(API 엔드포인트·환경변수·데이터모델·인증·코드 구조).
3. [`02-backlog.md`](./02-backlog.md)
   - 실행형 백로그. 정본 핵심 기능의 설계 기준과 작업 규약(검증 3종 세트·커밋 규칙).
4. [`03-source-fix-plan.md`](./03-source-fix-plan.md)
   - 소스 점검 결과(K1~K13)와 처리 상태 관리 문서. 처리 완료 항목은 `02-backlog.md`로 이관.
5. [`04-mobile-strategy.md`](./04-mobile-strategy.md)
   - 모바일 전략 (웹 우선, 하이브리드 앱 방향성).
6. [`05-hybrid-app-release-guide.md`](./05-hybrid-app-release-guide.md)
   - Capacitor 기반 하이브리드 앱 출시 가이드.

---

## 🧩 기능 상세 스펙 (`doc/spec/`)

| 문서 | 내용 | 상태 |
| :--- | :--- | :--- |
| [`phase3-implementation-plan.md`](./spec/phase3-implementation-plan.md) | AI Action Engine & 독립 세션 개편 마스터 계획 | ✅ 구현 완료 |
| [`phase3-ai-flow.md`](./spec/phase3-ai-flow.md) | AI 처리 엔진(Gemini) 아키텍처·프롬프트 규격 | ✅ 구현 완료 |
| [`phase3-execution-plan.md`](./spec/phase3-execution-plan.md) | 독립 세션·커넥션 매니저 단계별 개발 계획 | ✅ 구현 완료 |
| [`phase3-validation-log.md`](./spec/phase3-validation-log.md) | AI 예외 처리·로컬 Fallback 검증 규격 | ✅ 구현 완료 |
| [`phase5-write-back.md`](./spec/phase5-write-back.md) | 양방향 쓰기(Notion 완료 처리·Outlook 답장 초안) | ✅ 구현 완료 |
| [`phase6-llm-artifacts.md`](./spec/phase6-llm-artifacts.md) | 로컬 LLM 도구 산출물 수집 + Obsidian 미러링 | ✅ 구현 완료 |
| [`phase7-copilot-briefing.md`](./spec/phase7-copilot-briefing.md) | 브리핑 고도화(상황 맞춤 그리팅·시간대별 제안) | ✅ 구현 완료 (2026-07-22) |

> 스펙 문서는 **당시 설계 의도**의 기록입니다. "지금 코드가 하는 일"의 정본은 항상 [`01-as-built-reference.md`](./01-as-built-reference.md)입니다.

---

## 🏛️ 과거 레거시 문서 (`doc/legacy_timepilot/`)

구 프로젝트 명칭("TimePilot") 시절의 초기 단일 채널(Phase 1, Phase 2) 설계 및 브레인스토밍 기록은 역사 참고용으로 [`legacy_timepilot/`](./legacy_timepilot/) 하위에 안전하게 격리 보존되어 있습니다:

- `legacy_timepilot/0-prerequisites.md` ~ `5-validation_log.md` : 초기 Microsoft Graph API 연동 명세
- `legacy_timepilot/phase2_*.md` : 초기 Notion 연동 스펙
- `legacy_timepilot/timepilot_ai_os_architecture.md` : 초창기 AI Work OS 브레인스토밍 장기 비전서
