# 기능 상세 스펙: AI 캐릭터 컴패니언 & 생산성 연동 관계성 시스템 (Phase 16)

> **상태**: ✅ **구현 및 검증 완료 (2026-09-01)**  
> **관련 문서**: [`16-ai-character-productivity-companion-architecture.md`](../16-ai-character-productivity-companion-architecture.md)(아키텍처 계획서), [`00-product-spec.md`](../00-product-spec.md)(정본 기획서), [`02-backlog.md`](../02-backlog.md)(실행형 백로그)

---

## 1. 개요 & 4단계 마일스톤

사용자의 실제 업무 수행과 일처리 성과에 반응하여 실시간으로 소통하고 유대감을 쌓는 지능형 AI 캐릭터 시스템을 4단계에 걸쳐 구현했습니다.

```
[1단계: 지문/대사 마크다운 파서]
 └ 대화창·브리핑 창에서 *행동 지문*과 "대사"를 자동 감지하여 은은한 이탤릭/소프트 틴트 박스로 시각적 분리 렌더링
       ▼
[2단계: 호감도 게이지 & 칭호 UI]
 └ 코파일럿 패널 및 바리스타 팝업 상단에 [💖 Lv.1~Lv.5] 호감도 게이지/칭호 배지 연동 (할 일 완료 시 +15 EXP 실시간 상승)
       ▼
[3단계: 티키타카 추천 답변 칩 (Quick Replies)]
 └ 코파일럿 입력창 상단에 캐릭터별 롤플레잉 선택지 및 원클릭 업무 액션 칩([📄 3줄 요약], [⚡ 1순위 추천], [*라떼 마시며* 오늘 파이팅!] 등) 동적 배치
       ▼
[4단계: 레벨업 보상 시스템 (Perks & Rewards)]
 └ 호감도 레벨 달성 시 특별 시크릿 대사, 레벨업 축하 배너, 스마트 업무 큐레이션 및 캔버스 자동화 혜택 해금
```

---

## 2. 세부 기능 구현 내역

### 2.1 [1단계] 지문/대사 마크다운 분리 렌더러
- **구현 파일**: `src/app/components/markdownLite.tsx`, `src/app/components/markdownLite.module.css`
- **핵심 동작**:
  - `renderInline(text)` 함수에서 `*행동 지문*`, `(*독백 지문*)`, `**굵게**` 토큰을 안전하게 분리.
  - 지문은 `.actionNarration` 클래스로 래핑되어 은은한 디밍 컬러(`var(--text-dim)`)와 소프트 라운드 박스로 렌더링.

### 2.2 [2단계] 생산성 연동 호감도 관리자
- **구현 파일**: `src/lib/ai/affectionManager.ts`, `src/app/components/barista/AffectionBadge.tsx`
- **핵심 동작**:
  - `addAffectionExp(presetId, action)` 호출 시 로컬 스토리지 및 인메모리 스토어 동기화.
  - `coffeetide:affection-updated` 커스텀 이벤트를 발행하여 UI 전체에 실시간 동기화 및 `+15 EXP` 플로팅 알림 표출.
  - `src/app/page.tsx`의 `setLocalStatus`에서 `status === "completed"` 발생 시 `complete_task` 액션이 자동 트리거됨.

### 2.3 [3단계] 티키타카 추천 답변 칩 바
- **구현 파일**: `src/lib/ai/copilotQuickReplies.ts`, `src/app/components/copilot/CopilotComposer.tsx`
- **핵심 동작**:
  - `getQuickReplies()`가 긴급 업무 유무, 전체 할 일 개수, 시간대(오전/오후/퇴근 직전), 페르소나 프리셋(`karina`, `kim`, `calm`, `ted`, `poppy`, `miya` 등)을 분석하여 최적 칩 3~4개 생성.
  - 입력창 상단에 가로 스크롤 가능한 세련된 칩 버튼으로 렌더링되며, 클릭 시 긴 타이핑 없이 즉시 쿼리 실행.

### 2.4 [4단계] 레벨업 보상 및 해금 시스템
- **구현 파일**: `src/lib/ai/affectionManager.ts`, `src/app/components/barista/AffectionBadge.tsx`
- **핵심 동작**:
  - Lv.1~Lv.5 레벨별 해금 혜택(`rewardPerk`)과 시크릿 대사(`secretQuote`) 탑재.
  - 호감도 배지 우측의 `▼ 혜택` 토글 버튼을 통해 사용자가 언제든지 현재 해금된 실무 혜택을 확인 가능.
  - 레벨업 발생 시 그라데이션 축하 배너(`🎉 {baristaName}와의 관계 레벨업!`) 노출.

---

## 3. 검증 결과 (Validation Log)

### 3.1 자동화 단위 테스트
```bash
$ npx vitest run src/lib/ai/
 ✓ src/lib/ai/intents.test.ts (6 tests)
 ✓ src/lib/ai/personaEffects.test.ts (8 tests)
 ✓ src/lib/ai/baristaIdleTalks.test.ts (2 tests)
 ✓ src/lib/ai/copilotQuickReplies.test.ts (3 tests)
 ✓ src/lib/ai/affectionManager.test.ts (3 tests)
 ✓ src/lib/ai/artifacts.test.ts (2 tests)

 Test Files  6 passed (6)
      Tests  24 passed (24)
```

### 3.2 TypeScript 컴파일 검사
```bash
$ npx tsc --noEmit
# 에러 0건 정상 통과
```
