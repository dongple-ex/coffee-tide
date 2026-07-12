# Phase 3: AI Action Engine 및 AI 비서 기술 명세

본 파트에서는 coffeeTide Phase 3의 AI 처리 엔진(Action Engine) 및 비서 서비스(AI Copilot)의 연동 규격, 프롬프트 엔지니어링 설계, 그리고 데이터 연동 아키텍처를 정의합니다.

---

## 1. AI 처리 엔진 아키텍처 (Gemini API 연동)

Next.js API Route 단에서 Google AI SDK(`@google/generative-ai`)를 활용해 실시간 데이터 분류 및 비서 응답을 생성합니다.

```
[사용자 브라우저] ──(1) 대시보드 로드 / 질문 입력──> [Next.js API /api/mails]
                                                   │
   ┌───────────────────────────────────────────────┘
   ▼
[API Route]
   │
   ├─(2) 어댑터로부터 Outlook/Notion 통합 수집 (UnifiedData[])
   │
   ├─(3) [Action Engine] ──(Gemini API:gemini-2.5-flash)──> 카테고리 재분류 및 Action Directive 추가
   │
   └─(4) [AI Copilot (질의 시)] ──(Gemini API:gemini-2.5-flash)──> 행동 우선순위, 소요시간, 리스크 요약 보고
```

---

## 2. Gemini API 연동 규격

### 2.1 패키지 및 클라이언트 초기화
- SDK 패키지: `@google/generative-ai`
- API Key: `.env.local` 내 `GEMINI_API_KEY` 로 보안 적재.
- 모델 사양: 속도 및 효율이 탁월한 `gemini-2.5-flash` 모델을 기본 탑재.

### 2.2 Action Engine 프롬프트 엔지니어링 (JSON Output Mode)
수신 데이터의 본문(`content`)을 분석하여 분류 정확도를 높이기 위한 시스템 프롬프트 사양입니다.

*   **System Instructions**:
    ```
    역할: 수신된 업무 메일 또는 노션 페이지 데이터를 분석하여 가장 알맞은 행동 지침 카테고리로 분류하는 분류기(Classifier)입니다.
    
    분류 규칙:
    1. urgent: 서버 다운, 긴급 점검, 금일 즉시 마감 등 즉각적인 조치 및 비상 대응이 필요한 건.
    2. approval_required: 결재 승인, 최종 컨펌, 서명 요청이 포함된 건.
    3. meeting: 회의 참석, 일정 조율, 세미나 안내 건.
    4. action_required: 피드백 회신, 주간 보고서 제출 등 오늘 내로 액션이 필요한 일반 업무 건.
    5. reference: 단순 주간 동향, 업계 보고서, 기술 블로그 요약 등 보관용 정보 건.
    6. ignore: 광고성 뉴스레터, 시스템 정기 모니터링 성공 알림 등 무시해도 좋은 건.
    
    출력 형식: 반드시 아래 구조의 순수 JSON 배열 형태로만 응답해야 합니다. 추가 설명은 일절 생략하세요.
    [
      { "id": "데이터고유ID", "category": "분류값", "actionDirective": "무엇을 해야 하는지 1줄 요약" }
    ]
    ```

---

## 3. AI Copilot (비서 질의 응답) 프롬프트 명세

사용자가 Copilot 프롬프트에 질문을 남겼을 때 실행되는 프롬프트 설계입니다.

*   **Context 주입**:
    현재 동기화된 `UnifiedData[]`의 JSON 리스트를 컨텍스트로 LLM에 함께 전달합니다.
*   **System Instructions**:
    ```
    역할: 사용자의 개인 AI 업무 비서입니다. 제공된 메일 및 노션 정보 컨텍스트를 기반으로 사용자가 오늘 해야 할 일과 우선순위를 브리핑합니다.
    
    브리핑 구조 제약사항:
    반드시 다음 4가지 섹션을 명확히 노출하여 응답을 작성하세요.
    1. 오늘 처리할 최우선 업무 (액션/결재/긴급 건들을 중요도순으로 요약 나열)
    2. 행동 지침 요약 및 우선순위 제안
    3. 오늘 절약된 예상 시간 및 전체 업무 진행에 따른 예상 소요 시간
    4. 잠재적 위험 요소 (마감 기한 임박, 긴급 장애 전파 등 위험 징후 안내)
    
    어조: 친절하고 공손하며, 비즈니스에 적합한 명료한 말투를 유지하십시오.
    ```

---

## 4. Mock 및 Fallback 분류 규칙

Gemini API Key가 누락되었거나 `MOCK_MODE=true`인 오프라인 상황을 대비하여, `src/lib/ai/fallbackEngine.ts` 에 경량 규칙(Regex 매퍼) 및 로컬 시뮬레이터를 완비하여 동작 안정성을 보장합니다. (기존 Phase 2 수준의 Regex 규칙을 이관하고, 비서 질의 시의 응답 템플릿 연산 구조를 격리 보관함)
