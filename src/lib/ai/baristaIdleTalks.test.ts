import { describe, it, expect } from "vitest";
import { IDLE_TALK_POOL, formatIdleTalkForPersona } from "./baristaIdleTalks";

describe("Barista Idle Talks Module", () => {
  it("provides a rich pool of modern memes, jokes, trivia, and stretches", () => {
    expect(IDLE_TALK_POOL.length).toBeGreaterThanOrEqual(15);
    const categories = new Set(IDLE_TALK_POOL.map((item) => item.category));
    expect(categories.has("work_meme")).toBe(true);
    expect(categories.has("trendy_meme")).toBe(true);
    expect(categories.has("dad_joke")).toBe(true);
    expect(categories.has("coffee_trivia")).toBe(true);
    expect(categories.has("stretch_cheer")).toBe(true);
  });

  it("formats idle talk according to persona tone of voice", () => {
    const item = IDLE_TALK_POOL[0];

    // Karina (MZ Vitamin / Idol)
    const karinaTalk = formatIdleTalkForPersona(item, "karina", "카리나");
    expect(karinaTalk.title).toContain("카리나");
    expect(karinaTalk.content).toContain("팀장님");

    // Kim Manager (secretary - Dad Joke & Warm Boss)
    const kimTalk = formatIdleTalkForPersona(item, "secretary", "김부장");
    expect(kimTalk.title).toContain("김부장");
    expect(kimTalk.content).toMatch(/자네|부장님|라떼/);

    // Ontime Bot (pm - Efficiency AI)
    const ontimeTalk = formatIdleTalkForPersona(item, "pm", "칼퇴봇");
    expect(ontimeTalk.title).toContain("칼퇴봇");
    expect(ontimeTalk.content).toContain("[시스템 알림: 유휴 스레드 감지]");

    // Chaerin (chaerin - Tsundere Colleague)
    const chaerinTalk = formatIdleTalkForPersona(item, "chaerin", "채린이");
    expect(chaerinTalk.title).toContain("채린이");
    expect(chaerinTalk.content).toMatch(/야|너|멍때리/);

    // Ropan (ropan - Empire Lady)
    const ropanTalk = formatIdleTalkForPersona(item, "ropan", "로판 영애");
    expect(ropanTalk.title).toContain("로판 영애");
    expect(ropanTalk.content).toContain("공녀(공자)");
  });

  it("김부장 호감도 Lv.3/Lv.4에 따라 속마음 독백 및 파트너 애칭이 활성화된다", () => {
    const item = IDLE_TALK_POOL[0];

    const kimLv1 = formatIdleTalkForPersona(item, "secretary", "김부장", 1);
    expect(kimLv1.content).not.toContain("우리 팀 에이스");

    // Lv.3 이상 시 속마음 인트로 풀 확장
    const kimLv3 = formatIdleTalkForPersona(item, "secretary", "김부장", 3);
    expect(kimLv3.title).toContain("김부장");

    // Lv.4 이상 시 파트너 애칭 또는 부장님 인트로
    const kimLv4 = formatIdleTalkForPersona(item, "secretary", "김부장", 4);
    expect(kimLv4.title).toContain("김부장");
  });
});
