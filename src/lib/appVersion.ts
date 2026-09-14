/**
 * 사용자에게 표시하는 coffeeTide 버전 — 설정 화면 및 What's New 모달에 노출된다.
 * 릴리스 시 package.json과 함께 갱신할 것. (version.test.ts에서 동기화 검증)
 */
export const APP_VERSION = "v1.2.0";

export const LS_LAST_SEEN_VERSION = "coffeetide_last_seen_version";

export interface ReleaseItem {
  type: "feat" | "enhance" | "fix";
  title: string;
  description: string;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  items: ReleaseItem[];
}

export const RELEASE_HISTORY: ReleaseNote[] = [
  {
    version: "v1.2.0",
    date: "2026-09-14",
    title: "지식 아카이브 RAG & 3D 캔버스 고도화",
    summary: "완료 문서 지식 아카이브 검색과 AI RAG 연동, 3D 다이어리/칠판 뷰어, AI 컴패니언 기억/성장 시스템이 도입되었습니다.",
    items: [
      {
        type: "feat",
        title: "지식 아카이브 & RAG 검색 파이프라인",
        description: "캔버스에서 완료된 문서를 로컬·클라우드·Google Drive에 안전하게 보관하고, AI 코파일럿 및 캔버스 확장 시 지식 증거(Evidence)로 자동 활용합니다.",
      },
      {
        type: "feat",
        title: "3D 캔버스 다이어리/칠판 뷰어 & Document PiP",
        description: "양면 책자 펼침 효과, 칠판/다이어리 질감 테마, 반응형 자동 폭 맞춤, 50% 줌 및 OS 항상 위 Document PiP 분리 창을 지원합니다.",
      },
      {
        type: "feat",
        title: "AI 컴패니언 Phase 16/17 (기억·성장·관계성)",
        description: "대화 에피소드 기억 및 자동 요약, 페르소나별 고유 아바타, 친밀도 성장 엔진 및 자연스러운 대화 라우팅을 구현했습니다.",
      },
      {
        type: "enhance",
        title: "Google Calendar & Drive 수집 연동 안정화",
        description: "외부 서비스 인증 상태에 따른 부분 실패 격리, 일일 자동 백업 및 안전한 폴백 처리를 강화했습니다.",
      },
      {
        type: "fix",
        title: "한국어 자모 오타 자동 보정 및 AI 응답 정제",
        description: "한글 입력 오류 감지 및 AI 텍스트 변환 시 반복/퇴행 응답 필터링을 적용했습니다.",
      },
    ],
  },
  {
    version: "v1.1.0",
    date: "2026-08-20",
    title: "모바일 레이아웃 및 테마 최적화",
    summary: "모바일 화면에서의 바리스타 대화 경험과 다양한 테마 스타일을 개선했습니다.",
    items: [
      {
        type: "enhance",
        title: "모바일 챗 레이아웃 & 퀵 리플라이 개선",
        description: "모바일 화면 폭에 최적화된 바리스타 대화창과 깔끔한 셀렉트 드롭다운 퀵 리플라이를 지원합니다.",
      },
      {
        type: "enhance",
        title: "테마 스타일 & 온디바이스 AI 대응",
        description: "Notebook 및 라이트 테마 배지 시인성 향상 및 Chrome Built-in AI 지원 환경을 안내합니다.",
      },
    ],
  },
  {
    version: "v1.0.0",
    date: "2026-07-15",
    title: "coffeeTide 통합 스마트 워크스페이스 출시",
    summary: "캘린더, 할 일, 이메일, AI 코파일럿이 하나로 통합된 스마트 워크스페이스의 첫 릴리스입니다.",
    items: [
      {
        type: "feat",
        title: "통합 데스크 & 아침 브리핑",
        description: "Google/Outlook 연동을 통한 일정 및 업무 자동 수집과 AI 아침 브리핑을 제공합니다.",
      },
      {
        type: "feat",
        title: "AI 바리스타 & 스마트 캔버스",
        description: "자연어 기반 업무 추출, 일정 등록, 문서 작성 및 다이어리 관리를 지원합니다.",
      },
    ],
  },
];

import { useSyncExternalStore } from "react";

/** 사용자가 마지막으로 확인한 버전을 반환합니다. */
export function getLastSeenVersion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LS_LAST_SEEN_VERSION);
  } catch {
    return null;
  }
}

/** 현재 버전을 확인한 것으로 저장합니다. */
export function setLastSeenVersion(version: string = APP_VERSION): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_LAST_SEEN_VERSION, version);
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event("storage"));
    }
  } catch (e) {
    console.warn("[appVersion] Failed to save last seen version:", e);
  }
}

/** 아직 확인하지 않은 새로운 업데이트가 있는지 검사합니다. */
export function hasUnseenUpdate(): boolean {
  if (typeof window === "undefined") return false;
  const lastSeen = getLastSeenVersion();
  if (!lastSeen) return true;
  return lastSeen !== APP_VERSION;
}

const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

/** React 18/19 권장 useSyncExternalStore 기반 최신 업데이트 감지 훅 */
export function useHasUnseenUpdate(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasUnseenUpdate(),
    () => false
  );
}
