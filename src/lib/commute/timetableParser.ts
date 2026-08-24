import { TimetableEntry } from "@/lib/types/commute";

/**
 * 시간 문자열("18:08 (천안)", "18:28 (신창)" 등)을 파싱하여 TimetableEntry 배열을 생성합니다.
 */
export function parseTimetableText(rawText: string): TimetableEntry[] {
  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText.split(/\r?\n/);
  const entries: TimetableEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let currentHour: number | null = null;
    const hourPrefixMatch = trimmed.match(/^(\d{1,2})시\s*[:|]\s*(.*)$/);
    let content = trimmed;

    if (hourPrefixMatch) {
      currentHour = parseInt(hourPrefixMatch[1], 10);
      content = hourPrefixMatch[2];
    }

    const tokens = content.split(/[,;\t|]+/).map((t) => t.trim()).filter(Boolean);

    for (const token of tokens) {
      const match = token.match(/^(?:(\d{1,2})[시:]\s*)?(\d{1,2})(?:분)?(?:\s*\(([^)]+)\)|\s+([가-힣a-zA-Z0-9]+))?/);
      if (match) {
        let hour = match[1] !== undefined ? parseInt(match[1], 10) : currentHour;
        const minute = parseInt(match[2], 10);
        const destination = (match[3] || match[4] || "").trim() || undefined;

        if (hour === null) {
          if (minute >= 100) {
            hour = Math.floor(minute / 100);
            const actualMin = minute % 100;
            if (hour >= 0 && hour < 24 && actualMin >= 0 && actualMin < 60) {
              const formattedTime = `${String(hour).padStart(2, "0")}:${String(actualMin).padStart(2, "0")}`;
              const key = `${formattedTime}-${destination || ""}`;
              if (!seen.has(key)) {
                seen.add(key);
                entries.push({
                  time: formattedTime,
                  destination,
                  minutes: hour * 60 + actualMin,
                });
              }
            }
            continue;
          }
          continue;
        }

        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          const formattedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          const key = `${formattedTime}-${destination || ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            entries.push({
              time: formattedTime,
              destination,
              minutes: hour * 60 + minute,
            });
          }
        }
      }
    }
  }

  return entries.sort((a, b) => a.minutes - b.minutes);
}

/**
 * 현재 시각(분 단위)을 기준으로 다음 열차와 다다음 열차 정보를 계산합니다.
 */
export function getNextDepartures(
  entries: TimetableEntry[],
  nowMinutes?: number
): {
  next: TimetableEntry | null;
  nextDiffMin: number;
  subsequent: TimetableEntry | null;
  subsequentDiffMin: number;
  isTomorrowNext: boolean;
} {
  if (!entries || entries.length === 0) {
    return {
      next: null,
      nextDiffMin: 0,
      subsequent: null,
      subsequentDiffMin: 0,
      isTomorrowNext: false,
    };
  }

  let currentMin = nowMinutes;
  if (currentMin === undefined) {
    const now = new Date();
    currentMin = now.getHours() * 60 + now.getMinutes();
  }

  const upcoming = entries.filter((e) => e.minutes >= currentMin!);

  if (upcoming.length > 0) {
    const next = upcoming[0];
    const nextDiffMin = next.minutes - currentMin;
    const subsequent = upcoming.length > 1 ? upcoming[1] : entries[0];
    const subsequentDiffMin =
      upcoming.length > 1
        ? subsequent.minutes - currentMin
        : 24 * 60 - currentMin + entries[0].minutes;

    return {
      next,
      nextDiffMin,
      subsequent,
      subsequentDiffMin,
      isTomorrowNext: false,
    };
  }

  const next = entries[0];
  const nextDiffMin = 24 * 60 - currentMin + next.minutes;
  const subsequent = entries.length > 1 ? entries[1] : null;
  const subsequentDiffMin = subsequent ? 24 * 60 - currentMin + subsequent.minutes : 0;

  return {
    next,
    nextDiffMin,
    subsequent,
    subsequentDiffMin,
    isTomorrowNext: true,
  };
}

/**
 * 시간표 목록을 시간대(18시, 19시 등)별로 그룹화합니다.
 */
export function groupEntriesByHour(
  entries: TimetableEntry[]
): Array<{ hour: number; label: string; items: TimetableEntry[] }> {
  const groupsMap = new Map<number, TimetableEntry[]>();

  for (const item of entries) {
    const hour = Math.floor(item.minutes / 60);
    if (!groupsMap.has(hour)) {
      groupsMap.set(hour, []);
    }
    groupsMap.get(hour)!.push(item);
  }

  const hours = Array.from(groupsMap.keys()).sort((a, b) => a - b);
  return hours.map((hour) => ({
    hour,
    label: `${hour}시`,
    items: groupsMap.get(hour)!,
  }));
}
