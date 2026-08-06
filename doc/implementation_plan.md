# [구현 계획서] Spark 브리핑 위젯, CloudSync 동기화 및 AI 엔진 폴백 구조 개선

Gemini Spark 외부 에이전트 브리핑 인제스트 위젯을 도입하고, Supabase/SQLite 기반의 다중 기기 실시간 상태 동기화(CloudSync) 시스템 구축 및 AI API 미응답/429 발생 시에도 100% 정상 작동을 보장하는 로컬 FallbackEngine 아키텍처를 고도화합니다.

---

## 1. 개요 및 변경 목표

1. **✨ Spark 브리핑 위젯 (Spark Briefing Widget & Ingestion)**
   - 외부 에이전트(Google Calendar, Gmail, Drive 등)에서 자동 처리된 AI 액션 결과를 수집하고, 대시보드 위젯에 실시간으로 표시.
   - `/api/spark/ingest` API를 통해 액션 항목을 수집하고 UnifiedData 규격으로 변환하여 AI 바리스타 브리핑과 연동.

2. **☁️ 클라우드 동기화 (CloudSync / Supabase / Local DB)**
   - 로그인 사용자 및 게스트 세션 간 상태 자동 동기화 (`useCloudSync` 훅 도입).
   - Supabase 클라우드 DB가 구성되어 있을 때는 실시간 동기화, 미연동 상태에서는 로컬 SQLite/LocalStorage 기반으로 100% 오프라인 작동 지원.

3. **🤖 AI 엔진 폴백 구조 고도화 (FallbackEngine & Harness)**
   - Gemini API 429 (Rate Limit), 404, 네트워크 단절 시에도 AI 바리스타와 브리핑 서비스가 중단되지 않도록 `fallbackEngine.ts` 키워드 기반 분류·브리핑 100% 보장.
   - `/api/util/reset-ai-cooldown`을 통한 AI 쿨다운 즉시 해제 지원.

---

## User Review Required

> [!IMPORTANT]
> **Supabase DB & 로컬 모드 하이브리드 운영**
> Supabase 환경변수(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)가 설정되지 않은 환경에서는 자동으로 **게스트 모드(Guest Mode / Local Storage)**로 조용히 폴백되어 사용자는 에러 없이 지속적으로 서비스를 사용할 수 있습니다.

---

## Open Questions

> [!NOTE]
> Spark 브리핑 위젯의 자동 갱신 주기는 기본 30초 폴링 및 WebSocket 수신 구조로 설계되었습니다. 추가 요구사항이 있으시면 설정할 수 있습니다.

---

## Proposed Changes

---

### [AI Engine & Copilot Core]

AI API 429 쿨다운 및 키 미설정 시 로컬 폴백 엔진으로 즉시 전환하여 무중단 브리핑을 제공합니다.

#### [MODIFY] [fallbackEngine.ts](file:///c:/coffeeTide_workspace/src/lib/ai/fallbackEngine.ts)
- `classifyOne`, `classifyAll`의 정규식 키워드(긴급, 승인, 미팅, 할일 등) 판별 정밀도 향상
- `copilotBriefing` 함수에서 사용자 직접 질문(Spark, 보고서, 특정 키워드) 검색 필터링 로직 강화

#### [MODIFY] [gemini.ts](file:///c:/coffeeTide_workspace/src/lib/ai/gemini.ts)
- 429 Rate Limit 및 모델 미지원(404) 에러 시 쿨다운 타임아웃 및 폴백 시그널 전달

#### [MODIFY] [harness.ts](file:///c:/coffeeTide_workspace/src/lib/ai/harness.ts)
- LLM 응답 안전망(Safety Guard) 및 로컬 추출기 연결 개선

#### [MODIFY] [route.ts (Copilot API)](file:///c:/coffeeTide_workspace/src/app/api/copilot/route.ts)
- AI 바리스타 질의 응답 시 Fallback Engine 결과와 원활히 결합되도록 라우터 핸들러 보정

---

### [Spark Briefing Widget & Ingestion]

Gemini Spark 및 외부 에이전트 수신 결과를 시각화하고 대시보드에 배치합니다.

#### [NEW] [SparkBriefingWidget.tsx](file:///c:/coffeeTide_workspace/src/app/components/SparkBriefingWidget.tsx)
- Spark 인제스트 브리핑 리스트 렌더링, 카테고리 태그(미팅, 승인필요, 할일, 참고) 시각화 및 삭제/완료 동작 처리

#### [NEW] [SparkBriefingWidget.module.css](file:///c:/coffeeTide_workspace/src/app/components/SparkBriefingWidget.module.css)
- 모눈종이 노트 및 다크/라이트 테마 토큰과 완벽하게 호환되는 위젯 전용 CSS 모듈

#### [NEW] [sparkSync.ts](file:///c:/coffeeTide_workspace/src/lib/adapters/sparkSync.ts)
- `SparkBriefingItem` 데이터 타입 정의, 메모리 렌더링 어댑터 및 `toUnifiedData` 변환기 구현

#### [NEW] [/api/spark/ingest (Route)](file:///c:/coffeeTide_workspace/src/app/api/spark/ingest/route.ts)
- 외부 Webhook 및 내부 위젯 간 브리핑 항목 수집/조회/삭제 REST 엔드포인트

---

### [CloudSync & Database Tier]

다중 기기 동기화 및 오프라인 상태 보존 레이어를 구축합니다.

#### [NEW] [useCloudSync.ts](file:///c:/coffeeTide_workspace/src/app/hooks/useCloudSync.ts)
- 1.5초 디바운스 자동 저장 및 게스트/동기화 상태 관리 훅

#### [NEW] [syncAdapter.ts](file:///c:/coffeeTide_workspace/src/lib/db/syncAdapter.ts)
- Supabase REST API 및 로컬 저장소 간 하이브리드 데이터 동기화 어댑터

#### [NEW] [/api/user/sync (Route)](file:///c:/coffeeTide_workspace/src/app/api/user/sync/route.ts)
- 클라이언트 유저 데이터 저장 및 동기화 처리 API 라우트

#### [MODIFY] [SettingsModal.tsx](file:///c:/coffeeTide_workspace/src/app/components/SettingsModal.tsx)
- 클라우드 동기화 상태(Synced / Guest) 및 Spark 위젯 활성화 토글 UI 추가

#### [MODIFY] [page.tsx](file:///c:/coffeeTide_workspace/src/app/page.tsx)
- SparkBriefingWidget 대시보드 위젯 구역 배치 및 CloudSync 훅 연동

---

## Verification Plan

### Automated Tests
1. **TypeScript TypeCheck**:
   ```bash
   npx tsc --noEmit -p tsconfig.json
   ```
2. **ESLint Linting**:
   ```bash
   npm run lint
   ```
3. **Next.js Production Build**:
   ```bash
   npm run build
   ```

### Manual Verification
1. **Spark 브리핑 위젯 동작 확인**:
   - 대시보드에서 `Spark 브리핑 위젯`이 표시되고, 샘플 브리핑(미팅, 인보이스 결재 등)이 정상 수집 및 완료 처리되는지 확인.
2. **AI Engine Fallback 확인**:
   - API 키가 없거나 네트워크가 끊긴 환경에서도 `AI 바리스타` 질문에 Fallback Engine이 깔끔한 템플릿 답변을 즉시 내놓는지 확인.
3. **CloudSync 세션 반응 확인**:
   - 설정 모달에서 동기화 상태가 `게스트` 또는 `동기화 완료`로 정상 표시되고 데이터 변경 시 1.5초 후 동기화 동작 확인.
