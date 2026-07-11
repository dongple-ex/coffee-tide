# Part 2: 데이터 처리 및 정제 명세

> ⚠️ **역사 문서 (Phase 1 · TimePilot 시절)** — 초기 Microsoft 단일 채널 설계 기록으로, 현재 coffeTide 정본과 다릅니다. 특히 `UnifiedData.source` 유니온은 이후 `local_doc`·`gmail`·`llm`·`manual`·`paste` 등으로 확장 예정([`00-current-state.md`](./00-current-state.md) §3 참조).

본 파트에서는 외부 연동 리소스를 수용하는 공통 데이터 스키마와 정제 메커니즘을 상세히 다룹니다.

## 1. Unified Data Model 타입 명세 (`src/lib/types/unified.ts`)

플랫폼 범용 모델 스키마를 구성하여 다양한 비즈니스 어댑터의 출력을 정규화합니다.

```typescript
export interface UnifiedAuthor {
  name: string;
  email?: string;
}

export interface UnifiedData {
  id: string;                                                        // 플랫폼별 고유 식별자
  source: 'outlook' | 'notion' | 'obsidian' | 'slack' | 'teams' | 'jira'; // 소스 플랫폼 종류
  title: string;                                                     // 요약 제목 (예: 이메일 제목)
  content: string;                                                   // 본문 (HTML 및 노이즈가 제거된 텍스트)
  created_at: string;                                                // 생성 시간 (ISO 8601 UTC)
  author: UnifiedAuthor;                                             // 발신자/작성자 정보
  url: string;                                                       // 원본 시스템 이동 링크
  category?: 'action_required' | 'approval_required' | 'urgent' | 'meeting' | 'reference' | 'ignore'; // Action Engine 분류용 임시 카테고리
  status?: 'pending' | 'completed' | 'dismissed';                     // 행동 지침 상태 관리
}
```

---

## 2. Microsoft Graph API 데이터 매핑 및 HTML 정제 필터

### 2.1 매핑 인터페이스 정의
`OutlookAdapter` 내에서 수행되는 `Microsoft Graph Message -> UnifiedData` 매핑 로직입니다.

```typescript
import { Message } from '@microsoft/microsoft-graph-types';

export function mapGraphMessageToUnified(message: Message): UnifiedData {
  return {
    id: message.id || '',
    source: 'outlook',
    title: message.subject || '(제목 없음)',
    content: cleanHtmlContent(message.body?.content || '', message.body?.contentType),
    created_at: message.receivedDateTime || new Date().toISOString(),
    author: {
      name: message.from?.emailAddress?.name || '알 수 없음',
      email: message.from?.emailAddress?.address || undefined
    },
    url: message.webLink || '',
    category: determineCategory(message.subject || '', message.importance),
    status: 'pending'
  };
}
```

### 2.2 HTML 클리닝 정규식 함수
이메일 본문에 포함된 마크업, CSS 스타일, 자바스크립트 등 노이즈 데이터를 완전 제거하고 텍스트만 온전히 추출합니다.

```typescript
function cleanHtmlContent(content: string, type: 'html' | 'text' | null | undefined): string {
  if (!content) return '';
  if (type === 'text') return content.trim();

  return content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 내장 스타일 시트 영역 제거
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // 내장 스크립트 영역 제거
    .replace(/<[^>]+>/g, ' ') // HTML 태그 공백 변환
    .replace(/&nbsp;/g, ' ') // 공백 엔티티 처리
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ') // 연속된 공백 문자 1개로 병합
    .trim();
}

function determineCategory(subject: string, importance: string | null | undefined): UnifiedData['category'] {
  if (importance === 'high') return 'urgent';
  
  const keyword = subject.toLowerCase();
  if (keyword.includes('결재') || keyword.includes('승인') || keyword.includes('confirm') || keyword.includes('approve')) {
    return 'approval_required';
  }
  if (keyword.includes('회의') || keyword.includes('미팅') || keyword.includes('agenda') || keyword.includes('meeting')) {
    return 'meeting';
  }
  if (keyword.includes('요청') || keyword.includes('제출') || keyword.includes('피드백') || keyword.includes('action')) {
    return 'action_required';
  }
  
  return 'reference';
}
```

---

## 3. Mock 데이터 정의 (`src/lib/mocks/mails.ts`)

인증이 완료되지 않은 테스트 실행 시나리오를 충족하기 위해 반환되는 가상의 Mock 이메일 목록 규격입니다.

```typescript
import { UnifiedData } from '../types/unified';

export const MOCK_MAILS: UnifiedData[] = [
  {
    id: "mock-outlook-1",
    source: "outlook",
    title: "[승인 요청] 3분기 인프라 비용 집행 결재 요청",
    content: "3분기 인프라 운영 예산에 대한 세부 내역이 첨부와 같이 작성되었습니다. 검토 후 결재함에서 최종 승인 부탁드립니다.",
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15분 전
    author: { name: "홍길동 대리", email: "gdhong@company.com" },
    url: "https://outlook.office.com/mail/mock-outlook-1",
    category: "approval_required",
    status: "pending"
  },
  {
    id: "mock-outlook-2",
    source: "outlook",
    title: "[긴급] 개발 서버 DB 커넥션 오류 발생",
    content: "현재 개발 서버 DB 커넥션 풀이 초과되어 서비스 접근이 불가능합니다. 즉시 조치바랍니다.",
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30분 전
    author: { name: "모니터링 봇", email: "bot@company.com" },
    url: "https://outlook.office.com/mail/mock-outlook-2",
    category: "urgent",
    status: "pending"
  },
  {
    id: "mock-outlook-3",
    source: "outlook",
    title: "TimePilot 프로젝트 미팅 일정 안내",
    content: "내일 오전 10시 대회의실에서 TimePilot 프로젝트 1차 킥오프 미팅이 예정되어 있으니 참석 부탁드립니다.",
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2시간 전
    author: { name: "김철수 과장", email: "cskim@company.com" },
    url: "https://outlook.office.com/mail/mock-outlook-3",
    category: "meeting",
    status: "pending"
  }
];
```
