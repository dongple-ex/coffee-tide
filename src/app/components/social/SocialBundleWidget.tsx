"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { loadLS, saveLS } from "@/lib/localStore";
import { normalizeSocialTarget, restoreSocialBundles, socialSourceKey } from "@/lib/social/sources";
import { MAX_SOCIAL_SOURCES, SOCIAL_PROVIDER_LABELS, type SocialBundle, type SocialBundleResponse, type SocialConnectionStatus, type SocialPost, type SocialProvider, type SocialSource, type SocialSourceKind } from "@/lib/social/types";
import { uniqueLibrarySites, type LibrarySite } from "@/lib/widgets/library";
import { UiIcon } from "../UiIcon";
import styles from "./socialBundleWidget.module.css";

interface Preferences { bundles: SocialBundle[]; readIds: string[]; savedPosts: SocialPost[] }
const SOURCE_OPTIONS: { value: string; label: string; provider: SocialProvider; kind: SocialSourceKind; placeholder: string }[] = [
  { value: "x-account", label: "X 계정", provider: "x", kind: "account", placeholder: "@openai 또는 x.com/openai" },
  { value: "x-search", label: "X 검색어", provider: "x", kind: "search", placeholder: "AI, #개발, from:openai 등" },
  { value: "instagram-account", label: "Instagram 프로 계정", provider: "instagram", kind: "account", placeholder: "@계정명 또는 instagram.com/계정명" },
  { value: "threads-account", label: "Threads 계정", provider: "threads", kind: "account", placeholder: "@계정명 또는 threads.com/@계정명" },
  { value: "site-url", label: "사이트·RSS·유튜브", provider: "site", kind: "url", placeholder: "https://사이트/feed 또는 유튜브 채널 주소" },
];

function restorePreferences(key: string): Preferences {
  const saved = loadLS<Partial<Preferences> | null>(key, null);
  const bundles = restoreSocialBundles(saved?.bundles);
  const savedPosts = Array.isArray(saved?.savedPosts) ? saved.savedPosts.filter((post) => {
    if (!post || !["id", "sourceId", "author", "title", "text", "url", "publishedAt"].every((key) => typeof post[key as keyof SocialPost] === "string") || !Object.hasOwn(SOCIAL_PROVIDER_LABELS, post.provider)) return false;
    try {
      const url = new URL(post.url);
      return url.protocol === "https:" && !url.username && !url.password && (!post.imageUrl || (typeof post.imageUrl === "string" && new URL(post.imageUrl).protocol === "https:"));
    } catch { return false; }
  }).slice(0, 100) : [];
  return {
    bundles: bundles.length ? bundles : [{ id: "social-default", name: "관심 소식", sources: [] }],
    readIds: Array.isArray(saved?.readIds) ? saved.readIds.filter((id) => typeof id === "string").slice(-1000) : [],
    savedPosts,
  };
}

function formatDate(value: string): string {
  if (!value) return "게시 시각 미제공";
  if (/^\d{1,2}\.\d{1,2}\.?$/.test(value.trim())) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (/^\d{4}[./-]\s*\d{1,2}[./-]\s*\d{1,2}\.?$/.test(value.trim())) return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SocialBundleWidget({ userScope, customWidgets, onNotify }: { userScope?: string; customWidgets: LibrarySite[]; onNotify: (message: string) => void }) {
  const storageKey = `ct_social_bundles:${userScope ?? "guest"}`;
  const [preferences, setPreferences] = useState(() => restorePreferences(storageKey));
  const [activeId, setActiveId] = useState(() => preferences.bundles[0].id);
  const [newBundleName, setNewBundleName] = useState("");
  const [sourceType, setSourceType] = useState(SOURCE_OPTIONS[0].value);
  const [target, setTarget] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [siteId, setSiteId] = useState("");
  const [connections, setConnections] = useState<SocialConnectionStatus | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [data, setData] = useState<SocialBundleResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const request = useRef<AbortController | null>(null);
  const bundle = preferences.bundles.find((b) => b.id === activeId) ?? preferences.bundles[0];
  const option = SOURCE_OPTIONS.find((o) => o.value === sourceType)!;
  const sites = uniqueLibrarySites(customWidgets, null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/social/bundle", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("서버 연결 상태를 확인하지 못했습니다. 로그인과 네트워크 상태를 확인해 주세요.");
      setConnections(await response.json() as SocialConnectionStatus);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setConnectionError(error instanceof Error ? error.message : "연결 상태 확인에 실패했습니다.");
    });
    return () => { controller.abort(); request.current?.abort(); };
  }, []);

  function persist(next: Preferences) {
    setPreferences(next);
    if (!saveLS(storageKey, next)) onNotify("소식 번들 설정을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
  }
  function invalidate() {
    request.current?.abort();
    setBusy(false);
    setData(null);
    setError("");
    setFilter("all");
  }
  function updateSources(sources: SocialSource[]) {
    invalidate();
    persist({ ...preferences, bundles: preferences.bundles.map((b) => b.id === bundle.id ? { ...b, sources } : b) });
  }
  function addSource(provider: SocialProvider, kind: SocialSourceKind, raw: string, name: string) {
    try {
      if (bundle.sources.length >= MAX_SOCIAL_SOURCES) throw new Error(`번들당 소스는 최대 ${MAX_SOCIAL_SOURCES}개입니다.`);
      const normalized = normalizeSocialTarget(provider, kind, raw);
      const source: SocialSource = { id: crypto.randomUUID(), provider, kind, target: normalized, name: name.trim() || (kind === "account" ? `@${normalized}` : normalized) };
      if (bundle.sources.some((s) => socialSourceKey(s) === socialSourceKey(source))) throw new Error("이미 이 번들에 등록된 소스입니다.");
      updateSources([...bundle.sources, source]);
      setTarget(""); setSourceName(""); setSiteId("");
      onNotify("소스를 등록했습니다. ‘새 소식 가져오기’를 누르면 실제 수집을 시도합니다.");
    } catch (error) { setError(error instanceof Error ? error.message : "소스 정보를 확인해 주세요."); }
  }
  async function fetchBundle(summarize = false) {
    if (!bundle.sources.length) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/social/bundle", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ sources: bundle.sources, bundleName: bundle.name, summarize }),
      });
      const result = await response.json() as SocialBundleResponse;
      if (!response.ok || !result.success) throw new Error(result.error || "소식을 가져오지 못했습니다.");
      if (!controller.signal.aborted) {
        setData(result);
        if (summarize && result.posts.length && !result.aiUsed) onNotify("AI 브리핑을 만들지 못했습니다. 수집된 원문 게시물을 확인해 주세요.");
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "소식을 가져오지 못했습니다.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  const posts = filter === "saved" ? preferences.savedPosts : (data?.posts ?? []).filter((post) =>
    filter === "unread" ? !preferences.readIds.includes(post.id) : filter === "all" || post.provider === filter,
  );
  const unreadCount = (data?.posts ?? []).filter((p) => !preferences.readIds.includes(p.id)).length;

  return <section className={styles.widget} aria-label="소식 번들">
    <div className={styles.header}>
      <div><h2><UiIcon name="inbox" size={18} />소식 번들</h2><p>관심 계정과 사이트의 새 글을 한곳에서</p></div>
      <span className={styles.privateNote}>이 브라우저에 저장</span>
    </div>
    <div className={styles.connections} aria-label="소식 API 설정 상태">
      <span>X · {connections ? connections.x ? "설정됨" : "연결 필요" : "확인 중"}</span>
      <span>Instagram · {connections ? connections.instagram ? "설정됨" : "연결 필요" : "확인 중"}</span>
      <span>Threads · 공개 페이지 수집</span>
    </div>
    {connections?.mockMode && <p className={styles.notice}>현재 Mock 모드입니다. 외부 게시물을 수집하지 않으며 샘플 소식도 표시하지 않습니다.</p>}
    {connectionError && <p className={styles.notice}>{connectionError}</p>}
    <div className={styles.bundleTabs} aria-label="소식 번들 선택">
      {preferences.bundles.map((b) => <button type="button" key={b.id} aria-pressed={bundle.id === b.id} className={bundle.id === b.id ? styles.active : ""} onClick={() => { invalidate(); setActiveId(b.id); }}>{b.name}<small>{b.sources.length}</small></button>)}
    </div>
    <form className={styles.newBundle} onSubmit={(e) => {
      e.preventDefault();
      const name = newBundleName.trim();
      if (!name) return;
      if (preferences.bundles.length >= 20) { setError("소식 번들은 최대 20개까지 만들 수 있습니다."); return; }
      if (preferences.bundles.some((b) => b.name === name)) { setError("같은 이름의 번들이 있습니다."); return; }
      const next: SocialBundle = { id: crypto.randomUUID(), name, sources: [] };
      invalidate(); persist({ ...preferences, bundles: [...preferences.bundles, next] }); setActiveId(next.id); setNewBundleName("");
    }}>
      <input aria-label="새 번들 이름" placeholder="새 번들 이름 · 예: AI 소식" maxLength={80} value={newBundleName} onChange={(e) => setNewBundleName(e.target.value)} />
      <button type="submit" disabled={!newBundleName.trim()}><UiIcon name="plus" size={14} />번들 만들기</button>
    </form>
    <details className={styles.sourceEditor} open={sourcesExpanded} onToggle={(e) => setSourcesExpanded(e.currentTarget.open)}>
      <summary>소스 관리 <span>{bundle.sources.length}/{MAX_SOCIAL_SOURCES}</span></summary>
      <ul className={styles.sourceList}>
        {bundle.sources.map((source) => <li key={source.id}><span className={styles.provider}>{SOCIAL_PROVIDER_LABELS[source.provider]}</span><span title={source.target}>{source.name}</span>
          <button type="button" aria-label={`${SOCIAL_PROVIDER_LABELS[source.provider]} ${source.name} 소스 삭제`} onClick={() => updateSources(bundle.sources.filter((s) => s.id !== source.id))}><UiIcon name="close" size={13} /></button></li>)}
      </ul>
      <form className={styles.sourceForm} onSubmit={(e) => { e.preventDefault(); addSource(option.provider, option.kind, target, sourceName); }}>
        <select aria-label="소스 종류" value={sourceType} onChange={(e) => { setSourceType(e.target.value); setTarget(""); setError(""); }}>{SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <input aria-label="소스 계정·검색어·주소" placeholder={option.placeholder} value={target} maxLength={2048} onChange={(e) => setTarget(e.target.value)} required />
        <input aria-label="소스 표시 이름" placeholder="표시 이름 (선택)" value={sourceName} maxLength={80} onChange={(e) => setSourceName(e.target.value)} />
        <button type="submit" disabled={!target.trim() || bundle.sources.length >= MAX_SOCIAL_SOURCES}>소스 추가</button>
      </form>
      {option.provider === "instagram" && <p className={styles.hint}>공개 비즈니스·크리에이터 계정만 조회합니다. 개인·비공개 계정과 팔로잉 홈 피드는 지원하지 않습니다.</p>}
      {sites.length > 0 && <div className={styles.importSite}>
        <select aria-label="기존 등록 사이트" value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">등록한 사이트에서 선택</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
        <button type="button" disabled={!siteId || bundle.sources.length >= MAX_SOCIAL_SOURCES} onClick={() => { const site = sites.find((s) => s.id === siteId); if (site) addSource("site", "url", site.url, site.name); }}>번들에 담기</button>
      </div>}
      {preferences.bundles.length > 1 && <button type="button" className={styles.deleteBundle} onClick={() => {
        if (!window.confirm(`‘${bundle.name}’ 번들을 삭제할까요? 저장한 게시물은 남습니다.`)) return;
        const bundles = preferences.bundles.filter((b) => b.id !== bundle.id);
        invalidate(); persist({ ...preferences, bundles }); setActiveId(bundles[0].id);
      }}>현재 번들 삭제</button>}
    </details>
    <div className={styles.actions}>
      <button type="button" className={styles.fetchButton} disabled={busy || !bundle.sources.length || connections?.mockMode} onClick={() => void fetchBundle()}><UiIcon name="refresh" size={14} />{busy ? "확인 중…" : "새 소식 가져오기"}</button>
      <button type="button" disabled={busy || !data?.posts.length} onClick={() => void fetchBundle(true)}><UiIcon name="spark" size={14} />AI 브리핑</button>
    </div>
    <p className={styles.hint}>버튼을 누를 때 수집합니다. X 조회에는 API 비용이 발생하며, 같은 소스는 10분간 캐시를 사용합니다.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {data && <ul className={styles.statusList} aria-label="소스별 수집 결과">{data.sources.map((result) => {
      const source = bundle.sources.find((source) => source.id === result.sourceId);
      return <li key={result.sourceId} className={result.status === "ok" ? styles.statusOk : styles.statusWarning}><strong>{source?.name}</strong><span>{result.message}{result.cached ? " · 캐시" : ""}{result.fetchedAt ? ` · ${formatDate(result.fetchedAt)}` : ""}</span></li>;
    })}</ul>}
    {data?.briefing && data.aiUsed && <aside className={styles.briefing}><small>AI 브리핑 · 수집된 게시물 기준</small><strong>{data.briefing.headline}</strong><ul>{data.briefing.keyPoints.map((point, i) => <li key={i}>{point}</li>)}</ul></aside>}
    <div className={styles.filters} aria-label="게시물 필터">
      {[{ id: "all", name: "전체" }, { id: "unread", name: `안 읽음 ${unreadCount}` }, { id: "saved", name: `저장 ${preferences.savedPosts.length}` }, ...Object.entries(SOCIAL_PROVIDER_LABELS).map(([id, name]) => ({ id, name }))].map((item) =>
        <button type="button" key={item.id} aria-pressed={filter === item.id} className={filter === item.id ? styles.active : ""} onClick={() => setFilter(item.id)}>{item.name}</button>)}
    </div>
    {posts.length === 0 ? <div className={styles.empty}><UiIcon name="inbox" size={25} /><strong>{filter === "saved" ? "저장한 게시물이 없습니다" : !bundle.sources.length ? "관심 계정이나 사이트를 담아보세요" : data ? "표시할 게시물이 없습니다" : "등록한 소스에서 소식을 가져와 보세요"}</strong><p>{data && filter !== "saved" ? "위의 소스별 결과에서 연결 상태와 수집 결과를 확인해 주세요." : "소스 등록만으로 외부 게시물을 자동 수집하지 않습니다."}</p></div> :
      <div className={styles.posts}>{posts.map((post) => {
        const read = preferences.readIds.includes(post.id);
        const saved = preferences.savedPosts.some((p) => p.id === post.id);
        return <article key={post.id} className={`${styles.post} ${read ? styles.read : ""}`}>
          <div className={styles.postMeta}><span className={styles.provider}>{SOCIAL_PROVIDER_LABELS[post.provider]}</span><strong>{post.author}</strong><span>{formatDate(post.publishedAt)}</span></div>
          {post.provider === "site" && <h3>{post.title}</h3>}
          {post.imageUrl && <Image src={post.imageUrl} alt="게시물에 포함된 이미지" width={400} height={240} unoptimized className={styles.postImage} />}
          {post.provider === "site" && <span className={styles.excerptLabel}>본문 발췌 · 전체 내용은 원문에서 확인</span>}
          <p className={styles.postText}>{post.provider === "site" && post.text.length > 500 ? `${post.text.slice(0, 500)}…` : post.text || post.title}</p>
          <div className={styles.postActions}>
            <a href={post.url} target="_blank" rel="noopener noreferrer" onClick={() => { if (!read) persist({ ...preferences, readIds: [...preferences.readIds, post.id].slice(-1000) }); }}>원문 보기<UiIcon name="external-link" size={12} /></a>
            <button type="button" aria-pressed={read} onClick={() => persist({ ...preferences, readIds: read ? preferences.readIds.filter((id) => id !== post.id) : [...preferences.readIds, post.id].slice(-1000) })}>{read ? "읽음" : "읽음 표시"}</button>
            <button type="button" aria-pressed={saved} onClick={() => {
              if (!saved && preferences.savedPosts.length >= 100) { onNotify("저장한 게시물은 최대 100개입니다. 기존 저장을 해제한 후 다시 저장해 주세요."); return; }
              persist({ ...preferences, savedPosts: saved ? preferences.savedPosts.filter((p) => p.id !== post.id) : [post, ...preferences.savedPosts] });
            }}><UiIcon name="bookmark" size={12} />{saved ? "저장됨" : "저장"}</button>
          </div>
        </article>;
      })}</div>}
  </section>;
}
