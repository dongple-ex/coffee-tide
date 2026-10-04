export type WidgetFolderId = "tools" | "bundles" | "reading" | "video";
export const WIDGET_FOLDERS: { id: WidgetFolderId; name: string; description: string }[] = [
  { id: "tools", name: "생활·도구", description: "날씨, 금융, 길찾기와 집중 도구" },
  { id: "bundles", name: "소식·번들", description: "관심 계정과 채널을 모아보기" },
  { id: "reading", name: "뉴스·읽을거리", description: "등록한 뉴스, 블로그와 RSS" },
  { id: "video", name: "영상·채널", description: "유튜브와 영상 사이트" },
];

export interface LibrarySite { id: string; name: string; url: string }

export function canonicalWidgetUrl(raw: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.port ? `:${url.port}` : ""}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch { return raw.trim(); }
}

/** 표시만 중복 제거한다. 활성 항목과 실제 저장 데이터는 보존한다. */
export function uniqueLibrarySites<T extends LibrarySite>(sites: T[], activeId: string | null): T[] {
  const unique = new Map<string, T>();
  for (const site of sites) {
    const key = canonicalWidgetUrl(site.url);
    if (!unique.has(key) || site.id === activeId) unique.set(key, site);
  }
  return [...unique.values()];
}

export function siteWidgetFolder(url: string): WidgetFolderId {
  let host = "";
  try { host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname; }
  catch { return "reading"; }
  return /(^|\.)(youtube\.com|youtu\.be|coupangplay\.com|netflix\.com|tving\.com|wavve\.com|chzzk\.naver\.com)$/.test(host)
    ? "video" : "reading";
}
