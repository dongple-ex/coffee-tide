# CoffeeTide Telegram 연결 준비

- 작성일·기준일: 2026-11-03 (Asia/Seoul)
- 환경: Windows / Next.js 16.3 / 별도 서버리스 배포
- 목적: 이미 구현한 개인 대화 연결을 개발·테스트 환경에서 확인하고 운영 담당자가 반영할 절차를 준비한다.
- 상태: 로컬 테스트·빌드 통과. 실제 봇·DB·웹훅 등록·모바일 수신은 미검증.
- 이 문서의 CLI는 저장소 루트에서 실행한다. 도구의 기본 실행은 외부 요청 없는 점검이다.

| 참고 | 위치 |
|---|---|
| 연결·수신 API | src/app/api/telegram/link/route.ts, src/app/api/telegram/webhook/route.ts |
| 작업·발송 | src/lib/telegram/worker.ts, src/lib/telegram/sender.ts |
| DB 마이그레이션 | supabase/migrations/20261021_telegram_channel.sql |
| 설정 점검·웹훅 도구 | workspace/2026-11/2026-11-03/integration-readiness/telegram-setup.mjs |
| DB 메타데이터 조회 | workspace/2026-11/2026-11-03/integration-readiness/telegram-db-preflight.sql |
| DB 롤백 | supabase/rollback/20261021_telegram_channel.sql |
| 공식 API | [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook) |
| 일회용 연결 링크 | [Deep Linking](https://core.telegram.org/bots/features#deep-linking) |

| PART | 내용 |
|---|---|
| 1 | 데이터와 동작 범위 |
| 2 | 연결 전 설정과 DB 확인 |
| 3 | 등록·실제 검증·중지 |
| 4 | 현재 결과와 남은 검증 |

---
---
# PART 1 — 데이터와 동작 범위

## 1-1 연결과 응답

```mermaid
flowchart LR
    Web(["<b>웹 설정</b><br/><small>로그인 · 연결 시작</small>"])
    Link(["<b>일회용 링크</b><br/><small>10분 · 웹에서 확정</small>"])
    Hook(["<b>개인 대화 수신</b><br/><small>비밀 헤더 · 수신 ID 검사</small>"])
    Work(["<b>서버 작업</b><br/><small>허용 자료 · AI 응답 저장</small>"])
    Reply(["<b>Telegram 답장</b><br/><small>연결 재확인 · 결과 전달</small>"])
    Web ==> Link
    Link --> Hook
    Hook ==> Work
    Work ==> Reply
    classDef core fill:#e0f2fe,stroke:#0284c7,stroke-width:2.5px,color:#0c4a6e,rx:16,ry:16
    classDef context fill:#f3f4f6,stroke:#4b5563,stroke-width:2px,color:#1f2937,rx:16,ry:16
    classDef point fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f,rx:16,ry:16
    classDef muted fill:#fafafa,stroke:#e5e7eb,stroke-width:1.5px,color:#9ca3af,rx:16,ry:16
    class Work core
    class Web,Hook,Reply context
    class Link point
```

| 역할 | 요소 | 범위 |
|---|---|---|
| ⚫ 참조 `context` | 웹 설정 | Supabase 로그인 사용자가 연결을 시작한다. |
| 🟡 분기 `point` | 일회용 링크 | DB에는 해시만 저장하며 Telegram 계정을 웹에서 최종 확인한다. |
| ⚫ 참조 `context` | 개인 대화 | 질문과 Telegram 사용자·대화방 식별자가 CoffeeTide 서버로 들어온다. |
| 🔵 핵심 `core` | 서버 작업 | 연결 사용자의 동기화 자료 중 cloud_allowed만 모델에 전달한다. |
| ⚫ 참조 `context` | 답장 | 생성 답변과 웹 결과 링크가 Telegram 개인 대화로 전송된다. |

Telegram 질문·답장은 해당 연결의 서버 대화 기록과 AI 작업 저장소에 보관한다. 대화 문맥은 최근 24시간의 최대 4회 왕복이다. DB 대화 정리는 해당 연결의 다음 수신 때 수행하고, 수신 중복 방지 기록은 7일 보관한다. Redis AI 작업의 만료는 24시간이다. 이미 Telegram에 전달한 메시지는 CoffeeTide 연결 해제로 회수되지 않는다.

## 1-2 초기 사용 기준

| 항목 | 준비 기준 |
|---|---|
| 제공자 | COPILOT_AI_PROVIDER=gemini 유지. Kanana는 성능·품질 실측 전 시험 대상으로 둔다. |
| 지원 | 개인 채팅의 텍스트 질문, 서버 자료 조회, 텍스트 초안, 완료 답장 |
| 외부 실행 | 일정 등록·메일 발송·삭제·앱 실행 도구를 제공하지 않는다. |
| 자료 | PC의 로컬 파일이나 최신 Google·Outlook 실시간 상태를 조회하지 않는다. |
| 자동 알림 | 능동 업무 제안이나 웹에서 시작한 모든 AI 작업의 Telegram 자동 알림은 구현 범위에 없다. |

---
---
# PART 2 — 연결 전 설정과 DB 확인

## 2-1 서버 환경변수

실제 비밀값은 배포 환경의 비밀값 저장소에 설정한다. 대화·소스·문서·명령 인수에 토큰을 넣지 않는다.

| 이름 | 설정 |
|---|---|
| TELEGRAM_BOT_TOKEN | BotFather에서 준비한 해당 봇의 토큰 |
| TELEGRAM_BOT_USERNAME | @를 제외한 봇 이름 |
| TELEGRAM_WEBHOOK_SECRET | 별도로 만든 32~256자의 영문·숫자·하이픈·밑줄 비밀값 |
| TELEGRAM_APP_ORIGIN | 경로·쿼리 없는 공개 HTTPS 원점 |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 기존 Supabase 로그인·공개 설정 |
| SUPABASE_SECRET_KEY | 서버 전용 DB 접근 키. 기존 SUPABASE_SERVICE_ROLE_KEY 별칭도 지원 |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | 서버리스 AI 작업 저장소. KV_REST_API_URL / KV_REST_API_TOKEN 별칭 지원 |
| GEMINI_API_KEY | 초기 AI 응답 제공자 키. 미설정 시 모델 응답 대신 기존 로컬 대체 응답 사용 |

환경변수가 이미 안전하게 주입된 서버에서는 아래 명령을 그대로 실행한다. 현재 PC의 기존 .env.local을 점검할 때만 node 뒤에 --env-file=.env.local을 추가한다.

```powershell
node workspace/2026-11/2026-11-03/integration-readiness/telegram-setup.mjs
```

외부 요청은 0회다. 누락된 연결 조건이 있으면 종료 코드 2를 반환한다. ready는 로컬 설정 충족 여부이며 DB 적용이나 실제 연결 성공을 의미하지 않는다.

## 2-2 DB·배포 확인

1. 대상이 개발·테스트인지 운영인지 먼저 확인한다.
2. telegram-db-preflight.sql을 읽기 전용으로 실행해 같은 이름의 테이블 4개·함수 5개와 권한을 확인한다.
3. 객체가 없으면 기존 마이그레이션을 검토한 뒤 해당 환경의 승인 절차에 따라 적용한다.
4. 객체가 일부만 있거나 정의가 다르면 기존 객체를 덮어쓰지 않고 차이를 확인한다.
5. 적용 후 동일 조회로 RLS 활성화, anon·authenticated 접근 차단, service_role 접근과 함수의 비어 있는 search_path를 확인한다.
6. 웹 소스와 서버 환경변수를 함께 배포한다. 이 작업의 미커밋 코드가 배포 대상에 포함되어야 한다.

운영 DB·운영 배포는 운영 담당자가 직접 수행한다. 설정 점검 도구는 DB에 연결하지 않으므로 마이그레이션 완료를 판정하지 않는다.

---
---
# PART 3 — 등록·실제 검증·중지

## 3-1 웹훅 등록

```powershell
node workspace/2026-11/2026-11-03/integration-readiness/telegram-setup.mjs --register
```

위 명령은 계획만 표시한다. 실제 봇 정보 조회·등록은 하지 않는다. 실제 등록을 담당자가 실행할 때만 --apply를 붙인다.

```powershell
node workspace/2026-11/2026-11-03/integration-readiness/telegram-setup.mjs --register --apply
```

도구는 getMe로 봇 이름을 확인하고, getWebhookInfo로 기존 대상을 확인한 뒤 등록한다. 다른 웹훅이 이미 있으면 중단한다. 등록값은 max_connections=1, allowed_updates=["message"], drop_pending_updates=false이며 별도의 secret_token을 전달한다. 등록 후 주소·연결 수·업데이트 종류를 다시 조회한다. 비밀 헤더의 실제 수신 검증은 별도의 콜백 시험이 필요하다.

공식 API는 HTTPS 웹훅, 비밀 헤더, 비정상 HTTP 응답 시 재전달을 지원한다. 세부 계약은 [setWebhook](https://core.telegram.org/bots/api#setwebhook)을 기준으로 한다.

## 3-2 실제 계정 검증

| 순서 | 사용자 또는 담당자 행동 | 관찰할 결과 |
|---|---|---|
| 1 | 웹 설정에서 연결 시작 | 일회용 봇 링크 생성 |
| 2 | Telegram에서 링크를 열고 시작 | 웹으로 돌아가 확정하라는 안내 |
| 3 | 웹에서 상태 확인·계정 확인·연결 확정 | 본인 Telegram 계정 표시 |
| 4 | 가상 내용으로 인사·업무 질문 | 완료 또는 대체 응답임이 구분된 답장 |
| 5 | 웹을 닫고 같은 봇에 질문 | 별도 웹 탭 실행 없이 답장 |
| 6 | 두 번째 시험 계정으로 연결 | 다른 사용자의 자료·이력 미포함 |
| 7 | 웹에서 연결 해제 | 이후 자료 조회·새 답장 시작 중단 |
| 8 | 휴대폰에서 결과 링크 열기 | 로그인 후 본인의 저장 결과 확인 |

초기 질문은 가상 자료로 시험한다. 실제 업무 답변을 사용할 때는 CoffeeTide 서버, 선택한 AI 제공자, Telegram으로 전달되는 범위를 확인한다. 수신된 Telegram 알림이 실제 휴대폰 잠금 화면에 나타나는지도 별도로 확인한다.

## 3-3 상태 조회·중지

아래 조회는 봇 API의 getMe·getWebhookInfo만 호출한다. 토큰·답변·웹훅 전체 주소·원본 오류 본문은 출력하지 않는다.

```powershell
node workspace/2026-11/2026-11-03/integration-readiness/telegram-setup.mjs --check
```

중지는 기본 계획 실행 후 담당자가 실제 중지를 결정했을 때만 --apply를 붙인다. 대기 업데이트는 버리지 않는다. 중지 후 새 연동을 등록하기 전에는 Telegram 메시지를 받아 처리하지 않는다.

```powershell
node workspace/2026-11/2026-11-03/integration-readiness/telegram-setup.mjs --stop
node workspace/2026-11/2026-11-03/integration-readiness/telegram-setup.mjs --stop --apply
```

DB에 데이터가 있으면 스키마를 보존하고 웹훅 중지로 복구한다. 스키마 롤백 파일은 기본 DRY_RUN이며 데이터가 하나라도 있으면 중단한다. 비어 있는 초기 구축만 되돌릴 때 담당자가 적용 여부를 결정한다.

실제 스키마 롤백을 결정한 담당자는 같은 DB 세션에서 `set coffeetide.telegram_rollback_apply = 'true';`를 설정한 뒤 롤백 파일을 실행한다. 실행 후에는 `reset coffeetide.telegram_rollback_apply;`로 되돌린다. 실제 적용 경로는 테이블 잠금을 확보한 뒤 다시 빈 테이블인지 확인한다. 이 준비 작업에서는 SQL을 실행하지 않았다.

---
---
# PART 4 — 현재 결과와 남은 검증

## 4-1 이번 실행

| 검사 | 결과 |
|---|---|
| 기존 Kanana·공통 응답·Telegram 테스트 | 55개 통과 |
| 새 준비 도구 검사 | 시험 응답과 로컬 HTTP만 사용하여 16개 통과 |
| TypeScript·관련 소스 ESLint | 통과 |
| 프로덕션 빌드 | 통과. 기존 Obsidian 파일 추적 경고 2개 유지 |
| 전체 테스트 | 542개 통과, 기존 성장 분석 테스트 1개 실패 |
| 로컬 Telegram 설정 | 4개 모두 미설정 |
| 기존 Supabase·Redis·Gemini 설정 | 필요한 키 존재 확인. 실제 서비스 접근·유효성은 미검증 |

## 4-2 확인하지 않은 범위

- 실제 Telegram 봇 생성, getMe·getWebhookInfo·setWebhook 호출, 메시지 발송과 휴대폰 수신.
- PostgreSQL에서의 마이그레이션·RPC·RLS·동시성·롤백 실행.
- 모델·DB·Redis의 실제 자격정보 유효성과 운영 배포.

현재 구현은 웹훅 응답 전에 AI 작업을 완료한다. 독립 작업 큐는 없다. 코드의 AI 제한 240초·작업 lease 270초·요청 제한 300초와 배포 상품의 실제 실행 제한을 함께 확인해야 한다. 전송 성공 뒤 네트워크 응답만 유실되면 답장이 중복될 수 있고, Telegram 재전달이 종료되면 자동 복구되지 않을 수 있다. 따라서 장시간 응답 모델은 실제 사용 전 별도 지연·재전달 검증이 필요하다.
