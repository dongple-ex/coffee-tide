// Mock 데이터 — doc/legacy_timepilot/2-data_processing.md §3 + doc/legacy_timepilot/phase2_notion_spec.md §3 기반.
// 백로그 A2 반영: 각 Mock의 source 라벨은 실제 출처와 일치.

import { UnifiedData } from "../types/unified";

export const MOCK_MAILS: UnifiedData[] = [
  {
    id: "mock-outlook-1",
    source: "outlook",
    title: "[승인 요청] 3분기 인프라 비용 집행 결재 요청",
    content:
      "3분기 인프라 운영 예산에 대한 세부 내역이 첨부와 같이 작성되었습니다. 검토 후 결재함에서 최종 승인 부탁드립니다.",
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    author: { name: "홍길동 대리", email: "gdhong@company.com" },
    url: "https://outlook.office.com/mail/mock-outlook-1",
    category: "approval_required",
    status: "pending",
  },
  {
    id: "mock-outlook-2",
    source: "outlook",
    title: "[긴급] 개발 서버 DB 커넥션 오류 발생",
    content:
      "현재 개발 서버 DB 커넥션 풀이 초과되어 서비스 접근이 불가능합니다. 즉시 조치바랍니다.",
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    author: { name: "모니터링 봇", email: "bot@company.com" },
    url: "https://outlook.office.com/mail/mock-outlook-2",
    category: "urgent",
    status: "pending",
  },
  {
    id: "mock-gmail-1",
    source: "gmail",
    title: "coffeeTide 프로젝트 미팅 일정 안내",
    content:
      "내일 오전 10시 대회의실에서 coffeeTide 프로젝트 1차 킥오프 미팅이 예정되어 있으니 참석 부탁드립니다.",
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    author: { name: "김철수 과장", email: "cskim@company.com" },
    url: "https://mail.google.com/mail/mock-gmail-1",
    category: "meeting",
    status: "pending",
  },
  {
    id: "mock-gcal-1",
    source: "gcalendar",
    sourceApp: "Google Calendar",
    title: "주간 스프린트 계획 & 리서치 공유 회의",
    content:
      "[14:00 ~ 15:00] | 장소: 대회의실 A | 회의링크: https://meet.google.com/ct-weekly-sync\n이번 주 배포 일정 및 로컬 AI 모델 연동 진행 상황 점검",
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    author: { name: "강팀장", email: "lead@company.com" },
    url: "https://calendar.google.com/calendar/r/eventedit/mock-gcal-1",
    category: "meeting",
    status: "pending",
    actionDirective: "오늘 일정 참석 및 사전 준비",
  },
  {
    id: "mock-gdrive-1",
    source: "gdrive",
    sourceApp: "Google Drive",
    title: "2026 하반기 coffeeTide 서비스 아키텍처 사양서.gdoc",
    content:
      "[Google Docs] 최근 수정: 오늘 11:30 | 작성자: 박수석\nSupabase Postgres, 로컬 RAG 및 컴패니언 메모리 시스템 명세",
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    author: { name: "박수석", email: "sspark@company.com" },
    url: "https://drive.google.com/file/d/mock-gdrive-1/view",
    driveUrl: "https://drive.google.com/file/d/mock-gdrive-1/view",
    category: "reference",
    status: "pending",
  },
];

export const MOCK_NOTION_PAGES: UnifiedData[] = [
  {
    id: "mock-notion-1",
    source: "notion",
    title: "coffeeTide 제품 요구사항 정의서(PRD) 작성",
    content:
      "Status: [진행 중] | 기한: 2026-07-14 | 우선순위: 상. 무연동 manual/paste 흐름 명세를 구체화하고 개발 태스크 카드를 할당하세요.",
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    author: { name: "이지원 PM" },
    url: "https://notion.so/mock-notion-1",
    category: "urgent",
    status: "pending",
  },
  {
    id: "mock-notion-2",
    source: "notion",
    title: "Vanilla CSS 디자인 리팩토링 검토",
    content:
      "Status: [대기 중] | 기한: 2026-07-18 | 우선순위: 보통. Bento Grid 카드 간격 및 모바일 뷰포트 반응형 중단점 CSS 보정 필요.",
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    author: { name: "Sorin (나)" },
    url: "https://notion.so/mock-notion-2",
    category: "action_required",
    status: "pending",
  },
];

export const MOCK_OBSIDIAN_ITEMS: UnifiedData[] = [
  {
    id: "mock-obsidian-1",
    source: "obsidian",
    title: "주간 회고 노트에서 추출된 할 일: API 문서 보강",
    content: "- [ ] /api/mails 응답 스키마 문서화 (회고 노트 '2026-W28' 중)",
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    author: { name: "Obsidian Vault" },
    url: "obsidian://open?file=2026-W28",
    category: "action_required",
    status: "pending",
  },
];

export const MOCK_LLM_ITEMS: UnifiedData[] = [
  {
    id: "mock-llm-1",
    source: "llm",
    title: "coffeetide-project-basics",
    content:
      "coffeeTide 프로젝트 표기·상태 — 이름은 coffeeTide, 도메인 coffeeTide.dongple.kr. (Claude Code MEMORY 산출물 발췌)",
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    author: { name: "Claude" },
    url: "file:///mock/.claude/memory/coffeetide-project-basics.md",
    category: "reference",
    status: "pending",
  },
];
