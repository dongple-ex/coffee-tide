import { describe, it, expect } from "vitest";
import { normalizeThreadsUsername, parseThreadsMarkdown } from "./server";

describe("Threads server parser", () => {
  describe("normalizeThreadsUsername", () => {
    it("normalizes @username", () => {
      expect(normalizeThreadsUsername("@zuck")).toBe("zuck");
      expect(normalizeThreadsUsername("  @openai  ")).toBe("openai");
      expect(normalizeThreadsUsername("@coffee_tide.kr")).toBe("coffee_tide.kr");
    });

    it("normalizes threads.net URLs", () => {
      expect(normalizeThreadsUsername("https://www.threads.net/@zuck")).toBe("zuck");
      expect(normalizeThreadsUsername("https://threads.net/@openai/post/12345")).toBe("openai");
      expect(normalizeThreadsUsername("threads.net/@google")).toBe("google");
    });

    it("normalizes threads.com URLs", () => {
      expect(normalizeThreadsUsername("https://www.threads.com/@zuck")).toBe("zuck");
    });

    it("accepts plain valid usernames", () => {
      expect(normalizeThreadsUsername("zuck")).toBe("zuck");
      expect(normalizeThreadsUsername("meta_ai")).toBe("meta_ai");
    });

    it("rejects invalid inputs", () => {
      expect(normalizeThreadsUsername("")).toBeNull();
      expect(normalizeThreadsUsername("invalid user with space")).toBeNull();
      expect(normalizeThreadsUsername("@invalid!character")).toBeNull();
    });
  });

  describe("parseThreadsMarkdown", () => {
    it("parses profile info and posts from sample markdown", () => {
      const sample = `
## Mark Zuckerberg

zuck

![Image 1: zuck's profile picture](https://cdn.example.com/avatar.jpg)

Mostly AI and Jiu Jitsu takes

[![Image 2: zuck's profile picture](https://cdn.example.com/avatar.jpg)](https://www.threads.net/@zuck)

First test post from Mark! Check out https://meta.com

1.2K

300

50

[![Image 3: zuck's profile picture](https://cdn.example.com/avatar.jpg)](https://www.threads.net/@zuck)

Second post with an image.

![Post Image](https://cdn.example.com/photo.jpg)

850
      `;

      const result = parseThreadsMarkdown(sample, "zuck");
      expect(result.username).toBe("zuck");
      expect(result.displayName).toBe("Mark Zuckerberg");
      expect(result.avatarUrl).toBe("https://cdn.example.com/avatar.jpg");
      expect(result.bio).toContain("Mostly AI and Jiu Jitsu takes");
      expect(result.posts.length).toBe(2);

      expect(result.posts[0].text).toContain("First test post from Mark!");
      expect(result.posts[0].likeCount).toBe("1.2K");

      expect(result.posts[1].text).toContain("Second post with an image.");
      expect(result.posts[1].images).toContain("https://cdn.example.com/photo.jpg");
    });
  });
});
