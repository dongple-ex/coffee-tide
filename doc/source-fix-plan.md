# 소스 수정계획서 (2026-07-26)

> **목적**: 2026-07-24까지 반영된 코드(`44c266e`)를 점검해 발견한 결함·리스크를 **다른 개발자/에이전트가 그대로 집어서 작업**할 수 있도록 정리한 실행 계획서입니다.
> 형식은 [`7-backlog.md`](./7-backlog.md)와 동일한 `문제 → 위치 → 영향 → 수정안 → 완료 기준`입니다. 항목 ID는 백로그의 A~J와 충돌하지 않도록 **K 계열**을 사용하며, 처리 후 `7-backlog.md`로 이관합니다.
> **위치의 줄 번호는 편집으로 밀립니다 — 심볼/문자열로 다시 찾으세요.**

## 0. 현재 검증 baseline (2026-07-26 측정)

| 검증 | 결과 |
| :--- | :--- |
| `npx tsc --noEmit -p tsconfig.json` | ✅ 통과 (exit 0) |
| `npm run build` | ✅ 통과 (exit 0) |
| `npm run lint` | ❌ **실패 — 7 errors, 8 warnings** |

`7-backlog.md` §작업 규약은 "검증 3종 세트 셋 다 통과"를 요구하므로, **현재 main은 규약 위반 상태**입니다. K5를 최우선으로 처리해 게이트를 복구한 뒤 나머지를 진행합니다.

## 1. 우선순위 요약

| ID | 제목 | 우선순위 | 영역 | 상태 |
| :-- | :-- | :-- | :-- | :-- |
| **K1** | `/api/util/exec-app` 임의 명령 실행 (셸 주입) | **P0** | 보안 | ✅ 2026-07-27 (스모크 검증) |
| **K2** | `/api/commute` 전면 하드코딩 데이터를 실시간으로 표시 → **공공데이터포털 실연동** | **P0** | 제품 신뢰 | ⏳ 임시조치만 적용 — 실연동 대기 |
| **K3** | 앱 실행 실패해도 "띄워드렸습니다" 성공 오보 | P1 | 버그 | ✅ 2026-07-27 |
| **K4** | 바로가기 키워드 `includes` 오탐 → 일반 질문 가로챔 | P1 | 버그/UX | ✅ 2026-07-27 |
| **K5** | `npm run lint` 7 errors — 품질 게이트 깨짐 | P1 | 품질 게이트 | ✅ 2026-07-27 (0 errors·0 warnings) |
| **K6** | `ct_handoff_state` 저장·복원 불일치 + 배너 영구 재출현 | P2 | 상태/저장 | ✅ 2026-07-27 |
| **K7** | `ProactiveNudgeCard` 죽은 코드 (컴포넌트+CSS+import) | P2 | 정리 | ✅ 2026-07-27 |
| **K8** | 공공데이터포털 공용 키 정리 (`WEATHER_API_KEY` → `DATA_GO_KR_SERVICE_KEY`) + OWM 폴백 무력화 | P2 | 기능 | ✅ 2026-07-27 (`src/lib/env.ts`) |
| **K9** | 날씨 라우트가 원본 좌표를 제3자(BigDataCloud)로 전송 | P2 | 개인정보 | ✅ 2026-07-27 |
| **K10** | `page.tsx` 3,253줄 / `page.module.css` 1,592줄 분할 | P3 | 구조 | 🔄 진행 중 — 1~4단계 완료 (3,413 → 2,351줄) |
| **K11** | WelcomeCard 30초 타이머가 사용자 조작을 덮어씀 | P3 | UX | ✅ 2026-07-27 |
| **K12** | 카카오맵·네이버지도 딥링크가 스펙 불일치로 앱 실행 실패 | **P1** | 기능 | ✅ 2026-07-27 |
| **D1~D7** | 문서 동기화 (별도 트랙, §3) | P2 | 문서 | ⏸ 미착수 (5차) |

> **부수 수정 (2026-07-27, 계획서 외)**: ① ShortcutsWidget이 로컬 `.exe` 경로를 `https://C:\...`로 열어 빈 탭만 띄우던 문제 → `/api/util/exec-app` 경유 + 실패 토스트. ② WeatherWidget 갱신 버튼이 결과와 무관하게 "갱신되었습니다"를 띄우던 문제 → 결과 분기. ③ CommuteCard가 조회 실패 시 카드째 사라지던 문제 → 실패 상태 표시. ④ `/api/weather` 좌표 유효성 검증(NaN·범위 밖 → 400).

---

## 2. 소스 수정 항목

### K1. `/api/util/exec-app` — 검증 없는 셸 명령 실행 — P0

- **문제**: 클라이언트가 보낸 `target` 문자열을 검증 없이 셸 커맨드에 문자열 보간합니다.
  ```ts
  // src/app/api/util/exec-app/route.ts
  const command = process.platform === "win32"
    ? `start "" "${trimmed}"`      // ← 따옴표 포함 입력으로 탈출 가능
    : process.platform === "darwin" ? `open "${trimmed}"` : `xdg-open "${trimmed}"`;
  await execAsync(command);        // exec = 셸 경유
  ```
- **위치**: `src/app/api/util/exec-app/route.ts` (`execAsync`, `command` 조합), 호출부 `src/app/page.tsx`의 `fetch("/api/util/exec-app"` 블록.
- **영향**: `target`에 `"`·`&`·`|`를 넣으면 **사용자 PC에서 임의 명령이 실행**됩니다(서버 = 사용자 PC 전제). 세션 가드 뒤에 있지만, 게스트 세션은 `/api/auth/signin` 한 번으로 누구나 발급받을 수 있어 실질 방어선이 얕습니다. 클라우드 배포 시에는 서버에서 실행을 시도합니다.
- **수정안**:
  1. **셸 제거** — `exec` → `execFile`/`spawn`(`shell: false`, `detached: true`)로 전환. Windows는 `cmd /c start`를 쓰지 말고, URL/스킴은 `explorer.exe <url>`, 실행 파일은 경로를 직접 spawn.
  2. **입력 화이트리스트** — ① URL/딥링크: `new URL()` 파싱 성공 + 스킴 allowlist(`http`, `https`, `kakaomap`, `nmap`, `notion`, `mailto` 등) ② 로컬 실행 파일: 절대 경로 + 확장자 allowlist(`.exe`, `.lnk`, `.app`, `.sh` 제외) + `fs.existsSync` 확인. 그 외는 400.
  3. **간접 참조로 승격(권장)** — `ct_app_shortcuts`를 localStorage가 아니라 **세션에 저장**하고, 라우트는 `{ id }`만 받아 서버에서 target을 해석. 클라이언트가 임의 문자열을 실행 대상으로 지정할 수 없게 됩니다.
  4. **실행 환경 가드** — 데스크톱 전용 기능이므로(`8-mobile_strategy.md` §3), 클라우드/프로덕션 배포(`process.env.VERCEL` 등)에서는 403 + 안내 문구 반환.
- **완료 기준**: `target`에 `x" & calc & "`를 넣어도 아무것도 실행되지 않고 400을 반환한다. 정상 바로가기(브라우저 URL·설치 앱)는 그대로 동작한다.

### K2. `/api/commute` — 하드코딩 데이터를 실시간 정보처럼 표시 — P0

- **문제**: 응답 전체가 상수입니다. 출발 시각 = 현재+7분, 소요 = 대중교통 48분/자차 38분, 혼잡도·요금·노선·꿀팁 문구까지 고정값이며 `home`/`work` 파라미터는 문자열 치환에만 쓰입니다.
- **위치**: `src/app/api/commute/route.ts` 전체 (`depTime`, `durationMinutes`, `congestionText`, `routeOptions`, `smartTip`), 표시부 `src/app/components/CommuteCard.tsx`.
- **영향**: 화면에는 "출근길 급행 열차가 약 7분 후 (08:07) 도착합니다", "🔴 혼잡 (좌석 만석, 입석 여유)", "평균 속도 72km/h"처럼 **실측치로 읽히는 문장**이 출력됩니다. 사용자가 이 값을 믿고 움직이면 제품 신뢰가 한 번에 무너집니다. `00-current-state.md` §2-5(AI 답변은 근거에 기반)의 정신과도 충돌합니다.

#### 결정 (2026-07-26, 사용자)

**공공데이터포털 실 API 연동으로 진행합니다.** 인증키는 **날씨에서 쓰는 `WEATHER_API_KEY` 값을 그대로 재사용** — 공공데이터포털은 계정당 일반 인증키 1개를 모든 오픈API에 공통 적용하므로 신규 발급이 불필요합니다. 단, **API별 "활용신청" 승인은 각각 받아야 합니다**(§선행 작업).

#### 핵심 제약 — 포털에 "경로탐색"은 없습니다

카드가 보여주려는 정보 중 공공데이터포털로 실측 가능한 것과 아닌 것이 갈립니다.

| 표시 항목 | 공공데이터포털 | 조치 |
| :--- | :--- | :--- |
| 다음 열차 출발 시각 | ✅ 국토교통부_(TAGO)_지하철정보 — 역별 시간표 | 실데이터로 대체 |
| 다음 버스 도착 시각 | ✅ 국토교통부_(TAGO)_버스도착정보 — 정류소 기준 | 실데이터로 대체 |
| 고속도로 혼잡/통행 속도 | ✅ 한국도로공사_실시간 소통 데이터 / 실시간 정체상황 | 실데이터로 대체(구간 단위) |
| 출발지→목적지 **환승 경로·총 소요시간** | ❌ 전국 단위 없음 (서울특별시_대중교통환승경로 서비스는 **서울시 한정**) | **카카오맵/네이버지도 딥링크로 위임** (현재 구현 유지) |
| 통행요금 | ⚠️ 파일데이터(정적)만, 실시간 API 아님 | 표시 제거 또는 "참고" 표기 |
| 대중교통 요금 | ❌ | 표시 제거 |

즉 **"다음 출발/도착 시각 + 구간 혼잡도"는 실데이터로 채우고, "몇 분 걸린다 / 어떤 경로다"는 지도 앱에 위임**하는 형태가 포털만으로 만들 수 있는 정직한 최대치입니다. 기본값인 서울역→수원역처럼 시도 경계를 넘는 구간은 서울시 환승경로 API로 커버되지 않습니다.

#### 수정안

1. **정직한 타입으로 축소** — `src/lib/types/commute.ts`에서 실측 불가 필드(`durationMinutes`, `fareInfo`, `routeOptions[].duration/fare/arrivalTime`)를 제거하거나 옵셔널로 내리고, 추정치를 남길 경우 `estimated: true` 플래그를 함께 반환해 UI가 "예상"으로 표기하게 합니다.
2. **어댑터 신설** — `src/lib/adapters/commute.ts` (기존 `src/lib/adapters/*` 규약 따름). ① TAGO 지하철 역별 시간표 ② TAGO 버스도착정보 ③ 도로공사 실시간 소통. 각각 독립 실패 허용(원칙 4) — 하나가 죽어도 나머지는 표시.
3. **역/정류소 코드 매핑** — TAGO는 역명 문자열이 아니라 **코드**(지하철역 ID·정류소 `nodeId`) 기반입니다. 설정에서 역/정류소를 검색해 고르고 `ct_commute_config`에 **코드까지** 저장하도록 UI를 확장해야 합니다. (현재는 역명 문자열만 저장 — 이 작업이 K2에서 가장 큰 덩어리입니다.)
4. **폴백** — 키 미설정 / 활용신청 미승인 / API 장애 시 수치를 **숨기고** 딥링크 카드만 남깁니다. 하드코딩 수치로 되돌아가지 않습니다.
5. **캐시** — 날씨 라우트와 같은 서버 메모리 TTL 패턴 재사용(도착정보 30~60초, 시간표 24시간). 폴링 30초와 겹치므로 캐시 없이는 쿼터(기본 일 1,000건)가 빠르게 소진됩니다.
6. **임시 조치(1차 단계에서 선반영)** — 실연동 완료 전까지 카드에 `예시` 배지 + 단정형 문구 제거("도착합니다" → "지도 앱에서 실시간 정보를 확인하세요"). 실데이터가 붙으면 배지를 제거합니다.
- **완료 기준**: 화면의 모든 수치가 실 API 응답이고, 폴백 시에는 수치가 사라지고 딥링크만 남는다. `route.ts`에 하드코딩된 시각·소요시간·혼잡도 상수가 0개다.
- **선행 작업(사용자)**: [data.go.kr](https://www.data.go.kr)에서 아래 3종 활용신청 — ① [국토교통부_(TAGO)_지하철정보](https://www.data.go.kr/data/15098554/openapi.do) ② [국토교통부_(TAGO)_버스도착정보](https://www.data.go.kr/data/15098530/openapi.do) ③ [한국도로공사_실시간 소통 데이터](https://www.data.go.kr/data/15076684/openapi.do). 개발계정은 대체로 자동 승인이며 트래픽은 일 1,000건이 기본입니다.

### K3. 앱 실행 실패를 성공으로 보고 — P1

- **문제**: `void fetch("/api/util/exec-app", …)` — 응답을 기다리지도, 확인하지도 않고 곧바로 "프로그램을 바로 띄워드렸습니다 ☕" 메시지를 출력합니다. 라우트가 500(경로 없음/실행 실패)을 반환해도 동일합니다.
- **위치**: `src/app/page.tsx`의 `matchedShortcut` 블록.
- **영향**: 아무 일도 일어나지 않았는데 성공했다고 답하는, 가장 신뢰를 깎는 유형의 오보.
- **수정안**: `await`로 응답을 받아 `res.ok` 분기 — 실패 시 서버가 준 `error` 문구를 그대로 노출("프로그램 실행 실패: …"). 실행 대기 동안 `copilotBusy` 표시.
- **완료 기준**: 존재하지 않는 경로를 등록한 바로가기를 호출하면 실패 메시지가 뜬다.

### K4. 바로가기 키워드가 일반 질문을 가로챔 — P1

- **문제**: `appShortcuts.find(s => s.enabled && (question.includes(s.keyword) || question === s.keyword))` — **부분 문자열 포함**이면 매칭됩니다.
- **위치**: `src/app/page.tsx`의 `matchedShortcut` 계산부.
- **영향**: "노션" 바로가기를 등록해두면 *"노션에 정리한 업무 우선순위 알려줘"* 같은 정상 질문이 AI로 가지 않고 노션 앱만 실행되고 끝납니다. 키워드가 짧을수록(예: "메일") 오탐률이 급격히 올라갑니다.
- **수정안**: 매칭 조건을 좁힙니다 — ① 질문 전체가 키워드와 정확히 일치할 때만 실행(권장), 또는 ② 이미 구현된 슬래시 커맨드 인프라를 재사용해 `/실행 <키워드>` 형태로 이동(`handleSlashCommand`에 케이스 추가). ①·② 모두 실행 직전 "○○을 실행할까요?" 확인 버튼을 두면 더 안전합니다.
- **완료 기준**: 키워드를 포함한 문장형 질문은 AI 답변으로 처리되고, 단독 키워드(또는 명시적 커맨드)만 프로그램을 실행한다.

### K5. `npm run lint` 7 errors — 품질 게이트 복구 — P1

- **문제**: 아래 7개 error로 lint가 실패합니다(경고 8개 별도).

| 파일 | 위치 | 규칙 |
| :--- | :--- | :--- |
| `src/app/api/weather/route.ts` | 72, 100 (`minutes`) | `prefer-const` |
| `src/app/page.tsx` | 449 (핸드오프 복원 effect) | `react-hooks/set-state-in-effect` |
| `src/app/page.tsx` | 656 (날씨 fetch effect) | `react-hooks/set-state-in-effect` |
| `src/app/components/WelcomeCard.tsx` | 60 (시간대 갱신 effect) | `react-hooks/set-state-in-effect` |
| `src/app/components/CommuteCard.tsx` | 58 (초기 fetch effect) | `react-hooks/set-state-in-effect` |
| `src/app/components/ProactiveNudgeCard.tsx` | 23 | `react-hooks/set-state-in-effect` |

- **영향**: 규약상 모든 변경이 lint 통과를 전제하는데, 지금은 **신규 작업자가 자기 변경 때문인지 기존 부채인지 구분할 수 없습니다.** 이 상태가 길어질수록 lint 자체가 무시됩니다.
- **수정안**:
  - `prefer-const` 2건: `let minutes` → `const minutes` (단순 치환).
  - `set-state-in-effect` 5건: effect 본문의 동기 setState 제거 —
    - 초기값 계산형(`WelcomeCard`의 `getTimeState`/`getDateLabel`, `page.tsx` 핸드오프 복원)은 **lazy `useState` 초기화** 또는 `useSyncExternalStore`로 이동.
    - 외부 fetch형(`page.tsx` 날씨, `CommuteCard`)은 setState를 **비동기 콜백 내부**로 옮기고 effect 본문은 호출만 남기기(현재는 동기 경로에 setState가 걸려 있음).
    - `ProactiveNudgeCard`는 K7에서 삭제하면 함께 소멸.
  - 경고 8건은 같은 브랜치에서 정리 권장: 미사용 심볼 3건(`connectedCount`, `ShortcutsWidget.onOpenSettings`, `commute/route.ts:minutes`), `exhaustive-deps` 4건, `askCopilot` useCallback 미메모(§K10과 함께 처리).
- **완료 기준**: `npm run lint`가 **0 errors**로 통과(경고는 목표 0, 최소한 신규 발생 없음). tsc·build도 유지.

### K6. `ct_handoff_state` 저장·복원 불일치 — P2

- **문제**: 3가지가 얽혀 있습니다.
  1. `handleLogoutHandoff`가 `manualItems`, `dismissedIds`를 저장하지만, 복원 effect는 **UI 접힘 상태와 `copilotMessages`만 복원**합니다 → 저장된 업무 데이터는 영원히 읽히지 않는 사장(死藏) 페이로드.
  2. `manualItems`는 이미 `ct_manual_items`에 저장되므로 **동일 데이터가 두 벌** 남습니다. localStorage 5MB 한도(`/api/upload`가 1MB 텍스트를 manual 항목으로 넣는 구조라 더 민감)를 불필요하게 압박합니다.
  3. 복원 배너의 "확인 ✕"이 `setHandoffRestoredInfo(null)`만 하고 **`ct_handoff_state`를 지우지 않아**, 새로고침할 때마다 며칠 전 날짜의 "지난 퇴근 보존 상태 복원" 배너가 다시 뜹니다.
- **위치**: `src/app/page.tsx` — `LS_HANDOFF_STATE` 선언부, 복원 `useEffect`, `handleLogoutHandoff`, 배너 JSX(`handoffBanner`).
- **영향**: 저장소 낭비 + 사용자가 배너를 닫을 수 없음(닫아도 되살아남).
- **수정안**: `HandoffState`의 역할을 하나로 확정합니다.
  - **권장(A)**: 핸드오프는 **UI 스냅샷 전용** — `manualItems`/`dismissedIds` 필드를 타입과 저장에서 제거(업무 데이터는 기존 `ct_manual_items`/`ct_dismissed_ids`가 정본).
  - (B) 굳이 스냅샷을 복원하려면 복원 effect에서 실제로 `setManualItems`/`setDismissed`까지 수행하고, 기존 키와의 충돌 규칙(어느 쪽이 이기는지)을 명시.
  - 배너 "확인"에서 `localStorage.removeItem(LS_HANDOFF_STATE)` 또는 `restoredAck` 플래그 저장 → 같은 스냅샷은 1회만 안내.
- **완료 기준**: 배너를 닫은 뒤 새로고침해도 다시 뜨지 않는다. `ct_handoff_state`에 중복 업무 데이터가 쌓이지 않는다.

### K7. `ProactiveNudgeCard` 죽은 코드 제거 — P2

- **문제**: `page.tsx`가 import만 하고 렌더링하지 않습니다(기능은 `WelcomeCard.getProactiveMessage`로 흡수됨). lint 경고 + error 각 1건도 이 파일에서 발생합니다.
- **위치**: `src/app/components/ProactiveNudgeCard.tsx`, `src/app/components/proactiveNudgeCard.module.css`, `src/app/page.tsx`의 import 라인.
- **수정안**: 컴포넌트·CSS 모듈·import 삭제. (되살릴 계획이 있다면 삭제 대신 `7-backlog.md`에 근거를 남기고 import만 제거.)
- **완료 기준**: 미사용 import 경고와 해당 파일의 lint error가 사라지고 화면 변화가 없다.

### K8. `WEATHER_API_KEY` 단일 키로 두 공급자 호출 + 키 이름이 용도와 불일치 — P2

- **문제**: ① 같은 `WEATHER_API_KEY`를 기상청 `serviceKey`와 OpenWeatherMap `appid`에 **그대로** 넘깁니다. 공공데이터포털 키를 넣으면 OWM 폴백은 항상 401로 실패하므로 **2단 폴백이 사실상 1단**입니다. ② K2가 같은 공공데이터포털 키를 대중교통·도로 API에도 쓰게 되면서, `WEATHER_API_KEY`라는 이름이 실제 용도(포털 공용 인증키)와 어긋납니다.
- **위치**: `src/app/api/weather/route.ts`의 `GET`(`const apiKey = process.env.WEATHER_API_KEY` → `fetchKmaWeather(…, apiKey)` / `fetchOpenWeatherMap(…, apiKey)`), K2에서 신설할 `src/lib/adapters/commute.ts`.
- **수정안**: 공급자 축으로 환경변수를 정리합니다.
  - `DATA_GO_KR_SERVICE_KEY` — **공공데이터포털 공용 인증키**(기상청 + TAGO + 도로공사가 공유). 값은 지금 쓰는 `WEATHER_API_KEY`와 동일하므로 사용자가 새로 발급받을 것은 없습니다.
  - `OPENWEATHER_API_KEY` — OWM 전용. 있을 때만 폴백 시도.
  - **하위호환**: `WEATHER_API_KEY`가 설정돼 있으면 `DATA_GO_KR_SERVICE_KEY`의 별칭으로 계속 인정(`process.env.DATA_GO_KR_SERVICE_KEY ?? process.env.WEATHER_API_KEY`). 기존 `.env.local`을 고치지 않아도 동작해야 합니다.
  - 공용 키 판독은 한 곳(`src/lib/auth/…` 또는 신설 `src/lib/env.ts`)으로 모아 날씨·출퇴근이 같은 경로로 읽게 합니다.
- **완료 기준**: 포털 키만 설정한 환경에서 OWM 호출이 시도되지 않고 실패 로그도 남지 않는다. `WEATHER_API_KEY`만 있는 기존 환경에서 날씨·출퇴근이 모두 동작한다.

### K9. 원본 좌표가 제3자 서비스로 전송됨 — P2

- **문제**: `GET`은 캐시 키 용도로만 좌표를 소수점 2자리로 절삭하고, 외부 호출에는 **원본 좌표**(`latNum`, `lonNum`)를 넘깁니다. 역지오코딩(`fetchKoreanDistrictName`)은 키 없이 `api.bigdatacloud.net`으로 정밀 좌표를 그대로 전송합니다.
- **위치**: `src/app/api/weather/route.ts` — `GET`의 `lat`/`lon` 절삭부와 `fetchKmaWeather(latNum, lonNum, …)` 호출, `fetchKoreanDistrictName`.
- **영향**: 문서(`as-built-reference.md` §4, `phase7_copilot_briefing_spec.md`)는 "좌표 2자리 절삭·미저장"을 개인정보 보호 근거로 제시하는데, 실제로는 정밀 좌표가 외부로 나갑니다. 문서와 코드가 어긋난 상태이고, 앱 스토어 심사(`hybrid_app_release_guide.md`) 때 설명이 필요한 지점입니다.
- **수정안**: 절삭 좌표를 외부 호출에도 사용(기상청은 5km 격자로 변환되므로 정밀도 손실 없음, 역지오코딩은 동/구 단위라 2자리로 충분). BigDataCloud 의존을 `as-built-reference.md`에 명시하고, 실패 시 `"현재 위치"` 폴백 유지.
- **완료 기준**: 서버에서 나가는 모든 외부 요청의 좌표가 소수점 2자리다.

### K10. `page.tsx` / `page.module.css` 분할 — P3

- **문제**: `src/app/page.tsx` 3,253줄, `src/app/page.module.css` 1,592줄 단일 파일. 대시보드·설정 모달·Copilot·위젯 바·규칙 빌더·푸시 설정이 한 컴포넌트에 있습니다. `askCopilot`이 매 렌더 재생성돼 `handleReorderRemainingWithAI`의 `useCallback`이 무력화되는 등 부수 효과도 발생 중(K5 경고).
- **수정안**: 기능 경계로 순차 추출 — ① 설정 모달(`SettingsModal`) ② Copilot 패널(입력·슬래시 커맨드·Q&A 목록) ③ 위젯 바(`QuickWidgets`) ④ 규칙 빌더. 상태는 훅으로 분리(`useManualItems`, `useWeather`, `usePushSubscription`). CSS도 컴포넌트별 모듈로 이동.
- **주의**: 한 번에 하지 말 것. **PR 1개 = 컴포넌트 1개**, 각 단계마다 검증 3종 세트 + 스모크.
- **완료 기준**: `page.tsx`가 1,000줄 이하로 줄고 기능 회귀가 없다.

#### 진행 상황 (2026-07-27)

| 단계 | 내용 | 결과 |
| :--- | :--- | :--- |
| 1 ✅ | 순수 헬퍼 분리 — `src/lib/localStore.ts`(LS 키·loadLS·saveLS), `src/lib/mergeView.ts`(buildMergedView·timeAgo·ViewItem), `src/lib/labels.ts`, `src/app/hooks/useModalA11y.ts` | 3,413 → 3,262 |
| 2 ✅ | 설정 모달 5개 섹션 분리 — `src/app/components/settings/`{AutomationRules, Notification, Weather, Commute, Shortcuts}Section | 3,262 → 3,013 |
| 3 ✅ | 서비스 연동 섹션 — `settings/ConnectionsSection.tsx`(연동 폼 입력 5종을 지역 state로 내리고, `connectNotion`·`addLocalDocFolder`·`pickFolder`를 인자/반환값 기반으로 전환해 props 16개로 축소) | 3,013 → 2,728 |
| 4 ✅ | `renderItem` → `components/TaskItemCard.tsx`(하위작업 입력을 지역 state로), Copilot 패널 → `components/copilot/`{CopilotConversation, CopilotComposer}, Q&A 쌍 묶기 → `lib/copilotPairs.ts`(렌더링·미읽음 배지가 공유) | 2,728 → 2,351 |
| 5 ⏸ | 상태 훅 분리(`useManualItems`·`useWeather`·`usePushSubscription`), `page.module.css` 컴포넌트별 분할 | |

- 분리한 섹션은 `page.module.css`를 그대로 import한다(CSS 모듈은 다중 import 가능). CSS 분할은 5단계에서 함께 처리해 이번 단계의 변경 범위를 좁혔다.
- 상태 소유권은 옮기지 않았다 — 섹션은 값 + `onChange` 콜백만 받는 표현 컴포넌트다. 영속화는 기존과 동일한 지점(`rules`는 effect, 나머지는 onChange)에서 일어난다.
- **UI 육안 확인은 미실시**(브라우저 없이 작업). 설정 모달의 5개 섹션은 클릭 확인이 필요하다.

### K11. WelcomeCard 30초 자동 접힘이 사용자 조작을 덮어씀 — P3

- **문제**: 마운트 30초 후 무조건 접는 타이머가 있어, 사용자가 그 사이 직접 펼쳐도 다시 접힙니다. 타이머는 취소되지 않습니다.
- **위치**: `src/app/components/WelcomeCard.tsx`의 `setTimeout(… 30000)` effect.
- **수정안**: 사용자가 토글을 조작하면 타이머를 clear(플래그 또는 ref). 접힘 상태를 부모가 제어(`collapsed` prop)하는 구조이므로, 내부 `internalCollapsed`와의 이중 관리도 함께 정리.
- **완료 기준**: 사용자가 펼친 브리핑이 임의로 접히지 않는다.

### K12. 카카오맵·네이버지도 딥링크 스펙 불일치 — P1 — ✅ 2026-07-27

- **문제**: K2에서 "경로탐색·소요시간은 지도 앱에 위임"으로 설계했는데, 정작 그 호출부가 공식 스펙과 어긋나 **앱이 열리지 않았다**.
  | 항목 | 기존 코드 | 공식 스펙 |
  | :--- | :--- | :--- |
  | 카카오 `sp`/`ep` | 장소 **이름**(`sp=서울역`) | **좌표** `sp={lat},{lng}` |
  | 카카오 `by` | `CAR` / `PUBLICTRANSIT` (대문자) | `car` / `publictransit` (소문자) |
  | 네이버 경로 | `nmap://route/carset` | `nmap://route/car` (또는 `public`) |
  | 네이버 좌표 | 없음(`sname`/`dname`만) | `slat`·`slng`·`dlat`·`dlng` **필수** |
  | 네이버 웹 | `m.map.naver.com/route/publicTransit.naver` | 해당 경로 없음 — 웹 길찾기도 좌표 필요 |
- **추가 결함**: 앱 전환 감지 로직 `Date.now() - start < 1500`이 800ms 타이머 안에서 **항상 참** → 앱이 정상적으로 열려도 웹 탭이 매번 같이 열렸다.
- **조치**:
  1. `src/lib/mapLinks.ts` 신설 — 링크 생성을 순수 함수로 분리(스펙 근거를 주석에 명시).
  2. 좌표가 있을 때만 앱 스킴 생성, 없으면 `null` → 호출부는 웹으로만 연다(동작하지 않는 링크를 만들지 않는다).
  3. 좌표 없을 때 웹 폴백: 카카오는 이름 기반 길찾기(`sName`/`eName`, 실제 동작), 네이버는 목적지 검색.
  4. 앱 전환 감지를 `visibilitychange`/`pagehide`로 교체.
  5. 좌표 확보 경로: 설정에 **"현재 위치를 집/회사로"** 버튼 추가(지오코딩 키 불필요). 좌표는 `ct_commute_config`에 로컬 저장하며 **서버로 전송하지 않는다** — 그래서 링크 생성도 서버에서 클라이언트로 옮겼다(`CommuteInfo`에서 URL 4종 제거).
- **완료 기준**: 좌표 지정 시 모바일에서 두 앱이 출발지·도착지가 채워진 채 열리고, 미지정 시에도 웹으로 정상 연결된다. **실기기 확인은 H1(실계정 E2E)과 함께 필요** — 데스크톱에서는 웹 경로만 검증됨.

---

## 3. 문서 동기화 트랙 (D)

소스 수정과 별개로, `doc/`이 2026-07-22에 멈춰 있어 07-23~24 작업이 반영돼 있지 않습니다. **K 항목을 처리한 뒤 as-built를 한 번에 갱신**하는 편이 재작업이 적습니다.

| ID | 대상 | 내용 |
| :-- | :-- | :-- |
| D1 | `as-built-reference.md` §4 | 누락 라우트 3개 추가 — `/api/upload`, `/api/commute`, `/api/util/exec-app` |
| D2 | `as-built-reference.md` §4·§6, `7-backlog.md` I1, `phase7_*.md` §5.1 | `/api/weather` 설명 정정 — "OpenWeatherMap" → **기상청 단기예보 1순위 + OWM 폴백 + BigDataCloud 역지오코딩** (K8·K9 확정 후 최종 문구) |
| D3 | `as-built-reference.md` §3 | localStorage 키 4개 → 실제 16개 반영 (`ct_weather_enabled/coords`, `ct_app_shortcuts`, `ct_commute_config`, `ct_work_notes`, `ct_sub_tasks`, `ct_handoff_state`, `ct_theme`, `ct_brief_time`, `ct_browser_categories`, `ct_notified_item_ids`, `ct_oauth_state`) |
| D4 | `as-built-reference.md` §2·§7 | 세션 롤링 연장(B2) 구현 완료 반영 — 현재 "7일 고정"으로 서술돼 요약표와 모순 |
| D5 | `7-backlog.md` | H4·B2 상세절에 ✅ 표기(요약표와 불일치), I5 상세절의 "WelcomeCard 마운트 시 즉시 요청" 서술 갱신(설정 모달 옵트인으로 이미 이관됨), 커밋 트레일러 `Opus 4.8` → 현행 표기, 최종 갱신일 |
| D7 | `as-built-reference.md` §4·§5·§6 | K2 실연동 결과 반영 — TAGO·도로공사 어댑터, 캐시 TTL, 폴백 규칙, `DATA_GO_KR_SERVICE_KEY`(+`WEATHER_API_KEY` 별칭), **활용신청이 필요한 API 목록**과 일 1,000건 쿼터 |
| D6 | `README.md`, 신규 백로그 | 07-23~24 기능 등재 — Quick Widgets(Timer/Calculator/Shortcuts/Weather), 슬래시 커맨드 5종, Work Note·서브태스크·AI 재정렬, 섹션 접힘. 문서 전체가 UI 명칭 "AI 바리스타"를 한 번도 쓰지 않는 점도 통일 |

---

## 4. 실행 순서

| 단계 | 항목 | 기준 |
| :--- | :--- | :--- |
| **1차 — 게이트 복구 + 오보 차단** | K5, K7, K3, K11, **K2 임시조치**(`예시` 배지·단정형 문구 제거) | lint 0 errors 회복. 실연동 전까지 거짓 정보만은 먼저 막는다 |
| **2차 — 보안/개인정보/키 정리** | K1, K8, K9 | K1은 단독 브랜치·단독 리뷰. K8은 K2 실연동의 선행(공용 키 판독 경로 확정) |
| **3차 — 신뢰성** | K4, K6 | 작고 확실한 버그 정리 |
| **4차 — K2 실연동** | K2 (TAGO + 도로공사) | **활용신청 승인 후 착수.** 어댑터 → 역/정류소 코드 설정 UI → 폴백 순으로 커밋 분리 |
| **5차 — 문서** | D1~D6 | 4차까지의 결과를 as-built에 일괄 반영 |
| **6차 — 구조** | K10 | 리팩터링은 위 항목이 안정된 뒤 |

**작업 규약** (`7-backlog.md` §작업 규약 준수):
- 항목당 브랜치 1개(`fix/k1-exec-app-hardening` 등) → 논리 단위 커밋 → `main`에 `--ff-only` 머지.
- 모든 변경 후 **검증 3종 세트**(`tsc` / `lint` / `build`) 통과 + dev 서버 스모크(`curl -c jar …/api/auth/signin` → `-b jar`로 보호 API 호출).
- Windows 체크아웃의 `LF will be replaced by CRLF` 경고는 무해.

## 5. 보류 / 판단 필요

- **K2 커버리지 리스크** — 공공데이터포털에는 전국 환승 경로탐색이 없어, "총 소요시간·최적 경로"는 끝까지 지도 앱 딥링크에 위임됩니다. 카드가 "경로를 계산해주는 기능"이 아니라 **"다음 차 시각 + 구간 혼잡도 + 길찾기 바로가기"** 로 정의된다는 점을 UI 문구와 문서에 명시해야 합니다. 이 범위로 부족하다고 판단되면 그때 ODsay/TMAP(유료·비포털)을 별도 백로그로 검토합니다.
- **TAGO 코드 매핑 난이도** — 역명 문자열 → 역/정류소 코드 변환이 K2의 실제 작업량 대부분입니다. 검색 UI를 새로 만들지, 초기엔 코드 직접 입력으로 갈지 착수 시 결정합니다.
- **쿼터** — 포털 개발계정 기본 트래픽은 일 1,000건입니다. 30초 폴링과 결합되면 캐시 없이는 하루를 못 버티므로 K2 수정안 5번(캐시)은 선택이 아니라 필수입니다.
- **K1의 3번(바로가기를 세션으로 이전)** 은 설정 UI 변경을 동반합니다. 1·2·4번만으로도 주입은 막히므로, 3번은 후속으로 분리 가능합니다.
- `/api/util/exec-app`·`/api/util/select-folder`는 **서버 = 사용자 PC** 전제 기능입니다. `coffeeTide.dongple.kr` 클라우드 배포에서의 동작 정의(숨김/비활성/안내)를 한 번 확정해 문서화해야 합니다.

---

_작성: 2026-07-26 · 기준 커밋 `44c266e` · 이 계획서는 처리 완료 시 `7-backlog.md`로 이관하고 폐기합니다._
