// localStorage 영속화 — 키 정의와 안전한 read/write.
//
// 저장 실패(용량 초과 등)를 조용히 삼키지 않고 결과를 돌려주는 것이 이 모듈의 계약이다.
// manual 항목은 1급 소스(정본 원칙 2)라 호출부가 실패를 사용자에게 알려야 한다.

export const LS_MANUAL = "ct_manual_items";
export const LS_RULES = "ct_automation_rules";
export const LS_DISMISSED = "ct_dismissed_ids";
export const LS_FOLLOWUP = "ct_followup_hours";
export const LS_VIEW_WINDOW = "ct_view_window_days";
export const LS_FETCH_LIMIT = "ct_fetch_limit";
export const LS_BRIEF_TIME = "ct_brief_time";
export const LS_THEME = "ct_theme";
export const LS_WEATHER_ENABLED = "ct_weather_enabled";
export const LS_WEATHER_COORDS = "ct_weather_coords";
export const LS_COMMUTE_CONFIG = "ct_commute_config";
export const LS_APP_SHORTCUTS = "ct_app_shortcuts";
export const LS_BROWSER_CAT = "ct_browser_categories";
export const LS_HANDOFF_STATE = "ct_handoff_state";
export const LS_WORK_NOTES = "ct_work_notes";
export const LS_SUB_TASKS = "ct_sub_tasks";
export const LS_YOUTUBE_BUNDLES = "ct_youtube_bundles";
export const LS_YOUTUBE_ACTIVE_BUNDLE = "ct_youtube_active_bundle";
export const LS_YOUTUBE_HISTORY = "ct_youtube_history";
export const LS_YOUTUBE_CONTINUITY = "ct_youtube_continuity_v1";
export const LS_COMPACT_MODE = "ct_compact_mode";
export const LS_COMMUTE_TIMETABLES = "ct_commute_timetables";
export const YOUTUBE_BUNDLES_CHANGED_EVENT = "ct:youtube-bundles-changed";

import type { CommuteTimetable } from "./types/commute";

export const DEFAULT_COMMUTE_TIMETABLES: CommuteTimetable[] = [
  {
    id: "tt_sindorim_suwon_express",
    title: "1호선 신도림역 하행 급행 (수원·천안·신창 방면)",
    description: "신도림역 환승 시 급행 출발 시간표",
    rawText: `18시 | 18:08 (천안), 18:28 (신창), 18:52 (신창)
19시 | 19:12 (천안), 19:32 (신창), 19:54 (천안)
20시 | 20:15 (신창), 20:39 (천안)
21시 | 21:05 (신창), 21:30 (천안), 21:55 (천안)
22시 | 22:25 (천안)`,
    entries: [
      { time: "18:08", destination: "천안", minutes: 1088 },
      { time: "18:28", destination: "신창", minutes: 1108 },
      { time: "18:52", destination: "신창", minutes: 1132 },
      { time: "19:12", destination: "천안", minutes: 1152 },
      { time: "19:32", destination: "신창", minutes: 1172 },
      { time: "19:54", destination: "천안", minutes: 1194 },
      { time: "20:15", destination: "신창", minutes: 1215 },
      { time: "20:39", destination: "천안", minutes: 1239 },
      { time: "21:05", destination: "신창", minutes: 1265 },
      { time: "21:30", destination: "천안", minutes: 1290 },
      { time: "21:55", destination: "천안", minutes: 1315 },
      { time: "22:25", destination: "천안", minutes: 1345 },
    ],
    enabled: true,
  },
];

// 구 프로젝트명(TimePilot) 시절 tp_ 키 → ct_ 키 1회성 마이그레이션 맵 (판독 시 이관)
const LEGACY_LS_KEYS: Record<string, string> = {
  [LS_RULES]: "tp_automation_rules",
  [LS_DISMISSED]: "tp_dismissed_ids",
  [LS_FOLLOWUP]: "tp_followup_hours",
};

export function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    let raw = localStorage.getItem(key);
    const legacy = LEGACY_LS_KEYS[key];
    if (raw === null && legacy) {
      raw = localStorage.getItem(legacy);
      if (raw !== null) {
        try {
          localStorage.setItem(key, raw);
          localStorage.removeItem(legacy);
        } catch {
          // 이관 쓰기가 실패해도(용량 초과 등) 이번 세션은 구 키 값으로 동작 — 다음 로드에서 재시도
        }
      }
    }
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** @returns 저장 성공 여부 — 실패(용량 초과 등)를 호출부가 사용자에게 알릴 수 있도록 */
export function saveLS(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
