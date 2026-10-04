export type SocialProvider = "x" | "instagram" | "threads" | "site";
export type SocialSourceKind = "account" | "search" | "url";

export interface SocialSource {
  id: string;
  provider: SocialProvider;
  kind: SocialSourceKind;
  target: string;
  name: string;
}

export interface SocialBundle {
  id: string;
  name: string;
  sources: SocialSource[];
}

export interface SocialPost {
  id: string;
  sourceId: string;
  provider: SocialProvider;
  author: string;
  title: string;
  text: string;
  url: string;
  publishedAt: string;
  imageUrl?: string;
}

export interface SocialSourceResult {
  sourceId: string;
  provider: SocialProvider;
  status: "ok" | "empty" | "not_configured" | "error";
  message: string;
  fetchedAt?: string;
  cached?: boolean;
}

export interface SocialBundleResponse {
  success: boolean;
  posts: SocialPost[];
  sources: SocialSourceResult[];
  briefing?: { headline: string; keyPoints: string[] } | null;
  aiUsed?: boolean;
  error?: string;
}

export interface SocialConnectionStatus {
  x: boolean;
  instagram: boolean;
  mockMode: boolean;
}

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  x: "X", instagram: "Instagram", threads: "Threads", site: "사이트·RSS",
};
export const MAX_SOCIAL_SOURCES = 6;
