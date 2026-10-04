import { MAX_SOCIAL_SOURCES, type SocialBundle, type SocialSource, type SocialSourceKind, type SocialProvider } from "./types";

export function normalizeSocialTarget(provider: SocialProvider, kind: SocialSourceKind, raw: string): string {
  const input = raw.trim();
  if (!input) throw new Error("계정명이나 주소를 입력해 주세요.");
  if (provider === "site") {
    if (kind !== "url") throw new Error("사이트는 URL로 등록해 주세요.");
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("공개된 http/https 주소를 입력해 주세요.");
    url.hash = "";
    return url.href;
  }
  if (provider === "x" && kind === "search") {
    if (input.length > 256) throw new Error("X 검색어는 256자 이내로 입력해 주세요.");
    return input;
  }
  if (kind !== "account") throw new Error("이 소스는 계정명으로 등록해 주세요.");
  let username = input.replace(/^@/, "");
  if (/^(https?:\/\/|(?:www\.)?(?:x|twitter|instagram|threads)\.(?:com|net)\/)/i.test(input)) {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const allowed = provider === "x" ? ["x.com", "twitter.com"]
      : provider === "instagram" ? ["instagram.com"] : ["threads.net", "threads.com"];
    if (!allowed.includes(url.hostname.replace(/^www\./, "")) || url.username || url.password || url.port) {
      throw new Error("선택한 서비스의 계정 주소를 입력해 주세요.");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) throw new Error("게시물 주소 대신 계정 홈 주소를 입력해 주세요.");
    username = (parts[0] ?? "").replace(/^@/, "");
  }
  const valid = provider === "x" ? /^[A-Za-z0-9_]{1,15}$/ : /^[A-Za-z0-9._]{1,30}$/;
  if (!valid.test(username)) throw new Error("계정명 형식을 확인해 주세요. 예: @openai");
  return username.toLowerCase();
}

export function socialSourceKey(source: SocialSource): string {
  return `${source.provider}:${source.kind}:${source.target}`;
}

export function parseSocialSources(value: unknown): SocialSource[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SOCIAL_SOURCES) {
    throw new Error(`번들에 소스를 1~${MAX_SOCIAL_SOURCES}개 등록해 주세요.`);
  }
  const ids = new Set<string>();
  const keys = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("소스 형식을 확인해 주세요.");
    const source = item as Record<string, unknown>;
    if (!["x", "instagram", "threads", "site"].includes(String(source.provider))) throw new Error("지원하지 않는 서비스입니다.");
    const provider = source.provider as SocialProvider;
    const kind = source.kind as SocialSourceKind;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    if (!id || id.length > 100 || ids.has(id)) throw new Error("소스 식별자가 올바르지 않습니다.");
    if (typeof source.target !== "string" || source.target.length > 2048) throw new Error("소스 주소를 확인해 주세요.");
    const target = normalizeSocialTarget(provider, kind, source.target);
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 80) : "";
    const result = { id, provider, kind, target, name: name || target };
    const key = socialSourceKey(result);
    if (keys.has(key)) throw new Error("같은 소스가 중복 등록되어 있습니다.");
    ids.add(id);
    keys.add(key);
    return result;
  });
}

/** 손상되거나 이전 형식으로 저장된 항목은 서버 요청에 섞지 않는다. */
export function restoreSocialBundles(value: unknown): SocialBundle[] {
  if (!Array.isArray(value)) return [];
  const restored: SocialBundle[] = [];
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.name !== "string" || restored.some((b) => b.id === record.id)) continue;
    try {
      const sources = Array.isArray(record.sources) && record.sources.length === 0 ? [] : parseSocialSources(record.sources);
      restored.push({ id: record.id.slice(0, 100), name: record.name.slice(0, 80), sources });
    } catch { /* 유효한 다른 번들은 보존한다. */ }
  }
  return restored;
}
