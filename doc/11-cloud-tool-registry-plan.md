# 11. Cloud Tool Registry 설계 및 구현 계획

> 상태: **설계 확정 · 단계 A 읽기 전용 기반 구현 완료**  
> 기준일: 2026-08-11  
> 관련 문서: [`08-local-ai-enhancement-plan.md`](./08-local-ai-enhancement-plan.md), [`10-local-tools-document-agent-plan.md`](./10-local-tools-document-agent-plan.md)

## 1. 목적과 경계

Cloud Tool Registry는 Vercel의 CoffeeTide 서버에 함께 배포되는 TypeScript 함수를 AI 바리스타가 안전하게 조회·제안·실행할 수 있도록 관리한다. 개인 PC의 파일이나 프로그램을 사용하는 Local Tool Broker와 분리한다.

| 구분 | Cloud Tool Registry | Local Tool Broker |
|---|---|---|
| 실행 위치 | Vercel 또는 CoffeeTide 서버 | CoffeeTide를 실행한 사용자 PC |
| 사용 기기 | 로그인한 모든 PC·모바일 | 해당 PC 또는 같은 네트워크에서 그 PC에 접속한 기기 |
| 등록 방식 | 소스 코드에 정적으로 등록하고 배포·코드 리뷰 | 로컬 JSON에 절대 경로·스크립트 해시 등록 |
| 적합한 작업 | DB/API 조회, 문서 변환, 일정·Drive 작업 | PC 파일, 로컬 프로그램, PowerShell |
| 금지 | 임의 코드·셸·사용자 지정 URL 실행 | 등록되지 않은 경로·인자·변경된 스크립트 실행 |

Vercel Function은 배포 파일시스템을 읽기 전용으로 제공하고 임시 `/tmp`만 쓸 수 있으므로, 영구 상태와 감사 기록은 Supabase 같은 외부 저장소에 둔다. 함수 실행 시간 안에 끝나지 않는 장기 작업은 큐·백그라운드 작업으로 분리한다.

## 2. 핵심 원칙

1. **정적 등록**: 배포된 소스에 등록된 도구만 존재한다. 환경변수나 사용자 입력으로 모듈·함수·URL을 추가하지 않는다.
2. **모델과 실행 분리**: Gemini는 도구명과 인자를 구조화해 제안한다. CoffeeTide가 인증·권한·스키마·등급을 검사한 뒤 실행한다.
3. **최소 권한**: 도구 컨텍스트에는 사용자 ID, 타임존, 제한된 업무 항목처럼 필요한 정보만 전달하며 OAuth 토큰과 서버 비밀은 도구 결과에 포함하지 않는다.
4. **서버 전용 비밀**: API 키는 Vercel의 서버 전용 환경변수에 저장하고 `NEXT_PUBLIC_` 접두사를 사용하지 않는다.
5. **명시적 쓰기 승인**: 외부 쓰기는 실행 대상과 변경 내용을 먼저 보여주고, 사용자 세션에 묶인 단기·1회 승인 토큰이 있어야 한다.
6. **결정적 제한**: 입력 크기, 출력 크기, 제한 시간, 호출 횟수와 허용 네트워크 대상을 도구별로 고정한다.
7. **기본 기능 격리**: 도구 실패가 업무 목록·브리핑·로그인 같은 CoffeeTide 기본 기능을 막지 않는다.

## 3. 도구 계약

```ts
interface CloudToolDefinition<TInput, TData> {
  id: string;
  version: number;
  name: string;
  description: string;
  inputSchema: CloudToolObjectSchema;
  effect: "read_only" | "draft" | "external_write";
  confirmation: "none" | "result_review" | "always";
  timeoutMs: number;
  maxOutputBytes: number;
  execute(input: TInput, context: CloudToolContext): Promise<CloudToolResult<TData>>;
}
```

결과는 다음 공통 구조를 사용한다.

```ts
interface CloudToolResult<TData> {
  success: boolean;
  summary: string;
  data: TData;
  sources: Array<{ label: string; url?: string }>;
  warnings: string[];
}
```

도구 ID와 버전을 감사 기록에 남겨 같은 이름의 도구가 변경돼도 어떤 코드가 실행됐는지 구분한다. 모델에 전달하는 선언에는 공개 설명과 입력 스키마만 포함하며 내부 함수, 환경변수, 토큰은 포함하지 않는다.

## 4. 효과 등급과 승인 정책

| 효과 등급 | 예 | 1차 정책 |
|---|---|---|
| `read_only` | 업무 집계, 환율·금리, 연결 상태 조회 | 인증·스키마 검사 후 실행 가능 |
| `draft` | 일정·메일·보고서 초안 | 결과를 사용자에게 표시하고 저장 전 확인 |
| `external_write` | Calendar 등록, Drive 저장, 메일 발송 | 대상 미리보기 + 세션 결합 1회 승인 + 멱등성 키 |
| 파괴적 작업 | 삭제, 권한 변경, 임의 코드 실행 | Registry 등록 금지 |

1차 구현은 `read_only`만 허용한다. 타입 선언에 다른 등급이 있어도 실행기는 해당 단계가 구현되기 전까지 거부한다.

## 5. 실행 흐름

```text
사용자 질문 또는 /tool 명령
  → 인증 사용자 확인
  → Registry에서 도구 조회
  → 입력 스키마·크기 검사
  → 사용자·도구별 호출 제한 확인
  → 효과 등급과 승인 정책 확인
  → 제한 시간 안에서 서버 함수 실행
  → 결과 크기·비밀정보 검사
  → 실행 메타데이터 감사 기록
  → AI 바리스타가 출처와 함께 결과 설명
```

모바일과 데스크톱은 동일한 HTTPS API를 사용한다. 승인 UI는 최소 44px 터치 영역, 실행 대상·계정·도구명·입력·예상 변경 내용을 한 화면에서 보여줘야 한다.

## 6. 보안 설계

- API는 Supabase 사용자 또는 CoffeeTide 세션 인증이 필요하다.
- Registry는 정적 `Map`으로 구성하며 임의 import, `eval`, `spawn`, 셸 실행을 금지한다.
- 입력 객체는 등록 스키마에 없는 키를 거부하고 문자열 길이·숫자 범위·열거값을 검사한다.
- 도구가 호출하는 외부 호스트는 코드에 고정한다. 사용자 입력 URL을 그대로 `fetch`하지 않는다.
- 요청 본문, OAuth 토큰, 문서 원문은 로그에 남기지 않는다.
- 감사 기록은 요청 ID, 사용자 식별자 해시, 도구 ID·버전, 시작·종료 시각, 성공 여부, 오류 코드만 저장한다.
- 1차는 인메모리 호출 제한과 구조화 서버 로그를 사용한다. 다중 Vercel 인스턴스에 대한 정확한 제한·영속 감사는 Supabase 테이블로 이전한다.
- 프롬프트 인젝션 문구가 도구 결과에 포함돼도 결과를 시스템 지시로 취급하지 않는다.

## 7. 1차 등록 도구

### `workspace.task_summary`

- 입력: 활성/전체 범위, 카테고리/출처 그룹 기준
- 데이터: 현재 Copilot 요청에 포함된 최대 80개 업무 항목
- 출력: 전체·대기·완료·긴급 건수와 그룹별 집계
- 외부 통신·쓰기 없음

### `finance.market_snapshot`

- 입력: 전체 또는 USD/JPY/EUR 통화 선택
- 데이터: 기존 한국은행 ECOS 조회 계층과 1시간 캐시 공유
- 출력: 기준일, 환율, 기준금리, 공식 출처
- `BOK_ECOS_API_KEY`는 도구 결과와 로그에 포함하지 않음

## 8. 단계별 구현

### 단계 A — 읽기 전용 기반

- [x] 공통 타입·입력 스키마 검사·정적 Registry
- [x] 제한 시간·출력 크기·인메모리 호출 제한·메타데이터 로그
- [x] `workspace.task_summary`, `finance.market_snapshot`
- [x] 인증된 `/api/cloud-tools` 목록·실행 API
- [x] AI 바리스타 `/tools`, `/tool finance`, `/tool tasks` 명령

### 단계 B — Gemini 도구 제안

- [ ] 공개 도구 선언을 Gemini function calling 형식으로 변환
- [ ] 읽기 전용 도구 1회 선택·실행·결과 재요약
- [ ] 등록되지 않은 도구·인자와 반복 호출 거부
- [ ] Gemini 실패 시 명시적 `/tool` 명령과 기존 브리핑으로 폴백

### 단계 C — 초안 도구

- [ ] 일정·보고서·메일을 직접 저장하지 않고 초안으로 생성
- [ ] 모바일 결과 검토 카드와 수정·취소

### 단계 D — 외부 쓰기

- [ ] 세션 결합 1회 승인 토큰과 멱등성 키
- [ ] Calendar·Drive부터 기존 확인 UI 재사용
- [ ] Supabase 영속 감사·분산 호출 제한
- [ ] 삭제·권한 변경은 계속 금지

## 9. 테스트 매트릭스

- 비로그인 요청 401
- 미등록 도구 404, 미등록 인자·잘못된 형식 400
- 제한 시간·출력 상한·호출 제한 초과
- 다른 사용자 승인 토큰·만료·재사용 거부
- 도구 오류 시 Copilot과 기본 대시보드 정상 유지
- 모바일에서 목록·결과·승인 카드 접근성 확인
- API 키·OAuth 토큰·문서 원문이 응답·로그에 없는지 확인
- 로컬·Vercel Preview·Production 환경에서 같은 도구 ID와 스키마 확인

## 10. 완료 기준

- 같은 계정으로 어느 PC나 모바일에서 접속해 동일한 Cloud Tool 목록을 볼 수 있다.
- AI는 등록된 도구와 검증된 인자만 제안·실행할 수 있다.
- 읽기와 쓰기 효과가 코드와 UI에서 명확히 구분된다.
- 외부 쓰기는 사용자 승인 전 실행되지 않는다.
- 도구 실패와 공급자 장애가 CoffeeTide 기본 기능을 중단시키지 않는다.
