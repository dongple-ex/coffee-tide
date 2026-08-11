# As-Built 기술 레퍼런스 (구현 현황)

> **기준: 2026-07-27 구현 코드(`f76d065`).** 본 문서는 이 저장소에 실제 구현된 코드의 기술 레퍼런스(엔드포인트·환경변수·데이터모델·인증)입니다 — "지금 코드가 하는 일"의 정본.
>
> **UI 명칭**: 화면에서는 Copilot을 **"AI 바리스타"** 로 부릅니다(2026-07-17 개명). 본 문서는 코드·API 이름이 `copilot`인 지점만 Copilot으로 표기합니다.
>
> **문서 역할 구분**:
> - 제품 **정본 비전/기획**은 [`00-product-spec.md`](./00-product-spec.md).
> - 개선/수정 백로그(남은 격차 포함)는 [`02-backlog.md`](./02-backlog.md).
> - 문서 전체 지도는 [`README.md`](./README.md)(문서 인덱스) 참조.

---

## 1. 개요

coffeeTide는 여러 채널의 업무 데이터를 하나의 대시보드로 통합하고, AI로 트리아지하며, 자동화 규칙으로 정리하는 Next.js 16 앱입니다. **무연동 우선**: manual/paste가 1급 소스이며 외부 연동 없이 전 기능이 동작합니다.

| 구분 | 내용 |
| :--- | :--- |
| 채널 | **manual·paste(1급)**, Outlook, Gmail, Notion, Obsidian, 로컬 문서, LLM 산출물 |
| 로그인 | Google Identity Services ID 토큰 로그인 + 게스트 세션 + 서비스별 개별 연동 |
| AI | Gemini(`gemini-2.5-flash`, REST 직호출: 분류·브리핑·답장·규칙파싱·붙여넣기 추출) + FallbackEngine(전 기능 로컬 대체) |
| 자동화 | 규칙 엔진(pin/urgent/mute/hide)·자연어 규칙·팔로업 에스컬레이션·빠른 캡처·dismiss |
| 생산성 도구 | 슬래시 커맨드 5종, 워크노트·하위작업, 퇴근 핸드오프, 퀵 위젯(타이머·계산기·바로가기·날씨·출퇴근), 단어-앱 바로가기 |
| 인증 가드 | `src/proxy.ts` (Next 16 규약) |
| 토큰 | Google/Outlook 선제(만료 60초 전) + 반응형(401 시 1회) 리프레시 |
| 스타일 | Vanilla CSS Modules, 다크 Bento Grid (Tailwind 미사용) |

## 2. 인증 & 세션

- **세션**: `tp_session` (AES-256-GCM 암호화, HttpOnly) + `tp_session_expiry`(평문 보조, proxy 만료 판독용). `src/lib/auth/session.ts`.
  - **B1 반영**: 프로덕션에서 `SESSION_ENCRYPTION_SECRET` 미설정이면 throw(기동 거부). 개발용 fallback만 허용(경고 로그).
  - 만료 7일 + **활동 시 롤링 연장** (B2 반영). `touchSession`(`src/lib/auth/cookies.ts`)을 `/api/mails` 응답에서 호출 — 30초 폴링이 도는 동안 만료가 계속 밀린다.
- **인증 가드**: `src/proxy.ts`. `PUBLIC_PATHS`(/, signin, OAuth 시작/콜백) 외 요청에 세션 요구. API는 401, 페이지는 `/` 리다이렉트.
- **로그인 흐름**:
  - Google: 랜딩의 Google Identity Services 공식 버튼 → nonce가 포함된 Google ID 토큰 → `supabase.auth.signInWithIdToken()` → `/api/auth/bootstrap`에서 사용자 프로필·CoffeeTide 세션 생성. Supabase OAuth 도메인으로 화면을 리다이렉트하지 않는다.
  - Guest: `/api/auth/signin`이 **게스트 세션**(`guest@coffeetide.dongple.kr`)을 발급한다.
- **서비스 연동**:
  - Google: `/api/auth/google/signin` → `/api/auth/google/callback` (scope: openid email + Gmail 읽기 + Calendar 일정 쓰기 + Drive 메타데이터/앱 파일, `access_type=offline&prompt=consent`)
  - Outlook: `/api/auth/outlook` → `/api/auth/outlook/callback` (scope: User.Read, Mail.Read, Mail.ReadWrite, offline_access)
  - Notion(토큰+DB ID) / Obsidian·LLM(단일 폴더 경로): POST로 세션에 저장. 단일 경로형은 `makePathConnectionHandler` 공용 핸들러(`src/lib/auth/connectionRoutes.ts`).
  - 로컬 문서: **다중 폴더(최대 5개)** — `localDocPaths: string[]`, 전용 라우트에서 connect=추가/disconnect=개별·전체 해제.
- **토큰 리프레시**: `/api/mails` 진입 시 만료 임박(60초) 선제 갱신 + 어댑터 401(`AuthExpiredError`) 시 1회 반응형 갱신·재시도. 재실패 시 `errors.{채널}="재연동이 필요합니다"` + `connections.{채널}=false` (백로그 A3 반영).
- OAuth는 plain-fetch 구현(`src/lib/auth/msal.ts`, `google.ts`) — 레거시 PKCE/SDK 의존 없음 (D1 해당 없음).

## 3. 데이터 모델

### UnifiedData (`src/lib/types/unified.ts`)
`id, source, title, content, created_at, author, url, category?, actionDirective?, status?, delegatable?`

- `source`: `manual | paste | local_doc | obsidian | outlook | gmail | notion | llm` (A1 반영: Gmail 별도 배지)
- `category`: `urgent | approval_required | meeting | action_required | reference | ignore`
- `status`: `pending | held | completed | dismissed`
- `delegatable?`: 로컬 LLM 도구로 넘길 만한 업무 표식 (phase7). AI 분류 시에만 채워지며 `FallbackEngine`은 채우지 않음 — `undefined`는 "위임 불가"가 아니라 "판별 안 됨"

### ProcessedData (`src/lib/automation/rules.ts`)
`UnifiedData` + `pinned?`, `automated?`(적용된 규칙 태그 목록).

### `/api/mails` 응답
```jsonc
{
  "mails": UnifiedData[],          // AI(또는 로컬) 분류 + 최신순 정렬 완료
  "userEmail": string,
  "connections": {
    "google": boolean, "outlook": boolean,
    "notion": boolean, "obsidian": boolean, "local_doc": boolean, "llm": boolean,
    "localDocPaths"?: string[],   // 로컬 문서 다중 폴더 목록
    "googleEmail"?: string, "outlookEmail"?: string
  },
  "errors"?: { "outlook"?, "google"?, "notion"?, "obsidian"?, "local_doc"?, "llm"? },
  "ai_error"?: boolean             // AI 분류 실패로 로컬 엔진 사용 시 true
}
```

### 클라이언트 저장 (localStorage)

키 정의와 read/write는 **`src/lib/localStore.ts`** 한 곳에 있습니다(`loadLS`/`saveLS`). `saveLS`는 성공 여부를 boolean으로 돌려주므로, 용량 초과를 조용히 삼키지 않고 호출부가 사용자에게 알립니다.

| 키 | 내용 |
| :--- | :--- |
| `ct_manual_items` | manual/paste 항목 (`UnifiedData[]`, 완료/보류 상태 포함) |
| `ct_automation_rules` | 자동화 규칙 (구 `tp_automation_rules`) |
| `ct_dismissed_ids` | 숨긴 외부 항목 id — 동기화 시 현존 id와 교집합으로 자동 정리(D3) (구 `tp_dismissed_ids`) |
| `ct_followup_hours` | 팔로업 기준 시간(12/24/48) (구 `tp_followup_hours`) |
| `ct_brief_time` | 아침 브리핑 발송 시각 (기본 08:30) |
| `ct_theme` | 테마(dark/light/coffee/mega/kustom) |
| `ct_weather_enabled` · `ct_weather_coords` | 날씨 옵트인 여부와 캐시된 좌표 (I5 — 반복 권한 팝업 방지) |
| `ct_commute_config` | 출퇴근 설정 — 집/회사 역명, 이동수단, **집·회사 좌표**(지도 앱 딥링크용, 서버 미전송) |
| `ct_app_shortcuts` | 단어-앱 바로가기 레시피 (J2) |
| `ct_browser_categories` | 브라우저 폴더(FSA) 핸들의 종류 매핑 |
| `ct_work_notes` · `ct_sub_tasks` | 업무별 워크노트 / 하위작업 체크리스트 |
| `ct_handoff_state` | 퇴근 핸드오프 **UI 스냅샷** — 섹션 접힘·대화 이력·`acknowledged`. 업무 데이터는 복제하지 않는다(K6) |
| `ct_notified_item_ids` | 데스크톱 알림 중복 방지 (H4) |
| `ct_oauth_state` | OAuth CSRF state |

> 구 `tp_` 키는 `loadLS`가 판독 시 1회 이관합니다.

## 4. API 엔드포인트

| 경로 | 메서드 | 설명 |
| :--- | :--- | :--- |
| `/api/auth/signin` | GET | 게스트 세션 발급 → `/` |
| `/api/auth/bootstrap` | POST | Supabase 로그인 사용자의 프로필 upsert + CoffeeTide 암호화 세션 생성 |
| `/api/auth/signout` | POST | 세션 파기 |
| `/api/auth/outlook` · `/callback` | GET / DELETE | Outlook OAuth (DELETE=해제) |
| `/api/auth/google/signin` · `/callback` | GET / DELETE | Google OAuth (DELETE=해제) |
| `/api/auth/notion` | POST | 토큰+DB ID 저장/해제 (`action: connect\|disconnect`) |
| `/api/auth/obsidian` · `local-doc` · `llm` | POST | 폴더 경로 저장/해제 (존재 검증 포함) |
| `/api/mails` | GET | 멀티채널 병렬 수집 + 토큰 리프레시 + AI 분류 + LLM 다이제스트 자동 미러링 |
| `/api/copilot` | POST | Copilot 브리핑 — body의 `items`(클라 병합 목록)+`timezone`으로 무연동 동작(G3), 서버가 기준일 주입(G4) |
| `/api/tasks/extract` | POST | 붙여넣기 텍스트 → paste 업무 추출+분류 (G1) |
| `/api/tasks/classify` | POST | manual 항목 분류·행동지침 부여 (G1) |
| `/api/tasks/update` | POST | Notion 페이지 완료 / Obsidian 체크박스 완료 write-back |
| `/api/tasks/capture` | POST | 항목을 Notion 페이지/Obsidian 수집함으로 저장 |
| `/api/tasks/llm-digest` | POST | 오늘 LLM 산출물 → Obsidian `coffeeTide_LLM/YYYY-MM-DD.md` 수동 내보내기 |
| `/api/calendar/events` | POST | AI 바리스타가 구조화한 일정 초안을 사용자 확인 후 Google 기본 Calendar에 등록. 반복 일정은 RFC 5545 `RRULE`로 변환 |
| `/api/upload` | POST | 문서(≤2MB, `.txt/.md/.markdown/.csv/.json/.log/.html/.htm/.xml/.docx/.pdf/.xlsx/.pptx`)를 공통 파서로 텍스트화 → manual 항목. PDF 페이지, Excel 시트·셀 범위, PowerPoint 슬라이드 출처를 본문에 표시한다. 모바일 OS 파일 선택기와 PC 업로드가 같은 API를 사용하며, `saveToDrive=true`면 Google Drive 영구 저장(실패해도 업로드 자체는 성공 — 원칙 4) |
| `/api/local-tools` | GET/POST | 로컬 PC에 명시적으로 등록한 읽기 전용 PowerShell·Python·Node 도구 목록 조회, 실행 미리보기, 5분 유효 1회 승인 토큰 기반 실행. Vercel 등 클라우드 배포에서는 403 |
| `/api/cloud-tools` | GET/POST | 인증된 사용자의 Vercel 서버 도구 목록·실행. 정적으로 등록된 읽기 전용 TypeScript 도구만 허용하며 입력 스키마, 1분 호출 제한, 제한 시간·출력 크기를 검사한다 |
| `/api/weather` | GET | 좌표(`lat`/`lon`) → **기상청 초단기실황+초단기예보**(공공데이터포털, LCC 격자 변환) 1순위 → OpenWeatherMap 폴백. 지역명은 BigDataCloud 역지오코딩으로 한글 동/구. 좌표는 **소수점 2자리로 절삭해 외부 호출**(K9), 서버 메모리 캐시 20분, 좌표 미저장. 키 미설정/조회 실패 시 `success:false` (그리팅은 시간대 폴백) |
| `/api/commute` | GET | 출퇴근 길찾기 카드 데이터. KST 05~12시 출근 모드, 그 외 퇴근 모드로 출발·도착지 자동 전환. **⚠️ 시각·소요시간·요금·혼잡도는 현재 하드코딩된 예시 값** — 실연동은 K2(공공데이터포털 TAGO·도로공사) 예정. 지도 링크는 이 응답에 없다(§5 지도 앱 연동) |
| `/api/util/exec-app` | POST | 단어-앱 바로가기 실행 (J2, **데스크톱 전용**). 셸을 거치지 않는 `spawn` + 스킴/확장자 화이트리스트. 클라우드 배포(`VERCEL` 등)·`DISABLE_LOCAL_EXEC=true`에서는 403 (§5 로컬 실행기) |
| `/api/rules/parse` | POST | 자연어 → 자동화 규칙 변환 |
| `/api/mails/reply-draft` | POST | AI 답장 초안 (+ Outlook 임시보관함 저장; Gmail은 초안 텍스트만) |
| `/api/util/select-folder` | GET | 네이티브 폴더 선택 (Windows 전용, PowerShell 다이얼로그) |
| `/api/push/subscribe` · `unsubscribe` | POST | 웹 푸시 구독 등록(발송 시각·타임존 포함)/해제 (H5) |
| `/api/push/state` | POST | 업무 스냅샷 동기화 — 스케줄 발송의 데이터 소스 (2초 디바운스, 최대 50건) |
| `/api/push/test` | POST | 즉시 테스트 알림 발송 |
| `/api/briefing/daily` | GET/POST | 브리핑 발송 트리거 — 공개 경로, `CRON_SECRET` Bearer 인증 (Vercel Cron용) |

## 5. AI & 자동화

- **분류 (현재 소스 기준)**: `src/lib/ai/gemini.ts`의 `classifyTasks()`는 현재 Gemini를 호출하지 않고 `FallbackEngine.classifyOne()` 규칙으로만 분류하며 항상 `aiUsed:false`를 반환한다. 콘텐츠 해시 캐시는 조회 코드만 있고 결과 저장 코드가 없으며, `classifyDisabled()`도 분류 흐름에서 사용되지 않는다. 따라서 Gemini 분류·`delegatable` 판별·캐시·킬스위치는 구현 상태가 아니라 복구/재설계 대상이다. 상세는 [`08-local-ai-enhancement-plan.md`](./08-local-ai-enhancement-plan.md) 참조.
- **웰컴 그리팅 (phase7)**: `src/app/components/WelcomeCard.tsx` — 시간대(오전/오후/저녁) 테마 + 날씨 문구를 **템플릿 기반**으로 생성(LLM 미사용, 비용 0). 위치 권한은 **설정 모달에서 옵트인**(I5) — 마운트 시 자동 요청하지 않는다. 3단계 폴백: 날씨+시간대 → (위치 거부/조회 실패 시) 시간대만 → (그리팅 실패 시) 미표시·브리핑 정상. 30초 후 한 줄로 자동 접히되, 사용자가 먼저 조작했으면 개입하지 않는다(K11).
- **Copilot / AI 바리스타 (G4 반영)**: 기준일·타임존을 시스템 프롬프트에 주입, "날짜 추정 금지 + 출처 표기" 강제. 응답은 `MarkdownLite`로 카드/섹션 렌더링(G6). 질문·답변은 아코디언으로 묶이며(`src/lib/copilotPairs.ts`의 `buildQaPairs`) 접힌 상태에서 답이 도착하면 ✨ 배지가 깜빡인다.
- **슬래시 커맨드**: `/clear`(대화 초기화) · `/status`(업무 현황) · `/handoff`(퇴근 보존) · `/reorder`(남은 업무 AI 재배치) · `/tools`(Cloud Tool 목록) · `/tool finance|tasks`(읽기 전용 서버 도구 실행) · `/help`. 입력창에 `/`를 치면 자동완성 목록이 뜬다.
- **단어-앱 바로가기 (J2)**: `ct_app_shortcuts`에 등록한 키워드를 AI 바리스타에 **단독으로**(또는 `@키워드`) 입력하면 `/api/util/exec-app`으로 실행. 문장 속 부분 일치로는 실행되지 않는다(K4 — "노션에 정리한 업무 알려줘"가 앱 실행에 가로채이던 문제).
- **로컬 실행기 보안 (K1)**: 셸 문자열 조합 없이 `spawn(cmd, [args], {shell:false})`. URL은 스킴 화이트리스트(http/https/kakaomap/nmap/notion/…), 로컬 파일은 절대 경로 + `.exe`/`.lnk`/`.app`만 허용(`.bat`/`.cmd`/`.ps1`은 인터프리터가 인자를 재파싱하므로 제외). 제어문자 차단, 세션 필수, 클라우드 배포에서는 403.
- **등록형 로컬 Tool Broker**: 기존 `/api/util/exec-app`과 분리했다. JSON 등록부의 절대 경로·런타임·인자 플래그·SHA-256이 일치하는 `read_only` 도구만 `shell:false`로 실행하며, 앱 비밀 환경변수는 자식 프로세스에 전달하지 않는다. 실행 전 도구명·실행 PC·스크립트명·입력·시간 제한을 표시하고 사용자가 승인해야 한다. 결과와 비밀 입력을 제외한 감사 메타데이터는 `data/local-tool-audit.jsonl`에 저장한다. 운영체제 수준 샌드박스는 아니므로 사용자가 직접 신뢰하는 읽기 전용 스크립트만 등록해야 한다.
- **Cloud Tool Registry**: 소스 코드에 정적으로 등록된 TypeScript 함수만 Vercel에서 실행한다. 1차 도구는 현재 화면 업무 집계(`workspace.task_summary`)와 한국은행 환율·금리(`finance.market_snapshot`)다. 사용자 인증, 추가 인자 거부, 문자열·열거값 검사, 사용자·도구별 분당 20회 제한, 실행 시간·출력 크기 제한과 식별자 해시 로그를 적용한다. 현재는 `read_only + confirmation:none`만 실행하며 Gemini 자동 도구 선택과 외부 쓰기는 미구현이다. 상세 설계는 [`11-cloud-tool-registry-plan.md`](./11-cloud-tool-registry-plan.md) 참조.
- **워크노트 · 하위작업**: 업무 카드마다 진행 메모(`ct_work_notes`)와 체크리스트(`ct_sub_tasks`). `/reorder` 브리핑의 입력으로도 쓰인다.
- **퇴근 핸드오프**: `/handoff` 또는 "퇴근하기" 버튼 → 남은 업무 요약을 클립보드에 복사하고 **UI 스냅샷**(`ct_handoff_state`)을 저장. 다음 진입 시 섹션 접힘·대화 이력을 복원하고 안내 배너를 1회만 띄운다(K6).
- **지도 앱 연동 (K12)**: `src/lib/mapLinks.ts`. 카카오맵 `kakaomap://route?sp={lat},{lng}&ep=…&by=car|publictransit`, 네이버지도 `nmap://route/{car|public}?slat=…&appname=…` — **두 앱 모두 좌표 필수**라 좌표가 없으면 앱 스킴을 만들지 않고 웹으로만 연결한다(카카오 웹은 이름 기반 길찾기, 네이버는 목적지 검색). 좌표는 설정의 "현재 위치를 집/회사로"로 확보하며 **클라이언트에만 저장**한다. 앱 전환 감지는 `visibilitychange`/`pagehide`.
- **퀵 위젯**: 대시보드 상단 토글 바 — 타이머 / 계산기(키보드 입력 지원) / 바로가기 즐겨찾기 / 실시간 날씨 / 출퇴근 길찾기.
- **규칙**: `{ field: any|source|sender|title|content, value, action: pin|urgent|mute|hide, enabled }` — `applyRules` 위→아래 순차, pin 안정 정렬.
- **팔로업**: 응답 필요 카테고리(urgent/approval/action)가 `ct_followup_hours` 초과 시 상단 에스컬레이션 + `⏰ N시간째 기다리는 중` 배지.
- **LLM 산출물 (phase6)**: 폴더 스캔(`LlmArtifactAdapter`, frontmatter 파싱·발췌 500자) + Obsidian 연동 시 동기화마다 오늘 항목을 `coffeeTide_LLM/YYYY-MM-DD.md`에 idempotent upsert(Q4=자동).
- **폴링**: 30초, 백그라운드 탭에서 중단·복귀 시 즉시 갱신(C2·모바일 §5 반영).
- **아침 브리핑 웹 푸시 (H5)**: `public/sw.js`(Service Worker) + VAPID. 구독 시 프로필(구독+발송시각+타임존+업무 스냅샷)을 저장 — 저장소는 `UPSTASH_REDIS_REST_*` 설정 시 Upstash Redis, 미설정 시 `data/push-profiles.json` 파일(서버리스 배포는 Redis 필수). 스냅샷은 브리핑 생성 최소 필드(title/category/status)만 저장(본문·작성자 미저장). 세션이 쿠키에만 있어 스냅샷이 스케줄 발송의 데이터 소스. 셀프호스팅은 `src/instrumentation.ts`가 60초 주기 스케줄러 기동, 클라우드는 크론이 `/api/briefing/daily` 호출(`vercel.json`에 10분 주기 Vercel Cron 등록됨 — Hobby 플랜은 일 1회 제한이라 스케줄 조정 필요). 프로필 타임존 기준 발송시각 경과+당일 미발송이면 발송(등록 당일은 스킵, 테스트 발송으로 확인). 404/410 구독은 자동 제거. 알림 본문은 스냅샷에서 결정적 생성(우선순위 상위 3건), 클릭 시 대시보드 오픈.

## 6. 환경 변수

| 변수 | 용도 |
| :--- | :--- |
| `MOCK_MODE` | `true`면 데이터 어댑터를 Mock으로 전환. AI 호출 자체는 이 값이 아니라 `GEMINI_API_KEY`와 각 함수의 폴백 조건으로 결정됨 |
| `SESSION_ENCRYPTION_SECRET` | 세션 쿠키 AES-256-GCM 키 (32바이트 base64) — **프로덕션 필수** |
| `GEMINI_API_KEY` | Gemini API 키. 미설정 시 로컬 FallbackEngine |
| `DISABLE_AI_CLASSIFY` | `true`면 AI 분류 킬스위치 (백로그 C1) |
| `NEXT_PUBLIC_MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` / `NEXT_PUBLIC_MS_REDIRECT_URI` | Microsoft Entra ID 4종 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | Google Identity 로그인 Client ID + 입장 후 Gmail·Calendar·Drive OAuth 3종 |
| `NOTION_INTEGRATION_TOKEN` / `NOTION_DATABASE_ID` | Notion 기본값 (UI 세션별 입력 우선) |
| `LLM_ARTIFACTS_DEFAULT_PATH` | (선택) LLM 산출물 기본 경로 |
| `DATA_GO_KR_SERVICE_KEY` | (선택) **공공데이터포털 공용 인증키**. 포털은 계정당 인증키 1개를 활용신청한 모든 오픈API에 공통 적용하므로 기상청·(예정)TAGO·도로공사가 이 하나를 공유한다. 판독은 `src/lib/env.ts` |
| `WEATHER_API_KEY` | (선택) 위 키의 **하위호환 별칭** — 기존 `.env.local`을 고치지 않아도 동작한다. 단, 이 이름만 설정된 환경에서는 OpenWeatherMap 폴백에도 같은 값이 쓰인다(구 동작 유지) |
| `OPENWEATHER_API_KEY` | (선택) OpenWeatherMap 전용 키. 설정하면 기상청 실패 시에만 폴백 호출. 미설정 + `DATA_GO_KR_SERVICE_KEY`만 있으면 OWM은 호출하지 않는다(포털 키로 부르면 항상 401이라 무의미) |
| `DISABLE_LOCAL_EXEC` | `true`면 `/api/util/exec-app`과 `/api/local-tools` 비활성(403). `VERCEL`·`AWS_LAMBDA_FUNCTION_NAME`·`NETLIFY` 감지 시 자동 비활성 |
| `LOCAL_TOOL_REGISTRY_PATH` | 로컬 읽기 전용 Tool Broker 등록 JSON의 절대 경로. 미설정 시 도구 목록은 비어 있으며 클라우드 배포에서는 실행 불가 |
| `CLOUD_TOOL_AUDIT_SALT` | (선택) Cloud Tool 구조화 로그의 사용자 식별자 해시 솔트. 미설정 시 `SESSION_ENCRYPTION_SECRET` 사용 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 웹 푸시 3종 (`npx web-push generate-vapid-keys`). 미설정 시 알림 기능만 비활성 |
| `CRON_SECRET` | (선택) `/api/briefing/daily` 외부 크론 인증 토큰 — Vercel Cron은 자동으로 Bearer 헤더에 첨부 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | (선택) 푸시 프로필 저장소. 미설정 시 파일(`data/push-profiles.json`) — 서버리스 배포는 필수 |

- OAuth 리다이렉트 URI: 로컬 `http://localhost:3000/api/auth/...`, 배포 `https://coffeeTide.dongple.kr/api/auth/...`.

## 7. 알려진 한계 / TODO

남은 항목은 **[doc/02-backlog.md](./02-backlog.md)** 및 **[doc/03-source-fix-plan.md](./03-source-fix-plan.md)** 참조. 요약:

- **`/api/commute`가 하드코딩 예시 값** — 공공데이터포털 실연동 대기 (**K2**). 화면에는 `🧪 예시 데이터` 배지로 명시 중
- 외부 OAuth(Outlook/Google)·Notion 실계정 E2E 미검증 — MOCK 스모크만 통과 (**H1**)
- 지도 앱 딥링크 실기기 미검증 — 데스크톱에서 웹 경로만 확인 (**K12**, H1과 함께)
- 세션 쿠키에 토큰 전체 저장 → 대형 토큰 시 4KB 한계 리스크 (**H2**)
- Google Calendar 일정 **등록**은 구현됐지만 Calendar·Drive **수집**은 미구현(Gmail만 수집) (**H3**)
- 채널당 10건 고정 (C3), hide/dismiss 이원화 (D4)
- AI 분류 캐시는 서버 메모리 `Map`으로 선언돼 있으나 현재 결과 저장 코드가 없어 실질적으로 동작하지 않음
- 실제 로컬 모델 추론은 미구현. 현재 로컬 AI 표시는 규칙 기반 `FallbackEngine` 또는 LLM 산출물 파일 스캔을 뜻함 ([`08-local-ai-enhancement-plan.md`](./08-local-ai-enhancement-plan.md))
- `page.tsx` 2,351줄 — 분할 진행 중, 목표 1,000줄 (**K10** 5단계 남음)

## 8. 코드 구조 (K10 분할 반영, 2026-07-27)

```
src/lib/            localStore · mergeView · labels · copilotPairs · mapLinks · env   (순수 모듈)
src/app/hooks/      useModalA11y
src/app/components/ TaskItemCard · WelcomeCard · CommuteCard · 위젯 4종
      ├ settings/   AutomationRules · Notification · Weather · Commute · Shortcuts · Connections
      └ copilot/    CopilotConversation · CopilotComposer
src/app/page.tsx    상태 소유 + 데이터 흐름 (표현은 위 컴포넌트에 위임)
```

- 분리한 컴포넌트는 `page.module.css`를 그대로 import합니다(CSS 모듈 다중 import). CSS 분할은 K10 5단계.
- 컴포넌트는 값 + `onChange` 콜백만 받는 표현 컴포넌트이며, 상태와 영속화는 `page.tsx`가 소유합니다.
