# 개선 백로그 (Tech Debt & TODO)

> **이 문서의 목적**: 지금 당장은 안 고쳤지만 나중에 처리해야 할 항목을 다른 개발자/에이전트가 **그대로 집어서 작업**할 수 있도록 정리한 실행형 백로그입니다.
> 각 항목은 `문제 → 위치 → 영향 → 제안 → 완료 기준` 형식입니다. 위치의 줄 번호는 편집으로 밀릴 수 있으니 심볼/문자열로 다시 찾으세요.
>
> ℹ️ **2026-07-11 재구현 반영**: coffeeTide MVP가 이 저장소에 구현되면서 다수 항목이 **설계 단계에서 선반영**되었습니다(요약표의 ✅). ✅ 항목의 상세 절은 설계 기록으로 유지합니다. 남은 항목과 신규 **H 항목**(실계정 검증 등)을 우선 처리하세요.

## 작업 규약 (먼저 읽기)

- **검증 3종 세트** (모든 변경 후 필수): `npx tsc --noEmit -p tsconfig.json` · `npm run lint` · `npm run build` — 셋 다 통과해야 함.
- **런타임 스모크**: dev 서버(`npm run dev`, 기본 :3000)에 `curl -c jar http://localhost:3000/api/auth/signin`로 게스트 세션을 발급받아 `-b jar`로 보호 API 호출. 한글 body는 인코딩 깨짐 방지를 위해 **파일로 저장 후 `--data-binary @file`** 사용.
- **커밋**: 항목당 브랜치 1개(`fix/...`, `feat/...`, `chore/...`) → 논리 단위 커밋 → `main`에 `--ff-only` 머지 → push. 커밋 메시지 말미의 `Co-Authored-By:`는 **작업한 모델명으로** 적습니다(예: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`).
- Windows 체크아웃이라 `LF will be replaced by CRLF` 경고는 무해.
- **AGENTS.md 준수**: Next.js 16이므로 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 확인할 것.

## 우선순위 요약

| ID | 제목 | 상태/우선순위 | 영역 |
| :-- | :-- | :-- | :-- |
| **H1** | 외부 연동(Outlook/Google/Notion) 실계정 E2E 검증 | **P1** | 검증 |
| ~~H2~~ | 세션 쿠키 토큰 저장 4KB 한계 리스크 | ✅ 구현 (2026-07-31 쿠키 청킹, 실계정 검증은 H1과 함께) | 보안/안정성 |
| H3 | Google Calendar·Drive 수집 (Calendar 일정 등록은 구현, 수집은 미구현) | P3 | 기능 |
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
| ~~J1~~ | 출퇴근 길찾기 스마트 카드 & 시간대 자동 전환 | ✅ 구현 (2026-07-22) | 개인화/UX |
| ~~J2~~ | 자연어 단어-앱 바로가기 실행기 (`exec-app`) | ✅ 구현 (2026-07-22) | 개인화/AI |
| ~~B2~~ | 세션 7일 고정 만료 (롤링 연장 없음) | ✅ 구현 (2026-07-22) | 보안/UX |
| ~~L1~~ | 퀵 위젯 바(타이머·계산기·바로가기·날씨) | ✅ 구현 (2026-07-24) | 기능 |
| ~~L2~~ | AI 슬래시 커맨드 5종 + 자동완성 | ✅ 구현 (2026-07-24) | 기능 |
| ~~L3~~ | 워크노트·하위작업 체크리스트·AI 일정 재배치 | ✅ 구현 (2026-07-24) | 기능 |
| ~~L4~~ | 퇴근 핸드오프(UI 스냅샷 보존·복원) | ✅ 구현 (2026-07-24) | 기능 |
| **K2** | `/api/commute` 하드코딩 → 공공데이터포털(TAGO·도로공사) 실연동 | **P0** | 제품 신뢰 |
| ~~K10~~ | `page.tsx` 모듈 분할 (HeaderControls, QuickAddBar, SettingsModal) | ✅ 구현 (2026-08-03) | 구조 |
| F1 | 자연어 규칙 value 오추출 (실사용 검증 필요) | P2 | 기능 |
| F2 | Notion 빠른 캡처 실계정 E2E 미검증 (→H1에 포함) | P2 | 기능 |
| ~~C3~~ | 채널별 수집 건수 상한(10/20/50건) & 리스트 더보기/접기 페이지네이션 | ✅ 구현 (2026-08-03) | 성능/UX |
| D4 | 숨김 메커니즘 2개(규칙 hide vs dismiss) | P3 | 정리 |
| E3 | 반응형 실기기 점검 (≤480px 스타일은 구현됨) | P3 | UX |
| F3/F4 | Obsidian 데일리노트 캡처 / 규칙 정렬·통계 | P3 | 기능 |

---

## A. 정합성 & 버그

### ~~A1~~. Gmail과 Outlook이 UI에서 구분되지 않음 — ✅ 구현 (2026-07-22)
- **처리**: `UnifiedSource` 유니온에 `'gmail'` 포함, `GmailAdapter`에서 `source: "gmail"` 사용 및 `badge_gmail` 스타일 적용 완료.

### ~~A2~~. Mock 데이터 source 라벨 오류 — ✅ 구현 (2026-07-22)
- **처리**: `factory.ts`에서 mock 어댑터들의 source 라벨을 실제 어댑터와 동일하게 정정 완료.

### ~~A3~~. 토큰 401 반응형 재시도 부재 — ✅ 구현 (2026-07-22)
- **처리**: `src/app/api/mails/route.ts`에서 `AuthExpiredError` 발생 시 `refreshChannel`로 1회 반응형 갱신 및 재시도 구현 완료.

## B. 보안

### ~~B1~~. 세션 암호화 키 하드코딩 fallback — ✅ 구현 (2026-07-22)
- **처리**: `src/lib/auth/session.ts`의 `getEncryptionKey()`에서 `NODE_ENV === 'production'`일 때 키 미설정이면 명시적 예외(throw) 발생 적용 완료.

### ~~B2~~. 세션 7일 고정 만료 — ✅ 구현 (2026-07-22)
- **처리**: `touchSession`(`src/lib/auth/cookies.ts`)을 `/api/mails` 응답에서 호출해 활동 시 만료를 +7일 롤링 연장. 30초 폴링이 도는 동안 계속 갱신되므로 활성 사용자는 7일 경계에서 강제 로그아웃되지 않는다.
- 아래는 설계 기록.
- **문제**: `tp_session_expiry`가 발급 시점 +7일 고정. refresh token이 유효해도 7일 후 강제 재로그인.
- **위치**: `src/app/api/auth/*`(쿠키 maxAge/expiry 설정), `src/proxy.ts`(만료 판독).

## C. 성능 & 비용

### ~~C1~~. 매 `/api/mails` 요청마다 전체 AI 재분류 — ✅ 구현 (2026-07-11)
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

### ~~C3~~. 채널당 10건 고정 · 페이지네이션 없음 — ✅ 구현 (2026-08-03)
- **처리**: `fetchLimit` (10/20/50건, 기본값 20) 드롭다운 연동 및 `/api/mails?limit=N` 지원, 업무 리스트 하단 더 보기/접기 UI 적용 완료.

## D. 정리 (Tech Debt)

### ~~D1~~. 레거시 PKCE 죽은 코드 제거 — ✅ 구현 (2026-07-22)
- **처리**: 미사용 PKCE 콜백 라우트 및 SDK 죽은 함수 정리 완료.

### ~~D2~~. Notion `databases.query` — SDK v5 데이터소스 확인 — ✅ 구현 (2026-07-22)
- **처리**: `NotionAdapter`를 REST API 직접 호출 방식으로 전환하여 SDK 버전 의존성 해소 완료.

### ~~D3~~. localStorage 배열 무한 증가 — ✅ 구현 (2026-07-22)
- **처리**: `src/app/page.tsx`에서 `fetchMails` 시 수집된 `validIds` 기반으로 `dismissed` 배열 자동 필터링/정리 적용 완료.

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

> 근거: [`00-product-spec.md`](./00-product-spec.md)의 "핵심 제품 원칙"과 "현재 구현과의 차이". 정본은 **연동이 없어도 오늘의 일을 정리**하는 것을 지향하나, 현재 구현은 여전히 외부 연동을 사실상 전제로 함.

### G1. manual/paste 무연동 소스 — ✅ 구현 (2026-07-31 무연동 E2E 재검증)
- **문제(원래)**: 정본은 `manual`(직접 입력), `paste`(메모/메일 붙여넣기 추출)를 **1급 소스**로 규정하나 미구현이었음.
- **구현**: `UnifiedSource`에 `manual`·`paste` 포함, 빠른 추가 폼(`addManual` → `/api/tasks/classify`), 붙여넣기 추출(`importPaste` → `/api/tasks/extract`), `ct_manual_items` localStorage 영속, 완료/보류/삭제 로컬 write-back(`setLocalStatus`/`deleteLocal`).
- **검증 (2026-07-31)**: 연동 토큰 0·AI 키 0 상태에서 게스트 세션으로 E2E 스모크 — ① 수동 등록→분류(`approval_required`+행동지침) ② 붙여넣기→`paste` 소스 3건 추출·분류 ③ Copilot 브리핑에 최우선 업무·출처(직접 입력)·기준일 표기. 전부 통과 (정본 §6 성공 기준 충족).
- **보강 (2026-07-31)**: 생성 시 분류 실패로 category가 빈 항목이 폴백 브리핑에서 누락되던 빈틈 수정 — `askCopilot` 폴백 경로에서 `classifyAll`로 보충 후 브리핑.

### G2. 빈 화면 안내가 연동 전제 — ✅ 구현 (입력 우선 안내, 2026-07-31 코드 확인)
- **문제**: 미연동 시 안내가 "서비스를 연결해 주세요" 중심.
- **위치**: `src/app/page.tsx`의 `!isAnyConnected` 빈 상태 문구(todo/recent 섹션).
- **제안**: "업무를 직접 추가하거나 문서를 가져오세요"를 기본 안내로. (G1 선행 권장)
- **완료 기준**: 미연동 사용자에게 입력 경로가 우선 제시됨.

### G3. Copilot이 무연동 시 비활성 — ✅ 구현 (항상 활성, 2026-07-31 무연동 스모크 확인)
- **문제**: `isAnyConnected`가 false면 Copilot 입력이 `disabled`. 정본은 수동 데이터만으로도 Copilot 동작을 요구.
- **위치**: `src/app/page.tsx`의 Copilot `<input>/<button>` `disabled={... || !isAnyConnected}`.
- **제안**: 표시할 업무(manual 포함)가 있으면 활성화하도록 조건 변경.
- **완료 기준**: 수동 업무만 있어도 Copilot 브리핑 가능.

### G4. Copilot 날짜/출처 근거 규칙 — ✅ 구현 (Gemini 프롬프트 절대 규칙 + 폴백 기준일·출처, 2026-07-31 스모크 확인)
- **문제**: 정본은 "현재 날짜/타임존을 컨텍스트로 받고 추정 금지, 제안에 출처(파일/메일/페이지명) 표기"를 요구. 현재 프롬프트는 이를 보장하지 않음.
- **위치**: `src/lib/ai/gemini.ts`(askCopilot 프롬프트/컨텍스트).
- **제안**: 요청 시 현재 날짜/타임존을 컨텍스트로 주입, 시스템 지침에 "날짜 추정 금지 + 출처 표기" 명시.
- **완료 기준**: Copilot 응답에 기준일·출처가 일관되게 포함.

### G5. 문서 `phase4_*` dangling 참조 — ✅ 완료 (2026-07-11)
- **처리**: `doc/README.md` 읽기 순서를 재작성하여 phase4 참조를 제거하고, manual/paste 무연동 설계의 정본을 `00-product-spec.md` + 본 문서 G1으로 명시함.

### G6. Copilot 응답 카드/섹션 렌더링 — ✅ 구현 (`markdownLite.tsx`, 2026-07-31 코드 확인)
- **문제**: 정본은 Copilot 응답을 Markdown 원문 노출 대신 카드/섹션 형태로 렌더링할 것을 요구 ([`00-product-spec.md`](./00-product-spec.md) §5).
- **제안**: 경량 마크다운 렌더러 컴포넌트(프로토타입의 `MarkdownLite` 설계 참고)로 헤딩/리스트/강조를 섹션 UI로 변환. 원문 `**`, `##` 등이 그대로 보이면 안 됨.
- **완료 기준**: Copilot 브리핑이 섹션 구분된 카드 UI로 표시되고 Markdown 문법 문자가 노출되지 않음.

## H. 신규 (2026-07-11 구현 이후)

### H1. 외부 연동 실계정 E2E 검증 — P1
- **문제**: Outlook/Google OAuth, Notion 쿼리·캡처·완료, Obsidian/로컬 문서/LLM 실폴더 수집이 **MOCK 스모크만 통과**하고 실계정으로 미검증.
- **제안**: `.env.local`에 실제 자격 증명 설정 → `MOCK_MODE=false`로 각 연동·write-back(답장 초안, Notion 완료, Obsidian 체크·캡처·다이제스트) 순차 검증. F2(Notion 캡처)도 여기서 함께.
- **완료 기준**: 6종 연동 각각 수집 1회 + write-back 1회 실계정 성공.

### H2. 세션 쿠키 토큰 저장 4KB 한계 — ✅ 구현 (2026-07-31 쿠키 청킹)
- **문제(원래)**: 암호화 세션 쿠키에 OAuth 토큰 전체를 저장. MS 액세스 토큰은 2KB를 넘을 수 있어 Outlook+Google 동시 연동 시 쿠키 4KB 한계 초과 위험.
- **구현**: `src/lib/auth/cookies.ts` — NextAuth 방식 쿠키 분할. 암호화 페이로드를 3,500B 단위로 `tp_session`(첫 조각) + `tp_session.1`…`.4`(최대 5조각 ≈ 17.5KB)에 나눠 저장하고, 읽기에서 순서대로 이어붙여 복호화. 첫 조각이 기존 쿠키 이름이라 proxy.ts·기존 단일 쿠키 세션과 **하위호환**. 세션 축소 시 잔여 조각 자동 제거, 상한 초과 시 조용한 잘림 대신 명시적 오류.
- **검증 (2026-07-31)**: ① 7.4KB 페이로드(Outlook 2.6KB+refresh 1.8KB+전 채널) → 3조각 분할·복원 라운드트립 일치, 조각 유실 시 null 안전 실패, 소형 세션 1조각 하위호환 — 스팟 체크 전부 통과. ② dev 서버에서 세션 발급→보호 API→롤링 연장(touchSession) 왕복 200. 검증 3종 세트 통과.
- **남은 확인**: 실계정 Outlook+Google 동시 연동 상태에서의 실사이즈 검증은 H1과 함께.

### H3. Google Calendar·Drive 수집 — P3
- **문제**: AI 바리스타의 Calendar 일정·반복 일정 등록은 구현됐으나, 수집은 Gmail만 구현.
- **제안**: `GmailAdapter` 패턴으로 Calendar 오늘 일정(→`meeting`), Drive 최근 문서(→`reference`) 어댑터 추가.

### H4. 팔로업 브라우저 알림 — ✅ 구현 (2026-07-22)
- **처리**: `src/lib/push/browserNotification.ts`의 `triggerTaskNotifications` — 긴급/팔로업 초과 업무 발생 시 데스크톱 알림 1회. 중복 방지는 `ct_notified_item_ids`. 권한은 설정 모달의 알림 토글에서 옵트인.
- 아래는 설계 기록.
- **문제**: 팔로업 에스컬레이션이 화면 배지로만 표시됨(백그라운드 인지 불가).

### H5. 아침 브리핑 푸시 배달 — ✅ 구현 (2026-07-11)

> 구현됨: `public/sw.js` + `src/lib/push/*` + `src/instrumentation.ts`(스케줄러) + `/api/push/*`·`/api/briefing/daily` + 대시보드 "🔔 아침 브리핑 알림" 카드. API 배선·저장·크론 트리거·만료 구독 정리는 스모크 검증 완료. **남은 확인**: 실브라우저에서 알림 켜기 → 테스트 발송 수신 (H1 실계정 검증과 함께). 아래는 설계 기록.
- **배경**: 현재 coffeeTide는 사용자가 대시보드에 들어와야 브리핑을 받는 **pull 모델**. "알아서 도착하는" push 경로가 빠져 있음. (참고: 해피AI 'AI 업무비서 만들기' 영상, 2026-07 검토)
- **채널 결정 (2026-07-11 사용자)**: 카톡 등 외부 메신저는 앱 등록·연동(접속) 부담이 있어 제외. **브라우저 알림으로 배달**한다.
  - 1순위: **웹 푸시** (Service Worker + Push API + VAPID) — **탭을 닫아도** 브라우저가 백그라운드 실행 중이면 도착. PWA 로드맵(M2, [`04-mobile-strategy.md`](./04-mobile-strategy.md))과 함께 구현.
  - 보조: 탭이 열려 있을 때는 인앱 Notification API(H4 메커니즘 재사용)로 즉시 표시.
  - 카톡 "나에게 보내기"·이메일은 장기 검토로 강등.
- **제안 구현**:
  1. **스케줄 브리핑 생성**: 지정 시각(기본 08:30)에 `askCopilot` 브리핑 자동 생성. 셀프호스팅은 서버 내 스케줄러, Vercel 배포는 Vercel Cron + 신규 `/api/briefing/daily`.
  2. 푸시 구독: 설정 카드에서 옵트인 → 구독 정보 서버 저장 → 생성 시각에 web-push 발송(제목=최우선 업무 1줄, 클릭 시 대시보드 오픈).
  3. 브리핑 내용은 G4 규칙(기준일·출처 표기) 동일 적용. 수동 입력만 있어도 배달돼야 함(무연동 원칙).
- **제약 명시**: 웹 푸시는 브라우저 완전 종료 상태에서는 수신 불가(Windows의 Chrome/Edge는 기본적으로 백그라운드 상주라 대부분 수신됨). iOS Safari는 PWA 홈 화면 추가 시에만 지원 — 모바일 전략 M2와 연계.
- **완료 기준**: 탭을 닫은 상태에서 지정 시각에 브라우저 알림으로 브리핑이 도착하고, 클릭하면 대시보드가 열린다.

## I. Phase 7 — Copilot 브리핑 고도화 (2026-07-22)

> 근거: [`spec/phase7-copilot-briefing.md`](./spec/phase7-copilot-briefing.md). I1~I4는 스펙과 함께 구현 완료 — 상세는 스펙 §2와 [`01-as-built-reference.md`](./01-as-built-reference.md) 참조.

### I1. `GET /api/weather` — ✅ 구현 (2026-07-22, 2026-07-27 갱신)
- **기상청 초단기실황+초단기예보(공공데이터포털) 1순위 → OpenWeatherMap 폴백**. 지역명은 BigDataCloud 역지오코딩(한글 동/구). 좌표는 소수점 2자리로 절삭해 **외부 호출에도 사용**(K9) → 서버 메모리 캐시 20분, 좌표 미저장. 키는 `DATA_GO_KR_SERVICE_KEY`(구 `WEATHER_API_KEY`)와 `OPENWEATHER_API_KEY`로 분리(K8). 키 미설정/조회 실패 시 `success:false` (그리팅은 시간대 폴백).

### I2. 웰컴 그리팅 UI + 3단계 폴백 — ✅ 구현 (2026-07-22)
- `src/app/components/WelcomeCard.tsx` — 시간대 테마 + 날씨 문구 **템플릿 기반**(LLM 미사용). 날씨+시간대 → 시간대만 → 미표시 3단계 폴백.

### I3. Copilot 프롬프트 고도화 + 캐시 키 버저닝 — ⚠️ 프롬프트 구현 / 캐시 재점검 필요
- `src/lib/ai/gemini.ts` — 시간대별·성격별 제안 프롬프트(v2)와 `PROMPT_VERSION` 해시는 존재한다. 다만 현재 `classifyTasks()`가 캐시 결과를 저장하지 않아 캐시 버저닝 효과는 발생하지 않는다(L1에서 재설계).

### I4. `delegatable` 판별 및 배지 — ⚠️ UI·타입 구현 / 현재 판별 생산자 없음
- `UnifiedData.delegatable?: boolean`과 대시보드 배지는 구현돼 있다. 그러나 현재 `classifyTasks()`가 로컬 규칙만 사용하고 `FallbackEngine`도 이 필드를 채우지 않아 새 항목에 대한 실제 판별 값은 생성되지 않는다(L1에서 구조화 분류로 복구).

### I5. 위치 권한 요청 시점 옵트인 전환 — ✅ 구현 (2026-07-23)
- **처리**: geolocation 호출을 `WelcomeCard` 마운트 시점에서 **설정 모달의 `📍 위치 & 날씨 브리핑` 토글**로 이관. 옵트인 여부는 `ct_weather_enabled`, 좌표는 `ct_weather_coords`에 캐시해 반복 권한 팝업을 막는다. 첫 진입 시 권한 팝업이 뜨지 않는다.
- **남은 것**: 하이브리드 앱 전환 시 `@capacitor/geolocation`으로 교체(스펙 §2.1 구현 노트). 심사 대응은 `05-hybrid-app-release-guide.md` §2 Step 4-1과 함께.

---

## K. 소스 점검 (2026-07-27)

> 근거·상세는 [`03-source-fix-plan.md`](./03-source-fix-plan.md). K1·K3~K9·K11·K12는 **구현 완료**(커밋 `03cc9fe`, `f76d065`)이며, 여기에는 **남은 것만** 적습니다.

### K2. `/api/commute` 하드코딩 → 공공데이터포털 실연동 — ✅ 코드 구현 (2026-07-27) / 실키 E2E 검증 대기
- **구현 (2026-07-27, 커밋 `177090a` — 커밋 제목은 백업 기능이지만 K2 실연동이 함께 포함됨)**:
  - `src/lib/adapters/commute.ts` — TAGO 근접 정류소(`getCrdntPrxmtSttnList`) + 정류소별 실시간 버스 도착예정(`getSttnAcctoArvlPrearngeInfoList`). XML 에러 문서·JSON 헤더 오류·items 형태 편차 흡수.
  - `src/app/api/commute/route.ts` — 하드코딩 상수 0개. 실측 가능한 것(버스 도착예정)만 반환, 자차/키 미설정/조회 실패 시 수치 없이 안내 + 지도 앱 딥링크 위임. 도착정보 서버 캐시 45초.
  - `src/app/api/commute/stops/route.ts` — 설정에서 좌표 → 근접 정류소 1회 조회(좌표는 저장·반복 전송하지 않음). 정류소 코드는 `ct_commute_config`에 저장.
  - 지하철 시간표는 상·하행 판별 불가로 1차 범위에서 제외(설계 메모 참조), 도로공사 소통 데이터는 미착수.
- **남은 것 (P1)**: **실키 E2E 검증** — `.env.local`에 `DATA_GO_KR_SERVICE_KEY`(또는 별칭 `WEATHER_API_KEY`)가 현재 미설정. 키 설정 후 활용신청 승인 상태(TAGO 2종)와 실응답 필드명을 확인해야 한다. H1(실계정 E2E)과 묶어 진행 권장.
- **완료 기준**: 실키로 근접 정류소 검색·도착정보 표시가 실제 동작. 폴백 시 수치가 사라지고 딥링크만 남는 것 확인.

### K10. `page.tsx` / `page.module.css` 분할 — P3 (1~4단계 완료)
- **진행**: 3,413 → **2,351줄**. 순수 헬퍼 → 설정 6섹션 → 업무 카드 → Copilot 패널 순으로 분리 (구조는 [`01-as-built-reference.md`](./01-as-built-reference.md) §8).
- **남은 5단계**: 상태 훅 분리(`useManualItems`·`useWeather`·`usePushSubscription`) + `page.module.css`(1,592줄) 컴포넌트별 분할.
- **완료 기준**: `page.tsx` 1,000줄 이하, 기능 회귀 없음.

### K13. 기본 바로가기 프리셋의 하드코딩 경로 — P3
- **문제**: `DEFAULT_APP_SHORTCUTS`의 "구글안티" 프리셋 경로가 `C:\Users\tstar\...`로 특정 계정명을 포함해 다른 환경에서는 항상 실패한다(K1 이후 실패 사유는 화면에 표시됨).
- **제안**: 프리셋에서 제거하거나 `%LOCALAPPDATA%` 기반 경로로 교체.

---

## L. 로컬 AI 강화 (2026-08-11)

> 상세 설계와 검증 매트릭스: [`08-local-ai-enhancement-plan.md`](./08-local-ai-enhancement-plan.md). 로컬 스크립트·다형식 문서 계획은 [`10-local-tools-document-agent-plan.md`](./10-local-tools-document-agent-plan.md), CoffeeTide MCP 서버는 로컬 AI 이후 과제로 [`09-mcp-access-deferred-plan.md`](./09-mcp-access-deferred-plan.md)에 보류한다.

### L1. 실제 로컬 모델 공급자 도입 — P1

- **현재**: `FallbackEngine`은 정규식·템플릿이며 실제 LLM이 아니다. LLM 산출물 연동도 파일 스캔 기능이다.
- **문제**: `classifyTasks()`는 Gemini를 호출하지 않고 캐시도 채우지 않지만 기존 문서에는 Gemini 분류·캐시가 구현된 것으로 기록돼 있었다. 대화 문맥, 공급자 상태, 로컬 RAG도 없다.
- **제안**: OpenAI 호환 로컬 공급자(Ollama/LM Studio) → Gemini 옵트인 → 결정적 규칙 엔진의 공통 라우터를 구현한다. 1차는 로컬 CoffeeTide 실행 환경만 지원한다.
- **완료 기준**: Gemini 키 없이 실제 로컬 모델로 분류·추출·일정 초안·AI 바리스타가 동작하고, 공급자 중단 시 규칙 엔진으로 안전하게 폴백한다.

### L2. 로컬 문서 검색과 대화 문맥 — P2

- **현재**: 문서 발췌를 목록에 병합하고 최대 80개 항목의 앞부분만 컨텍스트로 전달한다. 화면의 이전 질문·답변은 다음 API 요청에 전달되지 않는다.
- **제안**: 변경분 임베딩, 질문별 상위 문서 검색, 파일 출처 인용, 제한된 최근 대화 문맥을 추가한다.
- **완료 기준**: 후속 질문이 문맥을 유지하고 로컬 문서 답변은 검색된 파일 근거를 표시한다.

### L3. 다형식 문서 파서와 증분 색인 — ⚠️ 주요 파서 구현 / 증분 색인 P2 계속

- **구현 (2026-08-11)**: 업로드·브라우저 폴더·서버 `LocalDocAdapter`가 동일한 공통 파서를 사용하도록 통합. 텍스트 계열·DOCX에 더해 PDF·XLSX·PPTX를 지원하고 모바일 파일 선택기에 노출했다. PDF 페이지, Excel 시트·셀 범위, PowerPoint 슬라이드 출처를 보존하며 Node/브라우저 DOCX 입력과 Next 서버 PDF worker 경로 차이도 보완했다.
- **남은 문제**: 파일 해시 증분 색인, 질문별 검색/RAG, HWPX·EML·OCR은 없다. 폴더 수집 결과도 아직 TODO 줄 추출에 치우쳐 있다.
- **제안**: 업로드와 폴더 스캔이 공유하는 문서 파서 계약을 만들고 PDF 페이지, Excel 시트/셀 범위, PowerPoint 슬라이드 단위로 추출한다. 파일 해시로 변경분만 다시 색인한다.
- **완료 기준**: PDF·DOCX·XLSX·PPTX를 질문별로 검색하고 답변에 파일명과 페이지·시트·슬라이드 근거를 표시한다.

### L4. 등록형 로컬 스크립트 Tool Broker — ⚠️ 읽기 전용 기반 구현 / 쓰기 도구 보류

- **구현 (2026-08-11)**: 기존 `/api/util/exec-app`과 분리한 `/api/local-tools` 및 설정의 `로컬 AI 도구` 영역을 추가했다. 로컬 JSON 등록부, 절대 경로·SHA-256 고정, 형식별 인자 검증, `shell:false`, 비밀 환경변수 차단, 시간·출력 제한, 5분 유효 1회 승인, 감사 로그를 적용했다. 모바일은 같은 PC의 CoffeeTide에 접속할 때 실행 PC·입력을 확인하고 승인할 수 있으며 Vercel에서는 403이다.
- **남은 문제**: 실제 로컬 모델의 구조화된 도구 제안 연결, 영속 승인 저장소, 운영체제 샌드박스, `prepare_file` 이상 쓰기 등급은 없다. 현재는 신뢰한 `read_only` 도구만 수동 실행한다.
- **완료 기준**: 로컬 모델이 등록된 읽기 전용 도구만 제안하고, 쓰기 작업은 별도 등급과 대상 미리보기·승인 정책을 거쳐 실행할 수 있다.

### L5. Vercel Cloud Tool Registry — ✅ 읽기 전용 단계 A·B 구현 / 쓰기 보류

- **구현 (2026-08-11)**: 정적 TypeScript Registry, 공통 입력 스키마 검사, 제한 시간·출력 상한, 사용자·도구별 인메모리 호출 제한, 식별자 해시 로그와 인증된 `/api/cloud-tools`를 추가했다. `workspace.task_summary`와 `finance.market_snapshot`을 모든 PC·모바일에서 실행할 수 있고 AI 바리스타의 `/tools`, `/tool finance`, `/tool tasks`로 확인한다. Phase B에서는 Registry 스키마를 Gemini function calling 선언으로 변환해 자연어 질문에서 읽기 전용 도구 하나를 자동 선택·실행·재요약한다. 미등록 함수·인자와 병렬·반복 호출은 거부하며 재요약 실패 시 검증된 결과를 그대로 표시한다.
- **남은 문제**: Supabase 영속 감사·분산 호출 제한, 초안과 외부 쓰기용 사용자 승인·멱등성 정책은 없다.
- **완료 기준**: Gemini가 등록 스키마로 읽기 도구를 제안하고, 쓰기 도구는 모바일 확인 카드와 세션 결합 1회 승인 후에만 실행된다. 상세는 [`11-cloud-tool-registry-plan.md`](./11-cloud-tool-registry-plan.md) 참조.

---

_최종 갱신: 2026-08-11 (로컬 AI L1~L4 및 MCP 보류 계획 등록). 이 문서는 살아있는 백로그입니다. 항목을 처리하면 "완료"로 표시하세요._
