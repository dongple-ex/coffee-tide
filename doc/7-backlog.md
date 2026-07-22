# Part 7: 개선 백로그 (Tech Debt & TODO)

> **이 문서의 목적**: 지금 당장은 안 고쳤지만 나중에 처리해야 할 항목을 다른 개발자/에이전트가 **그대로 집어서 작업**할 수 있도록 정리한 실행형 백로그입니다.
> 각 항목은 `문제 → 위치 → 영향 → 제안 → 완료 기준` 형식입니다. 위치의 줄 번호는 편집으로 밀릴 수 있으니 심볼/문자열로 다시 찾으세요.
>
> ℹ️ **2026-07-11 재구현 반영**: coffeeTide MVP가 이 저장소에 구현되면서 다수 항목이 **설계 단계에서 선반영**되었습니다(요약표의 ✅). ✅ 항목의 상세 절은 설계 기록으로 유지합니다. 남은 항목과 신규 **H 항목**(실계정 검증 등)을 우선 처리하세요.

## 작업 규약 (먼저 읽기)

- **검증 3종 세트** (모든 변경 후 필수): `npx tsc --noEmit -p tsconfig.json` · `npm run lint` · `npm run build` — 셋 다 통과해야 함.
- **런타임 스모크**: dev 서버(`npm run dev`, 기본 :3000)에 `curl -c jar http://localhost:3000/api/auth/signin`로 게스트 세션을 발급받아 `-b jar`로 보호 API 호출. 한글 body는 인코딩 깨짐 방지를 위해 **파일로 저장 후 `--data-binary @file`** 사용.
- **커밋**: 항목당 브랜치 1개(`fix/...`, `feat/...`, `chore/...`) → 논리 단위 커밋 → `main`에 `--ff-only` 머지 → push. 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Windows 체크아웃이라 `LF will be replaced by CRLF` 경고는 무해.
- **AGENTS.md 준수**: Next.js 16이므로 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 확인할 것.

## 우선순위 요약

| ID | 제목 | 상태/우선순위 | 영역 |
| :-- | :-- | :-- | :-- |
| **H1** | 외부 연동(Outlook/Google/Notion) 실계정 E2E 검증 | **P1** | 검증 |
| H2 | 세션 쿠키 토큰 저장 4KB 한계 리스크 | P2 | 보안/안정성 |
| H3 | Google Calendar·Drive 수집 (scope 확보됨, 미수집) | P3 | 기능 |
| ~~H4~~ | 팔로업 브라우저 알림(Notification API) | ✅ 구현 (2026-07-22) | 기능 |
| ~~H5~~ | 아침 브리핑 푸시 배달 — 웹 푸시(브라우저 알림) | ✅ 구현 (2026-07-11, 실브라우저 확인 대기) | 기능/차별화 |
| ~~C1~~ | AI 재분류 → 해시 캐시 + 쿨다운 + 킬스위치 | ✅ 구현 (MOCK 검증) | 성능/비용 |
| ~~B1~~ | 세션 암호화 키 하드코딩 fallback | ✅ 구현 (프로덕션 throw) | 보안 |
| ~~A3~~ | 토큰 401 반응형 재시도 | ✅ 구현 | 정합성 |
| ~~A1~~ | Gmail·Outlook 소스 혼동 | ✅ 구현 (`gmail` 별도 소스) | 정합성 |
| ~~A2~~ | Mock 데이터 source 라벨 오류 | ✅ 구현 (라벨 일치) | 정합성 |
| ~~D1~~ | 레거시 PKCE 죽은 코드 | ✅ 해당 없음 (plain-fetch OAuth) | 정리 |
| ~~D2~~ | Notion SDK v5 캐스팅 | ✅ 해소 (REST 직호출) | 정리 |
| ~~D3~~ | localStorage 배열 무한 증가 | ✅ 구현 (동기화 시 교집합 정리) | 정리 |
| ~~C2~~ | 폴링 effect 불필요 재설정 | ✅ 구현 (안정 콜백) | 성능 |
| ~~E1~~ | 아이콘 버튼 aria-label 부재 | ✅ 구현 | 접근성 |
| ~~E2~~ | 본문 1줄 클램프 고정 | ✅ 구현 (2줄+탭 펼침) | UX |
| ~~G1~~ | manual/paste 무연동 소스 (정본 핵심) | ✅ 구현 (스모크 검증) | 정본 격차 |
| ~~G2~~ | 빈 화면 안내가 연동 전제 | ✅ 구현 (입력 우선 안내) | 정본 격차 |
| ~~G3~~ | Copilot 무연동 비활성 | ✅ 구현 (항상 활성) | 정본 격차 |
| ~~G4~~ | Copilot 날짜/출처 근거 규칙 | ✅ 구현 (스모크 검증) | 정본 격차 |
| ~~G5~~ | 문서 `phase4_*` dangling 참조 | ✅ 완료 | 문서 |
| ~~G6~~ | Copilot 카드/섹션 렌더링 | ✅ 구현 (MarkdownLite) | 정본 격차 |
| ~~I1~~ | `GET /api/weather` + 좌표 절삭 캐시 | ✅ 구현 (2026-07-22) | 기능/phase7 |
| ~~I2~~ | 웰컴 그리팅 UI + 3단계 폴백 | ✅ 구현 (2026-07-22) | 기능/phase7 |
| ~~I3~~ | Copilot 프롬프트 고도화 + 캐시 키 버저닝 | ✅ 구현 (2026-07-22) | AI/phase7 |
| ~~I4~~ | `delegatable` 판별 및 배지 | ✅ 구현 (2026-07-22) | AI/phase7 |
| ~~I5~~ | 위치 권한 요청 시점 옵트인 전환 | ✅ 구현 (2026-07-22) | UX/phase7 |
| ~~B2~~ | 세션 7일 고정 만료 (롤링 연장 없음) | ✅ 구현 (2026-07-22) | 보안/UX |
| F1 | 자연어 규칙 value 오추출 (실사용 검증 필요) | P2 | 기능 |
| F2 | Notion 빠른 캡처 실계정 E2E 미검증 (→H1에 포함) | P2 | 기능 |
| C3 | 채널당 10건 고정, 페이지네이션 없음 | P3 | 성능 |
| D4 | 숨김 메커니즘 2개(규칙 hide vs dismiss) | P3 | 정리 |
| E3 | 반응형 실기기 점검 (≤480px 스타일은 구현됨) | P3 | UX |
| F3/F4 | Obsidian 데일리노트 캡처 / 규칙 정렬·통계 | P3 | 기능 |

---

## A. 정합성 & 버그

### A1. Gmail과 Outlook이 UI에서 구분되지 않음 — P2
- **문제**: Gmail 항목이 배지 호환을 위해 `source: 'outlook'`으로 라벨링됨.
- **위치**: `src/lib/adapters/gmail.ts` (mock의 `.map(x => ({...x, source:'outlook'}))` 및 실데이터 `source: 'outlook'` 주입), `UnifiedData['source']` 유니온(`src/lib/types/unified.ts`).
- **영향**: Gmail·Outlook 메일이 모두 "outlook" 배지로 표시돼 출처 혼동.
- **제안**: `source` 유니온에 `'gmail'` 추가 → `badge_gmail`/`badge_google` 스타일(page.module.css) 추가 → 어댑터가 실제 소스 사용. 답장/캡처 게이팅은 `['outlook','gmail'].includes(source)`로 갱신.
- **완료 기준**: Gmail 항목이 별도 배지로 표시되고, 메일 액션 버튼이 Gmail에도 노출.

### A2. Mock 데이터 source 라벨 오류 — P3
- **문제**: `MockGoogleCalendarAdapter`는 `source:'notion'`, `MockGoogleDriveAdapter`는 `source:'local_doc'` 반환.
- **위치**: `src/lib/adapters/factory.ts` (해당 Mock 클래스들).
- **영향**: `MOCK_MODE=true`에서만 배지가 잘못 표기(런타임 로직엔 무해).
- **제안**: 각각 `source:'gmail'`(A1 반영 시)/적절한 소스로 정정.
- **완료 기준**: Mock 캘린더/드라이브 항목 배지가 실제 출처와 일치.

### A3. 토큰 401 반응형 재시도 부재 — P1
- **문제**: 토큰 리프레시는 `/api/mails`에서 **만료 임박(60초) 선제 갱신**만 함. 토큰이 갑자기 revoke되거나 리프레시가 실패하면 어댑터가 401→`[]` 반환하고, UI엔 여전히 "연동됨"으로 표시.
- **위치**: `src/app/api/mails/route.ts`(리프레시 블록), 각 어댑터의 fetch 401 처리.
- **영향**: 만료된 연동이 "연동됨"인데 데이터만 안 옴 → 사용자 혼란.
- **제안**: 어댑터 호출이 401이면 1회 refresh 후 재시도; 재시도도 실패하면 해당 채널 `errors`에 표기하고 `connections.*`를 false로 내리거나 UI에 "재연동 필요" 노출.
- **완료 기준**: 만료/revoke 상황에서 사용자에게 명확한 재연동 안내가 표시됨.

## B. 보안

### B1. 세션 암호화 키 하드코딩 fallback — P1
- **문제**: `SESSION_ENCRYPTION_SECRET` 미설정 시 하드코딩 문자열로 키를 파생.
- **위치**: `src/lib/auth/session.ts`의 `getEncryptionKey`.
- **영향**: 프로덕션에서 키 미설정 시 **알려진 키**로 세션이 암호화됨(사실상 무보호).
- **제안**: `process.env.NODE_ENV === 'production'`에서 미설정이면 throw(부팅 실패) 또는 최소한 강한 경고 로그. 개발용 fallback만 유지.
- **완료 기준**: 프로덕션 빌드/런타임에서 키 미설정이 조용히 통과하지 않음.

### B2. 세션 7일 고정 만료 — P2
- **문제**: `tp_session_expiry`가 발급 시점 +7일 고정. refresh token이 유효해도 7일 후 강제 재로그인.
- **위치**: `src/app/api/auth/*`(쿠키 maxAge/expiry 설정), `src/proxy.ts`(만료 판독).
- **영향**: 불필요한 재로그인 UX 저하.
- **제안**: 활동 시 롤링 연장(요청마다 expiry 갱신) 또는 만료 시 refresh token으로 세션 재발급.
- **완료 기준**: 활성 사용자가 7일 경계에서 강제 로그아웃되지 않음.

## C. 성능 & 비용

### C1. 매 `/api/mails` 요청마다 전체 AI 재분류 — ✅ 구현 (2026-07-11)
- **문제**: `classifyTasks`가 모든 GET에서 전체 목록을 재분류하면 30초 폴링이 Gemini 무료 티어(일 20회)를 10분 만에 소진.
- **확정 설계** (프로토타입에서 검증된 방식 — 재구현 시 그대로 적용): `src/lib/ai/gemini.ts` — ① 콘텐츠 해시(`id`+title/content) 캐시로 **신규·변경 항목만** Gemini 전송(변경 없으면 호출 0회), ② 429/쿼터 초과 시 **10분 쿨다운** 동안 로컬 `FallbackEngine`으로 대체, ③ **킬스위치** `DISABLE_AI_CLASSIFY=true`로 AI 분류 완전 폐기(로컬 엔진만).
- **완료 기준**: 쿼터 소진 후 `/api/mails` 3연속 호출 → Gemini 호출 0회, 모두 200(로컬 엔진).
- **남은 여지**: 캐시가 서버 메모리(프로세스 재시작 시 소멸) — 필요 시 외부 스토어로 승격.

### C2. 폴링 effect 불필요 재설정 — P3
- **문제**: `fetchMails`/`fetchMailsSilent`가 `useCallback` deps에 `rules`·`alertedIds`를 포함 → 규칙/알림 변경 시 폴링 인터벌이 리셋.
- **위치**: `src/app/page.tsx` (두 fetch 콜백 + 폴링 useEffect).
- **영향**: 경미한 타이머 churn.
- **제안**: 최신 `rules`/`alertedIds`를 `useRef`로 참조해 콜백 identity를 안정화.
- **완료 기준**: 규칙/알림 변경이 폴링 인터벌을 재설정하지 않음.

### C3. 채널당 10건 고정 · 페이지네이션 없음 — P3
- **문제**: 각 어댑터 `fetchRecent(10)` 등 고정 limit, 초과분 조용히 누락.
- **위치**: `src/app/api/mails/route.ts`의 어댑터 호출 인자.
- **제안**: limit 설정화 또는 "더 보기" 로드. 누락 시 사용자에게 표기.
- **완료 기준**: 사용자가 수집량을 인지/조절 가능.

## D. 정리 (Tech Debt)

### D1. 레거시 PKCE 죽은 코드 제거 — P2
- **문제**: 초기 PKCE 로그인 설계 잔재가 미사용 상태로 남음(현재 로그인은 `signin`+`outlook`).
- **죽은 것**: `src/app/api/auth/callback/route.ts`, `src/lib/auth/msal.ts`의 `exchangeCodeForTokens`·`cca`·`REDIRECT_URI`, `src/proxy.ts`의 `PUBLIC_PATHS` 내 `'/api/auth/callback'`.
- **⚠️ 유지할 것**: `msal.ts`의 `refreshAccessToken`(토큰 리프레시에서 사용)과 `MS_SCOPES`(refreshAccessToken이 사용). 지우기 전 `grep`으로 사용처 재확인 필수.
- **완료 기준**: 미사용 심볼/라우트 제거 후 tsc·lint·build 통과, 로그인·리프레시 정상.

### D2. Notion `databases.query` — SDK v5 데이터소스 확인 — P2
- **문제**: `this.client.databases as unknown as { query }` 캐스팅으로 우회 중. Notion SDK v5 + 2025-09 API에서 `databases.query`가 data source 모델(`dataSources.query`)로 deprecated일 수 있음.
- **위치**: `src/lib/adapters/notion.ts` (fetchRecent, createTask의 databases 캐스팅).
- **제안**: 설치된 `@notionhq/client` 버전의 타입/문서 확인 → 필요 시 `dataSources` API로 마이그레이션, 캐스팅 제거.
- **완료 기준**: 실 Notion 계정에서 목록/생성 동작 확인, 불필요한 캐스팅 제거.

### D3. localStorage 배열 무한 증가 — P3
- **문제**: `tp_alerted_ids`, `tp_dismissed_ids`가 계속 누적되고 존재하지 않는 id도 유지.
- **위치**: `src/app/page.tsx` (alertedIds/dismissedIds 저장).
- **제안**: 저장 시 현재 수집된 id와 교집합만 유지하도록 주기적 정리.
- **완료 기준**: 배열 크기가 현재 데이터 규모에 수렴.

### D4. 숨김 메커니즘 2개 공존 — P3
- **문제**: 규칙 `hide`(자동)와 수동 `dismiss`가 별개로 존재.
- **제안**: 의도 차이를 UI/문서로 명확히 하거나 통합 검토(예: dismiss를 "이 발신자 항상 숨기기" 규칙으로 승격 제안).
- **완료 기준**: 사용자가 두 기능의 차이를 혼동하지 않음.

## E. UX & 접근성

### E1. 이모지 전용 버튼 aria-label 부재 — P2
- **위치**: `src/app/page.tsx` — dismiss `✕`, 폴더 선택 `📂`, 알림 벨, 규칙 토글 `●/○` 등.
- **제안**: 각 버튼에 `aria-label` 추가(대부분 `title`은 있으나 스크린리더 보강).
- **완료 기준**: 아이콘 버튼이 스크린리더에서 의미 전달.

### E2. 본문 1줄 클램프 고정 — P3
- **위치**: `.itemContent`(page.module.css, `-webkit-line-clamp: 1`).
- **제안**: 확장 토글 또는 2~3줄 허용.

### E3. 반응형 점검 — P3
- **제안**: 규칙 빌더/컨트롤 박스/액션 버튼 행이 좁은 화면(≤480px)에서 밀집하는지 점검·보완.

## F. 기능 다듬기

### F1. 자연어 규칙 value 오추출 — P2
- **문제**: 어색한 문형("제목에 긴급 있으면…")에서 키워드를 잘못 집음(field/action은 정확).
- **위치**: `src/lib/ai/gemini.ts`의 `parseRule` 프롬프트, `src/lib/ai/fallbackEngine.ts`의 휴리스틱.
- **제안**: few-shot 예시 확장 또는 "이렇게 해석했어요 → 확인/수정" 미리보기 단계 추가.
- **완료 기준**: 대표 문형 셋에서 value 정확도 향상.

### F2. Notion 빠른 캡처 E2E 검증 — P2
- **문제**: `NotionAdapter.createTask`가 실계정으로 미검증(Obsidian은 검증 완료).
- **제안**: 실 Notion 토큰+DB로 `/api/tasks/capture` 호출해 페이지 생성 확인, title 속성명 자동탐지 동작 검증.
- **완료 기준**: 실 DB에 태스크 페이지가 생성됨.

### F3. Obsidian 데일리노트 캡처 옵션 — P3
- **제안**: 현재 `coffeeTide_수집함.md` append 외에, "오늘 노트에 추가" 옵션 제공(리서치의 daily-note quick capture 니즈).

### F4. 규칙 우선순위 정렬 & 적중 통계 — P3
- **제안**: 규칙 순서 드래그 조정 + 규칙별 적중 건수 표기로 관리성 향상.

## G. 제품 정본(비전)과의 격차

> 근거: [`00-current-state.md`](./00-current-state.md)의 "핵심 제품 원칙"과 "현재 구현과의 차이". 정본은 **연동이 없어도 오늘의 일을 정리**하는 것을 지향하나, 현재 구현은 여전히 외부 연동을 사실상 전제로 함.

### G1. manual/paste 무연동 소스 미구현 — P1 (정본 핵심)
- **문제**: 정본은 `manual`(직접 입력), `paste`(메모/메일 붙여넣기 추출)를 **1급 소스**로 규정하나, 코드의 `UnifiedData['source']`에는 없음(`outlook|notion|obsidian|slack|teams|jira|local_doc`). 연동이 하나도 없으면 대시보드가 사실상 빈 상태.
- **위치**: `src/lib/types/unified.ts`(source 유니온), `src/app/api/mails/route.ts`(수집), `src/app/page.tsx`(입력 UI 부재).
- **제안**: `source`에 `manual`·`paste` 추가 → 빠른 업무 추가 폼 + 붙여넣기 추출(로컬/AI) → 세션 또는 localStorage에 저장 → 통합 파이프라인 병합. 완료/보류/삭제 로컬 write-back.
- **완료 기준**: 아무 연동 없이도 업무 1건 등록 → 분류·행동지침·Copilot 브리핑까지 동작 (정본 §6 성공 기준).

### G2. 빈 화면 안내가 연동 전제 — P2
- **문제**: 미연동 시 안내가 "서비스를 연결해 주세요" 중심.
- **위치**: `src/app/page.tsx`의 `!isAnyConnected` 빈 상태 문구(todo/recent 섹션).
- **제안**: "업무를 직접 추가하거나 문서를 가져오세요"를 기본 안내로. (G1 선행 권장)
- **완료 기준**: 미연동 사용자에게 입력 경로가 우선 제시됨.

### G3. Copilot이 무연동 시 비활성 — P2
- **문제**: `isAnyConnected`가 false면 Copilot 입력이 `disabled`. 정본은 수동 데이터만으로도 Copilot 동작을 요구.
- **위치**: `src/app/page.tsx`의 Copilot `<input>/<button>` `disabled={... || !isAnyConnected}`.
- **제안**: 표시할 업무(manual 포함)가 있으면 활성화하도록 조건 변경.
- **완료 기준**: 수동 업무만 있어도 Copilot 브리핑 가능.

### G4. Copilot 날짜/출처 근거 규칙 — P2
- **문제**: 정본은 "현재 날짜/타임존을 컨텍스트로 받고 추정 금지, 제안에 출처(파일/메일/페이지명) 표기"를 요구. 현재 프롬프트는 이를 보장하지 않음.
- **위치**: `src/lib/ai/gemini.ts`(askCopilot 프롬프트/컨텍스트).
- **제안**: 요청 시 현재 날짜/타임존을 컨텍스트로 주입, 시스템 지침에 "날짜 추정 금지 + 출처 표기" 명시.
- **완료 기준**: Copilot 응답에 기준일·출처가 일관되게 포함.

### G5. 문서 `phase4_*` dangling 참조 — ✅ 완료 (2026-07-11)
- **처리**: `doc/README.md` 읽기 순서를 재작성하여 phase4 참조를 제거하고, manual/paste 무연동 설계의 정본을 `00-current-state.md` + 본 문서 G1으로 명시함.

### G6. Copilot 응답 카드/섹션 렌더링 — P2
- **문제**: 정본은 Copilot 응답을 Markdown 원문 노출 대신 카드/섹션 형태로 렌더링할 것을 요구 ([`00-current-state.md`](./00-current-state.md) §5).
- **제안**: 경량 마크다운 렌더러 컴포넌트(프로토타입의 `MarkdownLite` 설계 참고)로 헤딩/리스트/강조를 섹션 UI로 변환. 원문 `**`, `##` 등이 그대로 보이면 안 됨.
- **완료 기준**: Copilot 브리핑이 섹션 구분된 카드 UI로 표시되고 Markdown 문법 문자가 노출되지 않음.

## H. 신규 (2026-07-11 구현 이후)

### H1. 외부 연동 실계정 E2E 검증 — P1
- **문제**: Outlook/Google OAuth, Notion 쿼리·캡처·완료, Obsidian/로컬 문서/LLM 실폴더 수집이 **MOCK 스모크만 통과**하고 실계정으로 미검증.
- **제안**: `.env.local`에 실제 자격 증명 설정 → `MOCK_MODE=false`로 각 연동·write-back(답장 초안, Notion 완료, Obsidian 체크·캡처·다이제스트) 순차 검증. F2(Notion 캡처)도 여기서 함께.
- **완료 기준**: 6종 연동 각각 수집 1회 + write-back 1회 실계정 성공.

### H2. 세션 쿠키 토큰 저장 4KB 한계 — P2
- **문제**: 암호화 세션 쿠키에 OAuth 토큰 전체를 저장. MS 액세스 토큰은 2KB를 넘을 수 있어 Outlook+Google 동시 연동 시 쿠키 4KB 한계 초과 위험.
- **위치**: `src/lib/auth/session.ts`, `src/lib/auth/cookies.ts`.
- **제안**: 쿠키 분할(chunking) 또는 서버측 세션 저장소(파일/SQLite)로 토큰만 이전.
- **완료 기준**: 양쪽 동시 연동 상태에서 세션 저장·복호화가 안정적으로 동작.

### H3. Google Calendar·Drive 수집 — P3
- **문제**: OAuth scope는 확보했으나 수집은 Gmail만 구현.
- **제안**: `GmailAdapter` 패턴으로 Calendar 오늘 일정(→`meeting`), Drive 최근 문서(→`reference`) 어댑터 추가.

### H4. 팔로업 브라우저 알림 — P3
- **문제**: 팔로업 에스컬레이션이 화면 배지로만 표시됨(백그라운드 인지 불가).
- **제안**: Notification API 옵트인 + 에스컬레이션 발생 시 1회 알림(`tp_alerted_ids`로 중복 방지, D3 정리 로직 재사용).

### H5. 아침 브리핑 푸시 배달 — ✅ 구현 (2026-07-11)

> 구현됨: `public/sw.js` + `src/lib/push/*` + `src/instrumentation.ts`(스케줄러) + `/api/push/*`·`/api/briefing/daily` + 대시보드 "🔔 아침 브리핑 알림" 카드. API 배선·저장·크론 트리거·만료 구독 정리는 스모크 검증 완료. **남은 확인**: 실브라우저에서 알림 켜기 → 테스트 발송 수신 (H1 실계정 검증과 함께). 아래는 설계 기록.
- **배경**: 현재 coffeeTide는 사용자가 대시보드에 들어와야 브리핑을 받는 **pull 모델**. "알아서 도착하는" push 경로가 빠져 있음. (참고: 해피AI 'AI 업무비서 만들기' 영상, 2026-07 검토)
- **채널 결정 (2026-07-11 사용자)**: 카톡 등 외부 메신저는 앱 등록·연동(접속) 부담이 있어 제외. **브라우저 알림으로 배달**한다.
  - 1순위: **웹 푸시** (Service Worker + Push API + VAPID) — **탭을 닫아도** 브라우저가 백그라운드 실행 중이면 도착. PWA 로드맵(M2, [`8-mobile_strategy.md`](./8-mobile_strategy.md))과 함께 구현.
  - 보조: 탭이 열려 있을 때는 인앱 Notification API(H4 메커니즘 재사용)로 즉시 표시.
  - 카톡 "나에게 보내기"·이메일은 장기 검토로 강등.
- **제안 구현**:
  1. **스케줄 브리핑 생성**: 지정 시각(기본 08:30)에 `askCopilot` 브리핑 자동 생성. 셀프호스팅은 서버 내 스케줄러, Vercel 배포는 Vercel Cron + 신규 `/api/briefing/daily`.
  2. 푸시 구독: 설정 카드에서 옵트인 → 구독 정보 서버 저장 → 생성 시각에 web-push 발송(제목=최우선 업무 1줄, 클릭 시 대시보드 오픈).
  3. 브리핑 내용은 G4 규칙(기준일·출처 표기) 동일 적용. 수동 입력만 있어도 배달돼야 함(무연동 원칙).
- **제약 명시**: 웹 푸시는 브라우저 완전 종료 상태에서는 수신 불가(Windows의 Chrome/Edge는 기본적으로 백그라운드 상주라 대부분 수신됨). iOS Safari는 PWA 홈 화면 추가 시에만 지원 — 모바일 전략 M2와 연계.
- **완료 기준**: 탭을 닫은 상태에서 지정 시각에 브라우저 알림으로 브리핑이 도착하고, 클릭하면 대시보드가 열린다.

## I. Phase 7 — Copilot 브리핑 고도화 (2026-07-22)

> 근거: [`phase7_copilot_briefing_spec.md`](./phase7_copilot_briefing_spec.md). I1~I4는 스펙과 함께 구현 완료 — 상세는 스펙 §2와 [`as-built-reference.md`](./as-built-reference.md) 참조.

### I1. `GET /api/weather` — ✅ 구현 (2026-07-22)
- OpenWeatherMap + `WEATHER_API_KEY`. 좌표 소수점 2자리 절삭 → 서버 메모리 캐시 20분, 좌표 미저장. 키 미설정/조회 실패 시 `success:false` (그리팅은 시간대 폴백).

### I2. 웰컴 그리팅 UI + 3단계 폴백 — ✅ 구현 (2026-07-22)
- `src/app/components/WelcomeCard.tsx` — 시간대 테마 + 날씨 문구 **템플릿 기반**(LLM 미사용). 날씨+시간대 → 시간대만 → 미표시 3단계 폴백.

### I3. Copilot 프롬프트 고도화 + 캐시 키 버저닝 — ✅ 구현 (2026-07-22)
- `src/lib/ai/gemini.ts` — 시간대별·성격별 제안 프롬프트(v2), `PROMPT_VERSION`을 해시 캐시 키에 포함해 프롬프트 변경 시 낡은 응답 재사용 방지 (C1 캐시와 호환).

### I4. `delegatable` 판별 및 배지 — ✅ 구현 (2026-07-22)
- `UnifiedData.delegatable?: boolean` — 로컬 LLM 도구 위임 후보 **표식**(실행 버튼 아님). `FallbackEngine`은 채우지 않음 — `undefined`는 "판별 안 됨". 대시보드 배지 표시.

### I5. 위치 권한 요청 시점 옵트인 전환 검토 — P3 (앱 심사 전 필수)
- **문제**: 현재 `WelcomeCard` 마운트 시 위치 권한을 **즉시 요청**. 첫 진입 즉시 요청은 이탈률을 높이고, 앱 스토어 심사에서 목적 불명확으로 지적받을 수 있음 (스펙 §5.4).
- **위치**: `src/app/components/WelcomeCard.tsx`의 `useEffect` (geolocation 호출).
- **영향**: 웹에서는 브라우저가 자체 권한 UI로 처리해 리스크가 낮으나, 하이브리드 앱 심사(`hybrid_app_release_guide.md` §2 Step 4-1)에서는 거부 사유가 될 수 있음.
- **제안**: 그리팅 영역에 "날씨 켜기" 버튼을 두고 클릭 시 요청(옵트인). 허용 여부를 localStorage에 기억. 하이브리드 앱 전환 시 `@capacitor/geolocation`으로 교체(스펙 §2.1 구현 노트)와 함께 진행.
- **완료 기준**: 첫 진입 시 권한 팝업이 뜨지 않고, 사용자가 명시적으로 켠 뒤에만 날씨 그리팅이 표시됨.

---

_최종 갱신: 2026-07-22 (phase7 I 항목 등록). 이 문서는 살아있는 백로그입니다. 항목을 처리하면 "완료"로 표시하세요._
