// UI 표시용 한글 라벨 맵 — 대시보드와 설정 패널이 함께 쓴다.

import { AutomationRule } from "@/lib/automation/rules";
import { SOURCE_LABELS } from "@/lib/types/unified";

/** 수집 오류 배너용 소스 라벨 — errors 키(google 등)는 SOURCE_LABELS와 집합이 달라 보강 */
export const ERROR_SOURCE_LABELS: Record<string, string> = {
  ...SOURCE_LABELS,
  google: "Google",
  llm: "LLM 산출물",
};

/** 자동화 규칙의 field/action enum 한글 라벨 (토스트·규칙 목록 공용) */
export const FIELD_LABEL: Record<AutomationRule["field"], string> = {
  any: "아무 곳",
  source: "출처",
  sender: "보낸 사람",
  title: "제목",
  content: "내용",
};

export const ACTION_LABEL: Record<AutomationRule["action"], string> = {
  pin: "맨 위 고정",
  urgent: "긴급 표시",
  mute: "음소거",
  hide: "숨김",
};
