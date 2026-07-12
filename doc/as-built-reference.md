# As-Built 기술 레퍼런스 (구현 현황)

> **기준: 2026-07-11 구현 코드.** 본 문서는 이 저장소에 실제 구현된 코드의 기술 레퍼런스(엔드포인트·환경변수·데이터모델·인증)입니다 — "지금 코드가 하는 일"의 정본.
>
> **문서 역할 구분**:
> - 제품 **정본 비전/기획**은 [`00-current-state.md`](./00-current-state.md).
> - 개선/수정 백로그(남은 격차 포함)는 [`7-backlog.md`](./7-backlog.md).
> - 문서 전체 지도는 [`README.md`](./README.md)(문서 인덱스) 참조.

---

## 1. 개요

coffeeTide는 여러 채널의 업무 데이터를 하나의 대시보드로 통합하고, AI로 트리아지하며, 자동화 규칙으로 정리하는 Next.js 16 앱입니다. **무연동 우선**: manual/paste가 1급 소스이며 외부 연동 없이 전 기능이 동작합니다.

| 구분 | 내용 |
| :--- | :--- |
| 채널 | **manual·paste(1급)**, Outlook, Gmail, Notion, Obsidian, 로컬 문서, LLM 산출물 |
| 로그인 | 게스트 세션(`coffeeTide 시작하기`) + 서비스별 개별 연동 |
| AI | Gemini(`gemini-2.5-flash`, REST 직호출: 분류·브리핑·답장·규칙파싱·붙여넣기 추출) + FallbackEngine(전 기능 로컬 대체) |
| 자동화 | 규칙 엔진(pin/urgent/mute/hide)·자연어 규칙·팔로업 에스컬레이션·빠른 캡처·dismiss |
| 인증 가드 | `src/proxy.ts` (Next 16 규약) |
| 토큰 | Google/Outlook 선제(만료 60초 전) + 반응형(401 시 1회) 리프레시 |
| 스타일 | Vanilla CSS Modules, 다크 Bento Grid (Tailwind 미사용) |

## 2. 인증 & 세션

- **세션**: `tp_session` (AES-256-GCM 암호화, HttpOnly) + `tp_session_expiry`(평문 보조, proxy 만료 판독용). `src/lib/auth/session.ts`.
  - **B1 반영**: 프로덕션에서 `SESSION_ENCRYPTION_SECRET` 미설정이면 throw(기동 거부). 개발용 fallback만 허용(경고 로그).
  - 만료 7일 고정 (롤링 연장은 백로그 B2).
- **인증 가드**: `src/proxy.ts`. `PUBLIC_PATHS`(/, signin, OAuth 시작/콜백) 외 요청에 세션 요구. API는 401, 페이지는 `/` 리다이렉트.
- **로그인 흐름**: `/api/auth/signin`이 **게스트 세션**(`guest@coffeetide.dongple.kr`) 발급 → 대시보드 진입 후 서비스별 개별 연동.
- **서비스 연동**:
  - Google: `/api/auth/google/signin` → `/api/auth/google/callback` (scope: openid email + gmail/calendar/drive readonly, `access_type=offline&prompt=consent`)
  - Outlook: `/api/auth/outlook` → `/api/auth/outlook/callback` (scope: User.Read, Mail.Read, Mail.ReadWrite, offline_access)
  - Notion(토큰+DB ID) / Obsidian·LLM(단일 폴더 경로): POST로 세션에 저장. 단일 경로형은 `makePathConnectionHandler` 공용 핸들러(`src/lib/auth/connectionRoutes.ts`).
  - 로컬 문서: **다중 폴더(최대 5개)** — `localDocPaths: string[]`, 전용 라우트에서 connect=추가/disconnect=개별·전체 해제.
- **토큰 리프레시**: `/api/mails` 진입 시 만료 임박(60초) 선제 갱신 + 어댑터 401(`AuthExpiredError`) 시 1회 반응형 갱신·재시도. 재실패 시 `errors.{채널}="재연동이 필요합니다"` + `connections.{채널}=false` (백로그 A3 반영).
- OAuth는 plain-fetch 구현(`src/lib/auth/msal.ts`, `google.ts`) — 레거시 PKCE/SDK 의존 없음 (D1 해당 없음).

## 3. 데이터 모델

### UnifiedData (`src/lib/types/unified.ts`)
`id, source, title, content, created_at, author, url, category?, actionDirective?, status?`

- `source`: `manual | paste | local_doc | obsidian | outlook | gmail | notion | llm` (A1 반영: Gmail 별도 배지)
- `category`: `urgent | approval_required | meeting | action_required | reference | ignore`
- `status`: `pending | held | completed | dismissed`

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
- `ct_manual_items`: manual/paste 항목 (UnifiedData[], 완료/보류 상태 포함)
- `tp_automation_rules`: 자동화 규칙
- `tp_dismissed_ids`: 숨긴 외부 항목 id — 동기화 시 현존 id와 교집합으로 자동 정리(D3 반영)
- `tp_followup_hours`: 팔로업 기준 시간(12/24/48)

## 4. API 엔드포인트

| 경로 | 메서드 | 설명 |
| :--- | :--- | :--- |
| `/api/auth/signin` | GET | 게스트 세션 발급 → `/` |
| `/api/auth/signout` | GET | 세션 파기 |
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
| `/api/rules/parse` | POST | 자연어 → 자동화 규칙 변환 |
| `/api/mails/reply-draft` | POST | AI 답장 초안 (+ Outlook 임시보관함 저장; Gmail은 초안 텍스트만) |
| `/api/util/select-folder` | GET | 네이티브 폴더 선택 (Windows 전용, PowerShell 다이얼로그) |
| `/api/push/subscribe` · `unsubscribe` | POST | 웹 푸시 구독 등록(발송 시각·타임존 포함)/해제 (H5) |
| `/api/push/state` | POST | 업무 스냅샷 동기화 — 스케줄 발송의 데이터 소스 (2초 디바운스, 최대 50건) |
| `/api/push/test` | POST | 즉시 테스트 알림 발송 |
| `/api/briefing/daily` | GET/POST | 브리핑 발송 트리거 — 공개 경로, `CRON_SECRET` Bearer 인증 (Vercel Cron용) |

## 5. AI & 자동화

- **분류 (C1 반영)**: `src/lib/ai/gemini.ts` — ① 콘텐츠 해시(`id`+title/content) 서버 메모리 캐시로 신규·변경 항목만 전송, ② 429 시 10분 쿨다운 동안 `FallbackEngine` 대체, ③ `DISABLE_AI_CLASSIFY=true` 킬스위치. 키 미설정 시 전 기능 로컬 대체.
- **Copilot (G4 반영)**: 기준일·타임존을 시스템 프롬프트에 주입, "날짜 추정 금지 + 출처 표기" 강제. 응답은 `MarkdownLite`로 카드/섹션 렌더링(G6).
- **규칙**: `{ field: any|source|sender|title|content, value, action: pin|urgent|mute|hide, enabled }` — `applyRules` 위→아래 순차, pin 안정 정렬.
- **팔로업**: 응답 필요 카테고리(urgent/approval/action)가 `tp_followup_hours` 초과 시 상단 에스컬레이션 + `⏰ N시간 경과` 배지.
- **LLM 산출물 (phase6)**: 폴더 스캔(`LlmArtifactAdapter`, frontmatter 파싱·발췌 500자) + Obsidian 연동 시 동기화마다 오늘 항목을 `coffeeTide_LLM/YYYY-MM-DD.md`에 idempotent upsert(Q4=자동).
- **폴링**: 30초, 백그라운드 탭에서 중단·복귀 시 즉시 갱신(C2·모바일 §5 반영).
- **아침 브리핑 웹 푸시 (H5)**: `public/sw.js`(Service Worker) + VAPID. 구독 시 프로필(구독+발송시각+타임존+업무 스냅샷)을 저장 — 저장소는 `UPSTASH_REDIS_REST_*` 설정 시 Upstash Redis, 미설정 시 `data/push-profiles.json` 파일(서버리스 배포는 Redis 필수). 스냅샷은 브리핑 생성 최소 필드(title/category/status)만 저장(본문·작성자 미저장). 세션이 쿠키에만 있어 스냅샷이 스케줄 발송의 데이터 소스. 셀프호스팅은 `src/instrumentation.ts`가 60초 주기 스케줄러 기동, 클라우드는 크론이 `/api/briefing/daily` 호출(`vercel.json`에 10분 주기 Vercel Cron 등록됨 — Hobby 플랜은 일 1회 제한이라 스케줄 조정 필요). 프로필 타임존 기준 발송시각 경과+당일 미발송이면 발송(등록 당일은 스킵, 테스트 발송으로 확인). 404/410 구독은 자동 제거. 알림 본문은 스냅샷에서 결정적 생성(우선순위 상위 3건), 클릭 시 대시보드 오픈.

## 6. 환경 변수

| 변수 | 용도 |
| :--- | :--- |
| `MOCK_MODE` | `true`면 실제 연동/AI 통신 없이 Mock 데이터로 동작 |
| `SESSION_ENCRYPTION_SECRET` | 세션 쿠키 AES-256-GCM 키 (32바이트 base64) — **프로덕션 필수** |
| `GEMINI_API_KEY` | Gemini API 키. 미설정 시 로컬 FallbackEngine |
| `DISABLE_AI_CLASSIFY` | `true`면 AI 분류 킬스위치 (백로그 C1) |
| `NEXT_PUBLIC_MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` / `NEXT_PUBLIC_MS_REDIRECT_URI` | Microsoft Entra ID 4종 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | Google OAuth 3종 |
| `NOTION_INTEGRATION_TOKEN` / `NOTION_DATABASE_ID` | Notion 기본값 (UI 세션별 입력 우선) |
| `LLM_ARTIFACTS_DEFAULT_PATH` | (선택) LLM 산출물 기본 경로 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 웹 푸시 3종 (`npx web-push generate-vapid-keys`). 미설정 시 알림 기능만 비활성 |
| `CRON_SECRET` | (선택) `/api/briefing/daily` 외부 크론 인증 토큰 — Vercel Cron은 자동으로 Bearer 헤더에 첨부 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | (선택) 푸시 프로필 저장소. 미설정 시 파일(`data/push-profiles.json`) — 서버리스 배포는 필수 |

- OAuth 리다이렉트 URI: 로컬 `http://localhost:3000/api/auth/...`, 배포 `https://coffeeTide.dongple.kr/api/auth/...`.

## 7. 알려진 한계 / TODO

남은 항목은 **[doc/7-backlog.md](./7-backlog.md)** 참조. 요약:

- 외부 OAuth(Outlook/Google)·Notion 실계정 E2E 미검증 — MOCK 스모크만 통과 (**H1**)
- 세션 쿠키에 토큰 전체 저장 → 대형 토큰 시 4KB 한계 리스크 (**H2**)
- Google Calendar·Drive 수집 미구현 (scope만 확보, Gmail만 수집) (**H3**)
- 세션 7일 고정 만료 (B2), 채널당 10건 고정 (C3), hide/dismiss 이원화 (D4)
- AI 분류 캐시가 서버 메모리 (프로세스 재시작 시 소멸)
