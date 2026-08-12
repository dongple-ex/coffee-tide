# 13. CoffeeTide 하이브리드 컴팩트 모드 (Hybrid Compact Mode) 상세 설계 및 구현 사양서

## 1. 개요 및 배경
CoffeeTide 대시보드는 오늘 할 일, AI 바리스타 브리핑, 빠른 위젯(유튜브, 날씨, 금융, 통근, 단축키 등)의 다양한 업무 지원 도구를 제공합니다.
사용자의 작업 환경과 목적에 맞춰 다음과 같은 화면 최적화를 제공하기 위해 **하이브리드 컴팩트 모드(Hybrid Compact Mode)**를 구현합니다:
- **데스크톱 / 태블릿 (901px 이상)**: 카드 여백과 폰트를 최적화한 **고밀도(High-Density) 2열 그리드**로 첫 화면에 핵심 업무 및 브리핑 요약을 노출하고 세부 데이터는 내부 스크롤로 접근
- **태블릿 단일 열 (769px ~ 900px)**: 유연한 단일 열 컴팩트 배치로 공간 활용 극대화
- **모바일 (768px 이하)**: 긴 세로 스크롤 대신 상단 **3단 세그먼트 탭(`[📋 오늘 할 일] [☕ AI 브리핑] [🧩 빠른 위젯]`)**을 통해 한 손으로 빠르게 전환하며 핵심 기능에 집중

---

## 2. 영역 매핑 (Area Mapping)

모바일 탭 전환 및 반응형 레이아웃 시 각 UI 요소는 다음과 같이 매핑됩니다:

| 영역 구분 | 포함되는 컴포넌트 및 UI 요소 | 동작 및 표시 정책 |
|---|---|---|
| **항상 표시 (Global)** | `HeaderControls`, 오류/세션 만료/퇴근 핸드오프 안내 배너, 설정 모달(`SettingsModal`), 토스트 알림, 활성 `SmartPlayerModal`(YouTube) | 탭 선택이나 컴팩트 모드 여부와 무관하게 상시 표시 |
| **`todo` 탭 (업무 영역)** | `QuickAddBar`(빠른 업무 추가/붙여넣기), 오늘의 행동 지침, 오늘의 LLM 작업, 받은 항목 전체(To-Do / Rest / Completed 목록) | 모바일 컴팩트 모드에서 `activeCompactTab === "todo"`일 때 활성화. 데스크톱에서는 2열 그리드의 좌측 열로 표시 |
| **`copilot` 탭 (AI 바리스타 영역)** | `WelcomeCard`(요약 카드), `CopilotConversation`(대화형 브리핑/Q&A), `CalendarDraftCard`, `CloudToolDraft`, `CloudWriteApprovalModal` | 모바일 컴팩트 모드에서 `activeCompactTab === "copilot"`일 때 활성화. 데스크톱에서는 2열 그리드의 우측 열로 표시 |
| **`widgets` 탭 (도구함 영역)** | `ContextualRecStrip`(KST 추천 스트립), 빠른 위젯 도구함(`Widget Toolbar`), 현재 활성화된 위젯 패널(`activeWidget`: 유튜브/날씨/금융/통근 등) | 모바일 컴팩트 모드에서 `activeCompactTab === "widgets"`일 때 활성화. 데스크톱에서는 하단 전폭 그리드로 표시 |

---

## 3. 컴포넌트 상태 보존 및 생명주기 (State Preservation)

1. **DOM 유지 (Zero Unmount)**:
   - 모바일 탭 전환 시 React 컴포넌트를 `if-else`로 언마운트하지 않고, **모든 패널을 DOM에 유지한 상태에서 CSS 클래스 및 HTML 접근성 속성(`hidden`, `inert`, `aria-hidden`)으로 전환**합니다.
   - **효과**: 작성 중이던 할 일 텍스트, AI 바리스타 질문 초안, 진행 중인 AI 스트리밍/응답, 활성 위젯 내부 상태가 탭 전환 중에도 100% 보존되며 불필요한 API 재호출이 발생하지 않습니다.
2. **YouTube 재생 연속성 보장**:
   - `SmartPlayerModal`은 특정 탭 패널의 숨김 상태에 종속되지 않도록 탭 패널 외부의 공용 모달 레이어(또는 `fixed` 오버레이)에서 렌더링됩니다.
   - 탭을 `widgets`에서 `todo`나 `copilot`으로 전환해도 YouTube IFrame이 언마운트되거나 새로고침되지 않고 백그라운드/PIP 상태로 연속 재생됩니다. (`doc/12` 명세 완벽 준수)

---

## 4. 반응형 브레이크포인트 (Breakpoints)

| 구간 | 뷰포트 너비 | 레이아웃 동작 |
|---|---|---|
| **데스크톱 (Desktop)** | `901px 이상` | 명시적 CSS Grid Area(2열): 좌측(QuickAdd + Todo), 우측(AI 바리스타), 하단(위젯 패널). 1280x800 첫 화면에 핵심 요약 가시화 |
| **태블릿 (Tablet)** | `769px ~ 900px` | 유연한 단일 열 고밀도 레이아웃. 카드 간격(10px) 및 패딩 최적화 |
| **모바일 (Mobile)** | `768px 이하` | 상단 3단 세그먼트 미니 탭 바 활성화. 선택된 탭 패널만 집중 표시 |

---

## 5. 데스크톱 컴팩트 모드 (Desktop High-Density Grid)

CSS Grid Area를 명시적으로 구성하여 고밀도 배치합니다:
```css
.pageCompact .dashboardGrid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  grid-template-areas:
    "input   copilot"
    "todo    copilot"
    "llm     copilot"
    "rest    rest"
    "widgets widgets";
  gap: 12px;
}

.pageCompact .widgetsPanelWrapper {
  display: block;
  grid-area: widgets;
  margin-top: 8px;
}

.pageCompact .todoPanelWrapper,
.pageCompact .copilotPanelWrapper {
  display: contents; /* 데스크톱에서는 자식 카드가 직접 상위 grid 셀에 매핑됨 */
}
```
- 카드 패딩: 16px → 12px~14px로 슬림화
- 폰트 및 줄 간격: 고밀도 가독성 최적화
- 리스트 내부 스크롤: 할 일 목록이 길어지면 내부 스크롤(`max-height: 480px; overflow-y: auto;`) 및 더보기 버튼을 제공하여 전체 레이아웃 붕괴 방지
- 일반 모드로 복귀 시 기존 반응형 12컬럼 Grid가 완벽하게 복원됨
- 1280×800 첫 화면(Above the Fold)에 `QuickAddBar`, `오늘의 행동 지침`, `AI 바리스타`가 즉시 노출되고 `widgets` 패널은 그리드 하단 전폭으로 배치됨

---

## 6. 상태 지속성 (State Persistence)

1. **로컬 스토리지 키**:
   - `LS_COMPACT_MODE = "ct_compact_mode"` (`boolean`)
2. **초기값 판정 우선순위**:
   1. `loadLS<boolean>(LS_COMPACT_MODE, ...)`에 저장된 값
   2. 퇴근 핸드오프 스냅샷(`handoffSnapshot?.compactMode`)
   3. 기본값: `false` (일반 뷰)
3. **퇴근 핸드오프 (`HandoffState`) 연계**:
   - 퇴근 시 `compactMode` 상태가 스냅샷에 기록되어 다음 날 출근 시에도 사용자가 설정한 뷰가 그대로 복원됨
   - `handleLogoutHandoff`의 의존성 배열 및 `saveLS` 저장 데이터에 반영
4. **활성 탭 (`activeCompactTab`) 메모리 정책**:
   - 초기값은 `"todo"`로 시작
   - 세션 중 컴팩트 모드를 껐다가 다시 켜더라도 직전에 보던 탭(`todo`, `copilot`, `widgets`) 상태를 React 메모리 상태로 유지

---

## 7. 접근성 (Accessibility & A11y)

1. **컴팩트 모드 토글 버튼**:
   - `aria-pressed={compactMode}` 적용
   - 명확한 `title` 및 `aria-label` 제공
2. **모바일 탭 컨트롤 (조건부 ARIA 적용)**:
   - `compactMode && isMobile`일 때만 `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-labelledby`를 적용하여 데스크톱 및 일반 모드에서 불필요한 고아(Orphan) `tabpanel` 발생을 원천 차단 (데스크톱 및 일반 뷰에서 tabpanel 개수: 0개)
   - 각 탭 버튼: `role="tab"`, `id="tab-todo"`, `aria-selected={activeCompactTab === "todo"}`, `aria-controls="panel-todo"`
   - 키보드 내비게이션: ArrowLeft, ArrowRight, Home, End 키로 탭 간 포커스 및 선택 이동 지원
3. **비활성 패널 포커스 격리**:
   - 모바일 환경에서 비활성화된 탭 패널은 `hidden` 속성 및 `.compactPanelHidden` 클래스를 적용하여 DOM 트리는 유지하되 `Tab` 키 포커스 순서 및 화면 렌더링에서 완전히 제외
4. **터치 타겟 및 모션 배려**:
   - 모바일 탭 버튼의 터치 타겟을 최소 44px 높이로 확보
   - `@media (prefers-reduced-motion: reduce)` 대응을 통해 불필요한 트랜지션 애니메이션 제거
5. **테마 대응**:
   - 모든 테마(다크, 라이트, 커피타이드, 에스프레소, 메가커피, 커스텀커피)에서 CSS 변수(`--bg`, `--card`, `--border`, `--accent`, `--text`, `--text-dim`)를 사용하여 명도 대비 및 가독성 확보

---

## 8. 완료 기준 및 검증 시나리오

### 8.1 뷰포트별 검증 대상
- `390 × 844` (모바일: iPhone 14)
- `768 × 1024` (태블릿 미디어 쿼리 경계)
- `900 × 1000` (데스크톱 2열 전환 경계)
- `1280 × 800` (데스크톱 표준 노트북)
- `1440 × 900` (데스크톱 와이드 모니터)

### 8.2 핵심 기능 검증 시나리오
1. **일반 ↔ 컴팩트 모드 반복 전환**: 레이아웃 깨짐 없이 즉각 전환 및 원복 확인
2. **새로고침 및 핸드오프 복원**: 새로고침 후 `compactMode` 유지 및 퇴근 스냅샷 복원 확인
3. **모바일 탭 전환 및 상태 보존**: `todo` ↔ `copilot` ↔ `widgets` 전환 시 작성 중인 입력값 및 응답 보존 확인
4. **YouTube 재생 연속성**: `widgets`에서 영상 재생 중 `todo`/`copilot` 탭으로 이동해도 재생 중단 및 iframe 재생성 없음 확인
5. **키보드 접근성**: `aria-pressed`, `role="tablist"` 좌우 방향키 탭 이동, `Tab` 키 포커스 격리 확인
6. **정적 빌드 검증**: `npm run lint`, `npm run typecheck`, `npm run build` 100% 통과
