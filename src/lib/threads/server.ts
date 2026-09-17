import { ThreadsChannel, ThreadsPost } from "../types/threads";

const FETCH_TIMEOUT_MS = 12_000;

/**
 * 다양한 형태의 사용자 입력(@username, threads.net URL 등)에서 순수 username 추출
 */
export function normalizeThreadsUsername(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // 1. @username 형태
  if (trimmed.startsWith("@")) {
    const raw = trimmed.slice(1);
    return /^[a-zA-Z0-9._]+$/.test(raw) ? raw : null;
  }

  // 2. URL 형태 (threads.net 또는 threads.com)
  if (trimmed.includes("threads.net") || trimmed.includes("threads.com")) {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const parts = url.pathname.split("/").filter(Boolean);
      for (const part of parts) {
        if (part.startsWith("@")) {
          const raw = part.slice(1);
          return /^[a-zA-Z0-9._]+$/.test(raw) ? raw : null;
        }
      }
      if (parts.length > 0 && /^[a-zA-Z0-9._]+$/.test(parts[0])) {
        return parts[0];
      }
    } catch {
      // URL 파싱 실패 시 fallback
    }
  }

  // 3. 순수 username 형태
  if (/^[a-zA-Z0-9._]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Jina Reader 마크다운 응답을 파싱하여 ThreadsChannel 및 ThreadsPost 목록으로 변환
 */
export function parseThreadsMarkdown(markdown: string, defaultUsername: string): ThreadsChannel {
  const profileUrl = `https://www.threads.net/@${defaultUsername}`;
  if (!markdown || markdown.trim().length === 0) {
    return {
      username: defaultUsername,
      displayName: defaultUsername,
      profileUrl,
      posts: [],
    };
  }

  // 1. 프로필 기본 정보 파싱
  let displayName = defaultUsername;
  let avatarUrl: string | undefined;
  let bio = "";

  const titleMatch = markdown.match(/^##\s+([^\r\n]+)/m);
  if (titleMatch) {
    displayName = titleMatch[1].trim();
  }

  const avatarMatch = markdown.match(/!\[Image\s*\d*:[^\]]*profile picture[^\]]*\]\((https:\/\/[^)\s]+)\)/i);
  if (avatarMatch) {
    avatarUrl = avatarMatch[1];
  }

  // 2. 게시물 단위 분할
  // Threads 마크다운에서 각 게시물은 아바타 링크 [![Image...](...)](https://www.threads.net/@...) 로 시작함
  const postDelimiterRegex = /\[!\[Image[^\]]*\]\([^)]+\)\]\(https:\/\/www\.threads\.net\/@[^)]+\)/g;
  const sections = markdown.split(postDelimiterRegex);

  // 첫 번째 섹션(헤더/바이오) 처리
  if (sections.length > 0) {
    const headerLines = sections[0].split("\n").map((l) => l.trim()).filter(Boolean);
    const bioCandidates = headerLines.filter(
      (line) =>
        !line.startsWith("##") &&
        !line.startsWith("!") &&
        !line.startsWith("[") &&
        line !== defaultUsername &&
        line !== "+ 1" &&
        !/^\d+$/.test(line)
    );
    if (bioCandidates.length > 0) {
      bio = bioCandidates.join(" ");
    }
  }

  const posts: ThreadsPost[] = [];
  const postSections = sections.slice(1);

  for (let i = 0; i < postSections.length; i++) {
    const rawSection = postSections[i].trim();
    if (!rawSection) continue;

    // 해당 섹션 내의 라인들 분석
    const lines = rawSection.split("\n").map((l) => l.trim());
    const textLines: string[] = [];
    const images: string[] = [];
    let permalink = profileUrl;
    const metrics: string[] = [];

    for (const line of lines) {
      if (!line) continue;

      // 이미지 마크다운 추출
      const imgMatch = line.match(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/);
      if (imgMatch) {
        images.push(imgMatch[1]);
        continue;
      }

      // 게시물 permalink 링크 추출 (/post/...)
      const linkMatch = line.match(/\((https:\/\/www\.threads\.net\/@[^/]+\/post\/[a-zA-Z0-9_-]+(?:media)?)\)/);
      if (linkMatch) {
        permalink = linkMatch[1];
      }

      // 숫자/지표 (좋아요, 리포스트, 댓글 등 e.g. "1.3K", "346")
      if (/^[\d.]+[KMBkmb]?$/.test(line)) {
        metrics.push(line);
        continue;
      }

      // 텍스트 본문 (마크다운 링크나 일반 글)
      if (!line.startsWith("[![") && !line.startsWith("##")) {
        textLines.push(line);
      }
    }

    const postText = textLines.join("\n").trim();
    if (postText || images.length > 0) {
      posts.push({
        id: `post-${defaultUsername}-${i}-${Date.now().toString(36)}`,
        text: postText || "미디어 게시물",
        authorUsername: defaultUsername,
        authorName: displayName,
        authorAvatar: avatarUrl,
        publishedAt: "최신",
        url: permalink,
        images,
        likeCount: metrics[0],
        replyCount: metrics[1],
        repostCount: metrics[2],
      });
    }
  }

  return {
    username: defaultUsername,
    displayName,
    bio: bio || undefined,
    avatarUrl,
    profileUrl,
    posts: posts.slice(0, 10), // 최대 10개
  };
}

/**
 * 단일 Threads 채널 최신 피드 수집
 */
export async function fetchThreadsChannel(input: string): Promise<ThreadsChannel> {
  const username = normalizeThreadsUsername(input);
  if (!username) {
    throw new Error(`올바른 Threads 계정 형식이 아닙니다: ${input}`);
  }

  const profileTarget = `https://www.threads.net/@${username}`;
  const readerUrl = `https://r.jina.ai/${profileTarget}`;

  try {
    const res = await fetch(readerUrl, {
      headers: {
        Accept: "application/json",
        "X-Target-Selector": "main",
      },
      next: { revalidate: 300 }, // 5분 캐시
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        username,
        displayName: username,
        profileUrl: profileTarget,
        posts: [],
        error: `Threads 채널 응답 오류 (${res.status})`,
      };
    }

    const json = (await res.json()) as { data?: { content?: string } };
    const content = json.data?.content || "";

    const channel = parseThreadsMarkdown(content, username);
    return channel;
  } catch (err) {
    const message = err instanceof Error ? err.message : "수집 실패";
    return {
      username,
      displayName: username,
      profileUrl: profileTarget,
      posts: [],
      error: `Threads 피드를 읽어오는 중 오류가 발생했습니다: ${message}`,
    };
  }
}
