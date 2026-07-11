// coffeTide 대시보드 — 정본 요구사항 반영:
// G1 manual/paste 1급 소스, G2 무연동 빈 화면 안내, G3 무연동 Copilot,
// G4 서버측 날짜/출처 근거, G6 MarkdownLite 렌더링, E1 aria-label,
// 팔로업 에스컬레이션·dismiss(D3 정리)·규칙 빌더(as-built §5), 폴링 visibility 일시정지(8-mobile §5).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyRules, AutomationRule, ProcessedData } from "@/lib/automation/rules";
import {
  CATEGORY_LABELS,
  ConnectionState,
  MailsResponse,
  SOURCE_LABELS,
  UnifiedData,
} from "@/lib/types/unified";
import CafeWait from "./components/cafeWait";
import IcedAmericano from "./components/icedAmericano";
import MarkdownLite from "./components/markdownLite";
import styles from "./page.module.css";

const LS_MANUAL = "ct_manual_items";
const LS_RULES = "tp_automation_rules";
const LS_DISMISSED = "tp_dismissed_ids";
const LS_FOLLOWUP = "tp_followup_hours";
const LS_BRIEF_TIME = "ct_brief_time";
const LS_THEME = "ct_theme";
const POLL_MS = 30_000;

type Theme = "dark" | "light" | "coffee" | "mega" | "kustom";

// 카페 주문 컨셉 대기 멘트 (cafeWait.tsx가 순차 재생)
const LOADING_WAIT_STEPS = [
  "주문 접수! ☕ 아아 내리는 중…",
  "🧊 얼음 넣는 중…",
  "🔔 곧 나옵니다!",
];
const COPILOT_WAIT_STEPS = [
  "주문 받았어요! ☕ 원두 가는 중…",
  "샷 내리는 중…",
  "🧊 얼음 동동 띄우는 중…",
  "🔔 다 되면 바로 갖다드릴게요!",
];
const PASTE_WAIT_STEPS = [
  "☕ 원두 고르는 중…",
  "할 일만 쏙 담는 중…",
  "🔔 곧 나와요!",
];
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const view = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

type Phase = "loading" | "landing" | "ready";

interface CopilotMessage {
  role: "user" | "ai";
  text: string;
  fallback?: boolean;
}

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 치명적이지 않음
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

const RESPONSE_NEEDED = new Set(["urgent", "approval_required", "action_required"]);
const TODO_CATS = new Set(["urgent", "approval_required", "action_required", "meeting"]);

type ViewItem = ProcessedData & { overdue: number };

/** 병합 파이프라인 (00-current-state §4.3) — 수동+외부 병합 → 규칙 → 팔로업 에스컬레이션 */
function buildMergedView(
  manualItems: UnifiedData[],
  serverMails: UnifiedData[],
  dismissed: string[],
  rules: AutomationRule[],
  followupHours: number
): ViewItem[] {
  const manualIds = new Set(manualItems.map((i) => i.id));
  const all = [...manualItems, ...serverMails.filter((m) => !manualIds.has(m.id))];
  const visible = all.filter((i) => !dismissed.includes(i.id));
  const processed = applyRules(visible, rules);

  const now = Date.now();
  const withOverdue: ViewItem[] = processed.map((i) => {
    const hours = Math.floor((now - Date.parse(i.created_at)) / 3_600_000);
    const overdue =
      RESPONSE_NEEDED.has(i.category ?? "") &&
      i.status !== "completed" &&
      hours >= followupHours
        ? hours
        : 0;
    return { ...i, overdue };
  });

  // 정렬: pin 고정 → 팔로업 에스컬레이션 → 나머지(원래 순서)
  const pinned = withOverdue.filter((i) => i.pinned);
  const escalated = withOverdue.filter((i) => !i.pinned && i.overdue > 0);
  const rest = withOverdue.filter((i) => !i.pinned && i.overdue === 0);
  return [...pinned, ...escalated, ...rest];
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [serverMails, setServerMails] = useState<UnifiedData[]>([]);
  const [manualItems, setManualItems] = useState<UnifiedData[]>(() =>
    loadLS<UnifiedData[]>(LS_MANUAL, [])
  );
  const [connections, setConnections] = useState<ConnectionState | null>(null);
  const [errors, setErrors] = useState<MailsResponse["errors"]>();
  const [aiError, setAiError] = useState(false);
  const [rules, setRules] = useState<AutomationRule[]>(() =>
    loadLS<AutomationRule[]>(LS_RULES, [])
  );
  const [dismissed, setDismissed] = useState<string[]>(() => loadLS<string[]>(LS_DISMISSED, []));
  const [followupHours, setFollowupHours] = useState(() => loadLS<number>(LS_FOLLOWUP, 24));

  const [quickTitle, setQuickTitle] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);

  const [ruleInput, setRuleInput] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);

  const [notionToken, setNotionToken] = useState("");
  const [notionDbId, setNotionDbId] = useState("");
  const [obsidianPath, setObsidianPath] = useState("");
  const [localDocPath, setLocalDocPath] = useState("");
  const [llmPath, setLlmPath] = useState("");

  const [theme, setTheme] = useState<Theme>(() => loadLS<Theme>(LS_THEME, "dark"));

  const [pushSupported, setPushSupported] = useState<boolean | null>(null);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [briefTime, setBriefTime] = useState(() => loadLS<string>(LS_BRIEF_TIME, "08:30"));

  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState<{ title: string; text: string; message: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);

  const markBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  // ── 서버 동기화 ──────────────────────────────
  const fetchMails = useCallback(async (silent = false) => {
    try {
      const res = await fetch("/api/mails");
      if (res.status === 401) {
        setPhase("landing");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MailsResponse;
      setServerMails(data.mails);
      setConnections(data.connections);
      setErrors(data.errors);
      setAiError(Boolean(data.ai_error));
      setPhase("ready");

      // D3: dismissed 배열을 현재 존재하는 외부 id로만 정리 (로컬 항목은 dismiss 대상이 아님)
      const validIds = new Set(data.mails.map((m) => m.id));
      setDismissed((prev) => prev.filter((id) => validIds.has(id)));
    } catch {
      if (!silent) setPhase((p) => (p === "loading" ? "landing" : p));
    }
  }, []);

  // 첫 동기화 (localStorage 복원은 useState 지연 초기화로 처리).
  // setState는 fetch 응답 콜백에서만 일어나는 정당한 mount-fetch 패턴.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMails();
  }, [fetchMails]);

  // 영속화 — 외부 시스템(localStorage) 쓰기
  useEffect(() => {
    saveLS(LS_MANUAL, manualItems);
  }, [manualItems]);
  useEffect(() => {
    saveLS(LS_RULES, rules);
  }, [rules]);
  useEffect(() => {
    saveLS(LS_DISMISSED, dismissed);
  }, [dismissed]);
  useEffect(() => {
    saveLS(LS_FOLLOWUP, followupHours);
  }, [followupHours]);

  // 테마 적용 — html[data-theme] + localStorage 영속
  useEffect(() => {
    if (theme === "dark") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    saveLS(LS_THEME, theme);
  }, [theme]);

  // 웹 푸시 — Service Worker 등록 + 기존 구독 복원 (H5)
  useEffect(() => {
    if (phase !== "ready") return;
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushSupported(false);
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        setPushSupported(true);
        setPushEndpoint(subscription?.endpoint ?? null);
      } catch {
        setPushSupported(false);
      }
    })();
  }, [phase]);

  // 웹 푸시 — 업무 스냅샷 동기화 (스케줄 발송의 데이터 소스, 2초 디바운스)
  useEffect(() => {
    if (!pushEndpoint) return;
    const timer = setTimeout(() => {
      const items = buildMergedView(manualItems, serverMails, dismissed, rules, followupHours)
        .filter((i) => i.status !== "completed")
        .slice(0, 50);
      void fetch("/api/push/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: pushEndpoint, items }),
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [manualItems, serverMails, dismissed, rules, followupHours, pushEndpoint]);

  // 30초 폴링 — 백그라운드 탭에서는 중단, 복귀 시 즉시 갱신 (C2: 콜백 identity 안정화)
  useEffect(() => {
    if (phase !== "ready") return;
    const interval = setInterval(() => {
      if (!document.hidden) void fetchMails(true);
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void fetchMails(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, fetchMails]);

  const merged = buildMergedView(manualItems, serverMails, dismissed, rules, followupHours);

  const todoItems = merged.filter(
    (i) => TODO_CATS.has(i.category ?? "") && i.status !== "completed"
  );
  const restItems = merged.filter(
    (i) => !TODO_CATS.has(i.category ?? "") || i.status === "completed"
  );
  const llmItems = merged.filter((i) => i.source === "llm");
  const activeCount = merged.filter((i) => i.status !== "completed").length;
  const urgentCount = merged.filter(
    (i) => i.category === "urgent" && i.status !== "completed"
  ).length;
  const doneCount = manualItems.filter((i) => i.status === "completed").length;

  // ── G1: 수동 입력 / 붙여넣기 ────────────────
  async function addManual() {
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle("");
    const item: UnifiedData = {
      id: `manual-${Date.now()}`,
      source: "manual",
      title,
      content: title,
      created_at: new Date().toISOString(),
      author: { name: "나" },
      url: "",
      status: "pending",
    };
    setManualItems((prev) => [item, ...prev]);
    try {
      const res = await fetch("/api/tasks/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [item] }),
      });
      if (res.ok) {
        const { items } = (await res.json()) as { items: UnifiedData[] };
        if (items[0]) {
          setManualItems((prev) => prev.map((i) => (i.id === item.id ? items[0] : i)));
        }
      }
    } catch {
      // 분류 실패해도 항목은 유지 (부분 실패 허용)
    }
  }

  async function importPaste() {
    const text = pasteText.trim();
    if (!text) return;
    setPasteBusy(true);
    try {
      const res = await fetch("/api/tasks/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      const { tasks } = (await res.json()) as { tasks: UnifiedData[] };
      setManualItems((prev) => [...tasks, ...prev]);
      setPasteText("");
      setShowPaste(false);
      showToast(`할 일 ${tasks.length}건을 쏙 골라냈어요!`);
    } catch {
      showToast("앗, 골라내다 놓쳤어요. 한 번만 다시 시도해 주세요.");
    } finally {
      setPasteBusy(false);
    }
  }

  function setLocalStatus(id: string, status: UnifiedData["status"]) {
    setManualItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  }

  function deleteLocal(id: string) {
    setManualItems((prev) => prev.filter((i) => i.id !== id));
  }

  function dismissItem(id: string) {
    setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  // ── write-back 액션 (phase5) ────────────────
  async function completeExternal(item: UnifiedData) {
    markBusy(item.id, true);
    try {
      const res = await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, source: item.source }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error);
      showToast(json.message ?? "완료 도장 꾹 찍어뒀어요!");
      dismissItem(item.id);
      void fetchMails(true);
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "완료 처리 실패");
    } finally {
      markBusy(item.id, false);
    }
  }

  async function replyDraft(item: UnifiedData) {
    markBusy(item.id, true);
    try {
      const res = await fetch("/api/mails/reply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, bodyContent: item.content, source: item.source }),
      });
      const json = (await res.json()) as {
        draftText?: string;
        message?: string;
        error?: string;
      };
      if (!json.draftText) throw new Error(json.error);
      setDraft({ title: item.title, text: json.draftText, message: json.message ?? "" });
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "초안 생성 실패");
    } finally {
      markBusy(item.id, false);
    }
  }

  async function capture(item: UnifiedData, target: "notion" | "obsidian") {
    markBusy(item.id, true);
    try {
      const res = await fetch("/api/tasks/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, title: item.title, content: item.content }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error);
      showToast(json.message ?? "저장했습니다");
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "캡처 실패");
    } finally {
      markBusy(item.id, false);
    }
  }

  // ── Copilot (G3: 무연동에서도 동작) ──────────
  async function askCopilot(preset?: string) {
    const question = (preset ?? copilotInput).trim();
    if (!question || copilotBusy) return;
    setCopilotInput("");
    setCopilotMessages((prev) => [...prev, { role: "user", text: question }]);
    setCopilotBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          items: merged.filter((i) => i.status !== "completed"),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = (await res.json()) as { answer?: string; ai_fallback?: boolean };
      setCopilotMessages((prev) => [
        ...prev,
        { role: "ai", text: json.answer ?? "응답을 생성하지 못했습니다.", fallback: json.ai_fallback },
      ]);
    } catch {
      setCopilotMessages((prev) => [
        ...prev,
        { role: "ai", text: "앗, 대답을 놓쳤어요. 잠시 후 다시 물어봐 주세요." },
      ]);
    } finally {
      setCopilotBusy(false);
    }
  }

  // ── 자동화 규칙 ─────────────────────────────
  async function addRule() {
    const text = ruleInput.trim();
    if (!text) return;
    setRuleBusy(true);
    try {
      const res = await fetch("/api/rules/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json()) as { rule?: AutomationRule; error?: string };
      if (!json.rule) throw new Error(json.error);
      setRules((prev) => [...prev, json.rule!]);
      setRuleInput("");
      showToast(`규칙 접수! ${json.rule.field}에 '${json.rule.value}' → ${json.rule.action}`);
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "규칙 해석 실패");
    } finally {
      setRuleBusy(false);
    }
  }

  // ── 연동 관리 ───────────────────────────────
  async function connectPath(route: string, path: string) {
    if (!path.trim()) {
      showToast("폴더 경로를 입력해 주세요");
      return;
    }
    const res = await fetch(`/api/auth/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", path: path.trim() }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      showToast(json.error ?? "연동 실패");
      return;
    }
    showToast("연결 완료! 이제 여기 소식도 챙겨올게요.");
    void fetchMails(true);
  }

  async function disconnect(route: string, method: "POST" | "DELETE" = "POST") {
    await fetch(`/api/auth/${route}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify({ action: "disconnect" }) : undefined,
    });
    showToast("연결을 풀어뒀어요. 언제든 다시 부르세요.");
    void fetchMails(true);
  }

  async function connectNotion() {
    const res = await fetch("/api/auth/notion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", token: notionToken, dbId: notionDbId }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      showToast(json.error ?? "Notion 연동 실패");
      return;
    }
    setNotionToken("");
    setNotionDbId("");
    showToast("Notion 연결 완료! 태스크 모시러 갑니다.");
    void fetchMails(true);
  }

  async function addLocalDocFolder() {
    if (!localDocPath.trim()) {
      showToast("폴더 경로를 알려주세요");
      return;
    }
    const res = await fetch("/api/auth/local-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", path: localDocPath.trim() }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      showToast(json.error ?? "폴더 추가 실패");
      return;
    }
    setLocalDocPath("");
    showToast("폴더 추가 완료! 이 폴더도 챙겨볼게요.");
    void fetchMails(true);
  }

  async function removeLocalDocFolder(path: string) {
    await fetch("/api/auth/local-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect", path }),
    });
    showToast("폴더 연결을 풀어뒀어요.");
    void fetchMails(true);
  }

  async function pickFolder(setter: (path: string) => void) {
    try {
      const res = await fetch("/api/util/select-folder");
      const json = (await res.json()) as { path?: string; error?: string };
      if (json.path) setter(json.path);
      else if (json.error) showToast(json.error);
    } catch {
      showToast("폴더 선택기를 열 수 없습니다. 경로를 직접 입력해 주세요.");
    }
  }

  // ── 웹 푸시 (H5) ────────────────────────────
  async function subscribePush() {
    if (!VAPID_PUBLIC_KEY) {
      showToast("서버에 VAPID 키가 설정되지 않았습니다 (.env.example 참조)");
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showToast("브라우저 알림 권한이 허용되지 않았습니다");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          briefTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      setPushEndpoint(subscription.endpoint);
      showToast(`좋아요, 매일 ${briefTime}에 찾아뵐게요! 첫 브리핑은 내일부터 — 궁금하면 '테스트 발송'을 눌러보세요.`);
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "알림 설정 실패");
    } finally {
      setPushBusy(false);
    }
  }

  async function unsubscribePush() {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? pushEndpoint;
      await subscription?.unsubscribe();
      if (endpoint) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setPushEndpoint(null);
      showToast("알겠어요, 당분간 조용히 있을게요.");
    } catch {
      showToast("알림 해제 실패");
    } finally {
      setPushBusy(false);
    }
  }

  async function testPush() {
    if (!pushEndpoint) return;
    setPushBusy(true);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: pushEndpoint }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      showToast(json.message ?? json.error ?? "요청 실패");
    } finally {
      setPushBusy(false);
    }
  }

  async function saveBriefTime(next: string) {
    setBriefTime(next);
    saveLS(LS_BRIEF_TIME, next);
    if (!pushEndpoint) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          briefTime: next,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      showToast(`발송 시각 ${next}, 기억해뒀어요!`);
    } catch {
      showToast("발송 시각 변경 실패");
    }
  }

  async function exportLlmDigest() {
    const res = await fetch("/api/tasks/llm-digest", { method: "POST" });
    const json = (await res.json()) as { message?: string; error?: string };
    showToast(json.message ?? json.error ?? "요청 실패");
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── 렌더링 ─────────────────────────────────
  if (phase === "loading") {
    return (
      <main className={styles.landing}>
        <div className={styles.landingCard}>
          <IcedAmericano size={28} /> <CafeWait steps={LOADING_WAIT_STEPS} interval={1100} />
        </div>
      </main>
    );
  }

  if (phase === "landing") {
    return (
      <main className={styles.landing}>
        <div className={styles.landingCard}>
          <div className={styles.landingEmoji}>
            <IcedAmericano size={72} />
          </div>
          <h1 className={styles.landingTitle}>
            coffe<span>Tide</span>
          </h1>
          <p className={styles.landingDesc}>
            커피 한 잔 하면서 오늘을 정리하는 AI 개인 비서예요.
            <br />
            회원가입도, 연동도 없이 지금 바로 시작할 수 있어요.
          </p>
          <a className={styles.landingBtn} href="/api/auth/signin">
            coffeTide 시작하기
          </a>
          <p className={styles.landingHint}>
            게스트로 조용히 입장해요. Outlook·Notion 연동은 내키실 때 하셔도 늦지 않아요.
          </p>
        </div>
      </main>
    );
  }

  const isAnyConnected = connections
    ? Object.values(connections).some((v) => v === true)
    : false;

  function renderItem(item: ProcessedData & { overdue: number }) {
    const isLocal = item.source === "manual" || item.source === "paste";
    const isMail = item.source === "outlook" || item.source === "gmail";
    const busy = busyIds.has(item.id);
    return (
      <div
        key={item.id}
        className={[
          styles.item,
          item.pinned ? styles.itemPinned : "",
          item.overdue > 0 ? styles.itemOverdue : "",
          item.status === "completed" ? styles.itemDone : "",
        ].join(" ")}
      >
        <div className={styles.itemHeader}>
          {item.pinned && (
            <span className={styles.pinIcon} role="img" aria-label="상단 고정됨">
              📌
            </span>
          )}
          <span className={`${styles.badge} ${styles[`badge_${item.source}`]}`}>
            {SOURCE_LABELS[item.source]}
          </span>
          {item.category && (
            <span className={`${styles.cat} ${styles[`cat_${item.category}`] ?? ""}`}>
              {CATEGORY_LABELS[item.category]}
            </span>
          )}
          {item.overdue > 0 && (
            <span className={styles.overdueBadge}>⏰ {item.overdue}시간 경과</span>
          )}
          {item.status === "held" && <span className={styles.cat}>보류 중</span>}
        </div>
        <div className={styles.itemTitle}>{item.title}</div>
        {item.content && item.content !== item.title && (
          <div
            className={`${styles.itemContent} ${expanded.has(item.id) ? styles.itemContentOpen : ""}`}
            onClick={() => toggleExpand(item.id)}
            title="눌러서 펼치기/접기"
          >
            {item.content}
          </div>
        )}
        {item.actionDirective && item.status !== "completed" && (
          <div className={styles.directive}>→ {item.actionDirective}</div>
        )}
        <div className={styles.itemMeta}>
          <span>{item.author.name}</span>
          <span>{timeAgo(item.created_at)}</span>
        </div>
        <div className={styles.itemActions}>
          {isLocal && item.status !== "completed" && (
            <>
              <button className={styles.actionBtn} onClick={() => setLocalStatus(item.id, "completed")}>
                ✅ 완료
              </button>
              <button
                className={styles.actionBtn}
                onClick={() => setLocalStatus(item.id, item.status === "held" ? "pending" : "held")}
              >
                {item.status === "held" ? "▶️ 재개" : "⏸ 보류"}
              </button>
            </>
          )}
          {isLocal && (
            <button
              className={styles.actionBtn}
              onClick={() => deleteLocal(item.id)}
              aria-label={`'${item.title}' 삭제`}
            >
              🗑 삭제
            </button>
          )}
          {isMail && (
            <button className={styles.actionBtn} disabled={busy} onClick={() => replyDraft(item)}>
              ✍️ 답장 초안
            </button>
          )}
          {(item.source === "notion" || item.source === "obsidian") && (
            <button className={styles.actionBtn} disabled={busy} onClick={() => completeExternal(item)}>
              ✅ 완료 처리
            </button>
          )}
          {isLocal && connections?.obsidian && (
            <button className={styles.actionBtn} disabled={busy} onClick={() => capture(item, "obsidian")}>
              📥 Obsidian
            </button>
          )}
          {isLocal && connections?.notion && (
            <button className={styles.actionBtn} disabled={busy} onClick={() => capture(item, "notion")}>
              📥 Notion
            </button>
          )}
          {item.url && (
            <a className={styles.actionBtn} href={item.url} target="_blank" rel="noreferrer">
              🔗 원문
            </a>
          )}
          {!isLocal && (
            <button
              className={`${styles.actionBtn} ${styles.btnDanger}`}
              onClick={() => dismissItem(item.id)}
              aria-label={`'${item.title}' 숨기기`}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <IcedAmericano size={26} /> coffe<span>Tide</span>
        </div>
        <div className={styles.stats}>
          <span className={styles.statChip}>
            대기 <b>{activeCount}</b>
          </span>
          <span className={styles.statChip}>
            긴급 <b>{urgentCount}</b>
          </span>
          <span className={styles.statChip}>
            오늘 완료 <b>{doneCount}</b>
          </span>
        </div>
        <div className={styles.headerRight}>
          <select
            className={styles.input}
            style={{ width: "auto", padding: "4px 8px" }}
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            aria-label="테마 선택"
          >
            <option value="dark">🌙 다크</option>
            <option value="light">☀️ 라이트</option>
            <option value="coffee">🥤 커피타이드</option>
            <option value="mega">💛 메가커피</option>
            <option value="kustom">💙 커스텀커피</option>
          </select>
          <label>
            팔로업 기준{" "}
            <select
              className={styles.input}
              style={{ width: "auto", display: "inline-block", padding: "4px 8px" }}
              value={followupHours}
              onChange={(e) => setFollowupHours(Number(e.target.value))}
              aria-label="팔로업 에스컬레이션 기준 시간"
            >
              <option value={12}>12시간</option>
              <option value={24}>24시간</option>
              <option value={48}>48시간</option>
            </select>
          </label>
          <span>{connections?.googleEmail || connections?.outlookEmail || "게스트"}</span>
          <a href="/api/auth/signout">퇴근하기</a>
        </div>
      </header>

      {errors && Object.keys(errors).length > 0 && (
        <div className={styles.errorBanner}>
          몇 군데서 소식을 못 받아왔어요 (나머지는 멀쩡해요):{" "}
          {Object.entries(errors)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </div>
      )}
      {aiError && (
        <div className={styles.errorBanner} style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "rgba(255,180,84,0.08)" }}>
          AI가 잠깐 자리를 비워서, 제 감(로컬 규칙)으로 분류해뒀어요.
        </div>
      )}

      <div className={styles.grid}>
        {/* G1: 빠른 업무 추가 + 붙여넣기 — 입력 경로가 최우선 (00-current-state §4.1) */}
        <section className={`${styles.card} ${styles.colInput}`}>
          <div className={styles.cardTitle}>
            ⚡ 빠른 업무 추가
            <button
              className={`${styles.btn} ${styles.cardTitleBtn}`}
              onClick={() => setShowPaste((v) => !v)}
            >
              📋 메모/회의록 붙여넣기
            </button>
          </div>
          <div className={styles.formRow}>
            <input
              className={styles.input}
              placeholder="예: 내일까지 주간 보고서 제출"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManual()}
              aria-label="빠른 업무 추가 입력"
            />
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={addManual}>
              추가
            </button>
          </div>
          {showPaste && (
            <div>
              <textarea
                className={styles.textarea}
                placeholder="메모·메일·회의록을 붙여넣으면 할 일만 쏙 골라낼게요"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                aria-label="붙여넣기 가져오기 입력"
              />
              <div className={styles.formRow} style={{ marginTop: 8 }}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={pasteBusy || !pasteText.trim()}
                  onClick={importPaste}
                >
                  {pasteBusy ? <CafeWait steps={PASTE_WAIT_STEPS} interval={1200} /> : "할 일 골라내기"}
                </button>
              </div>
            </div>
          )}
          <p className={styles.connNote} style={{ marginTop: 10 }}>
            연동 없어도 괜찮아요 — 여기 적은 업무는 이 브라우저에 고이 저장해두고,
            분류부터 브리핑까지 똑같이 챙겨드려요.
          </p>
        </section>

        {/* G3/G6: Copilot — 무연동에서도 활성, MarkdownLite 렌더링 */}
        <section className={`${styles.card} ${styles.colCopilot}`}>
          <div className={styles.cardTitle}>🤖 AI Copilot</div>
          <div className={styles.copilotBody}>
            {copilotMessages.length === 0 ? (
              <div className={styles.msgHint}>
                “오늘 뭐 해야 해?”라고 편하게 물어보세요.
                {merged.length === 0 &&
                  " 아직 아는 업무가 없어서 브리핑이 좀 심심할 거예요 — 위에서 몇 개만 알려주세요!"}
              </div>
            ) : (
              copilotMessages.map((msg, i) =>
                msg.role === "user" ? (
                  <div key={i} className={styles.msgUser}>
                    {msg.text}
                  </div>
                ) : (
                  <div key={i} className={styles.msgAi}>
                    <MarkdownLite text={msg.text} />
                  </div>
                )
              )
            )}
            {copilotBusy && (
              <div className={styles.msgHint}>
                <CafeWait steps={COPILOT_WAIT_STEPS} />
              </div>
            )}
          </div>
          <div className={styles.copilotForm}>
            <input
              className={styles.input}
              placeholder="오늘 뭐 해야 해?"
              value={copilotInput}
              onChange={(e) => setCopilotInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askCopilot()}
              disabled={copilotBusy}
              aria-label="Copilot 질문 입력"
            />
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => askCopilot()}
              disabled={copilotBusy}
            >
              질문
            </button>
            <button
              className={styles.btn}
              onClick={() => askCopilot("오늘 해야 할 일을 브리핑해줘")}
              disabled={copilotBusy}
            >
              오늘 브리핑
            </button>
          </div>
        </section>

        {/* 오늘의 행동 지침 */}
        <section className={`${styles.card} ${styles.colTodo}`}>
          <div className={styles.cardTitle}>
            🎯 오늘의 행동 지침 <small>{todoItems.length}건</small>
          </div>
          {todoItems.length === 0 ? (
            <div className={styles.emptyState}>
              {/* G2: 연동 전제가 아닌 입력 우선 안내 */}
              오늘은 아직 조용하네요. <b>위에서 업무를 추가하거나 메모를 붙여넣어
              보세요.</b>
              {!isAnyConnected && " Outlook/Notion 연동은 나중에 해도 충분해요."}
            </div>
          ) : (
            <div className={styles.list}>{todoItems.map(renderItem)}</div>
          )}
        </section>

        {/* 사이드: 연동 관리 + 규칙 */}
        <div className={styles.colSide}>
          <section className={styles.card}>
            <div className={styles.cardTitle}>🔌 서비스 연동 관리 <small>전부 선택 사항이에요</small></div>
            <div className={styles.connGrid}>
              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  📧 Outlook
                  <span
                    className={`${styles.connStatus} ${errors?.outlook ? styles.connErr : connections?.outlook ? styles.connOn : ""}`}
                  >
                    {errors?.outlook ? "재연동 필요" : connections?.outlook ? "연동됨" : "미연동"}
                  </span>
                </div>
                {connections?.outlook ? (
                  <button className={styles.btn} onClick={() => disconnect("outlook", "DELETE")}>
                    해제
                  </button>
                ) : (
                  <a className={styles.btn} href="/api/auth/outlook" style={{ textAlign: "center" }}>
                    연동하기
                  </a>
                )}
              </div>

              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  📮 Google
                  <span
                    className={`${styles.connStatus} ${errors?.google ? styles.connErr : connections?.google ? styles.connOn : ""}`}
                  >
                    {errors?.google ? "재연동 필요" : connections?.google ? "연동됨" : "미연동"}
                  </span>
                </div>
                {connections?.google ? (
                  <button className={styles.btn} onClick={() => disconnect("google/signin", "DELETE")}>
                    해제
                  </button>
                ) : (
                  <a className={styles.btn} href="/api/auth/google/signin" style={{ textAlign: "center" }}>
                    연동하기
                  </a>
                )}
              </div>

              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  📝 Notion
                  <span className={`${styles.connStatus} ${connections?.notion ? styles.connOn : ""}`}>
                    {connections?.notion ? "연동됨" : "미연동"}
                  </span>
                </div>
                {connections?.notion ? (
                  <button className={styles.btn} onClick={() => disconnect("notion")}>
                    해제
                  </button>
                ) : (
                  <>
                    <input
                      className={styles.input}
                      placeholder="Integration Token"
                      value={notionToken}
                      onChange={(e) => setNotionToken(e.target.value)}
                      aria-label="Notion Integration Token"
                    />
                    <div className={styles.connRow}>
                      <input
                        className={styles.input}
                        placeholder="Database ID"
                        value={notionDbId}
                        onChange={(e) => setNotionDbId(e.target.value)}
                        aria-label="Notion Database ID"
                      />
                      <button className={styles.btn} onClick={connectNotion}>
                        연동
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  💎 Obsidian
                  <span className={`${styles.connStatus} ${connections?.obsidian ? styles.connOn : ""}`}>
                    {connections?.obsidian ? "연동됨" : "미연동"}
                  </span>
                </div>
                {connections?.obsidian ? (
                  <button className={styles.btn} onClick={() => disconnect("obsidian")}>
                    해제
                  </button>
                ) : (
                  <div className={styles.connRow}>
                    <input
                      className={styles.input}
                      placeholder="볼트 폴더 경로"
                      value={obsidianPath}
                      onChange={(e) => setObsidianPath(e.target.value)}
                      aria-label="Obsidian 볼트 폴더 경로"
                    />
                    <button
                      className={styles.iconBtn}
                      onClick={() => pickFolder(setObsidianPath)}
                      aria-label="Obsidian 볼트 폴더 선택"
                      title="폴더 선택"
                    >
                      📂
                    </button>
                    <button className={styles.btn} onClick={() => connectPath("obsidian", obsidianPath)}>
                      연동
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  📁 로컬 문서
                  <span className={`${styles.connStatus} ${connections?.local_doc ? styles.connOn : ""}`}>
                    {connections?.local_doc
                      ? `연동됨 · ${connections?.localDocPaths?.length ?? 0}개 폴더`
                      : "미연동"}
                  </span>
                </div>
                {(connections?.localDocPaths ?? []).map((path) => (
                  <div key={path} className={styles.folderRow}>
                    <span className={styles.folderPath} title={path}>
                      {path}
                    </span>
                    <button
                      className={styles.iconBtn}
                      onClick={() => removeLocalDocFolder(path)}
                      aria-label={`'${path}' 폴더 연결 해제`}
                      title="이 폴더 빼기"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className={styles.connRow}>
                  <input
                    className={styles.input}
                    placeholder="문서 폴더 경로 (.md/.txt)"
                    value={localDocPath}
                    onChange={(e) => setLocalDocPath(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addLocalDocFolder()}
                    aria-label="로컬 문서 폴더 경로"
                  />
                  <button
                    className={styles.iconBtn}
                    onClick={() => pickFolder(setLocalDocPath)}
                    aria-label="로컬 문서 폴더 선택"
                    title="폴더 선택"
                  >
                    📂
                  </button>
                  <button className={styles.btn} onClick={addLocalDocFolder}>
                    ➕ 추가
                  </button>
                </div>
                <p className={styles.connNote}>폴더는 5개까지 함께 살펴봐 드려요.</p>
              </div>

              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  🧠 LLM 산출물
                  <span className={`${styles.connStatus} ${connections?.llm ? styles.connOn : ""}`}>
                    {connections?.llm ? "연동됨" : "미연동"}
                  </span>
                </div>
                {connections?.llm ? (
                  <button className={styles.btn} onClick={() => disconnect("llm")}>
                    해제
                  </button>
                ) : (
                  <div className={styles.connRow}>
                    <input
                      className={styles.input}
                      placeholder="산출물 폴더 (예: ~/.claude/.../memory)"
                      value={llmPath}
                      onChange={(e) => setLlmPath(e.target.value)}
                      aria-label="LLM 산출물 폴더 경로"
                    />
                    <button
                      className={styles.iconBtn}
                      onClick={() => pickFolder(setLlmPath)}
                      aria-label="LLM 산출물 폴더 선택"
                      title="폴더 선택"
                    >
                      📂
                    </button>
                    <button className={styles.btn} onClick={() => connectPath("llm", llmPath)}>
                      연동
                    </button>
                  </div>
                )}
                <p className={styles.connNote}>Claude Code·Gemini 등의 작업 산출물 폴더 (데스크톱 전용)</p>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardTitle}>⚙️ 자동화 규칙</div>
            <div className={styles.formRow}>
              <input
                className={styles.input}
                placeholder='예: "제목에 긴급 있으면 맨 위로"'
                value={ruleInput}
                onChange={(e) => setRuleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRule()}
                aria-label="자연어 규칙 입력"
              />
              <button className={styles.btn} disabled={ruleBusy} onClick={addRule}>
                {ruleBusy ? "레시피 적는 중…" : "추가"}
              </button>
            </div>
            <div className={styles.list}>
              {rules.length === 0 && (
                <p className={styles.connNote}>
                  “뉴스레터는 숨겨줘”처럼 말씀만 하세요 — 제가 규칙으로 만들어
                  적용할게요. (고정·긴급·음소거·숨김)
                </p>
              )}
              {rules.map((rule, i) => (
                <div key={i} className={styles.ruleRow}>
                  <button
                    className={styles.iconBtn}
                    onClick={() =>
                      setRules((prev) =>
                        prev.map((r, j) => (j === i ? { ...r, enabled: !r.enabled } : r))
                      )
                    }
                    aria-label={rule.enabled ? "규칙 끄기" : "규칙 켜기"}
                    title={rule.enabled ? "켜짐" : "꺼짐"}
                  >
                    {rule.enabled ? "●" : "○"}
                  </button>
                  <span className={styles.ruleText}>
                    <b>{rule.field}</b>에 &lsquo;{rule.value}&rsquo; → <b>{rule.action}</b>
                  </span>
                  <button
                    className={styles.iconBtn}
                    onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="규칙 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardTitle}>
              🔔 아침 브리핑 알림
              <small>{pushEndpoint ? "켜짐" : "꺼짐"}</small>
            </div>
            {pushSupported === false ? (
              <p className={styles.connNote}>
                이 브라우저는 웹 푸시를 지원하지 않아요. (iOS는 홈 화면에 추가한 뒤 사용 가능)
              </p>
            ) : (
              <>
                <div className={styles.formRow}>
                  <label className={styles.connNote} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    발송 시각
                    <input
                      type="time"
                      className={styles.input}
                      style={{ flex: 1 }}
                      value={briefTime}
                      onChange={(e) => void saveBriefTime(e.target.value)}
                      aria-label="아침 브리핑 발송 시각"
                    />
                  </label>
                </div>
                <div className={styles.formRow}>
                  {pushEndpoint ? (
                    <>
                      <button className={styles.btn} disabled={pushBusy} onClick={testPush}>
                        📨 테스트 발송
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnDanger}`}
                        disabled={pushBusy}
                        onClick={unsubscribePush}
                      >
                        알림 끄기
                      </button>
                    </>
                  ) : (
                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={pushBusy || pushSupported === null}
                      onClick={subscribePush}
                    >
                      {pushBusy ? "알림벨 다는 중…" : "🔔 알림 켜기"}
                    </button>
                  )}
                </div>
                <p className={styles.connNote}>
                  매일 {briefTime}, 탭을 닫아두셔도 브리핑을 들고 찾아갈게요.
                  (브라우저는 켜져 있어야 해요)
                </p>
              </>
            )}
          </section>
        </div>

        {/* 🧠 오늘의 LLM 작업 (phase6 §7) */}
        {(llmItems.length > 0 || connections?.llm) && (
          <section className={`${styles.card} ${styles.colFull}`}>
            <div className={styles.cardTitle}>
              🧠 오늘의 LLM 작업 <small>{llmItems.length}건</small>
              {connections?.obsidian && (
                <button
                  className={`${styles.btn} ${styles.cardTitleBtn}`}
                  onClick={exportLlmDigest}
                >
                  📥 Obsidian에 오늘 요약 내보내기
                </button>
              )}
            </div>
            {llmItems.length === 0 ? (
              <div className={styles.emptyState}>
                오늘은 AI 동료들이 조용하네요. 산출물이 생기면 여기 모아드릴게요.
              </div>
            ) : (
              <div className={styles.list}>{llmItems.map(renderItem)}</div>
            )}
          </section>
        )}

        {/* 전체 목록 */}
        <section className={`${styles.card} ${styles.colFull}`}>
          <div className={styles.cardTitle}>
            📚 받은 항목 전체 <small>{restItems.length}건</small>
          </div>
          {restItems.length === 0 ? (
            <div className={styles.emptyState}>
              참고용 소식이 모이는 자리예요. 아직은 텅 — 업무를 추가하거나 문서를
              가져오면 채워드릴게요.
            </div>
          ) : (
            <div className={styles.list}>{restItems.map(renderItem)}</div>
          )}
        </section>
      </div>

      {/* 답장 초안 모달 (phase5 §3) */}
      {draft && (
        <div className={styles.overlay} onClick={() => setDraft(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardTitle}>✍️ 답장 초안 — {draft.title}</div>
            {draft.message && <p className={styles.connNote}>{draft.message}</p>}
            <div className={styles.draftText}>{draft.text}</div>
            <div className={styles.formRow}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  void navigator.clipboard?.writeText(draft.text);
                  showToast("초안 복사 완료! 붙여넣기만 하면 돼요.");
                }}
              >
                복사
              </button>
              <button className={styles.btn} onClick={() => setDraft(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </main>
  );
}
