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

    it("parses real-world Jina Threads format with usernames with dots and relative times", () => {
      const sample = `
# [choi.openai](https://www.threads.net/@choi.openai)

# CHOI

choi.openai

![Image 1: choi.openai's profile picture](https://cdn.example.com/choi_avatar.jpg)

■ 대한민국 최고의 AI 채널 , e/acc
genexis.ai

[![Image 2: choi.openai's profile picture](https://cdn.example.com/choi_avatar.jpg)](https://www.threads.net/@choi.openai)

[choi.openai](https://www.threads.net/@choi.openai)

[14m](https://www.threads.net/@choi.openai/post/DdgsjlMj3y3)

최근 서울대 학생들의 AI 사용 실태가 큰 화제입니다.

Translate

10

13

1

[![Image 3: choi.openai's profile picture](https://cdn.example.com/choi_avatar.jpg)](https://www.threads.net/@choi.openai)

[choi.openai](https://www.threads.net/@choi.openai)

[1h](https://www.threads.net/@choi.openai/post/DdgskJlj6kj)

1/ 9월 18일 a16z가 미국 소비자의 AI 결제 실태를 공개했습니다.

Translate

[![Image 4](https://cdn.example.com/post_chart.jpg)](https://www.threads.net/@choi.openai/post/DdgskJlj6kj/media)

4

2
      `;

      const result = parseThreadsMarkdown(sample, "choi.openai");
      expect(result.username).toBe("choi.openai");
      expect(result.displayName).toBe("CHOI");
      expect(result.avatarUrl).toBe("https://cdn.example.com/choi_avatar.jpg");
      expect(result.bio).toContain("대한민국 최고의 AI 채널");
      expect(result.posts.length).toBe(2);

      // First post
      expect(result.posts[0].text).toContain("최근 서울대 학생들의 AI 사용 실태가 큰 화제입니다.");
      expect(result.posts[0].publishedAt).toBe("14m");
      expect(result.posts[0].url).toBe("https://www.threads.net/@choi.openai/post/DdgsjlMj3y3");
      expect(result.posts[0].likeCount).toBe("10");
      expect(result.posts[0].replyCount).toBe("13");
      expect(result.posts[0].repostCount).toBe("1");

      // Second post with image
      expect(result.posts[1].text).toContain("1/ 9월 18일 a16z가 미국 소비자의 AI 결제 실태를 공개했습니다.");
      expect(result.posts[1].publishedAt).toBe("1h");
      expect(result.posts[1].url).toBe("https://www.threads.net/@choi.openai/post/DdgskJlj6kj");
      expect(result.posts[1].images).toContain("https://cdn.example.com/post_chart.jpg");
      expect(result.posts[1].likeCount).toBe("4");
      expect(result.posts[1].replyCount).toBe("2");
    });
  });
});
