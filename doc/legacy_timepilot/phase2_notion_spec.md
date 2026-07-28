# Phase 2: Notion API 연동 규격 및 데이터 매핑 명세

> ⚠️ **역사 문서 (Phase 2 · TimePilot 시절)** — Notion 초기 연동 설계 기록입니다. 신규 작업 기준: [`00-current-state.md`](./00-current-state.md) 및 Phase 3 이후 문서.

본 파트에서는 TimePilot Phase 2의 Notion 통합에 필요한 API 연동 방식, 데이터 스키마 및 가공 처리 설계를 정의합니다.

---

## 1. Notion API 연동 설계

Notion 통합은 사용자의 노션 워크스페이스 내 특정 데이터베이스(DB) 및 페이지를 TimePilot에 연결하여 할 일(Task) 및 관련 정보를 추출하는 방식으로 구동됩니다.

### 1.1 인증 및 권한 부여 방식
1.  **OAuth 2.0 Flow (공개 통합 - Public Integration)**:
    - 사용자가 TimePilot 웹 앱에서 "Notion 연동" 버튼을 클릭합니다.
    - Notion 권한 승인 페이지로 리다이렉트되어 사용자가 TimePilot에 접근을 허용할 데이터베이스/페이지를 선택합니다.
    - 리다이렉트 콜백을 통해 획득한 `access_token` 및 워크스페이스 정보를 세션에 보관합니다.
2.  **Internal Integration Token (내부 통합 - 개발/수동 테스트용)**:
    - 사용자가 [Notion Developers](https://developers.notion.com/)에서 직접 API 토큰을 발급받아 `.env.local`에 기입하여 연동하는 방식을 보조 옵션으로 제공합니다.

### 1.2 Notion API Endpoints 및 사용 권한
- **Database Query**: `POST https://api.notion.com/v1/databases/{database_id}/query`
  - 상태가 미완료(Not Started, In Progress 등)인 페이지 목록을 가져오기 위한 쿼리 필터를 적용합니다.
- **Page Retrieval**: `GET https://api.notion.com/v1/pages/{page_id}`
  - 특정 페이지의 상세 속성 및 메타데이터를 획득합니다.
- **Notion SDK**: `@notionhq/client` 패키지를 도입하여 통합 개발을 진행합니다.

---

## 2. Notion 데이터의 Unified Data Model 매핑 규칙

Notion의 특정 페이지/로우 데이터를 공통 모델(`UnifiedData`)로 정규화하는 상세 가공 정책입니다.

### 2.1 매핑 정의 및 규칙

Notion 데이터베이스는 사용자가 정의한 속성(Properties) 명칭이 제각각일 수 있습니다. 따라서 TimePilot은 다음과 같은 **표준 속성 매핑 규칙**을 지원하거나 기본 스키마를 상정합니다.

| UnifiedData 필드 | Notion Page 리소스 필드 | 설명 / 변환 규칙 |
| :--- | :--- | :--- |
| `id` | `id` | Notion 페이지의 UUID 형식 ID |
| `source` | 고정값 `"notion"` | 소스 식별자 |
| `title` | `properties.Name.title[0].plain_text` | 데이터베이스 Title 속성 (기본값) |
| `content` | 데이터베이스 속성(Properties) 요약 텍스트 | 마감일, 상태, 우선순위 등의 정보를 결합한 문자열 생성 (하단 가이드라인 참고) |
| `created_at` | `created_time` | 페이지 생성 시점 (ISO 8601) |
| `author.name` | `created_by.name` | 페이지 최초 작성 사용자명 |
| `url` | `url` | Notion 데스크톱/웹으로 이동하는 페이지 링크 |
| `category` | 속성 값 기반 매핑 | 우선순위 및 마감 기한 속성 분석 후 `urgent`, `action_required` 등으로 분류 |

### 2.2 Notion `content` 필드 결합 알고리즘
Notion 페이지의 원시 콘텐츠는 여러 블록(Blocks)으로 쪼개져 있어 API 요청량이 급증할 수 있습니다. 따라서 초기 동기화 시에는 페이지 내 **주요 속성 필드(Status, Due Date, Priority 등)**의 메타데이터를 파싱하여 설명형 텍스트로 자동 합성합니다.
```typescript
// 예시 변환 결과 텍스트
"Status: [진행 중] | 마감일: 2026-07-01 | 우선순위: 높음. 개발 서버 마이그레이션 작업을 정해진 일정까지 마무리해야 합니다."
```

### 2.3 `category` (행동 지침) 동적 판별 알고리즘
Notion의 우선순위(`Priority` 또는 `우선순위`) 및 마감일(`Due Date` 또는 `기한`) 속성을 식별하여 다음과 같이 분류 카테고리를 동적 지정합니다:
- **`urgent` (긴급)**: 마감일이 당일 또는 내일이면서 우선순위가 '상/높음'인 경우.
- **`approval_required` (결재 필요)**: 속성에 '결재', '승인대기' 상태가 잡혀 있는 경우.
- **`action_required` (액션 필요)**: 상태가 '진행 대기(To Do)' 상태이며 담당자가 나로 지정된 경우.
- **`reference` (참고용)**: 완료(Done)되었거나 마감 기한이 먼 단순 메모 성격의 페이지.

---

## 3. Notion Mock 데이터 추가 명세

오프라인 상태에서 Notion 연동 컴포넌트를 테스트하기 위해 `src/lib/mocks/mails.ts` 에 결합될 Notion 모의 데이터 구조입니다.

```typescript
export const MOCK_NOTION_PAGES: UnifiedData[] = [
  {
    id: "mock-notion-1",
    source: "notion",
    title: "TimePilot 제품 요구사항 정의서(PRD) 작성",
    content: "Status: [진행 중] | 기한: 2026-06-30 | 우선순위: 상. 2단계 Notion 연동 개발 명세를 구체화하고 개발 태스크 카드를 할당하세요.",
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), // 1일 전
    author: { name: "이지원 PM" },
    url: "https://notion.so/mock-notion-1",
    category: "urgent",
    status: "pending"
  },
  {
    id: "mock-notion-2",
    source: "notion",
    title: "Vanilla CSS 디자인 리팩토링 검토",
    content: "Status: [대기 중] | 기한: 2026-07-05 | 우선순위: 보통. Bento Grid 카드 간격 및 모바일 뷰포트 반응형 중단점 CSS 보정 필요.",
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), // 3일 전
    author: { name: "Sorin (나)" },
    url: "https://notion.so/mock-notion-2",
    category: "action_required",
    status: "pending"
  }
];
```
