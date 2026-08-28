import { describe, it, expect } from "vitest";
import { IDLE_TALK_POOL, formatIdleTalkForPersona } from "./baristaIdleTalks";

describe("Barista Idle Talks Module", () => {
  it("provides a rich pool of jokes, trivia, and stretches", () => {
    expect(IDLE_TALK_POOL.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(IDLE_TALK_POOL.map((item) => item.category));
    expect(categories.has("joke")).toBe(true);
    expect(categories.has("coffee_trivia")).toBe(true);
    expect(categories.has("stretch")).toBe(true);
  });

  it("formats idle talk according to persona style", () => {
    const item = IDLE_TALK_POOL[0];

    // Karina
    const karinaTalk = formatIdleTalkForPersona(item, "karina", "카리나");
    expect(karinaTalk.title).toContain("카리나");
    expect(karinaTalk.content).toContain("팀장님");

    // Kim Manager (secretary)
    const kimTalk = formatIdleTalkForPersona(item, "secretary", "김부장");
    expect(kimTalk.title).toContain("김부장");
    expect(kimTalk.content).toContain("자네");

    // Ontime Bot (pm)
    const ontimeTalk = formatIdleTalkForPersona(item, "pm", "칼퇴봇");
    expect(ontimeTalk.title).toContain("칼퇴봇");
    expect(ontimeTalk.content).toContain("[유휴 상태 감지]");
  });
});
