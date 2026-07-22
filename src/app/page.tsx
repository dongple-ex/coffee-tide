// coffeeTide 대시보드 — 정본 요구사항 반영:
// G1 manual/paste 1급 소스, G2 무연동 빈 화면 안내, G3 무연동 Copilot,
// G4 서버측 날짜/출처 근거, G6 MarkdownLite 렌더링, E1 aria-label,
// 팔로업 에스컬레이션·dismiss(D3 정리)·규칙 빌더(as-built §5), 폴링 visibility 일시정지(8-mobile §5).

"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyRules, AutomationRule, ProcessedData } from "@/lib/automation/rules";
import {
  BROWSER_ID_PREFIX,
  BrowserFolderInfo,
  BrowserFolderKind,
  captureBrowserObsidian,
  completeBrowserObsidianTask,
  pickBrowserFolder,
  removeBrowserFolder,
  requestBrowserPermissions,
  scanBrowserFolders,
  supportsFsAccess,
} from "@/lib/browser/localFolders";
import {
  getNotificationPermission,
  requestNotificationPermission,
  triggerTaskNotifications,
} from "@/lib/push/browserNotification";
import {
  CATEGORY_LABELS,
  ConnectionState,
  MailsResponse,
  SOURCE_LABELS,
  UnifiedCategory,
  UnifiedData,
} from "@/lib/types/unified";
import { GoogleIcon, NotionIcon, ObsidianIcon, OutlookIcon } from "./components/brandIcons";
import CafeWait from "./components/cafeWait";
import IcedAmericano from "./components/icedAmericano";
import MarkdownLite from "./components/markdownLite";
import { WelcomeCard, WeatherData } from "./components/WelcomeCard";
import { CommuteCard } from "./components/CommuteCard";
import { CommuteConfig } from "@/lib/types/commute";
import styles from "./page.module.css";

const LS_MANUAL = "ct_manual_items";
const LS_RULES = "ct_automation_rules";
const LS_DISMISSED = "ct_dismissed_ids";
const LS_FOLLOWUP = "ct_followup_hours";
const LS_BRIEF_TIME = "ct_brief_time";
const LS_THEME = "ct_theme";
const LS_WEATHER_ENABLED = "ct_weather_enabled";
const LS_WEATHER_COORDS = "ct_weather_coords";
const LS_COMMUTE_CONFIG = "ct_commute_config";
const LS_BROWSER_CAT = "ct_browser_categories";
const POLL_MS = 30_000;

type Theme = "dark" | "light" | "coffee" | "mega" | "kustom";

export interface DynamicCafeContext {
  taskCount?: number;
  urgentCount?: number;
  type?: "loading" | "copilot" | "paste";
}

export function getDynamicCafeSteps(ctx: DynamicCafeContext): string[] {
  const { taskCount = 0, urgentCount = 0, type = "loading" } = ctx;
  const hours = new Date().getHours();

  // 1. 작업량이 폭발적으로 많은 경우 (할 일 8건 이상 또는 긴급 2건 이상)
  if (taskCount >= 8 || urgentCount >= 2) {
    if (type === "copilot") {
      return [
        "🚨 우와, 오늘 할 일이 빽빽하네요!",
        "정신 바짝 차리게 에스프레소 투샷 내리는 중 ☕⚡",
        "고카페인 200% 특제 롱블랙 쉐이킹 중 💥",
        "바리스타 전원 동원해서 리듬감 있게 얼음 띄우는 중 🧊",
        "🔔 카페인 충전 완료! 오늘 업무 싹 깨부숴봅시다!",
      ];
    }
    if (type === "paste") {
      return [
        "📋 붙여넣은 할 일이 한 보따리네요!",
        "진한 Espresso 샷 추가해서 골라내는 중 ☕",
        "우선순위 쏙쏙 잘라 컵에 담는 중 ✂️",
        "🧊 시원하게 저어 정리 마무리 중…",
        "🔔 대용량 할 일 콤보 준비 완료!",
      ];
    }
    return [
      "☕ 주문 접수! 오늘 작업량이 엄청 묵직하네요!",
      "에스프레소 투샷 찐하게 내리는 중 ☕⚡",
      "각얼음 콰직콰직 가득 담는 중 🧊",
      "특제 고카페인 아메리카노 완성 직전 🔥",
      "🔔 오늘 업무 싹 클리어할 준비 완료!",
    ];
  }

  // 2. 시간대별 & 대기 타입별 재미있고 유쾌한 카페 멘트
  if (hours >= 5 && hours < 12) {
    if (type === "copilot") {
      return [
        "☕ 상쾌한 아침 주문 접수! 바리스타 출근 완료!",
        "갓 볶은 모닝 싱글오리진 원두 곱게 가는 중 🌾",
        "황금빛 크레마 에스프레소 진하게 추출 중 ☕✨",
        "갓 구운 크루아상 냄새 풍기며 각얼음 띄우는 중 🥐🧊",
        "🔔 모닝 에너제틱 브리핑 대령이오!",
      ];
    }
    return [
      "☕ 상쾌한 아침 시작! 원두 볶는 중…",
      "에스프레소 샷 내리는 중 ☕",
      "각얼음 콰직콰직 띄우는 중 🧊",
      "🔔 아침의 커피가 거의 다 됐어요!",
    ];
  }

  if (hours >= 12 && hours < 18) {
    if (type === "copilot") {
      return [
        "🥱 나른한 오후시간! 식곤증 퇴치 특공대 출동!",
        "정신 번쩍 들게 콜드브루 원액 방울방울 내리는 중 💧",
        "달콤 쌉싸름한 바닐라 크림 폼 듬뿍 얹는 중 🍦",
        "시원한 시나몬 파우더 톡톡 뿌리는 중 ✨",
        "🔔 오후 피로 싹 날려버릴 브리핑 나왔습니다!",
      ];
    }
    return [
      "☀️ 오후의 주문 접수! 시원함 장전 중!",
      "에스프레소 투샷 템핑하는 중 ☕",
      "각얼음 듬뿍 넣어 흔드는 중 🧊🌀",
      "🔔 정신 번쩍 들 커피 준비 완료!",
    ];
  }

  // 저녁/밤
  if (type === "copilot") {
    return [
      "🌙 오늘 하루도 정말 수고 많으셨어요!",
      "부담 없는 디카페인 원두로 부드럽게 추출 중 ☕",
      "오늘의 결실을 편안하게 컵에 담는 중 🍵",
      "따스하고 부드럽게 마무리 저어주는 중 🥄",
      "🔔 오늘도 무사히 마무리! 편안하게 확인해보세요!",
    ];
  }

  return [
    "🌙 하루를 정돈하는 밤의 카페 주문 접수!",
    "부드러운 디카페인 아메리카노 내리는 중 ☕",
    "마음 편안해지는 수증기 피어오르는 중 ♨️",
    "🔔 하루를 아름답게 매듭지어 드릴게요!",
  ];
}

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

// 구 프로젝트명(TimePilot) 시절 tp_ 키 → ct_ 키 1회성 마이그레이션 맵 (판독 시 이관)
const LEGACY_LS_KEYS: Record<string, string> = {
  [LS_RULES]: "tp_automation_rules",
  [LS_DISMISSED]: "tp_dismissed_ids",
  [LS_FOLLOWUP]: "tp_followup_hours",
};

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    let raw = localStorage.getItem(key);
    const legacy = LEGACY_LS_KEYS[key];
    if (raw === null && legacy) {
      raw = localStorage.getItem(legacy);
      if (raw !== null) {
        try {
          localStorage.setItem(key, raw);
          localStorage.removeItem(legacy);
        } catch {
          // 이관 쓰기가 실패해도(용량 초과 등) 이번 세션은 구 키 값으로 동작 — 다음 로드에서 재시도
        }
      }
    }
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // 저장 실패(용량 초과 등)는 치명적이지 않지만, 호출부가 사용자에게 알릴 수 있게 결과를 돌려준다
    return false;
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

// 수집 오류 배너용 소스 한글 라벨 — errors 키(google 등)는 SOURCE_LABELS와 집합이 달라 보강
const ERROR_SOURCE_LABELS: Record<string, string> = {
  ...SOURCE_LABELS,
  google: "Google",
  llm: "LLM 산출물",
};

// 자동화 규칙의 field/action enum 한글 라벨 (토스트·규칙 목록 공용)
const FIELD_LABEL: Record<AutomationRule["field"], string> = {
  any: "아무 곳",
  source: "출처",
  sender: "보낸 사람",
  title: "제목",
  content: "내용",
};
const ACTION_LABEL: Record<AutomationRule["action"], string> = {
  pin: "맨 위 고정",
  urgent: "긴급 표시",
  mute: "음소거",
  hide: "숨김",
};

type ViewItem = ProcessedData & { overdue: number };

/** 모달 접근성 — 열릴 때 포커스 이동, Tab 순환 유지(포커스 트랩), ESC 닫기, 닫힐 때 포커스 복원 */
function useModalA11y(
  open: boolean,
  containerRef: RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      // 닫힌 <details> 안의 요소 등 실제로 포커스 불가능한 것은 제외해야 트랩이 끊기지 않는다
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) =>
        typeof el.checkVisibility === "function" ? el.checkVisibility() : el.offsetParent !== null
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus();
    };
  }, [open, containerRef]);
}

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
  // 원칙 4(부분 실패 허용): 수집 API 실패·세션 만료는 화면을 막지 않고 배너로 안내
  const [fetchFailed, setFetchFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [rules, setRules] = useState<AutomationRule[]>(() =>
    loadLS<AutomationRule[]>(LS_RULES, [])
  );
  const [dismissed, setDismissed] = useState<string[]>(() => loadLS<string[]>(LS_DISMISSED, []));
  const [followupHours, setFollowupHours] = useState(() => loadLS<number>(LS_FOLLOWUP, 24));
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(getNotificationPermission);

  const [quickTitle, setQuickTitle] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);

  const [saveToDrive, setSaveToDrive] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const plusFirstItemRef = useRef<HTMLButtonElement>(null);
  const copilotBodyRef = useRef<HTMLDivElement>(null);

  const [ruleInput, setRuleInput] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);

  const [notionToken, setNotionToken] = useState("");
  const [notionDbId, setNotionDbId] = useState("");
  const [obsidianPath, setObsidianPath] = useState("");
  const [localDocPath, setLocalDocPath] = useState("");
  const [llmPath, setLlmPath] = useState("");

  const [theme, setTheme] = useState<Theme>(() => loadLS<Theme>(LS_THEME, "dark"));
  const [showConn, setShowConn] = useState(false);

  // 브라우저 로컬 폴더 (File System Access API) — 원격 배포에서도 폴더 연동
  const [fsaSupported, setFsaSupported] = useState(false);
  const [browserFolders, setBrowserFolders] = useState<BrowserFolderInfo[]>([]);
  const [browserItems, setBrowserItems] = useState<UnifiedData[]>([]);

  const [pushSupported, setPushSupported] = useState<boolean | null>(null);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [briefTime, setBriefTime] = useState(() => loadLS<string>(LS_BRIEF_TIME, "08:30"));

  const [weatherEnabled, setWeatherEnabled] = useState(() => loadLS<boolean>(LS_WEATHER_ENABLED, false));
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lon: number } | null>(() =>
    loadLS<{ lat: number; lon: number } | null>(LS_WEATHER_COORDS, null)
  );
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);

  const [commuteConfig, setCommuteConfig] = useState<CommuteConfig>(() =>
    loadLS<CommuteConfig>(LS_COMMUTE_CONFIG, {
      enabled: false,
      homeStation: "서울역",
      workStation: "수원역",
    })
  );

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

  const fetchWeatherData = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data.success && data.weather) {
        setWeatherData(data.weather);
      }
    } catch (err) {
      console.warn("[coffeeTide] Weather fetch failed:", err);
    }
  }, []);

  const enableWeatherLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      showToast("이 브라우저는 위치 정보를 지원하지 않아요.");
      return;
    }
    setWeatherBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setWeatherBusy(false);
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
        setWeatherCoords(coords);
        setWeatherEnabled(true);
        saveLS(LS_WEATHER_ENABLED, true);
        saveLS(LS_WEATHER_COORDS, coords);
        void fetchWeatherData(coords.lat, coords.lon);
        showToast("📍 위치 허용 완료! 날씨 브리핑이 활성화되었습니다.");
      },
      (error) => {
        setWeatherBusy(false);
        showToast(`위치 권한 오류: ${error.message}`);
      },
      { timeout: 10000 }
    );
  }, [fetchWeatherData, showToast]);

  const disableWeatherLocation = useCallback(() => {
    setWeatherEnabled(false);
    setWeatherData(null);
    saveLS(LS_WEATHER_ENABLED, false);
    showToast("날씨 브리핑을 껐습니다.");
  }, [showToast]);

  useEffect(() => {
    if (weatherEnabled) {
      if (weatherCoords) {
        void fetchWeatherData(weatherCoords.lat, weatherCoords.lon);
      } else if (typeof window !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
            setWeatherCoords(coords);
            saveLS(LS_WEATHER_COORDS, coords);
            void fetchWeatherData(coords.lat, coords.lon);
          },
          () => {},
          { timeout: 8000 }
        );
      }
    }
  }, [weatherEnabled, weatherCoords, fetchWeatherData]);

  // ── 서버 동기화 ──────────────────────────────
  const fetchMails = useCallback(async (silent = false) => {
    try {
      const res = await fetch("/api/mails");
      if (res.status === 401) {
        // 사용 중(silent 폴링) 세션 만료는 화면을 유지한 채 배너로 안내 — 작성 중인 내용을 지키기 위함
        if (silent) setSessionExpired(true);
        else setPhase("landing");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MailsResponse;
      setServerMails(data.mails);
      setConnections(data.connections);
      setErrors(data.errors);
      setAiError(Boolean(data.ai_error));
      setSessionExpired(false);
      setFetchFailed(false);
      setPhase("ready");

      // D3: dismissed 배열을 현재 존재하는 외부 id로만 정리 (로컬 항목은 dismiss 대상이 아님,
      // 브라우저 폴더 항목(bfs-)은 scanBrowser에서 별도 정리)
      const validIds = new Set(data.mails.map((m) => m.id));
      setDismissed((prev) =>
        prev.filter((id) => validIds.has(id) || id.startsWith(BROWSER_ID_PREFIX))
      );
    } catch {
      // 원칙 4(부분 실패 허용): 수집 API가 죽어도 무연동 기능(직접 추가·붙여넣기·바리스타)은 막지 않는다.
      // 401은 위에서 처리 — 여기 오는 실패는 네트워크/서버 오류이므로 대시보드로 진입시키고 배너로 알린다.
      setFetchFailed(true);
      setPhase((p) => (p === "loading" ? "ready" : p));
    }
  }, []);

  // ── 브라우저 폴더 스캔 — 서버 /api/mails 파이프라인(수집→AI 분류→C1 캐시) 미러 ──
  const scanBrowser = useCallback(async () => {
    if (!supportsFsAccess()) return;
    const { items, complete, folders } = await scanBrowserFolders();
    setBrowserFolders(folders);

    // 분류 캐시 적용 (llm 항목은 reference 고정이라 캐시 불필요)
    const cache = loadLS<Record<string, { category?: UnifiedCategory; actionDirective?: string }>>(
      LS_BROWSER_CAT,
      {}
    );
    const withCat = items.map((i) =>
      i.category || !cache[i.id] ? i : { ...i, ...cache[i.id] }
    );
    setBrowserItems(withCat);

    // D3: 완전 스캔일 때만 사라진 브라우저 항목의 dismiss 정리
    if (complete) {
      const ids = new Set(items.map((i) => i.id));
      setDismissed((prev) =>
        prev.filter((id) => !id.startsWith(BROWSER_ID_PREFIX) || ids.has(id))
      );
    }

    // 캐시에 없는 신규 항목만 AI 분류 (실패 시 다음 폴링에서 재시도)
    const fresh = withCat.filter((i) => !i.category).slice(0, 20);
    if (fresh.length === 0) return;
    try {
      const res = await fetch("/api/tasks/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: fresh }),
      });
      if (!res.ok) return;
      const { items: classified } = (await res.json()) as { items: UnifiedData[] };
      const nextCache: typeof cache = complete ? {} : { ...cache };
      if (complete) {
        for (const i of withCat) if (cache[i.id]) nextCache[i.id] = cache[i.id]; // 현재 항목으로 프루닝
      }
      for (const c of classified) {
        nextCache[c.id] = { category: c.category, actionDirective: c.actionDirective };
      }
      saveLS(LS_BROWSER_CAT, nextCache);
      setBrowserItems((prev) =>
        prev.map((i) => (!i.category && nextCache[i.id] ? { ...i, ...nextCache[i.id] } : i))
      );
    } catch {
      // 분류 실패해도 항목은 유지 (부분 실패 허용)
    }
  }, []);

  // 첫 동기화 (localStorage 복원은 useState 지연 초기화로 처리).
  // setState는 fetch 응답 콜백에서만 일어나는 정당한 mount-fetch 패턴.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMails();
  }, [fetchMails]);

  // 브라우저 폴더 연동 복원 — FSA 지원 감지 + 저장 핸들 스캔 (권한 상태 포함)
  useEffect(() => {
    if (phase !== "ready") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFsaSupported(supportsFsAccess());
    void scanBrowser();
  }, [phase, scanBrowser]);

  // 영속화 — 외부 시스템(localStorage) 쓰기.
  // manual 항목은 1급 소스(정본 원칙 2)라 저장 실패(용량 초과)를 조용히 삼키면 데이터 유실로 이어진다.
  const quotaWarnedRef = useRef(false);
  useEffect(() => {
    const ok = saveLS(LS_MANUAL, manualItems);
    if (!ok && !quotaWarnedRef.current) {
      quotaWarnedRef.current = true;
      showToast("앗, 저장 공간이 가득 차서 새 항목을 못 담고 있어요. 큰 업로드 항목을 몇 개 삭제해 주세요.");
    } else if (ok) {
      quotaWarnedRef.current = false;
    }
  }, [manualItems, showToast]);
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

  // 모달 접근성 — 설정 패널·답장 초안 모달 (포커스 이동/트랩/복원 + ESC 닫기)
  const connPanelRef = useRef<HTMLDivElement>(null);
  const draftModalRef = useRef<HTMLDivElement>(null);
  useModalA11y(showConn, connPanelRef, () => setShowConn(false));
  useModalA11y(Boolean(draft), draftModalRef, () => setDraft(null));

  // 탭 간 동기화 — 다른 탭이 저장한 localStorage 변경을 반영 (storage 이벤트는 다른 탭에서만 발생.
  // 반영값을 persist effect가 동일 문자열로 재저장하므로 이벤트 루프는 생기지 않는다)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.newValue === null) return;
      try {
        if (e.key === LS_MANUAL) setManualItems(JSON.parse(e.newValue));
        else if (e.key === LS_RULES) setRules(JSON.parse(e.newValue));
        else if (e.key === LS_DISMISSED) setDismissed(JSON.parse(e.newValue));
        else if (e.key === LS_FOLLOWUP) setFollowupHours(JSON.parse(e.newValue));
      } catch {
        // 손상된 값은 무시 — 다음 정상 저장에서 수렴
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 드라이브 영구 저장은 Google 연동 시에만 기본 ON (정본 원칙 3: 연동은 증강 기능 —
  // 무연동 사용자의 기본 업로드 경로가 '연동하라'는 에러로 시작되면 안 된다).
  // 연동 상태가 바뀔 때만 기본값을 재동기화 (렌더 중 상태 조정 패턴).
  // 단, 사용자가 직접 토글한 뒤에는 폴링 중 일시적 연동 오류(플랩)가 선택을 덮어쓰지 않게 한다.
  const googleConnected = connections?.google === true;
  const userSetDriveRef = useRef(false);
  const [prevGoogleConnected, setPrevGoogleConnected] = useState(googleConnected);
  if (prevGoogleConnected !== googleConnected) {
    setPrevGoogleConnected(googleConnected);
    if (!googleConnected) setSaveToDrive(false);
    else if (!userSetDriveRef.current) setSaveToDrive(true);
  }

  // + 메뉴 — ESC로 닫기 + 열릴 때 첫 항목으로 포커스 이동 (키보드 접근성)
  useEffect(() => {
    if (!plusOpen) return;
    plusFirstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPlusOpen(false);
        plusBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plusOpen]);

  // 바리스타 대화 — 새 메시지가 접히지 않게 항상 맨 아래로 스크롤
  useEffect(() => {
    const el = copilotBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [copilotMessages, copilotBusy]);

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
      const items = buildMergedView(
        manualItems,
        [...serverMails, ...browserItems],
        dismissed,
        rules,
        followupHours
      )
        .filter((i) => i.status !== "completed")
        .slice(0, 50);
      void fetch("/api/push/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: pushEndpoint, items }),
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [manualItems, serverMails, browserItems, dismissed, rules, followupHours, pushEndpoint]);

  // 30초 폴링 — 백그라운드 탭에서는 중단, 복귀 시 즉시 갱신 (C2: 콜백 identity 안정화)
  useEffect(() => {
    if (phase !== "ready") return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        void fetchMails(true);
        void scanBrowser();
      }
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        void fetchMails(true);
        void scanBrowser();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, fetchMails, scanBrowser]);

  // 병합 파이프라인은 규칙 적용+정렬이 있어 키 입력마다 재계산하지 않도록 메모이제이션
  // (overdue 시각은 30초 폴링이 serverMails를 갱신할 때마다 재계산돼 충분히 신선하다)
  const merged = useMemo(
    () =>
      buildMergedView(manualItems, [...serverMails, ...browserItems], dismissed, rules, followupHours),
    [manualItems, serverMails, browserItems, dismissed, rules, followupHours]
  );

  // H4: 데스크톱 브라우저 알림 (긴급/팔로업 초과 업무 발생 시)
  useEffect(() => {
    if (merged.length > 0 && notifPerm === "granted") {
      triggerTaskNotifications(merged, followupHours);
    }
  }, [merged, followupHours, notifPerm]);

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
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: "manual",
      title,
      content: title,
      created_at: new Date().toISOString(),
      author: { name: "나" },
      url: "",
      status: "pending",
    };
    setManualItems((prev) => [item, ...prev]);
    await classifyManualItem(item);
  }

  async function classifyManualItem(item: UnifiedData) {
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
    // 브라우저 연동(FSA) 항목은 서버를 거치지 않고 클라이언트에서 직접 노트 수정
    if (item.id.startsWith(BROWSER_ID_PREFIX)) {
      markBusy(item.id, true);
      try {
        await completeBrowserObsidianTask(item.id);
        showToast("완료 도장 꾹 찍어뒀어요! (노트 체크박스도 갱신)");
        void scanBrowser();
      } catch (err) {
        showToast(err instanceof Error && err.message ? err.message : "앗, 완료 도장을 못 찍었어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        markBusy(item.id, false);
      }
      return;
    }
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
      showToast(err instanceof Error && err.message ? err.message : "앗, 완료 도장을 못 찍었어요. 잠시 후 다시 시도해 주세요.");
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
      showToast(err instanceof Error && err.message ? err.message : "앗, 초안을 미처 못 적었어요. 한 번만 다시 눌러주세요.");
    } finally {
      markBusy(item.id, false);
    }
  }

  async function capture(item: UnifiedData, target: "notion" | "obsidian") {
    // 서버 볼트 미연동 + 브라우저 볼트 연동 상태면 클라이언트에서 직접 캡처
    if (target === "obsidian" && !connections?.obsidian) {
      markBusy(item.id, true);
      try {
        const note = await captureBrowserObsidian(item.title, item.content);
        showToast(`Obsidian '${note}'에 담아뒀어요!`);
      } catch (err) {
        showToast(err instanceof Error && err.message ? err.message : "앗, 담다가 흘렸어요. 한 번만 다시 눌러주세요.");
      } finally {
        markBusy(item.id, false);
      }
      return;
    }
    markBusy(item.id, true);
    try {
      const res = await fetch("/api/tasks/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, title: item.title, content: item.content }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error);
      showToast(json.message ?? "잘 담아뒀어요!");
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "앗, 담다가 흘렸어요. 한 번만 다시 눌러주세요.");
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
        { role: "ai", text: json.answer ?? "앗, 주문이 밀렸나 봐요 ☕ 잠시 후 다시 물어봐 주세요.", fallback: json.ai_fallback },
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      showToast("1MB 이하의 텍스트 파일만 업로드할 수 있어요.");
      e.target.value = "";
      return;
    }

    setUploadBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("saveToDrive", saveToDrive.toString());

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const error = await res.json();
        showToast("앗, 파일을 받다가 놓쳤어요 (" + (error.error || "원인을 알 수 없어요") + "). 다시 한 번 건네주세요!");
        return;
      }

      // 원칙 4(부분 실패 허용): Drive 저장이 안 돼도 항목 등록은 성공 — driveNotice로 상황만 알린다
      const json = (await res.json()) as {
        doc: UnifiedData;
        driveSaved?: boolean;
        driveNotice?: string;
      };
      setManualItems((prev) => [json.doc, ...prev]);
      showToast(json.driveNotice ?? `'${file.name}' 잘 받았어요! 금방 살펴볼게요.`);
      classifyManualItem(json.doc);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "원인은 아직 찾는 중이에요";
      showToast(`앗, 파일을 옮기다 살짝 엎질렀어요 (${message}). 한 번만 다시 부탁드려요!`);
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
      showToast(`규칙 접수! ${FIELD_LABEL[json.rule.field]}에 '${json.rule.value}' → ${ACTION_LABEL[json.rule.action]}`);
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "앗, 레시피를 못 알아들었어요. 조금 다르게 말씀해 주실래요?");
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
      showToast(json.error ?? "앗, 연결이 잘 안 됐어요. 잠시 후 다시 시도해 주세요.");
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
      showToast(json.error ?? "앗, Notion과 연결이 잘 안 됐어요 — 토큰과 Database ID를 한 번만 확인해 주세요.");
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
      showToast(json.error ?? "앗, 폴더를 못 담았어요. 경로를 확인해 주세요.");
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

  // ── 브라우저 폴더 연동 (File System Access API) ──
  async function connectBrowserFolder(kind: BrowserFolderKind) {
    try {
      const name = await pickBrowserFolder(kind);
      if (!name) return; // 사용자가 선택 취소
      showToast(`'${name}' 폴더를 이 브라우저에서 챙겨볼게요!`);
      void scanBrowser();
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "앗, 폴더가 안 열리네요. 다시 시도해 주세요.");
    }
  }

  async function disconnectBrowserFolder(key: string) {
    await removeBrowserFolder(key);
    showToast("브라우저 폴더 연결을 풀어뒀어요.");
    void scanBrowser();
  }

  async function regrantBrowserFolders() {
    await requestBrowserPermissions();
    void scanBrowser();
  }

  async function pickFolder(setter: (path: string) => void) {
    try {
      const res = await fetch("/api/util/select-folder");
      const json = (await res.json()) as { path?: string; error?: string };
      if (json.path) setter(json.path);
      else if (json.error) showToast(json.error);
    } catch {
      showToast("폴더 선택 창이 안 열리네요. 경로를 직접 적어 주시면 챙겨볼게요.");
    }
  }

  // ── 웹 푸시 (H5) ────────────────────────────
  async function subscribePush() {
    if (!VAPID_PUBLIC_KEY) {
      console.warn("웹 푸시 미설정: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 환경변수가 필요합니다 (.env.example 참조)");
      showToast("이 서버는 아직 알림을 내릴 준비가 안 됐어요 — 관리자에게 문의해 주세요.");
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showToast("알림 권한이 꺼져 있어요 — 주소창 옆 자물쇠(사이트 설정)에서 허용해 주시면 바로 찾아뵐게요!");
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
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `서버가 잠시 말이 없네요 (HTTP ${res.status}). 조금 뒤 다시 시도해 주세요.`);
      setPushEndpoint(subscription.endpoint);
      showToast(`좋아요, 매일 ${briefTime}에 찾아뵐게요! 첫 브리핑은 내일부터 — 궁금하면 '테스트 발송'을 눌러보세요.`);
    } catch (err) {
      showToast(
        err instanceof Error && err.message
          ? `앗, 알림벨을 달다 놓쳤어요 (${err.message})`
          : "앗, 알림벨을 달다 놓쳤어요. 잠시 후 다시 시도해 주세요."
      );
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
      showToast("앗, 알림을 끄지 못했어요. 잠시 후 다시 눌러주세요.");
    } finally {
      setPushBusy(false);
    }
  }

  const toggleNotification = useCallback(async (enable: boolean) => {
    setPushBusy(true);
    try {
      if (enable) {
        const res = await requestNotificationPermission();
        setNotifPerm(res);
        if (res === "granted") {
          if (pushSupported && VAPID_PUBLIC_KEY && !pushEndpoint) {
            try {
              await subscribePush();
            } catch (err) {
              console.warn("Push subscribe error:", err);
            }
          } else {
            showToast("🔔 데스크톱 알림 권한이 허용되었습니다!");
          }
        } else {
          showToast("알림 권한이 거부되어 있습니다. 브라우저 설정에서 허용해주세요.");
        }
      } else {
        if (pushEndpoint) {
          try {
            await unsubscribePush();
          } catch (err) {
            console.warn("Unsubscribe push error:", err);
          }
        }
        setPushEndpoint(null);
        showToast("알림을 껐습니다.");
      }
    } catch (err) {
      console.warn("Toggle notification error:", err);
    } finally {
      setPushBusy(false);
    }
  }, [pushSupported, pushEndpoint, showToast]);

  async function testPush() {
    if (!pushEndpoint) return;
    setPushBusy(true);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: pushEndpoint }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      showToast(json.message ?? json.error ?? `서버가 잠시 말이 없네요 (HTTP ${res.status}). 조금 뒤 다시 시도해 주세요.`);
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
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          briefTime: next,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `서버가 잠시 말이 없네요 (HTTP ${res.status}). 조금 뒤 다시 시도해 주세요.`);
      showToast(`발송 시각 ${next}, 기억해뒀어요!`);
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "앗, 발송 시각을 못 적어뒀어요. 다시 골라주세요.");
    }
  }

  async function exportLlmDigest() {
    const res = await fetch("/api/tasks/llm-digest", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    showToast(json.message ?? json.error ?? `서버가 잠시 말이 없네요 (HTTP ${res.status}). 조금 뒤 다시 시도해 주세요.`);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const dynamicLoadingSteps = useMemo(
    () => getDynamicCafeSteps({ taskCount: merged.length, urgentCount, type: "loading" }),
    [merged.length, urgentCount]
  );
  const dynamicCopilotSteps = useMemo(
    () => getDynamicCafeSteps({ taskCount: merged.length, urgentCount, type: "copilot" }),
    [merged.length, urgentCount]
  );
  const dynamicPasteSteps = useMemo(
    () => getDynamicCafeSteps({ taskCount: merged.length, urgentCount, type: "paste" }),
    [merged.length, urgentCount]
  );

  // ── 렌더링 ─────────────────────────────────
  if (phase === "loading") {
    return (
      <main className={styles.landing}>
        <div className={styles.landingCard}>
          <IcedAmericano size={28} /> <CafeWait steps={dynamicLoadingSteps} interval={1100} />
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
            coffee<span>Tide</span>
          </h1>
          <p className={styles.landingDesc}>
            커피 한 잔 하면서 오늘을 정리하는 AI 업무 비서예요.
            <br />
            회원가입도, 연동도 없이 지금 바로 시작할 수 있어요.
          </p>
          <a className={styles.landingBtn} href="/api/auth/signin">
            coffeeTide 시작하기
          </a>
          <p className={styles.landingHint}>
            게스트로 조용히 입장해요. Outlook·Notion 연동은 내키실 때 하셔도 늦지 않아요.
          </p>
        </div>
      </main>
    );
  }

  const isAnyConnected =
    (connections ? Object.values(connections).some((v) => v === true) : false) ||
    browserFolders.length > 0;
  const browserObsidian = browserFolders.find((f) => f.kind === "obsidian");
  const browserDocs = browserFolders.filter((f) => f.kind === "local_doc");
  const browserLlm = browserFolders.find((f) => f.kind === "llm");
  const browserNeedsPermission = browserFolders.some((f) => f.permission === "prompt");
  const browserKinds = new Set(browserFolders.map((f) => f.kind));
  const connectedCount = connections
    ? Object.values(connections).filter((v) => v === true).length +
      [...browserKinds].filter((k) => !connections[k]).length
    : browserKinds.size;

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
          {item.delegatable && (
            <span
              className={styles.delegatableBadge}
              title="Claude Code 등 로컬 LLM 도구로 초안/분석을 작성하기에 적합한 업무입니다"
            >
              🤖 AI 위임 가능
            </span>
          )}
          {item.overdue > 0 && (
            <span className={styles.overdueBadge}>⏰ {item.overdue}시간째 기다리는 중</span>
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
          {isLocal && (connections?.obsidian || browserObsidian) && (
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
        <div className={styles.headerRow}>
          <div className={styles.logo}>
            <IcedAmericano size={26} /> coffee<span>Tide</span>
          </div>
          <div className={styles.headerActionsRight}>
            <span className={styles.userEmail} title={connections?.googleEmail || connections?.outlookEmail || "게스트"}>
              {connections?.googleEmail || connections?.outlookEmail || "게스트"}
            </span>
            <select
              className={`${styles.input} ${styles.selectCompact}`}
              style={{ width: "auto", padding: "2px 6px" }}
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
            <button
              className={styles.logoutBtnSmall}
              onClick={async () => {
                const pendingItems = merged.filter((i) => i.status !== "completed");
                const summary = pendingItems.map((i) => `- [ ] ${i.title}`).join('\n');
                const text = `# ☕ coffeeTide Hand-off\n\n## 🚧 내일 이어서 할 일\n${summary}`;
                try {
                  await navigator.clipboard.writeText(text);
                  showToast("남은 할 일을 정리해서 클립보드에 복사했어요! (HANDOFF.md에 붙여넣으세요)");
                } catch {
                  showToast("클립보드 복사에 실패했어요. 브라우저 권한(HTTPS 접속)을 확인해주세요.");
                }
              }}
            >
              퇴근하기
            </button>
          </div>
        </div>
        <div className={styles.headerRowStart}>
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
        </div>
        <div className={styles.headerRowStart}>
          <button
            className={styles.connMenuBtn}
            onClick={() => setShowConn((v) => !v)}
            aria-expanded={showConn}
            aria-haspopup="dialog"
            aria-label="설정 열기/닫기"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="m12 14 4-4"/>
              <path d="M3.34 19a10 10 0 1 1 17.32 0"/>
            </svg>
            설정
          </button>
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
        </div>
      </header>

      {sessionExpired && (
        <div
          className={styles.errorBanner}
          style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "rgba(255,180,84,0.08)" }}
        >
          자리를 오래 비우셨네요 — 세션이 만료됐어요. 화면의 내용은 그대로 있으니, 준비되시면 다시
          입장해 주세요.{" "}
          <button
            className={styles.btn}
            style={{ padding: "2px 10px", fontSize: "0.76rem" }}
            onClick={() => setPhase("landing")}
          >
            다시 입장하기
          </button>
        </div>
      )}
      {fetchFailed && !sessionExpired && (
        <div
          className={styles.errorBanner}
          style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "rgba(255,180,84,0.08)" }}
        >
          외부 소식은 잠시 못 가져왔어요. 직접 추가·붙여넣기·바리스타는 그대로 쓸 수 있어요.{" "}
          <button
            className={styles.btn}
            style={{ padding: "2px 10px", fontSize: "0.76rem" }}
            onClick={() => void fetchMails(true)}
          >
            다시 가져오기
          </button>
        </div>
      )}
      {errors && Object.keys(errors).length > 0 && (
        <div className={styles.errorBanner}>
          몇 군데서 소식을 못 받아왔어요 (나머지는 멀쩡해요):{" "}
          {Object.entries(errors)
            .map(([k, v]) => `${ERROR_SOURCE_LABELS[k] ?? k}: ${v}`)
            .join(" · ")}{" "}
          <button
            className={styles.btn}
            style={{ padding: "2px 10px", fontSize: "0.76rem" }}
            onClick={() => setShowConn(true)}
          >
            설정에서 재연동
          </button>{" "}
          그동안 직접 추가·붙여넣기는 계속 쓸 수 있어요.
        </div>
      )}
      {aiError && (
        <div className={styles.errorBanner} style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "rgba(255,180,84,0.08)" }}>
          AI가 잠깐 자리를 비워서, 제 감(로컬 규칙)으로 분류해뒀어요.
        </div>
      )}
      {browserNeedsPermission && (
        <div
          className={styles.errorBanner}
          style={{ borderColor: "var(--accent)", color: "var(--text)", background: "var(--accent-dim)" }}
        >
          🔑 연동해둔 로컬 폴더의 브라우저 접근 권한이 만료됐어요.{" "}
          <button
            className={styles.btn}
            style={{ padding: "2px 10px", fontSize: "0.76rem" }}
            onClick={regrantBrowserFolders}
          >
            다시 허용
          </button>
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
                  {pasteBusy ? <CafeWait steps={dynamicPasteSteps} interval={1200} /> : "할 일 골라내기"}
                </button>
              </div>
            </div>
          )}

        </section>

        {/* G3/G6: Copilot — 무연동에서도 활성, MarkdownLite 렌더링 */}
        <section className={`${styles.card} ${styles.colCopilot}`}>
          <div className={styles.cardTitle}>☕ AI 바리스타</div>
          <WelcomeCard compact weather={weatherData} />
          <div className={styles.copilotBody} ref={copilotBodyRef}>
            {copilotMessages.length === 0 ? (
              <div className={styles.msgHint}>
                “오늘 뭐 해야 해?”라고 주문하듯 편하게 물어보세요 ☕
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
                <CafeWait steps={dynamicCopilotSteps} interval={1200} />
              </div>
            )}
          </div>
          <div className={styles.copilotForm}>
            <input
              type="file"
              ref={fileInputRef}
              accept="text/*,.txt,.md,.markdown,.csv,.json,.log,application/json"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <button
              ref={plusBtnRef}
              className={`${styles.btn} ${styles.plusBtn} ${plusOpen ? styles.plusBtnOpen : ""}`}
              onClick={() => setPlusOpen((v) => !v)}
              disabled={uploadBusy}
              title="첨부·옵션"
              aria-label="첨부 및 옵션 메뉴"
              aria-expanded={plusOpen}
            >
              +
            </button>
            {plusOpen && (
              <>
                <div className={styles.plusBackdrop} onClick={() => setPlusOpen(false)} />
                <div className={styles.plusMenu} role="menu">
                  <button
                    ref={plusFirstItemRef}
                    className={styles.plusMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setPlusOpen(false);
                      fileInputRef.current?.click();
                    }}
                    disabled={uploadBusy}
                  >
                    📎 파일 첨부
                  </button>
                  <button
                    className={styles.plusMenuItem}
                    role="menuitem"
                    onClick={() => {
                      userSetDriveRef.current = true;
                      setSaveToDrive(!saveToDrive);
                    }}
                    disabled={!googleConnected}
                    title={
                      googleConnected
                        ? undefined
                        : "Google 연동 후 드라이브 영구 저장을 쓸 수 있어요. 지금은 일회성 분석으로 업로드돼요."
                    }
                  >
                    {saveToDrive ? "☁️ 드라이브 영구 저장" : "⏳ 일회성 분석 (임시)"}
                    <span
                      className={`${styles.plusMenuState} ${saveToDrive ? "" : styles.plusMenuStateOff}`}
                    >
                      {saveToDrive ? "켜짐" : "꺼짐"}
                    </span>
                  </button>
                  <button
                    className={styles.plusMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setPlusOpen(false);
                      askCopilot("오늘 해야 할 일을 브리핑해줘");
                    }}
                    disabled={copilotBusy}
                  >
                    📋 오늘 브리핑
                  </button>
                </div>
              </>
            )}
            <input
              className={styles.input}
              placeholder="오늘 뭐 해야 해?"
              value={copilotInput}
              onChange={(e) => setCopilotInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askCopilot()}
              disabled={copilotBusy}
              aria-label="AI 바리스타 질문 입력"
            />
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => askCopilot()}
              disabled={copilotBusy}
              title="질문"
              style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 10 4 15 9 20"></polyline>
                <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
              </svg>
            </button>
          </div>
        </section>

        {/* 🚇 스마트 길찾기 카드 (옵트인) */}
        {commuteConfig.enabled && (
          <section className={styles.colFull} style={{ padding: 0 }}>
            <CommuteCard
              homeStation={commuteConfig.homeStation || "서울역"}
              workStation={commuteConfig.workStation || "수원역"}
            />
          </section>
        )}

        {/* 오늘의 행동 지침 */}
        <section className={`${styles.card} ${styles.colFull}`}>
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



        {/* 🧠 오늘의 LLM 작업 (phase6 §7) */}
        {(llmItems.length > 0 || connections?.llm || browserLlm) && (
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

      {/* 설정 — 상단 메뉴로 여닫는 오버레이 패널 */}
      {showConn && (
        <div className={`${styles.overlay} ${styles.overlayTop}`} onClick={() => setShowConn(false)}>
          <div
            ref={connPanelRef}
            tabIndex={-1}
            className={`${styles.modal} ${styles.connPanel}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="설정"
          >
            <div className={styles.stickyModalHeader}>
              <div className={styles.cardTitle} style={{ margin: 0, display: "flex", alignItems: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <path d="m12 14 4-4"/>
                  <path d="M3.34 19a10 10 0 1 1 17.32 0"/>
                </svg>
                설정
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  className={`${styles.btn} ${styles.btnDanger}`}
                  style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/signout", { method: "POST" });
                    } catch {}
                    setPhase("landing");
                  }}
                >
                  로그아웃 (접속 종료)
                </button>
                <button
                  className={styles.iconBtn}
                  onClick={() => setShowConn(false)}
                  aria-label="설정 닫기"
                  style={{ fontSize: "1.1rem", padding: "4px 8px" }}
                >
                  ✕
                </button>
              </div>
            </div>

            <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
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
                      <b>{FIELD_LABEL[rule.field]}</b>에 &lsquo;{rule.value}&rsquo; →{" "}
                      <b>{ACTION_LABEL[rule.action]}</b>
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

            <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
              <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
                <span>🔔 브리핑 & 데스크톱 알림</span>
                <label className={`${styles.switchLabel} ${pushBusy ? styles.switchDisabled : ""}`}>
                  <span>{notifPerm === "granted" || Boolean(pushEndpoint) ? "ON" : "OFF"}</span>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={notifPerm === "granted" || Boolean(pushEndpoint)}
                    disabled={pushBusy}
                    onChange={(e) => void toggleNotification(e.target.checked)}
                  />
                  <span className={styles.switchSlider} />
                </label>
              </div>
              {pushSupported === false ? (
                <p className={styles.connNote}>
                  이 브라우저는 웹 푸시를 지원하지 않아요. (iOS는 홈 화면에 추가한 뒤 사용 가능)
                </p>
              ) : (
                <>
                  <div className={styles.formRow} style={{ marginTop: 8 }}>
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
                    {pushEndpoint && (
                      <button className={styles.btn} disabled={pushBusy} onClick={testPush} style={{ padding: "4px 10px", fontSize: "0.78rem" }}>
                        📨 테스트 발송
                      </button>
                    )}
                  </div>
                  <p className={styles.connNote}>
                    매일 {briefTime}, 탭을 닫아두셔도 브리핑을 들고 찾아갈게요. (브라우저는 켜져 있어야 해요)
                  </p>
                </>
              )}
            </section>

            <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
              <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
                <span>📍 위치 & 날씨 브리핑</span>
                {weatherData && weatherEnabled && (
                  <small style={{ marginLeft: 6 }}>{weatherData.city} ({weatherData.temp}°C)</small>
                )}
                <label className={`${styles.switchLabel} ${weatherBusy ? styles.switchDisabled : ""}`}>
                  <span>{weatherEnabled ? "ON" : "OFF"}</span>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={weatherEnabled}
                    disabled={weatherBusy}
                    onChange={(e) => {
                      if (e.target.checked) {
                        enableWeatherLocation();
                      } else {
                        disableWeatherLocation();
                      }
                    }}
                  />
                  <span className={styles.switchSlider} />
                </label>
              </div>
              <p className={styles.connNote}>
                위치 권한을 허용하면 계신 곳의 기상청 날씨와 맞춤 웰컴 메시지를 브리핑해 드립니다.
              </p>
            </section>

            <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
              <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
                <span>🚇 출퇴근 길찾기 브리핑</span>
                <label className={styles.switchLabel}>
                  <span>{commuteConfig.enabled ? "ON" : "OFF"}</span>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={commuteConfig.enabled}
                    onChange={(e) => {
                      const next = { ...commuteConfig, enabled: e.target.checked };
                      setCommuteConfig(next);
                      saveLS(LS_COMMUTE_CONFIG, next);
                    }}
                  />
                  <span className={styles.switchSlider} />
                </label>
              </div>
              <div className={styles.formRow} style={{ marginTop: 8 }}>
                <input
                  className={styles.input}
                  placeholder="집/출발역 (예: 서울역)"
                  value={commuteConfig.homeStation}
                  onChange={(e) => {
                    const next = { ...commuteConfig, homeStation: e.target.value };
                    setCommuteConfig(next);
                    saveLS(LS_COMMUTE_CONFIG, next);
                  }}
                  aria-label="집/출발역"
                />
                <input
                  className={styles.input}
                  placeholder="회사/도착역 (예: 수원역)"
                  value={commuteConfig.workStation}
                  onChange={(e) => {
                    const next = { ...commuteConfig, workStation: e.target.value };
                    setCommuteConfig(next);
                    saveLS(LS_COMMUTE_CONFIG, next);
                  }}
                  aria-label="회사/도착역"
                />
              </div>
              <p className={styles.connNote}>
                시간대에 따라 오전(출근 모드), 오후(퇴근 모드)로 자동 전환하여 대시보드 스마트 카드로 보여드립니다.
              </p>
            </section>

            <div className={styles.cardTitle} style={{ marginTop: 20 }}>
              🔌 서비스 연동 <small>전부 선택 사항이에요</small>
            </div>
            {browserNeedsPermission && (
              <div className={styles.permRow}>
                🔑 저장된 폴더의 접근 권한을 다시 허용해 주세요 (브라우저 보안 정책상 재방문
                시 필요할 수 있어요)
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={regrantBrowserFolders}>
                  다시 허용
                </button>
              </div>
            )}
            <div className={styles.connGrid}>
              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  <OutlookIcon /> Outlook
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
                  <GoogleIcon /> Google
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
                  <NotionIcon /> Notion
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
                  <ObsidianIcon /> Obsidian
                  <span
                    className={`${styles.connStatus} ${connections?.obsidian || browserObsidian ? styles.connOn : ""}`}
                  >
                    {connections?.obsidian ? "연동됨" : browserObsidian ? "브라우저 연동" : "미연동"}
                  </span>
                </div>
                {connections?.obsidian ? (
                  <button className={styles.btn} onClick={() => disconnect("obsidian")}>
                    해제
                  </button>
                ) : (
                  <>
                    {browserObsidian ? (
                      <div className={styles.folderRow}>
                        <span className={styles.folderPath} title={browserObsidian.name}>
                          📂 {browserObsidian.name}
                        </span>
                        <button
                          className={styles.iconBtn}
                          onClick={() => disconnectBrowserFolder(browserObsidian.key)}
                          aria-label="브라우저 볼트 연결 해제"
                          title="연결 해제"
                        >
                          ✕
                        </button>
                      </div>
                    ) : fsaSupported ? (
                      <button className={styles.btn} onClick={() => connectBrowserFolder("obsidian")}>
                        📂 브라우저에서 볼트 폴더 열기
                      </button>
                    ) : (
                      <p className={styles.connNote}>
                        이 브라우저는 폴더 열기를 지원하지 않아요 (Chrome/Edge 필요).
                      </p>
                    )}
                    <details className={styles.connDetails}>
                      <summary>서버(로컬 실행) 경로로 연동</summary>
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
                    </details>
                  </>
                )}
              </div>

              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  📁 로컬 문서
                  <span
                    className={`${styles.connStatus} ${connections?.local_doc || browserDocs.length > 0 ? styles.connOn : ""}`}
                  >
                    {connections?.local_doc
                      ? `연동됨 · ${connections?.localDocPaths?.length ?? 0}개 폴더`
                      : browserDocs.length > 0
                        ? `브라우저 · ${browserDocs.length}개 폴더`
                        : "미연동"}
                  </span>
                </div>
                {browserDocs.map((folder) => (
                  <div key={folder.key} className={styles.folderRow}>
                    <span className={styles.folderPath} title={folder.name}>
                      📂 {folder.name}
                    </span>
                    <button
                      className={styles.iconBtn}
                      onClick={() => disconnectBrowserFolder(folder.key)}
                      aria-label={`'${folder.name}' 브라우저 폴더 연결 해제`}
                      title="이 폴더 빼기"
                    >
                      ✕
                    </button>
                  </div>
                ))}
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
                {fsaSupported ? (
                  <button className={styles.btn} onClick={() => connectBrowserFolder("local_doc")}>
                    📂 브라우저에서 문서 폴더 열기
                  </button>
                ) : (
                  <p className={styles.connNote}>
                    이 브라우저는 폴더 열기를 지원하지 않아요 (Chrome/Edge 필요).
                  </p>
                )}
                <details className={styles.connDetails}>
                  <summary>서버(로컬 실행) 경로로 연동</summary>
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
                </details>
                <p className={styles.connNote}>폴더는 5개까지 함께 살펴봐 드려요.</p>
              </div>

              <div className={styles.connCard}>
                <div className={styles.connHead}>
                  🧠 LLM 산출물
                  <span
                    className={`${styles.connStatus} ${connections?.llm || browserLlm ? styles.connOn : ""}`}
                  >
                    {connections?.llm ? "연동됨" : browserLlm ? "브라우저 연동" : "미연동"}
                  </span>
                </div>
                {connections?.llm ? (
                  <button className={styles.btn} onClick={() => disconnect("llm")}>
                    해제
                  </button>
                ) : (
                  <>
                    {browserLlm ? (
                      <div className={styles.folderRow}>
                        <span className={styles.folderPath} title={browserLlm.name}>
                          📂 {browserLlm.name}
                        </span>
                        <button
                          className={styles.iconBtn}
                          onClick={() => disconnectBrowserFolder(browserLlm.key)}
                          aria-label="브라우저 LLM 폴더 연결 해제"
                          title="연결 해제"
                        >
                          ✕
                        </button>
                      </div>
                    ) : fsaSupported ? (
                      <button className={styles.btn} onClick={() => connectBrowserFolder("llm")}>
                        📂 브라우저에서 산출물 폴더 열기
                      </button>
                    ) : (
                      <p className={styles.connNote}>
                        이 브라우저는 폴더 열기를 지원하지 않아요 (Chrome/Edge 필요).
                      </p>
                    )}
                    <details className={styles.connDetails}>
                      <summary>서버(로컬 실행) 경로로 연동</summary>
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
                    </details>
                  </>
                )}
                <p className={styles.connNote}>Claude Code·Gemini 등의 작업 산출물 폴더</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 답장 초안 모달 (phase5 §3) */}
      {draft && (
        <div className={styles.overlay} onClick={() => setDraft(null)}>
          <div
            ref={draftModalRef}
            tabIndex={-1}
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`답장 초안 — ${draft.title}`}
          >
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
