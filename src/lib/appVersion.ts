/**
 * 사용자에게 표시하는 coffeeTide 버전 — 설정 화면 및 What's New 모달에 노출된다.
 * 릴리스 시 package.json과 함께 갱신할 것. (version.test.ts에서 동기화 검증)
 */
export const APP_VERSION = "v1.2.10";

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
    version: "v1.2.10",
    date: "2026-10-04",
    title: "소식 번들·도구 폴더와 영상 보기 모드",
    summary: "X·Instagram 등 관심 소식을 번들로 모으고, 휴식 도구를 폴더에서 찾습니다. 영상 플레이어의 듣기·축소·PiP·전체 보기와 원본 이동을 개선했습니다.",
    items: [
      {
        type: "feat",
        title: "관심 소식을 한 번들에 모으기",
        description: "X 계정·검색, Instagram 공개 프로 계정, Threads와 사이트·RSS를 주제별로 묶습니다. 읽음·저장·서비스 필터를 지원하며 X·Instagram은 서버 인증 설정이 필요합니다. 연결하지 않은 소스는 연결 필요로 표시합니다.",
      },
      {
        type: "enhance",
        title: "휴식·도구 폴더 탐색",
        description: "도구와 사이트를 종류별 폴더로 정리하고 이름·주소 검색을 제공합니다. 같은 주소의 중복 표시를 줄이고 폴더 펼침 상태를 저장합니다.",
      },
      {
        type: "enhance",
        title: "듣기·축소·전체 보기와 영상 복귀",
        description: "보기 모드를 한곳에서 전환하며 모바일은 축소 보기로 시작합니다. 재생 위치·일시정지·배속을 유지하고 현재 위치의 YouTube 원본과 브라우저 전체화면을 제공합니다.",
      },
      {
        type: "fix",
        title: "PiP 재생 전환과 음소거 안정화",
        description: "PiP의 YouTube 오류 153에 대응하는 재생 경로를 적용했습니다. PiP를 사용할 수 없거나 창이 즉시 닫히면 축소 보기로 복원하고 음소거 조작 오류를 수정했습니다.",
      },
    ],
  },
  {
    version: "v1.2.9",
    date: "2026-10-02",
    title: "터미널 AI 추론 수준·비용 안내",
    summary: "선택한 모델의 지원 추론 단계와 권장 기본값, API·구독 과금 차이와 공식 사용량 메뉴를 안내합니다. 실제 적용값을 확인할 수 없으면 미확인으로 표시합니다.",
    items: [
      {
        type: "enhance",
        title: "모델별 추론 정보 표시",
        description: "모델 목록을 지원하는 앱에서 지원 단계를 표시합니다. Codex의 권장 기본값과 바리스타 설정 내 안내는 데스크톱 소스 v0.1.3에 적용했으며 기존 v0.1.1 다운로드에는 포함되지 않습니다. 추론 수준은 앱에서 별도 지정하지 않습니다.",
      },
      {
        type: "enhance",
        title: "비용과 한도 판단에 필요한 안내",
        description: "추론 수준·대화 길이에 따른 사용량 영향과 추가 크레딧 사용 조건을 안내합니다. 예상 금액과 잔여 한도는 현재 연결에서 제공하지 않으며, 공식 사용량 메뉴에서 확인할 수 있습니다.",
      },
    ],
  },
  {
    version: "v1.2.8",
    date: "2026-10-02",
    title: "터미널 AI 모델 목록 자동 조회",
    summary: "연결된 데스크톱 바리스타에서 Claude와 Codex의 모델 목록을 받아 선택합니다. 목록 새로고침과 직접 입력을 지원하며 저장한 모델은 다음 질문부터 적용됩니다.",
    items: [
      {
        type: "feat",
        title: "CLI가 제공하는 모델 목록",
        description: "모델 목록 조회를 지원하는 데스크톱 앱이 필요합니다. 최신 데스크톱 소스 v0.1.2에 적용했으며 기존 v0.1.1 다운로드에는 포함되지 않습니다. 조회 목록은 실행 권한이나 잔여 사용량을 보장하지 않습니다.",
      },
      {
        type: "fix",
        title: "조회 실패와 기존 모델 설정 유지",
        description: "목록 조회 실패나 구버전 앱은 상태를 명확히 표시합니다. 목록에서 확인되지 않은 저장 모델도 유지하며, 자동 선택과 모델 이름 직접 입력을 사용할 수 있습니다.",
      },
    ],
  },
  {
    version: "v1.2.7",
    date: "2026-10-01",
    title: "데스크톱 바리스타 직접 대화 연동",
    summary: "대화창을 지원하는 바리스타 앱에서 보낸 질문을 웹의 기본 AI 또는 선택한 CLI로 처리하고 앱에 답변을 전달합니다. 웹 탭 연결을 유지해 주세요.",
    items: [{
      type: "feat",
      title: "캐릭터 대화창과 웹 AI 연결",
      description: "대화·업무 모드와 최근 대화 문맥을 전달합니다. 중복 요청은 AI를 다시 실행하지 않고 답변 전달만 재시도합니다. 직접 대화 버튼은 최신 데스크톱 소스에 적용되며 기존 v0.1.1 다운로드에는 포함되지 않습니다.",
    }],
  },
  {
    version: "v1.2.6",
    date: "2026-10-01",
    title: "터미널 AI 모델 선택",
    summary: "Claude Code와 Codex CLI 연결에서 모델을 목록으로 선택하거나 직접 입력할 수 있습니다. 저장한 모델은 다음 질문부터 적용됩니다.",
    items: [
      {
        type: "enhance",
        title: "모델 목록과 직접 입력",
        description: "CLI 기본 모델, 제공자별 모델 후보, 직접 입력 옵션을 제공합니다. 후보 목록은 계정의 사용 가능 모델을 조회한 결과가 아니며, 지원 여부는 계정과 CLI 버전에 따라 다릅니다.",
      },
    ],
  },
  {
    version: "v1.2.5",
    date: "2026-10-01",
    title: "터미널 AI 계정·사용량 안내",
    summary: "터미널 AI 연결 설정에서 사용 계정과 요금제, 실제 응답 성공 상태 및 사용량 확인 메뉴를 제공합니다. 계정 정보는 연결된 보조 앱이 제공하는 경우 표시됩니다.",
    items: [
      {
        type: "feat",
        title: "사용 계정과 응답 성공 상태",
        description: "지원하는 보조 앱에서 로그인 이메일·요금제·계정 조회 시각을 표시합니다. 질문에 실제 답변이 돌아오면 응답 성공 시각을 표시합니다.",
      },
      {
        type: "enhance",
        title: "사용량 확인 메뉴 안내",
        description: "Claude Usage와 Codex 터미널의 사용량 메뉴를 안내합니다. 계정 조회를 지원하지 않는 기존 앱에서도 대화와 사용량 안내를 이용할 수 있습니다.",
      },
    ],
  },
  {
    version: "v1.2.4",
    date: "2026-10-01",
    title: "Claude Code·Codex CLI 대화 연결",
    summary: "데스크톱 바리스타 v0.1.1과 연결해 Claude Code 또는 Codex CLI로 대화할 수 있습니다. 캐릭터 지침과 최근 대화를 전달하며, 공급자 선택·설치 확인·답변 취소를 지원합니다.",
    items: [
      {
        type: "feat",
        title: "터미널 AI 선택 및 대화",
        description: "설정에서 Claude Code 또는 Codex CLI를 선택하고, PC의 기존 로그인으로 AI 바리스타 채팅과 미니카드에서 대화합니다. 연결·로그인 실패 시 오류를 표시합니다.",
      },
      {
        type: "enhance",
        title: "실행 설정·설치 확인·답변 취소",
        description: "실행 파일과 작업 폴더·모델을 설정하고, 설치 버전을 확인하거나 진행 중인 답변을 취소할 수 있습니다. 현재는 대화 송수신을 지원하며 전문 스킬·MCP 실행은 후속 단계입니다.",
      },
      {
        type: "fix",
        title: "Windows 앱 다운로드 갱신",
        description: "CLI 연결 기능이 포함된 바리스타 v0.1.1을 GitHub Releases에서 제공합니다. 새 앱 실행 후 웹과 다시 연결해 주세요.",
      },
    ],
  },
  {
    version: "v1.2.3",
    date: "2026-09-27",
    title: "페르소나 실무 시나리오·신경망 음성 대화 & 일일 회고 리포트",
    summary: "13종 페르소나의 사내 실무 스토리와 전용 이미지, Edge-TTS 신경망 음성 대화(Waveform UI), 친밀도 Lv.5 일일 회고 리포트 및 Document PiP 안정화가 적용되었습니다.",
    items: [
      {
        type: "feat",
        title: "페르소나별 사내 실무 스토리 및 전문 직무 시나리오 탑재",
        description: "13개 전체 페르소나에 사내 직급·역할, 상세 배경 스토리, 전문 업무 분야를 정의하고 AI 지침에 연동하여 몰입감 있고 전문적인 업무 조언을 제공합니다.",
      },
      {
        type: "feat",
        title: "Edge-TTS 신경망 음성 대화 & 음파(Waveform) 시각화 UI",
        description: "자연스러운 한국어 뉴럴 보이스 기반 실시간 스트리밍 음성 대화와 오디오 파형 인터랙션을 지원합니다.",
      },
      {
        type: "feat",
        title: "친밀도 Lv.5 일일 회고 리포트 & 김부장 캐릭터 해금 혜택",
        description: "친밀도 최고 단계 달성 시 원클릭 일일 회고 및 정시 퇴근 리포트(Obsidian/클립보드 연동)를 제공하며, 만년 김부장의 전용 결재·기안서 서식을 지원합니다.",
      },
      {
        type: "enhance",
        title: "13종 페르소나 전용 고화질 비주얼 에셋 적용",
        description: "각 캐릭터의 직무와 개성에 맞춘 새 이미지를 웹·데스크톱 플로팅 바리스타 및 설정 화면에 전면 적용했습니다.",
      },
      {
        type: "fix",
        title: "음성 재생 동기화 및 Document PiP 안정화",
        description: "음성 중단 시 지연/중복 발화를 방지하고, 일상·업무 대화 라우팅 및 독립 OS Document PiP 팝업 연동을 개선했습니다.",
      },
    ],
  },
  {
    version: "v1.2.2",
    date: "2026-09-21",
    title: "데스크톱 바리스타 연결 지원",
    summary: "CoffeeTideBarista 데스크톱 앱과의 연결을 통해 캐릭터를 다른 화면 위에 띄우고 창 제어 및 다운로드 안내가 추가되었습니다.",
    items: [
      {
        type: "feat",
        title: "데스크톱 바리스타 플로팅 지원",
        description: "웹 미니카드 및 데스크톱 앱 연결을 통해 화면 위에 언제나 바리스타를 띄워두고 작업할 수 있습니다.",
      },
    ],
  },

  {
    version: "v1.2.1",
    date: "2026-09-20",
    title: "업무 필터·AI 액션 실행 & Threads 피드 안정화",
    summary: "중요 업무 핀 고정 및 검색 필터, AI 대화형 업무 조작(자동 완료/메모/답장 초안), Threads 피드 수집 안정화가 적용되었습니다.",
    items: [
      {
        type: "feat",
        title: "AI 코파일럿 대화형 업무 조작 (Action Execution)",
        description: "대화창에서 '~ 완료 처리해줘', '~ 찾아줘', '~ 메모 남겨줘' 등 자연어 지시를 내리면 즉각적으로 일감을 찾아 완료하고 메모 및 필터를 동기화합니다.",
      },
      {
        type: "feat",
        title: "오늘 업무 검색 및 상태별 필터 바",
        description: "중요 업무 핀 고정 기능과 함께, 텍스트 검색 및 전체·미완료·완료 상태 필터를 통해 일감을 손쉽게 찾을 수 있습니다.",
      },
      {
        type: "fix",
        title: "Threads 피드 수집 타임아웃 해결 & 파서 개선",
        description: "Jina Reader 헤더 수정으로 타임아웃을 해결하고, 첨부 이미지/차트 및 상대 시간, 반응 지표(좋아요, 리포스트, 댓글)를 안정적으로 수집합니다.",
      },
    ],
  },
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
