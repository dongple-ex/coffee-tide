# 09. CoffeeTide MCP 접근 방법 — 보류 계획

> 상태: **보류 — 로컬 AI 강화 후 진행**  
> 기준일: 2026-08-11  
> 선행 문서: [`08-local-ai-enhancement-plan.md`](./08-local-ai-enhancement-plan.md)

## 1. 목표

외부 AI가 CoffeeTide의 업무·브리핑·연동 상태를 MCP 도구와 리소스로 안전하게 읽고, 사용자 확인을 거쳐 제한된 작업을 실행할 수 있게 한다.

```text
외부 AI/MCP 클라이언트
  → CoffeeTide MCP 서버
  → 기존 서비스·어댑터 계층
  → 업무, 브리핑, 문서 검색, Calendar 초안
```

CoffeeTide 내부 AI가 외부 MCP 서버를 사용하는 방향은 “CoffeeTide가 MCP 클라이언트”가 되는 별도 과제다. 이 문서는 **외부 AI가 CoffeeTide에 접근하는 서버 방향**만 다룬다.

## 2. 현재 상태

- MCP 서버와 `/mcp` 엔드포인트는 아직 없다.
- `/api/copilot`, `/api/tasks/*`, `/api/calendar/events`, `/api/spark/ingest` 등 재사용 가능한 REST 기능은 있다.
- Spark 수신 API는 단일 목적 Webhook이며 MCP 도구 검색·호출 프로토콜이 아니다.
- 기존 브라우저 세션 쿠키를 외부 MCP 클라이언트 인증 수단으로 그대로 사용하면 안 된다.

## 3. 1차 제공 범위

### Resources

- `coffeetide://briefing/today`
- `coffeetide://tasks/pending`
- `coffeetide://connections/status`

### 읽기 Tools

- `get_today_briefing`
- `list_pending_tasks`
- `search_coffeetide_items`
- `get_connection_status`

### 쓰기 Tools — 2차

- `prepare_task`
- `prepare_calendar_event`
- `prepare_task_update`

쓰기 도구는 초안만 반환한다. 실제 등록·완료는 CoffeeTide UI에서 사용자 확인 후 수행한다.

## 4. 전송 방식

| 방식 | 용도 | 결정 |
|---|---|---|
| STDIO | 같은 PC의 개인 AI 클라이언트 | 로컬 MVP 후보 |
| Streamable HTTP | 다른 기기·원격 AI 클라이언트 | 운영 2차 후보 |

로컬 MVP는 별도 Node 프로세스가 CoffeeTide 내부 서비스 계층을 호출하도록 한다. 운영 원격형은 `https://coffee-tide.dongple.kr/mcp` 같은 단일 엔드포인트를 사용한다.

## 5. 인증

- 로컬 STDIO: 환경 변수로 전달한 개인용 토큰 또는 로컬 OS 사용자 경계
- 원격 HTTP: MCP 인증 명세에 맞는 OAuth 2.1 보호 리소스
- 사용자별 최소 scope 예시:
  - `coffeetide:read`
  - `coffeetide:task:prepare`
  - `coffeetide:calendar:prepare`
- Supabase 사용자 ID를 CoffeeTide 데이터 소유권의 기준으로 사용하되, MCP 클라이언트 등록·토큰 발급·Protected Resource Metadata는 별도 인증 계층 설계가 필요하다.
- 범용 장기 Bearer 비밀 하나를 모든 사용자와 도구에 공유하지 않는다.

공식 참고:

- MCP 서버 구현: https://modelcontextprotocol.io/docs/develop/build-server
- MCP Tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP HTTP 인증: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

## 6. 안전 규칙

- 읽기 전용 도구부터 출시한다.
- 각 도구에서 사용자 소유권과 scope를 다시 확인한다.
- 모델의 텍스트만으로 메일 전송, 일정 등록, 업무 삭제를 실행하지 않는다.
- 쓰기 작업은 미리보기 → 사용자 확인 → 실행의 두 단계로 분리한다.
- 도구 입력은 스키마·길이·허용값으로 검증한다.
- 원문, OAuth 토큰, API 키를 도구 결과와 로그에 포함하지 않는다.
- 요청 ID, 사용자 ID, 도구명, 성공/실패, 실행 시간을 감사 로그로 남긴다.

## 7. 구현 순서

1. 기존 API 로직을 라우트에서 재사용 가능한 서비스 함수로 분리한다.
2. 읽기 전용 MCP 서버와 도구 스키마를 작성한다.
3. 로컬 STDIO 연결로 도구 검색·호출·소유권 테스트를 완료한다.
4. 원격 Streamable HTTP와 OAuth 메타데이터를 추가한다.
5. 사용자 확인형 쓰기 초안 도구를 추가한다.
6. 호출 제한, 감사 로그, 폐기·토큰 회수 경로를 검증한다.

## 8. 시작 조건

다음 조건을 충족하기 전에는 MCP 구현을 시작하지 않는다.

- 로컬 AI 강화 계획의 공급자 추상화와 상태 표시가 완료됨
- 업무·브리핑·문서 검색 서비스 계층이 API 라우트와 분리됨
- 읽기/쓰기 권한 경계와 사용자 확인 UX가 확정됨
- 사용자가 MCP 구현 재개를 명시적으로 승인함

## 9. 완료 기준

- MCP 클라이언트가 CoffeeTide 도구 목록을 조회한다.
- 인증된 사용자는 자신의 데이터만 읽는다.
- 읽기 도구가 기존 CoffeeTide 화면과 같은 결과를 반환한다.
- 인증 없음·scope 부족·다른 사용자 접근은 거부된다.
- 쓰기 도구는 사용자 확인 없이는 실제 상태를 바꾸지 않는다.
- 운영 로그에 비밀값과 원문이 남지 않는다.
