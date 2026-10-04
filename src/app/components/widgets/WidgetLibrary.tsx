"use client";

import { useEffect, useMemo, useState } from "react";
import { UiIcon, type UiIconName } from "../UiIcon";
import { loadLS, saveLS } from "@/lib/localStore";
import { siteWidgetFolder, uniqueLibrarySites, WIDGET_FOLDERS, type LibrarySite, type WidgetFolderId } from "@/lib/widgets/library";
import styles from "./widgetLibrary.module.css";

interface LibraryItem { id: string; name: string; folder: WidgetFolderId; icon?: UiIconName; mark?: string; url?: string }
const TOOLS: LibraryItem[] = [
  { id: "weather", name: "실시간 날씨", folder: "tools", icon: "weather" },
  { id: "finance", name: "환율·금리", folder: "tools", icon: "finance" },
  { id: "commute", name: "스마트 길찾기", folder: "tools", icon: "route" },
  { id: "timer", name: "몰입 타이머", folder: "tools", icon: "timer" },
  { id: "calc", name: "빠른 계산기", folder: "tools", icon: "calculator" },
  { id: "shortcuts", name: "바로가기 즐겨찾기", folder: "tools", icon: "bookmark" },
  { id: "social", name: "소식 번들", folder: "bundles", icon: "inbox" },
  { id: "youtube", name: "유튜브 번들", folder: "bundles", icon: "video" },
  { id: "threads", name: "Threads 피드", folder: "bundles", mark: "@" },
];

function FolderIcon({ open }: { open: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d={open ? "M3 8V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 8h17l-3 11H3L1 8h2Z" : "M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3V7Z"} />
  </svg>;
}

interface Props {
  activeWidget: string | null;
  customWidgets: LibrarySite[];
  commuteEnabled: boolean;
  userScope?: string;
  onSelect: (id: string) => void;
}

export function WidgetLibrary({ activeWidget, customWidgets, commuteEnabled, userScope, onSelect }: Props) {
  const storageKey = `ct_widget_folders:${userScope ?? "guest"}`;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<WidgetFolderId[]>(() => {
    const saved = loadLS<unknown>(storageKey, ["bundles"]);
    return Array.isArray(saved) ? saved.filter((id): id is WidgetFolderId => WIDGET_FOLDERS.some((f) => f.id === id)) : ["bundles"];
  });
  const items = useMemo(() => [
    ...TOOLS.filter((item) => item.id !== "commute" || commuteEnabled),
    ...uniqueLibrarySites(customWidgets, activeWidget).map((site): LibraryItem => ({
      ...site, folder: siteWidgetFolder(site.url), mark: site.name.slice(0, 1),
    })),
  ], [customWidgets, activeWidget, commuteEnabled]);
  const active = items.find((item) => item.id === activeWidget);
  const activeFolder = active?.folder;
  useEffect(() => {
    if (!activeFolder) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setExpanded((previous) => {
        if (previous.includes(activeFolder)) return previous;
        const next = [...previous, activeFolder];
        saveLS(storageKey, next);
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [activeFolder, storageKey]);

  const visible = items.filter((item) => `${item.name} ${item.url ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const folders = WIDGET_FOLDERS.filter((folder) => visible.some((item) => item.folder === folder.id));
  const allExpanded = folders.every((folder) => expanded.includes(folder.id));
  function updateExpanded(next: WidgetFolderId[]) {
    setExpanded(next);
    saveLS(storageKey, next);
  }

  return <nav className={styles.library} aria-label="휴식·도구 폴더">
    <div className={styles.header}>
      <div className={styles.heading}><UiIcon name="widgets" size={15} /><span>휴식·도구 모음</span><span className={styles.total}>{items.length}</span></div>
      <button type="button" className={styles.textButton} disabled={Boolean(query.trim())} onClick={() => updateExpanded(allExpanded ? [] : folders.map((folder) => folder.id))}>
        {query.trim() ? "검색 결과" : allExpanded ? "모두 접기" : "모두 펼치기"}
      </button>
    </div>
    <div className={styles.toolbar}>
      <input type="search" aria-label="도구·사이트 검색" placeholder="도구나 사이트 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="button" className={styles.addButton} data-widget-id="add-custom" onClick={() => onSelect("add-custom")}><UiIcon name="plus" size={14} /><span>사이트 추가</span></button>
    </div>
    <div className={styles.folders}>
      {folders.map((folder) => {
        const children = visible.filter((item) => item.folder === folder.id);
        const open = Boolean(query.trim()) || expanded.includes(folder.id);
        return <section key={folder.id} className={`${styles.folder} ${activeFolder === folder.id ? styles.activeFolder : ""}`}>
          <button type="button" className={styles.folderButton} aria-expanded={open} aria-controls={`widget-folder-${folder.id}`} onClick={() => updateExpanded(expanded.includes(folder.id) ? expanded.filter((id) => id !== folder.id) : [...expanded, folder.id])}>
            <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true">›</span>
            <FolderIcon open={open} />
            <span className={styles.folderName}>{folder.name}</span>
            <span className={styles.folderCount}>{children.length}</span>
            {activeFolder === folder.id && <span className={styles.activeDot} aria-label="열린 도구가 있음" />}
          </button>
          <div id={`widget-folder-${folder.id}`} className={styles.children} hidden={!open}>
            {children.map((item) => <button key={item.id} type="button" data-widget-id={item.id} aria-pressed={activeWidget === item.id}
              className={`${styles.chip} ${activeWidget === item.id ? styles.selected : ""}`} onClick={() => onSelect(item.id)} title={item.url || `${item.name} 열기/닫기`}>
              {item.icon ? <UiIcon name={item.icon} size={15} /> : <span className={styles.mark} aria-hidden="true">{item.mark}</span>}
              <span>{item.name}</span>
            </button>)}
          </div>
        </section>;
      })}
      {folders.length === 0 && <p className={styles.empty}>일치하는 도구나 사이트가 없습니다.</p>}
    </div>
    {active && <div className={styles.breadcrumb}><span>{WIDGET_FOLDERS.find((f) => f.id === active.folder)?.name}</span><span aria-hidden="true">/</span><strong>{active.name}</strong></div>}
  </nav>;
}
