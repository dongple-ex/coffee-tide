// 수집·표시 시간 윈도우 — "현재 시각 기준 얼마 전까지 읽어오는가"의 단일 기준.
//
// 두 단계로 나뉜다:
// 1) 수집 상한(COLLECT_WINDOW_DAYS = 14일): 모든 수집 채널(서버 /api/mails의
//    outlook·gmail·notion·obsidian·local_doc·llm, 클라이언트 브라우저 폴더 스캔)은
//    최근 14일 이내에 생성/수신/수정(created_at)된 항목만 가져온다.
// 2) 표시 창(3/7/14일 차등): 대시보드에는 건수에 따라 좁은 창부터 적용한다 —
//    최근 3일 항목이 WINDOW_MIN_ITEMS건 이상이면 3일치만, 부족하면 7일, 그래도
//    부족하면 14일까지 넓힌다. 바쁠 때는 최신에 집중하고 한산할 때는 넓게 본다.
//    (창 선택·적용은 mergeView.ts의 병합 파이프라인에서 수행)
//
// 주의: 가장 좁은 티어(3일)도 followupHours(기본 24시간)보다 커야 하고, 핀 고정·
// 팔로업 초과 항목은 창과 무관하게 유지돼야 방치 업무가 화면에서 사라지지 않는다.

export const WINDOW_TIERS_DAYS = [3, 7, 14] as const;

/** 표시 창을 좁은 티어로 확정하는 데 필요한 최소 건수 */
export const WINDOW_MIN_ITEMS = 5;

/** 수집(fetch) 상한 = 가장 넓은 티어 */
export const COLLECT_WINDOW_DAYS = WINDOW_TIERS_DAYS[WINDOW_TIERS_DAYS.length - 1];
export const COLLECT_WINDOW_MS = COLLECT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** created_at이 최근 days일 이내인지 판정. 파싱 불가한 날짜는 버리지 않고 유지한다(fail-open). */
export function isWithinDays(createdAtIso: string, days: number, now: number = Date.now()): boolean {
  const t = Date.parse(createdAtIso);
  return Number.isNaN(t) ? true : now - t <= days * 24 * 60 * 60 * 1000;
}

/** created_at이 수집 상한(14일) 안인지 판정 */
export function isWithinCollectWindow(createdAtIso: string, now: number = Date.now()): boolean {
  return isWithinDays(createdAtIso, COLLECT_WINDOW_DAYS, now);
}

/** 표시 창 설정 — "auto"면 건수 차등(3/7/14일), 숫자면 해당 일수로 고정 */
export type ViewWindowSetting = "auto" | number;

/** localStorage 등 외부에서 읽은 값을 안전한 설정값으로 정규화 (미지 값은 "auto") */
export function normalizeViewWindow(v: unknown): ViewWindowSetting {
  if (typeof v === "number" && (WINDOW_TIERS_DAYS as readonly number[]).includes(v)) return v;
  return "auto";
}

/**
 * 건수 차등 표시 창 선택 — 좁은 티어부터 훑어 WINDOW_MIN_ITEMS건 이상 담기는
 * 첫 티어를 반환한다. 어느 티어도 못 채우면 가장 넓은 티어(14일)를 쓴다.
 */
export function pickWindowDays(
  items: { created_at: string }[],
  now: number = Date.now()
): number {
  for (const days of WINDOW_TIERS_DAYS) {
    if (items.filter((i) => isWithinDays(i.created_at, days, now)).length >= WINDOW_MIN_ITEMS) {
      return days;
    }
  }
  return COLLECT_WINDOW_DAYS;
}
