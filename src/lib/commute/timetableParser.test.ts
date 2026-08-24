import { describe, it, expect } from "vitest";
import { parseTimetableText, getNextDepartures, groupEntriesByHour } from "./timetableParser";

describe("timetableParser", () => {
  it("사용자 스크린샷 텍스트 형태를 정확하게 파싱한다", () => {
    const rawText = `
18시 | 18:08 (천안), 18:28 (신창), 18:52 (신창)
19시 | 19:12 (천안), 19:32 (신창), 19:54 (천안)
20시 | 20:15 (신창), 20:39 (천안)
21시 | 21:05 (신창), 21:30 (천안), 21:55 (천안)
22시 | 22:25 (천안)
`;
    const entries = parseTimetableText(rawText);
    expect(entries).toHaveLength(12);

    expect(entries[0]).toEqual({
      time: "18:08",
      destination: "천안",
      minutes: 18 * 60 + 8,
    });
    expect(entries[1]).toEqual({
      time: "18:28",
      destination: "신창",
      minutes: 18 * 60 + 28,
    });
    expect(entries[11]).toEqual({
      time: "22:25",
      destination: "천안",
      minutes: 22 * 60 + 25,
    });
  });

  it("현재 시각 기준 다음 열차와 남은 시간을 올바르게 계산한다", () => {
    const rawText = `
18시 | 18:08 (천안), 18:28 (신창), 18:52 (신창)
19시 | 19:12 (천안), 19:32 (신창)
`;
    const entries = parseTimetableText(rawText);

    // 18:15 (1095분) 기준
    const currentMin = 18 * 60 + 15;
    const { next, nextDiffMin, subsequent, subsequentDiffMin, isTomorrowNext } = getNextDepartures(
      entries,
      currentMin
    );

    expect(isTomorrowNext).toBe(false);
    expect(next?.time).toBe("18:28");
    expect(next?.destination).toBe("신창");
    expect(nextDiffMin).toBe(13); // 18:28 - 18:15 = 13분

    expect(subsequent?.time).toBe("18:52");
    expect(subsequentDiffMin).toBe(37); // 18:52 - 18:15 = 37분
  });

  it("오늘 열차가 모두 종료된 경우 내일 첫 차를 가리킨다", () => {
    const rawText = `
18:08 천안
18:28 신창
`;
    const entries = parseTimetableText(rawText);

    // 23:00 (1380분) 기준
    const currentMin = 23 * 60;
    const { next, nextDiffMin, isTomorrowNext } = getNextDepartures(entries, currentMin);

    expect(isTomorrowNext).toBe(true);
    expect(next?.time).toBe("18:08");
    // 23:00 ~ 24:00 (60분) + 18:08 (1088분) = 1148분
    expect(nextDiffMin).toBe(60 + 18 * 60 + 8);
  });

  it("시간대별 그룹화를 정상 수행한다", () => {
    const rawText = `
18:08 천안
18:28 신창
19:12 천안
`;
    const entries = parseTimetableText(rawText);
    const groups = groupEntriesByHour(entries);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("18시");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].label).toBe("19시");
    expect(groups[1].items).toHaveLength(1);
  });
});
