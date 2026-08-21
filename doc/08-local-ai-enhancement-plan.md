# 08. CoffeeTide 로컬 AI 강화 계획

> 상태: **로컬 모델은 설계 단계 / PDF·XLSX·PPTX 포함 공통 문서 파서 구현**  
> 기준일: 2026-08-11  
> 관련 문서: [`01-as-built-reference.md`](./01-as-built-reference.md), [`02-backlog.md`](./02-backlog.md), [`spec/phase6-llm-artifacts.md`](./spec/phase6-llm-artifacts.md), [`09-mcp-access-deferred-plan.md`](./09-mcp-access-deferred-plan.md), [`10-local-tools-document-agent-plan.md`](./10-local-tools-document-agent-plan.md)

## 1. 목적과 용어

CoffeeTide가 인터넷이나 Gemini API 상태에 덜 의존하면서 다음 기능을 실제 로컬 모델로 수행하도록 강화한다.

- AI 바리스타 질의·브리핑
- 업무 분류와 행동 지침
- 메모·회의록에서 업무 추출
- 자연어 일정 초안과 자동화 규칙 구조화
- 답장 초안과 문서 요약
- 로컬 문서 검색(RAG)과 출처 인용
- 등록된 로컬 스크립트의 안전한 도구 실행
- PDF·Excel·PowerPoint 등 다형식 문서 수집

현재 프로젝트에서 서로 다른 세 기능이 모두 “로컬 AI”처럼 보일 수 있으므로 구분한다.

| 구분 | 현재 상태 | 실제 의미 |
|---|---|---|
| `FallbackEngine` | 구현됨 | 정규식·템플릿 기반 결정적 규칙 엔진. LLM이 아니다. |
| LLM 산출물 연동 | 구현됨 | Claude Code·Gemini 등이 만든 파일을 읽는 기능. 모델을 실행하지 않는다. |
| 로컬 모델 추론 | **미구현** | Ollama·LM Studio 같은 로컬 추론 서버에 프롬프트를 보내 답을 생성하는 기능. |

이 문서에서 “로컬 AI 강화”는 세 번째 기능을 추가하되, 첫 번째 규칙 엔진을 최종 안전망으로 유지하는 것을 뜻한다.

## 2. 현재 소스 점검 결과

### 2.1 현재 처리 흐름

```text
UI/API 요청
  ├─ Gemini 키 있음 → 일부 기능은 Gemini 직접 호출
  └─ 키 없음·호출 실패 → FallbackEngine 또는 고정 문구

로컬 문서·LLM 산출물
  → 파일 스캔·발췌
  → UnifiedData에 병합
  → 전체 목록 일부를 Gemini 또는 FallbackEngine 컨텍스트로 사용
```

현재는 AI 공급자 추상화가 없고 `src/lib/ai/gemini.ts`에 원격 호출, 폴백 선택, JSON 파싱, 쿨다운이 함께 들어 있다.

### 2.2 기능별 실제 동작

| 기능 | 진입점 | 키가 있을 때 | 키가 없거나 실패할 때 |
|---|---|---|---|
| 업무 분류 | `classifyTasks()` | **현재 Gemini를 호출하지 않음** | `classifyOne()` 정규식 분류 |
| AI 바리스타 | `askCopilot()` | Gemini 직접 호출 | 템플릿 브리핑 |
| 일정 해석 | `extractCalendarEventDraft()` | Gemini JSON 추출 | 초안 생성 불가 안내 |
| 답장 초안 | `generateReplyDraft()` | Gemini 생성 | 고정된 범용 답장 |
| 자연어 규칙 | `parseRule()` | Gemini JSON 추출 | 대표 문형 정규식 |
| 붙여넣기 추출 | `extractTasks()` | Gemini JSON 추출 | 줄·불릿 휴리스틱 |
| 뉴스 요약 | `summarizeSiteContent()` | Gemini 요약 | 기존 로컬 핵심 문장 요약 유지 |
| YouTube 분석 | `analyzeYoutube()`·`chatYoutube()` | Gemini 영상 URL 분석 | 로컬 대체 없음 |
| LLM 산출물 | `LlmArtifactAdapter` | 모델 호출 없음 | 파일 발췌만 수행 |

### 2.3 확인된 정합성·품질 문제

1. **분류 문서와 코드가 다르다.** *(2026-08-22 부분 해소: 조회 전용 캐시 잔재를 제거하고 정본 문서를 로컬 전용 현실에 맞게 정정. `ai_error` 상시 표시 문제는 남아 있다.)*
   - 기존 정본 문서는 “캐시 미스만 Gemini 전송”이라고 설명한다.
   - 실제 `classifyTasks()`는 항상 `aiUsed:false`로 로컬 규칙 결과를 반환한다.
   - 따라서 `/api/mails`의 `ai_error`가 항목이 있을 때 계속 표시될 수 있다.
2. **쿨다운 설명이 다르다.**
   - 코드 상수는 1분이지만 로그·일부 문서는 10분이라고 적혀 있다.
   - `askCopilot()`과 일정 추출은 `ignoreCooldown=true`로 쿨다운을 우회한다.
3. **분류 킬스위치가 실제 분류 흐름에 연결되지 않았다.** *(2026-08-22 해소: 분류가 로컬 전용이라 막을 대상이 없으므로 `classifyDisabled()`와 `DISABLE_AI_CLASSIFY`를 제거. AI 분류를 재도입할 때 킬스위치도 함께 재설계한다.)*
4. **대화가 상태를 이어받지 않는다.**
   - 화면은 질문·답변 이력을 보관하지만 `/api/copilot`에는 현재 질문과 업무 목록만 전달한다.
   - “그중 두 번째 건을 더 설명해줘” 같은 후속 질문은 안정적으로 처리하기 어렵다.
5. **문서 검색이 아니라 전체 발췌 전달 방식이다.**
   - 최대 80개 항목, 항목당 앞 300자만 컨텍스트에 넣는다.
   - 질문과 관련된 문서를 검색·랭킹하는 임베딩/RAG 계층이 없다.
6. **구조화 응답 검증이 약하다.**
   - `parseJsonLoose()`는 코드펜스를 제거한 뒤 첫 `{` 또는 `[`부터 전체를 `JSON.parse`한다.
   - 스키마 검증, 필드별 오류 보고, 재시도 정책이 공통화되어 있지 않다.
7. **공급자 상태가 사용자에게 보이지 않는다.**
   - 현재 응답이 Gemini, 로컬 모델, 규칙 엔진 중 무엇인지 세부적으로 구분할 계약이 없다.
   - 지연시간, 모델명, 폴백 이유, 로컬 서버 연결 상태도 확인할 수 없다.
8. **로컬 모델 실행 경로가 없다.**
   - 설정 UI, 상태 점검 API, 공급자 라우터, 로컬 추론 어댑터가 모두 없다.

## 3. 목표 아키텍처

```text
AI 기능 호출
  → AiOrchestrator
      ├─ 요청 유형·프라이버시·필요 capability 판정
      ├─ LocalOpenAICompatibleProvider (Ollama / LM Studio)
      ├─ GeminiProvider (사용자 옵트인 원격 폴백)
      └─ DeterministicProvider (항상 가능한 최종 폴백)
  → 출력 스키마 검증
  → 기능별 결과 + provider/fallback 메타데이터
```

핵심 원칙은 다음과 같다.

- 로컬 모델을 우선할 수 있지만 규칙 엔진은 제거하지 않는다.
- Gemini 전송은 공급자 정책과 개인정보 설정에 따라 명시적으로 결정한다.
- 분류·일정·규칙·업무 추출은 JSON Schema 기반 구조화 출력을 사용한다.
- 로컬 모델이 직접 캘린더나 업무 상태를 변경하지 않는다. 모델은 초안만 만들고 기존 확인 UI가 실행한다.
- 공급자 장애는 기능 전체 장애가 아니라 다음 공급자로의 제한된 폴백으로 처리한다.

## 4. 공급자 공통 계약

구현 시 `gemini.ts`를 바로 확장하지 않고 공급자 인터페이스부터 분리한다.

```ts
type AiCapability =
  | "chat"
  | "structured_output"
  | "tool_calling"
  | "embedding"
  | "vision";

interface AiProvider {
  id: "local" | "gemini" | "rules";
  healthCheck(): Promise<AiProviderHealth>;
  generateText(request: AiTextRequest): Promise<AiTextResult>;
  generateStructured<T>(request: AiStructuredRequest<T>): Promise<AiStructuredResult<T>>;
  embed?(texts: string[]): Promise<number[][]>;
}

interface AiExecutionMeta {
  provider: "local" | "gemini" | "rules";
  model?: string;
  latencyMs: number;
  fallbackReason?: "not_configured" | "unreachable" | "timeout" | "quota" | "invalid_output";
}
```

`src/lib/ai/providers/` 아래에 `localOpenAICompatible.ts`, `gemini.ts`, `deterministic.ts`를 두고, 기존 외부 함수 이름은 오케스트레이터가 유지해 API 변경 범위를 줄인다.

## 5. 로컬 추론 서버 선택

1차 구현은 특정 제품 SDK에 묶이지 않고 **OpenAI 호환 HTTP API**를 공통 경계로 사용한다.

| 후보 | 기본 주소 예시 | 활용 |
|---|---|---|
| Ollama | `http://127.0.0.1:11434/v1` | 채팅, JSON/스키마 출력, 도구 호출, 임베딩 |
| LM Studio | `http://127.0.0.1:1234/v1` | 채팅, 구조화 출력, 도구 호출, 임베딩, 모델 상태 |

모델 이름을 코드에 고정하지 않는다. 설정 화면에서 `/v1/models` 결과를 조회하고 사용자가 선택하도록 한다. 모델 선정 기준은 한국어 지시 이해, JSON Schema 준수율, 도구 호출 지원, 메모리 사용량, 첫 응답 지연시간이다.

공식 참고 자료:

- Ollama OpenAI 호환 API: https://docs.ollama.com/api/openai-compatibility
- Ollama 구조화 출력: https://docs.ollama.com/capabilities/structured-outputs
- Ollama 임베딩: https://docs.ollama.com/api/embed
- LM Studio 로컬 서버: https://lmstudio.ai/docs/developer/core/server
- LM Studio OpenAI 호환 API: https://lmstudio.ai/docs/developer/openai-compat
- LM Studio 구조화 출력: https://lmstudio.ai/docs/developer/openai-compat/structured-output

## 6. 실행 환경 제약

### 6.1 CoffeeTide를 사용자 PC에서 실행하는 경우

Next.js 서버가 같은 PC의 `127.0.0.1` 로컬 모델 서버를 호출할 수 있으므로 가장 단순하고 안전한 1차 대상이다.

### 6.2 Vercel의 CoffeeTide를 사용하는 경우

Vercel 서버의 `localhost`는 사용자 PC가 아니다. 따라서 배포 서버가 사용자의 Ollama·LM Studio에 직접 접근할 수 없다.

배포 웹에서 로컬 모델을 사용하려면 향후 별도 로컬 브리지 또는 데스크톱 패키지가 필요하다. 브라우저에서 임의의 로컬 주소로 직접 요청하는 방식은 CORS, HTTPS 혼합 콘텐츠, 로컬 네트워크 접근 정책과 인증 문제 때문에 기본 설계로 채택하지 않는다.

1차 범위는 다음과 같이 고정한다.

- 로컬 CoffeeTide 실행: 로컬 모델 사용 가능
- Vercel 배포: Gemini 또는 규칙 엔진 사용
- UI는 `로컬 모델은 PC에서 CoffeeTide를 실행할 때 사용 가능` 상태를 명확히 표시

### 6.3 모바일에서 사용하는 경우

- Vercel 모바일 접속에서는 OS 파일 선택기를 통한 개별 문서 업로드와 서버 측 파싱·검색을 제공한다.
- 모바일 브라우저의 폴더 전체 스캔과 사용자 PC의 `localhost` 모델·스크립트 직접 호출은 지원하지 않는다.
- 같은 네트워크의 로컬 CoffeeTide에 접속한 경우 문서 색인과 스크립트 실행 주체는 PC이며, 모바일은 요청·미리보기·승인·결과 확인 인터페이스가 된다.
- 향후 하이브리드 앱의 네이티브 문서 선택기도 웹과 동일한 업로드·파서 계약을 사용한다.

## 7. 제안 환경 변수와 설정

아래 값은 **향후 구현용**이며 현재 `.env.example`에는 아직 추가하지 않는다.

```text
AI_PROVIDER_MODE=local_first
LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_AI_MODEL=
LOCAL_AI_API_KEY=
LOCAL_AI_TIMEOUT_MS=30000
LOCAL_AI_MAX_CONTEXT_ITEMS=20
LOCAL_EMBEDDING_MODEL=
ALLOW_CLOUD_AI_FALLBACK=false
```

`AI_PROVIDER_MODE` 후보:

- `local_first`: 로컬 → 사용자가 허용한 Gemini → 규칙 엔진
- `local_only`: 로컬 → 규칙 엔진
- `cloud_first`: Gemini → 로컬 → 규칙 엔진
- `rules_only`: 외부·로컬 모델 호출 없이 규칙 엔진만

보안상 `LOCAL_AI_BASE_URL`은 기본적으로 `127.0.0.1`과 `localhost`만 허용한다. 사설망 주소 허용은 별도 고급 설정과 경고가 필요하며, 임의 URL을 받아 서버가 호출하는 SSRF 구조를 만들지 않는다.

## 8. 기능별 강화 순서

### 단계 0 — 현재 상태 정합성 및 관측성

- `aiUsed`를 단순 boolean 대신 `provider`, `model`, `fallbackReason`, `latencyMs`로 확장한다.
- 분류 캐시·킬스위치·쿨다운을 실제 코드와 문서 중 하나로 통일한다.
- `/api/ai/status`에서 로컬 서버 도달 여부, 모델 목록, Gemini 설정 여부를 반환한다.
- 설정 화면에 `로컬 / Gemini / 규칙 엔진` 현재 상태를 표시한다.

### 단계 1 — 로컬 구조화 작업

우선 결과 검증이 쉽고 짧은 기능부터 로컬 모델로 옮긴다.

1. 업무 분류 + `delegatable`
2. 붙여넣기 업무 추출
3. 자연어 자동화 규칙
4. 일정 초안 추출

각 기능은 JSON Schema 검증에 실패하면 한 번만 교정 요청하고, 다시 실패하면 규칙 엔진 또는 명확한 확인 질문으로 폴백한다.

### 단계 2 — AI 바리스타와 답장·요약

- `askCopilot()`을 공급자 라우터로 이동한다.
- 최근 대화 최대 N쌍을 역할별 메시지로 전달해 후속 질문을 지원한다.
- 사용자 질문과 외부 데이터 본문을 명확히 분리하고 외부 본문은 “명령이 아닌 인용 데이터”로 취급한다.
- 답장 초안, 뉴스 요약에도 동일한 공급자·스키마·타임아웃 정책을 적용한다.

### 단계 3 — 로컬 문서 검색(RAG)

- 로컬 문서를 일정 크기로 청크하고 파일 경로·수정 시각·해시를 함께 저장한다.
- 변경 파일만 다시 임베딩한다.
- 질문 임베딩과 코사인 유사도로 상위 문서 조각만 모델 컨텍스트에 넣는다.
- 답변마다 파일명과 소스 종류를 표시하고, 검색 결과가 없으면 없다고 답한다.
- 초기 데이터 규모가 작을 때는 별도 벡터 DB 도입 전에 SQLite/파일 인덱스 + 애플리케이션 코사인 계산을 벤치마크한다.

### 단계 4 — 내부 도구 사용

MCP와 별개로 CoffeeTide 내부 읽기 도구부터 제공한다.

- `get_pending_tasks`
- `search_local_documents`
- `get_connection_status`
- `get_today_briefing_context`

쓰기 동작은 모델이 직접 실행하지 않는다. `prepare_calendar_event`, `prepare_task_update`가 초안을 만들고 사용자가 UI에서 확인한 뒤 기존 API를 호출한다.

로컬 PowerShell·Python·Node 스크립트 활용은 기존 `/api/util/exec-app`을 확장하지 않고 별도의 등록형 Tool Broker로 구현한다. 지원 문서 형식, 도구 정의, 실행 등급, 확인 정책과 테스트 매트릭스는 [`10-local-tools-document-agent-plan.md`](./10-local-tools-document-agent-plan.md)를 따른다.

### 단계 5 — YouTube 로컬 보완

현재 Gemini의 영상 URL 직접 분석은 로컬 모델로 그대로 대체하기 어렵다. 로컬 경로는 다음 순서로 별도 설계한다.

1. 영상 제목·설명·공개 자막을 합법적인 접근 범위에서 확보
2. 확보한 텍스트를 로컬 모델로 요약·질의
3. 자막이 없으면 Gemini 영상 분석 또는 “로컬 분석 불가” 안내

영상 다운로드·음성 전사는 저장 공간, 저작권, 실행 시간 정책을 정한 뒤 별도 승인 과제로 둔다.

## 9. 개인정보와 안전 기준

- `manual`, `paste`, `local_doc`, `obsidian`, `llm` 원문은 기본적으로 로컬 공급자를 우선한다.
- Gemini 폴백 시 전송될 데이터 범위를 요청 전에 표시할 수 있어야 한다.
- 토큰, 비밀번호, API 키 형태는 컨텍스트 구성 단계에서 마스킹한다.
- 모델 응답을 코드·셸·URL로 바로 실행하지 않는다.
- 외부 메일·문서 본문의 프롬프트 인젝션 문구는 데이터로 격리하고 시스템 지침으로 승격하지 않는다.
- 로그에는 원문과 프롬프트 전체를 남기지 않고 요청 ID, 공급자, 지연시간, 결과 상태만 기록한다.
- 로컬 모델 API 토큰이 있으면 서버 환경 변수에만 저장하고 `NEXT_PUBLIC_*`로 노출하지 않는다.

## 10. 테스트 계획

### 자동화

- 공급자 라우팅: 로컬 정상·미실행·타임아웃·잘못된 JSON·Gemini 비허용
- 구조화 출력: 분류, 일정, 반복 일정, 규칙, 붙여넣기 추출 스키마 검증
- 폴백: 로컬 실패 후 규칙 엔진이 항상 유효한 결과를 반환
- 개인정보: 클라우드 폴백 비허용 시 외부 fetch 0회
- SSRF: 허용하지 않은 `LOCAL_AI_BASE_URL` 거부
- RAG: 변경 파일만 재색인, 출처가 없는 답변 금지
- 프롬프트 인젝션: 문서 본문의 지침이 시스템 규칙을 변경하지 못함

### 품질 평가 세트

최소 30개의 고정 한국어 예제를 저장해 공급자 변경 때 회귀를 비교한다.

- 업무 분류 10개
- 회의록 업무 추출 5개
- 단일·반복 일정 5개
- 자연어 규칙 5개
- 후속 질문과 문서 근거 답변 5개

측정값:

- 스키마 성공률
- 정답/근거 일치율
- 첫 응답 및 전체 응답 지연시간
- 로컬 메모리 사용량
- 폴백률

### 필수 명령

```bash
npm run lint
npm run typecheck
npm run build
```

## 11. 완료 기준

- 로컬 CoffeeTide에서 Gemini 키 없이 실제 로컬 모델로 AI 바리스타가 응답한다.
- 로컬 모델 중단 시 규칙 엔진으로 자동 전환되고 UI가 멈추지 않는다.
- 분류·업무 추출·일정·규칙 응답이 스키마 검증을 통과한다.
- 현재 사용 중인 공급자와 폴백 이유가 화면에서 확인된다.
- 후속 질문이 최근 대화 문맥을 유지한다.
- 로컬 문서 질문은 검색된 출처를 함께 표시하고 없는 사실을 만들지 않는다.
- Vercel에서는 사용자 PC의 localhost를 호출하려 하지 않는다.
- 쓰기 작업은 항상 기존 확인 UI를 거친다.

## 12. 이번 작업 범위

2026-08-11에는 모바일·PC 역할을 재검토하고 공통 문서 파서를 구현했다. 업로드, 브라우저 폴더, 서버 로컬 문서 어댑터가 같은 파서를 사용하며 모바일 첨부 선택기에서 PDF·DOCX·XLSX·PPTX와 텍스트 계열을 받을 수 있다. 공급자 코드, 환경 변수, 설정 UI, 로컬 모델 설치, 증분 색인과 RAG는 아직 변경하지 않았다.
