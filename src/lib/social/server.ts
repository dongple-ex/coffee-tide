import { createHash } from "node:crypto";
import { collectSiteContent } from "../news/collect";
import { fetchThreadsChannel } from "../threads/server";
import { socialSourceKey } from "./sources";
import type { SocialConnectionStatus, SocialPost, SocialSource, SocialSourceResult } from "./types";

const CACHE_TTL_MS = 10 * 60 * 1000;
const POST_LIMIT = 10;
type Collected = { posts: SocialPost[]; result: SocialSourceResult };
const cache = new Map<string, { value: Collected; at: number }>();
const pending = new Map<string, Promise<Collected>>();
let xBudget = { day: "", count: 0 };

export function socialConnectionStatus(): SocialConnectionStatus {
  const mockMode = process.env.MOCK_MODE === "true";
  return {
    x: !mockMode && Boolean(process.env.X_BEARER_TOKEN?.trim()),
    instagram: !mockMode && Boolean(process.env.INSTAGRAM_ACCESS_TOKEN?.trim() && process.env.INSTAGRAM_USER_ID?.trim()),
    mockMode,
  };
}

class ProviderError extends Error {}

function reserveXRequest(): void {
  const day = new Date().toISOString().slice(0, 10);
  if (xBudget.day !== day) xBudget = { day, count: 0 };
  const configured = Number(process.env.X_FEED_DAILY_REQUEST_LIMIT ?? 50);
  const limit = Number.isFinite(configured) ? Math.max(0, Math.min(1000, Math.floor(configured))) : 50;
  if (xBudget.count >= limit) throw new ProviderError("이 서버의 오늘 X 조회 한도에 도달했습니다. 내일 다시 확인해 주세요.");
  xBudget.count += 1;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function string(value: unknown): string { return typeof value === "string" ? value : ""; }

/** 외부 응답의 URL도 브라우저에 전달하기 전에 프로토콜을 제한한다. */
export function safeSocialUrl(value: unknown): string | undefined {
  try {
    const url = new URL(string(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

async function providerJson(url: URL, token: string, provider: "X" | "Instagram"): Promise<Record<string, unknown>> {
  if (provider === "X") reserveXRequest();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    if (response.status === 429) throw new ProviderError(`${provider} 조회 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.`);
    if (response.status === 401) throw new ProviderError(`${provider} 연결 토큰이 만료되었거나 올바르지 않습니다. 서버 연결 설정을 확인해 주세요.`);
    if (response.status === 403) throw new ProviderError(`${provider} 조회 권한이 없습니다. 계정 공개 여부와 앱 권한을 확인해 주세요.`);
    if (response.status === 402) throw new ProviderError("X API 크레딧과 지출 한도를 확인해 주세요.");
    throw new ProviderError(`${provider}에서 게시물을 가져오지 못했습니다 (HTTP ${response.status}).`);
  }
  const body = record(await response.json());
  if (body.error) throw new ProviderError("Instagram 조회에 실패했습니다. 프로 계정 여부, Facebook 페이지 연결과 Business Discovery 권한을 확인해 주세요.");
  return body;
}

export function parseXPosts(body: Record<string, unknown>, source: SocialSource): SocialPost[] {
  const users = records(record(body.includes).users);
  const media = records(record(body.includes).media);
  return records(body.data).slice(0, POST_LIMIT).flatMap((item) => {
    const id = string(item.id);
    const user = users.find((user) => user.id === item.author_id);
    const author = string(user?.username) || (source.kind === "account" ? source.target : "X");
    const text = string(record(item.note_tweet).text) || string(item.text);
    if (!/^\d+$/.test(id) || !text) return [];
    const keys = record(item.attachments).media_keys;
    const image = media.find((m) => Array.isArray(keys) && keys.includes(m.media_key));
    return [{
      id: `x:${id}`, sourceId: source.id, provider: "x" as const,
      author, title: text.slice(0, 100), text, publishedAt: string(item.created_at),
      url: `https://x.com/i/web/status/${id}`,
      imageUrl: safeSocialUrl(image?.url) || safeSocialUrl(image?.preview_image_url),
    }];
  });
}

async function fetchX(source: SocialSource): Promise<SocialPost[]> {
  const token = process.env.X_BEARER_TOKEN!.trim();
  let endpoint: URL;
  if (source.kind === "search") {
    endpoint = new URL("https://api.x.com/2/tweets/search/recent");
    endpoint.searchParams.set("query", source.target);
    endpoint.searchParams.set("sort_order", "recency");
  } else {
    const userBody = await providerJson(new URL(`https://api.x.com/2/users/by/username/${source.target}`), token, "X");
    const id = string(record(userBody.data).id);
    if (!/^\d+$/.test(id)) throw new ProviderError("X 계정을 찾지 못했습니다. 계정명을 확인해 주세요.");
    endpoint = new URL(`https://api.x.com/2/users/${id}/tweets`);
    endpoint.searchParams.set("exclude", "retweets,replies");
  }
  endpoint.searchParams.set("max_results", String(POST_LIMIT));
  endpoint.searchParams.set("tweet.fields", "created_at,author_id,attachments,note_tweet");
  endpoint.searchParams.set("expansions", "author_id,attachments.media_keys");
  endpoint.searchParams.set("user.fields", "name,username");
  endpoint.searchParams.set("media.fields", "url,preview_image_url,type");
  const body = await providerJson(endpoint, token, "X");
  if (Array.isArray(body.errors) && !Array.isArray(body.data)) throw new ProviderError("X 게시물을 읽지 못했습니다. 계정과 조회 권한을 확인해 주세요.");
  return parseXPosts(body, source);
}

export function parseInstagramPosts(body: Record<string, unknown>, source: SocialSource): SocialPost[] {
  const discovered = record(body.business_discovery);
  return records(record(discovered.media).data).slice(0, POST_LIMIT).flatMap((item) => {
    const id = string(item.id);
    const url = safeSocialUrl(item.permalink);
    if (!id || !url || !/(^|\.)instagram\.com$/.test(new URL(url).hostname)) return [];
    const text = string(item.caption);
    const mediaType = string(item.media_type);
    return [{
      id: `instagram:${id}`, sourceId: source.id, provider: "instagram" as const,
      author: string(discovered.username) || source.target,
      title: text.slice(0, 100) || (mediaType === "VIDEO" ? "Instagram 영상" : "Instagram 게시물"),
      text, url, publishedAt: string(item.timestamp),
      imageUrl: safeSocialUrl(mediaType === "VIDEO" ? item.thumbnail_url : item.media_url),
    }];
  });
}

async function fetchInstagram(source: SocialSource): Promise<SocialPost[]> {
  const userId = process.env.INSTAGRAM_USER_ID!.trim();
  if (!/^\d+$/.test(userId)) throw new ProviderError("Instagram 연결 계정 ID 설정을 확인해 주세요.");
  const version = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || "v25.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new ProviderError("Instagram API 버전 설정을 확인해 주세요.");
  const endpoint = new URL(`https://graph.facebook.com/${version}/${userId}`);
  endpoint.searchParams.set("fields", `business_discovery.username(${source.target}){username,media.limit(${POST_LIMIT}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}`);
  const body = await providerJson(endpoint, process.env.INSTAGRAM_ACCESS_TOKEN!.trim(), "Instagram");
  if (!body.business_discovery) throw new ProviderError("이 Instagram 계정을 조회할 수 없습니다. 공개 비즈니스·크리에이터 계정인지 확인해 주세요.");
  return parseInstagramPosts(body, source);
}

async function fetchSource(source: SocialSource): Promise<Collected> {
  const status = socialConnectionStatus();
  const base = { sourceId: source.id, provider: source.provider };
  if (status.mockMode) return { posts: [], result: { ...base, status: "not_configured", message: "현재 Mock 모드라 외부 소식을 수집하지 않습니다. 실제 수집은 서버의 Mock 모드 해제 후 사용할 수 있습니다." } };
  if (source.provider === "x" && !status.x) return { posts: [], result: { ...base, status: "not_configured", message: "X API 연결이 필요합니다. 서버에 Bearer Token을 설정해 주세요." } };
  if (source.provider === "instagram" && !status.instagram) return { posts: [], result: { ...base, status: "not_configured", message: "Instagram API 연결이 필요합니다. Facebook Login 토큰과 연결된 프로 계정 ID를 서버에 설정해 주세요." } };
  try {
    let posts: SocialPost[];
    if (source.provider === "x") posts = await fetchX(source);
    else if (source.provider === "instagram") posts = await fetchInstagram(source);
    else if (source.provider === "threads") {
      const channel = await fetchThreadsChannel(source.target);
      if (channel.error) throw new ProviderError("Threads 공개 페이지를 읽지 못했습니다. 계정명이나 공개 여부를 확인하고 다시 시도해 주세요.");
      posts = channel.posts.flatMap((post) => {
        const url = safeSocialUrl(post.url);
        if (!url) return [];
        return [{ id: `threads:${url}`, sourceId: source.id, provider: "threads" as const,
          author: channel.displayName, title: post.text.slice(0, 100), text: post.text, url,
          publishedAt: post.publishedAt, imageUrl: safeSocialUrl(post.images[0]) }];
      });
    } else {
      const collected = await collectSiteContent({ url: source.target, siteName: source.name, limit: POST_LIMIT, deep: true });
      if (!collected.ok) throw new ProviderError(collected.reason || "사이트에서 최신 글을 가져오지 못했습니다.");
      posts = collected.items.map((item) => ({
        id: `site:${item.url}`, sourceId: source.id, provider: "site" as const,
        author: collected.siteName, title: item.title, text: item.text.replace(/\]\]>\s*$/, "").trim().slice(0, 6000), url: item.url, publishedAt: item.date,
      }));
    }
    return { posts, result: { ...base, status: posts.length ? "ok" : "empty", fetchedAt: new Date().toISOString(),
      message: posts.length ? `${posts.length}개 게시물 확인` : "가져올 수 있는 게시물이 없습니다." } };
  } catch (error) {
    return { posts: [], result: { ...base, status: "error", message: error instanceof ProviderError ? error.message : "소식 수집이 지연되거나 실패했습니다. 잠시 후 다시 확인해 주세요." } };
  }
}

/** 읽기 전용 공개 콘텐츠 캐시. 키에 자격증명 해시를 포함해 설정 변경 시 재사용을 막는다. */
export async function collectSocialSource(source: SocialSource): Promise<Collected> {
  const credentials = [process.env.MOCK_MODE, process.env.X_BEARER_TOKEN, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_USER_ID, process.env.INSTAGRAM_GRAPH_API_VERSION];
  const key = `${socialSourceKey(source)}:${createHash("sha256").update(JSON.stringify(credentials)).digest("hex")}`;
  const now = Date.now();
  for (const [key, entry] of cache) if (now - entry.at >= CACHE_TTL_MS) cache.delete(key);
  const cached = cache.get(key);
  const relabel = (value: Collected, cached = false): Collected => ({
    posts: value.posts.map((post) => ({ ...post, sourceId: source.id })),
    result: { ...value.result, sourceId: source.id, cached },
  });
  if (cached) return relabel(cached.value, true);
  const existing = pending.get(key);
  if (existing) return relabel(await existing, true);
  const task = fetchSource(source);
  pending.set(key, task);
  try {
    const value = await task;
    if (value.result.status === "ok" || value.result.status === "empty") {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, at: Date.now() });
    }
    return relabel(value);
  } finally { pending.delete(key); }
}
