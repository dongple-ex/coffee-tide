// coffeeTide 대시보드 — 정본 요구사항 반영:
// G1 manual/paste 1급 소스, G2 무연동 빈 화면 안내, G3 무연동 Copilot,
// G4 서버측 날짜/출처 근거, G6 MarkdownLite 렌더링, E1 aria-label,
// 팔로업 에스컬레이션·dismiss(D3 정리)·규칙 빌더(as-built §5), 폴링 visibility 일시정지(8-mobile §5).

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutomationRule, ProcessedData } from "@/lib/automation/rules";
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
  ConnectionState,
  MailsResponse,
  UnifiedCategory,
  UnifiedData,
} from "@/lib/types/unified";
import { ACTION_LABEL, ERROR_SOURCE_LABELS, FIELD_LABEL } from "@/lib/labels";
import { buildMergedView, TODO_CATS } from "@/lib/mergeView";
import {
  loadLS,
  saveLS,
  LS_APP_SHORTCUTS,
  LS_BRIEF_TIME,
  LS_BROWSER_CAT,
  LS_COMMUTE_CONFIG,
  LS_DISMISSED,
  LS_FOLLOWUP,
  LS_HANDOFF_STATE,
  LS_MANUAL,
  LS_RULES,
  LS_SUB_TASKS,
  LS_THEME,
  LS_WEATHER_COORDS,
  LS_WEATHER_ENABLED,
  LS_WORK_NOTES,
} from "@/lib/localStore";
import { useModalA11y } from "./hooks/useModalA11y";
import { AutomationRulesSection } from "./components/settings/AutomationRulesSection";
import { CommuteSection } from "./components/settings/CommuteSection";
import { ConnectionsSection } from "./components/settings/ConnectionsSection";
import { NotificationSection } from "./components/settings/NotificationSection";
import { ShortcutsSection } from "./components/settings/ShortcutsSection";
import { WeatherSection } from "./components/settings/WeatherSection";
import CafeWait from "./components/cafeWait";
import { TaskItemCard } from "./components/TaskItemCard";
import { CopilotComposer } from "./components/copilot/CopilotComposer";
import { CopilotConversation } from "./components/copilot/CopilotConversation";
import { buildQaPairs, CopilotMessage } from "@/lib/copilotPairs";
import IcedAmericano from "./components/icedAmericano";
import { WelcomeCard, WeatherData } from "./components/WelcomeCard";
import { CommuteCard } from "./components/CommuteCard";
import { TimerWidget } from "./components/TimerWidget";
import { CalculatorWidget } from "./components/CalculatorWidget";
import { ShortcutsWidget } from "./components/ShortcutsWidget";
import { WeatherWidget } from "./components/WeatherWidget";
import { ByteNewsWidget } from "./components/ByteNewsWidget";
import { CommuteConfig, CommuteStop } from "@/lib/types/commute";
import { AppShortcut } from "@/lib/types/appShortcut";
import { saveRawContent, getRawContent } from "@/lib/browser/rawStore";
import styles from "./page.module.css";

import { SubTask } from "@/lib/types/unified";

const LS_RAW_ENABLED = "ct_raw_enabled";
const LS_DRIVE_BACKUP_ENABLED = "ct_drive_backup_enabled";

const POLL_MS = 30_000;

// 퇴근 핸드오프는 **UI 스냅샷 전용**이다. 업무 데이터의 정본은 ct_manual_items / ct_dismissed_ids이며,
// 여기에 복제하면 localStorage(약 5MB)를 이중으로 먹고 어느 쪽이 최신인지도 모호해진다.
export interface HandoffState {
  savedAt: string;
  pendingCount: number;
  todoSectionCollapsed: boolean;
  llmSectionCollapsed: boolean;
  restSectionCollapsed: boolean;
  welcomeCardCollapsed: boolean;
  copilotMessages: CopilotMessage[];
  /** 복원 안내 배너를 사용자가 확인했는지 — 스냅샷은 유지하되 배너만 1회로 제한 */
  acknowledged?: boolean;
}

const DEFAULT_APP_SHORTCUTS: AppShortcut[] = [
  {
    id: "preset-google-anti",
    keyword: "구글안티",
    target: "C:\\Users\\tstar\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe",
    enabled: true,
  },
  {
    id: "preset-kakaotalk",
    keyword: "카카오톡",
    target: "kakaotalk://",
    enabled: true,
  },
  {
    id: "preset-notion",
    keyword: "노션",
    target: "notion://",
    enabled: true,
  },
];

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

  // 지난 퇴근(handoff) 스냅샷은 마운트 시 1회만 읽어 각 state의 lazy 초기값으로 쓴다.
  // effect에서 setState로 복원하면 cascading render가 발생한다(react-hooks/set-state-in-effect).
  const [handoffSnapshot] = useState<HandoffState | null>(() =>
    loadLS<HandoffState | null>(LS_HANDOFF_STATE, null)
  );

  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>(
    () => handoffSnapshot?.copilotMessages ?? []
  );
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [welcomeCardCollapsed, setWelcomeCardCollapsed] = useState(
    () => handoffSnapshot?.welcomeCardCollapsed ?? false
  );
  const [expandedQaKeys, setExpandedQaKeys] = useState<Set<string>>(new Set());
  const [unreadQaKeys, setUnreadQaKeys] = useState<Set<string>>(new Set());

  // Q&A 답변 도착 시 접혀있는 카드가 있으면 깜빡이는 알림(unreadQaKeys) 등록.
  // 쌍 묶기는 CopilotConversation과 반드시 같은 결과여야 해서 buildQaPairs를 공유한다.
  useEffect(() => {
    if (copilotMessages.length === 0) return;
    buildQaPairs(copilotMessages).forEach((pair) => {
      if (pair.aiText && !expandedQaKeys.has(pair.id)) {
        setUnreadQaKeys((prev) => {
          if (prev.has(pair.id)) return prev;
          const next = new Set(prev);
          next.add(pair.id);
          return next;
        });
      }
    });
  }, [copilotMessages, expandedQaKeys]);

  /** 답변 펼침 토글 — 펼치면 미읽음 표시도 해제한다 */
  const toggleQaPair = useCallback((pairId: string) => {
    setExpandedQaKeys((prev) => {
      const next = new Set(prev);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
    setUnreadQaKeys((prev) => {
      if (!prev.has(pairId)) return prev;
      const next = new Set(prev);
      next.delete(pairId);
      return next;
    });
  }, []);
  const [todoSectionCollapsed, setTodoSectionCollapsed] = useState(
    () => handoffSnapshot?.todoSectionCollapsed ?? false
  );
  const [llmSectionCollapsed, setLlmSectionCollapsed] = useState(
    () => handoffSnapshot?.llmSectionCollapsed ?? false
  );
  const [restSectionCollapsed, setRestSectionCollapsed] = useState(
    () => handoffSnapshot?.restSectionCollapsed ?? false
  );
  // 복원 안내는 스냅샷당 1회만 — 확인을 누르면 acknowledged로 표시해 재출현을 막는다
  const [handoffRestoredInfo, setHandoffRestoredInfo] = useState<{
    savedAt: string;
    pendingCount: number;
  } | null>(() =>
    handoffSnapshot && !handoffSnapshot.acknowledged
      ? { savedAt: handoffSnapshot.savedAt, pendingCount: handoffSnapshot.pendingCount }
      : null
  );

  const acknowledgeHandoff = useCallback(() => {
    setHandoffRestoredInfo(null);
    const stored = loadLS<HandoffState | null>(LS_HANDOFF_STATE, null);
    if (stored) saveLS(LS_HANDOFF_STATE, { ...stored, acknowledged: true });
  }, []);

  const [saveToDrive, setSaveToDrive] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const plusFirstItemRef = useRef<HTMLButtonElement>(null);
  const copilotBodyRef = useRef<HTMLDivElement>(null);

  const [ruleInput, setRuleInput] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);

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
      transportType: "public",
    })
  );
  const [activeWidget, setActiveWidget] = useState<string | null>(null);
  const widgetListRef = useRef<HTMLDivElement>(null);
  const isWidgetDragging = useRef(false);
  const widgetStartX = useRef(0);
  const widgetScrollLeft = useRef(0);

  const handleWidgetMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!widgetListRef.current) return;
    isWidgetDragging.current = true;
    widgetStartX.current = e.pageX - widgetListRef.current.offsetLeft;
    widgetScrollLeft.current = widgetListRef.current.scrollLeft;
  };

  const handleWidgetMouseLeaveOrUp = () => {
    isWidgetDragging.current = false;
  };

  const handleWidgetMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isWidgetDragging.current || !widgetListRef.current) return;
    const x = e.pageX - widgetListRef.current.offsetLeft;
    const walk = (x - widgetStartX.current) * 1.5;
    widgetListRef.current.scrollLeft = widgetScrollLeft.current - walk;
  };

  const [appShortcuts, setAppShortcuts] = useState<AppShortcut[]>(() =>
    loadLS<AppShortcut[]>(LS_APP_SHORTCUTS, DEFAULT_APP_SHORTCUTS)
  );

  const [workNotes, setWorkNotes] = useState<Record<string, string>>(() => loadLS(LS_WORK_NOTES, {}));
  const [subTasksMap, setSubTasksMap] = useState<Record<string, SubTask[]>>(() => loadLS(LS_SUB_TASKS, {}));
  const [openWorkNoteId, setOpenWorkNoteId] = useState<string | null>(null);

  const [openRawContentId, setOpenRawContentId] = useState<string | null>(null);
  const [loadedRawTexts, setLoadedRawTexts] = useState<Record<string, string>>({});

  const handleToggleRawContent = async (itemId: string, defaultRaw?: string) => {
    if (openRawContentId === itemId) {
      setOpenRawContentId(null);
      return;
    }
    setOpenRawContentId(itemId);
    if (!loadedRawTexts[itemId]) {
      if (defaultRaw) {
        setLoadedRawTexts((prev) => ({ ...prev, [itemId]: defaultRaw }));
      } else {
        const dbRaw = await getRawContent(itemId);
        if (dbRaw) {
          setLoadedRawTexts((prev) => ({ ...prev, [itemId]: dbRaw }));
        }
      }
    }
  };

  const [rawEnabled, setRawEnabled] = useState<boolean>(() => loadLS<boolean>(LS_RAW_ENABLED, true));
  const [driveBackupEnabled, setDriveBackupEnabled] = useState<boolean>(() => loadLS<boolean>(LS_DRIVE_BACKUP_ENABLED, true));

  const handleSaveWorkNote = (taskId: string, note: string) => {
    setWorkNotes((prev) => {
      const next = { ...prev, [taskId]: note };
      saveLS(LS_WORK_NOTES, next);
      return next;
    });
  };

  const handleAddSubTask = (taskId: string, title: string) => {
    const text = title.trim();
    if (!text) return;
    const newSub: SubTask = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: text,
      completed: false,
    };
    setSubTasksMap((prev) => {
      const list = prev[taskId] || [];
      const next = { ...prev, [taskId]: [...list, newSub] };
      saveLS(LS_SUB_TASKS, next);
      return next;
    });
  };

  const handleToggleSubTask = (taskId: string, subId: string) => {
    setSubTasksMap((prev) => {
      const list = prev[taskId] || [];
      const nextList = list.map((s) => (s.id === subId ? { ...s, completed: !s.completed } : s));
      const next = { ...prev, [taskId]: nextList };
      saveLS(LS_SUB_TASKS, next);
      return next;
    });
  };

  const handleRemoveSubTask = (taskId: string, subId: string) => {
    setSubTasksMap((prev) => {
      const list = prev[taskId] || [];
      const nextList = list.filter((s) => s.id !== subId);
      const next = { ...prev, [taskId]: nextList };
      saveLS(LS_SUB_TASKS, next);
      return next;
    });
  };

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

  // 순수 fetch — 상태 갱신은 호출부(비동기 콜백)에서 한다.
  // 이렇게 두면 effect 본문에서 동기 setState가 일어나지 않는다(react-hooks/set-state-in-effect).
  const fetchWeatherData = useCallback(async (lat: number, lon: number): Promise<WeatherData | null> => {
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      const data = (await res.json()) as { success?: boolean; weather?: WeatherData };
      return data.success && data.weather ? data.weather : null;
    } catch (err) {
      console.warn("[coffeeTide] Weather fetch failed:", err);
      return null;
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
        showToast("📍 위치 허용 완료! 날씨 브리핑이 활성화되었습니다.");
        void fetchWeatherData(coords.lat, coords.lon).then((weather) => {
          if (weather) setWeatherData(weather);
        });
      },
      (error) => {
        setWeatherBusy(false);
        showToast(`위치 권한 오류: ${error.message}`);
      },
      { timeout: 10000 }
    );
  }, [fetchWeatherData, showToast]);

  // 지도 앱 딥링크(카카오 kakaomap://route, 네이버 nmap://route/*)는 좌표가 필수다.
  // 별도 지오코딩 키 없이 좌표를 확보하는 가장 확실한 방법 — 그 자리에서 현재 위치를 찍어 저장한다.
  const captureCommuteCoords = useCallback(
    (which: "home" | "work") => {
      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        showToast("이 브라우저는 위치 정보를 지원하지 않아요.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: Number(position.coords.latitude.toFixed(5)),
            lng: Number(position.coords.longitude.toFixed(5)),
          };
          const label = which === "home" ? "집" : "회사";
          setCommuteConfig((prev) => {
            const next: CommuteConfig =
              which === "home" ? { ...prev, homeCoords: coords } : { ...prev, workCoords: coords };
            saveLS(LS_COMMUTE_CONFIG, next);
            return next;
          });
          showToast(`📍 현재 위치를 '${label}'로 저장했어요. 가까운 정류소를 찾는 중…`);

          // 좌표는 여기서 한 번만 서버로 보내 정류소 코드로 바꾼다.
          // 이후 출퇴근 카드 폴링에는 코드만 오간다(K2·K12).
          void (async () => {
            try {
              const res = await fetch(`/api/commute/stops?lat=${coords.lat}&lng=${coords.lng}`);
              const data = (await res.json()) as {
                success?: boolean;
                stops?: CommuteStop[];
                reason?: string;
              };
              const nearest = data.success ? data.stops?.[0] : undefined;
              if (!nearest) {
                showToast(
                  `'${label}' 위치는 저장했어요. 다만 가까운 정류소는 못 찾았어요${data.reason ? ` (${data.reason})` : ""} — 지도 앱 길찾기는 정상 동작합니다.`
                );
                return;
              }
              setCommuteConfig((prev) => {
                const next: CommuteConfig =
                  which === "home" ? { ...prev, homeStop: nearest } : { ...prev, workStop: nearest };
                saveLS(LS_COMMUTE_CONFIG, next);
                return next;
              });
              showToast(
                `🚏 '${label}' 근처 정류소 '${nearest.name}'${nearest.distanceM !== undefined ? ` (약 ${nearest.distanceM}m)` : ""}를 등록했어요.`
              );
            } catch {
              showToast(`'${label}' 위치는 저장했어요. 정류소 조회는 잠시 후 다시 시도해 주세요.`);
            }
          })();
        },
        (error) => showToast(`위치 권한 오류: ${error.message}`),
        { timeout: 10000 }
      );
    },
    [showToast]
  );

  const disableWeatherLocation = useCallback(() => {
    setWeatherEnabled(false);
    setWeatherData(null);
    saveLS(LS_WEATHER_ENABLED, false);
    showToast("날씨 브리핑을 껐습니다.");
  }, [showToast]);

  // 날씨 동기화 — 저장된 좌표가 있으면 그 좌표로, 없으면 1회 위치 조회 후 가져온다.
  // 상태 갱신은 모두 비동기 콜백(fetch·geolocation) 안에서만 일어난다.
  useEffect(() => {
    if (!weatherEnabled) return;
    let cancelled = false;

    const load = (lat: number, lon: number) => {
      void fetchWeatherData(lat, lon).then((weather) => {
        if (!cancelled && weather) setWeatherData(weather);
      });
    };

    if (weatherCoords) {
      load(weatherCoords.lat, weatherCoords.lon);
    } else if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
          setWeatherCoords(coords);
          saveLS(LS_WEATHER_COORDS, coords);
          load(coords.lat, coords.lon);
        },
        () => {},
        { timeout: 8000 }
      );
    }

    return () => {
      cancelled = true;
    };
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
      setDismissed((prev) => {
        const next = prev.filter((id) => validIds.has(id) || id.startsWith(BROWSER_ID_PREFIX));
        if (next.length !== prev.length) saveLS(LS_DISMISSED, next);
        return next;
      });
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
      setDismissed((prev) => {
        const next = prev.filter((id) => !id.startsWith(BROWSER_ID_PREFIX) || ids.has(id));
        if (next.length !== prev.length) saveLS(LS_DISMISSED, next);
        return next;
      });
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

  const [isDataRefreshing, setIsDataRefreshing] = useState(false);

  const handleRefreshAll = useCallback(async () => {
    if (isDataRefreshing) return;
    setIsDataRefreshing(true);
    try {
      await fetchMails(true);
      if (weatherEnabled && weatherCoords) {
        const weather = await fetchWeatherData(weatherCoords.lat, weatherCoords.lon);
        if (weather) setWeatherData(weather);
      }
      showToast("날짜·시간대 및 연결 최신 데이터를 불러왔습니다. ☕");
    } catch {
      showToast("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsDataRefreshing(false);
    }
  }, [isDataRefreshing, fetchMails, weatherEnabled, weatherCoords, fetchWeatherData, showToast]);

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

  const handleLogoutHandoff = useCallback(async () => {
    const pendingItems = merged.filter((i) => i.status !== "completed");
    const summary = pendingItems.map((i) => `- [ ] ${i.title}`).join("\n");
    const text = `# ☕ coffeeTide Hand-off\n\n## 🚧 내일 이어서 할 일\n${summary}`;

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(
      2,
      "0"
    )}:${String(now.getMinutes()).padStart(2, "0")}`;

    // 업무 데이터(manualItems/dismissed)는 각자의 키가 정본이므로 스냅샷에 복제하지 않는다
    const handoffData: HandoffState = {
      savedAt: formattedDate,
      pendingCount: pendingItems.length,
      todoSectionCollapsed,
      llmSectionCollapsed,
      restSectionCollapsed,
      welcomeCardCollapsed,
      copilotMessages,
      acknowledged: false,
    };

    saveLS(LS_HANDOFF_STATE, handoffData);

    try {
      await navigator.clipboard.writeText(text);
      showToast(`☕ 퇴근 완료! 보존된 업무(${pendingItems.length}건) 상태가 기록 관리되었습니다.`);
    } catch {
      showToast(`☕ 퇴근 완료! 보존된 업무(${pendingItems.length}건) 상태가 안전하게 저장되었습니다.`);
    }
  }, [
    merged,
    todoSectionCollapsed,
    llmSectionCollapsed,
    restSectionCollapsed,
    welcomeCardCollapsed,
    copilotMessages,
    showToast,
  ]);

  // 이벤트 핸들러에서만 호출되므로 메모이제이션하지 않는다 —
  // askCopilot(비메모)을 참조해 useCallback을 걸면 매 렌더 identity가 바뀌어 의미가 없다.
  async function handleReorderRemainingWithAI() {
    const pendingItems = merged.filter((i) => i.status !== "completed");
    if (pendingItems.length === 0) {
      showToast("현재 처리할 미완료 업무가 없습니다. ☕");
      return;
    }

    const itemsSummary = pendingItems
      .map((i) => {
        const note = workNotes[i.id] ? ` [진행 메모: ${workNotes[i.id]}]` : "";
        const subs = subTasksMap[i.id] && subTasksMap[i.id].length > 0
          ? ` (하위작업: ${subTasksMap[i.id].filter(s => s.completed).length}/${subTasksMap[i.id].length} 완료)`
          : "";
        return `- ${i.title}${note}${subs}`;
      })
      .join("\n");

    const prompt = `오늘 아직 다 완료하지 못한 남은 업무들이야. 진행 상황과 워크노트를 바탕으로 남은 오후/오늘 일정에 맞춰 핵심 우선순위와 실천 가이드를 브리핑해줘:\n\n${itemsSummary}`;

    setWelcomeCardCollapsed(true);
    void askCopilot(prompt);
    showToast("남은 업무들과 진행 메모를 바탕으로 AI 바리스타가 일정 재배치 브리핑을 작성합니다! ☕");
  }

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
        body: JSON.stringify({ text, saveToDrive: driveBackupEnabled }),
      });
      if (!res.ok) throw new Error();
      const { tasks } = (await res.json()) as { tasks: UnifiedData[] };
      // PC IndexedDB 대용량 DB에도 옵션 켜짐 시 원문 보관
      if (rawEnabled) {
        tasks.forEach((t) => {
          if (text) void saveRawContent(t.id, text);
        });
      }
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
    setDismissed((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveLS(LS_DISMISSED, next);
      return next;
    });
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

  const handleSlashCommand = (cmdText: string): boolean => {
    const trimmed = cmdText.trim().toLowerCase();
    if (!trimmed.startsWith("/")) return false;

    const cmd = trimmed.split(" ")[0];

    if (cmd === "/clear" || cmd === "/clean") {
      setCopilotMessages([]);
      setCopilotInput("");
      showToast("AI 바리스타 대화 내역을 깨끗하게 정리했어요! ☕");
      return true;
    }

    if (cmd === "/status" || cmd === "/stats") {
      setCopilotInput("");
      const activeCount = merged.filter((i) => i.status !== "completed").length;
      const urgentCount = merged.filter((i) => i.category === "urgent" && i.status !== "completed").length;
      const doneCount = manualItems.filter((i) => i.status === "completed").length;
      const text = `📊 **현재 업무 처리 상태 현황**:\n\n- ⏳ 대기 및 진행 중: **${activeCount}건**\n- 🚨 긴급 처리 필요: **${urgentCount}건**\n- ✅ 오늘 처리 완료: **${doneCount}건**\n\n언제든 질문이나 추가 지시를 말씀해주세요 ☕`;
      setCopilotMessages((prev) => [...prev, { role: "ai", text }]);
      return true;
    }

    if (cmd === "/handoff") {
      setCopilotInput("");
      void handleLogoutHandoff();
      return true;
    }

    if (cmd === "/reorder") {
      setCopilotInput("");
      void handleReorderRemainingWithAI();
      return true;
    }

    if (cmd === "/help" || cmd === "/?") {
      setCopilotInput("");
      const text = `💡 **AI 바리스타 슬래시 커맨드 안내**:\n\n- \`/clear\` : 대화 내역 초기화\n- \`/status\` : 업무 처리 현황 요약\n- \`/handoff\` : 남은 업무 퇴근 보존 및 정리\n- \`/reorder\` : 남은 업무 AI 일정 재배치\n- \`/help\` : 커맨드 도움말 출력\n\n**단어-앱 바로가기**: 등록한 키워드만 단독으로(또는 \`@키워드\`) 입력하면 해당 앱이 실행돼요. 문장 속에 키워드가 있으면 실행 대신 평소처럼 답변해 드립니다.`;
      setCopilotMessages((prev) => [...prev, { role: "ai", text }]);
      return true;
    }

    return false;
  };

  // ── Copilot (G3: 무연동에서도 동작) ──────────
  async function askCopilot(preset?: string) {
    setWelcomeCardCollapsed(true);
    const question = (preset ?? copilotInput).trim();
    if (!question || copilotBusy) return;

    if (handleSlashCommand(question)) {
      return;
    }

    setCopilotInput("");
    setCopilotMessages((prev) => [...prev, { role: "user", text: question }]);

    // 단어-앱 바로가기 레시피 — 질문 전체가 키워드(또는 @키워드)와 일치할 때만 실행한다.
    // 부분 일치로 잡으면 "노션에 정리한 업무 알려줘" 같은 정상 질문이 실행에 가로채여 답변을 못 받는다.
    const normalizedQuestion = question.trim().toLowerCase().replace(/^@/, "");
    const matchedShortcut = appShortcuts.find(
      (s) => s.enabled && s.keyword.trim().toLowerCase() === normalizedQuestion
    );

    if (matchedShortcut) {
      setCopilotBusy(true);
      try {
        const res = await fetch("/api/util/exec-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: matchedShortcut.target }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setCopilotMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: res.ok
              ? `🚀 **'${matchedShortcut.keyword}'** 명령 확인! **[${matchedShortcut.target}]** 실행했어요 ☕`
              : `앗, **'${matchedShortcut.keyword}'** 실행에 실패했어요 — ${json.error ?? `HTTP ${res.status}`}`,
          },
        ]);
      } catch {
        setCopilotMessages((prev) => [
          ...prev,
          { role: "ai", text: `앗, **'${matchedShortcut.keyword}'** 실행 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.` },
        ]);
      } finally {
        setCopilotBusy(false);
      }
      return;
    }

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

  /** @returns 성공 여부 — 호출부(ConnectionsSection)가 입력값 초기화를 결정한다 */
  async function connectNotion(token: string, dbId: string): Promise<boolean> {
    const res = await fetch("/api/auth/notion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", token, dbId }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      showToast(json.error ?? "앗, Notion과 연결이 잘 안 됐어요 — 토큰과 Database ID를 한 번만 확인해 주세요.");
      return false;
    }
    showToast("Notion 연결 완료! 태스크 모시러 갑니다.");
    void fetchMails(true);
    return true;
  }

  async function addLocalDocFolder(path: string): Promise<boolean> {
    if (!path.trim()) {
      showToast("폴더 경로를 알려주세요");
      return false;
    }
    const res = await fetch("/api/auth/local-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", path: path.trim() }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      showToast(json.error ?? "앗, 폴더를 못 담았어요. 경로를 확인해 주세요.");
      return false;
    }
    showToast("폴더 추가 완료! 이 폴더도 챙겨볼게요.");
    void fetchMails(true);
    return true;
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

  /** 네이티브 폴더 선택 (Windows 전용) — @returns 선택한 경로, 취소/실패 시 null */
  async function pickFolder(): Promise<string | null> {
    try {
      const res = await fetch("/api/util/select-folder");
      const json = (await res.json()) as { path?: string; error?: string };
      if (json.path) return json.path;
      if (json.error) showToast(json.error);
      return null;
    } catch {
      showToast("폴더 선택 창이 안 열리네요. 경로를 직접 적어 주시면 챙겨볼게요.");
      return null;
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

  // subscribePush/unsubscribePush(비메모)를 참조하므로 useCallback을 걸어도 identity가 안정되지 않는다.
  // 이벤트 핸들러 전용이라 메모이제이션이 필요 없다.
  async function toggleNotification(enable: boolean) {
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

  function renderItem(item: ProcessedData & { overdue: number }) {
    return (
      <TaskItemCard
        key={item.id}
        item={item}
        busy={busyIds.has(item.id)}
        contentExpanded={expanded.has(item.id)}
        onToggleContent={() => toggleExpand(item.id)}
        workNoteOpen={openWorkNoteId === item.id}
        onToggleWorkNote={() => setOpenWorkNoteId((prev) => (prev === item.id ? null : item.id))}
        workNote={workNotes[item.id] || ""}
        onChangeWorkNote={(note) => handleSaveWorkNote(item.id, note)}
        subTasks={subTasksMap[item.id] ?? []}
        onAddSubTask={(title) => handleAddSubTask(item.id, title)}
        onToggleSubTask={(subId) => handleToggleSubTask(item.id, subId)}
        onRemoveSubTask={(subId) => handleRemoveSubTask(item.id, subId)}
        canCaptureObsidian={Boolean(connections?.obsidian || browserObsidian)}
        canCaptureNotion={Boolean(connections?.notion)}
        onSetStatus={(status) => setLocalStatus(item.id, status)}
        onDelete={() => deleteLocal(item.id)}
        onReplyDraft={() => void replyDraft(item)}
        onCompleteExternal={() => void completeExternal(item)}
        onCapture={(target) => void capture(item, target)}
        onDismiss={() => dismissItem(item.id)}
        rawContentOpen={openRawContentId === item.id}
        onToggleRawContent={() => void handleToggleRawContent(item.id, item.rawContent)}
        rawText={loadedRawTexts[item.id]}
      />
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
              onClick={() => void handleLogoutHandoff()}
            >
              퇴근하기
            </button>
          </div>
        </div>
        <div className={styles.headerRowStart} style={{ justifyContent: "space-between", alignItems: "center", width: "100%" }}>
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
          <button
            className={styles.refreshBtn}
            onClick={() => void handleRefreshAll()}
            disabled={isDataRefreshing}
            aria-label="연결 데이터 새로고침"
            title="연결 데이터 새로고침"
          >
            <svg
              className={isDataRefreshing ? styles.spinIcon : ""}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6" />
              <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.3L2.5 16" />
            </svg>
          </button>
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

      {handoffRestoredInfo && (
        <div className={styles.handoffBanner}>
          <div className={styles.handoffBannerContent}>
            <span style={{ fontSize: "1.1rem" }}>🌅</span>
            <span>
              <b>지난 퇴근 보존 상태 복원:</b> {handoffRestoredInfo.savedAt} 퇴근 시 기록된 업무 ({handoffRestoredInfo.pendingCount}건) 및 UI 상태가 그대로 유지되었습니다.
            </span>
          </div>
          <button
            type="button"
            className={styles.handoffBannerBtn}
            onClick={acknowledgeHandoff}
          >
            확인 ✕
          </button>
        </div>
      )}

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
      {/* 🧩 확장형 빠른 위젯 바 (Widget Toolbar) */}
      <div className={styles.widgetBarSection}>
        <div className={styles.widgetBarHeader}>
          <span className={styles.widgetBarTitle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            빠른 위젯 도구함
          </span>
        </div>
        <div
          className={styles.widgetList}
          ref={widgetListRef}
          onMouseDown={handleWidgetMouseDown}
          onMouseLeave={handleWidgetMouseLeaveOrUp}
          onMouseUp={handleWidgetMouseLeaveOrUp}
          onMouseMove={handleWidgetMouseMove}
        >
          <button
            type="button"
            className={`${styles.widgetChip} ${activeWidget === "weather" ? styles.widgetChipActive : ""}`}
            onClick={() => setActiveWidget((prev) => (prev === "weather" ? null : "weather"))}
            title="실시간 날씨 정보 및 브리핑 열기/닫기"
          >
            <span>🌤️</span>
            <span>실시간 날씨</span>
          </button>
          {commuteConfig.enabled && (
            <button
              type="button"
              className={`${styles.widgetChip} ${activeWidget === "commute" ? styles.widgetChipActive : ""}`}
              onClick={() => setActiveWidget((prev) => (prev === "commute" ? null : "commute"))}
              title="출퇴근 길찾기 위젯 열기/닫기"
            >
              <span>🚇</span>
              <span>스마트 길찾기</span>
            </button>
          )}
          <button
            type="button"
            className={`${styles.widgetChip} ${activeWidget === "timer" ? styles.widgetChipActive : ""}`}
            onClick={() => setActiveWidget((prev) => (prev === "timer" ? null : "timer"))}
            title="집중 몰입 타이머 열기/닫기"
          >
            <span>⏱️</span>
            <span>몰입 타이머</span>
          </button>
          <button
            type="button"
            className={`${styles.widgetChip} ${activeWidget === "calc" ? styles.widgetChipActive : ""}`}
            onClick={() => setActiveWidget((prev) => (prev === "calc" ? null : "calc"))}
            title="빠른 수치 계산기 열기/닫기"
          >
            <span>🧮</span>
            <span>빠른 계산기</span>
          </button>
          <button
            type="button"
            className={`${styles.widgetChip} ${activeWidget === "shortcuts" ? styles.widgetChipActive : ""}`}
            onClick={() => setActiveWidget((prev) => (prev === "shortcuts" ? null : "shortcuts"))}
            title="앱/레시피 바로가기 즐겨찾기 열기/닫기"
          >
            <span>⭐</span>
            <span>바로가기 즐겨찾기</span>
          </button>
        </div>

        {/* 선택된 위젯 패널 */}
        {activeWidget === "weather" && (
          <div className={styles.widgetPanel}>
            <WeatherWidget
              weather={weatherData}
              enabled={weatherEnabled}
              onEnableLocation={enableWeatherLocation}
              onRefreshWeather={() => {
                if (!weatherCoords) return;
                void fetchWeatherData(weatherCoords.lat, weatherCoords.lon).then((weather) => {
                  if (weather) {
                    setWeatherData(weather);
                    showToast("실시간 날씨 정보가 갱신되었습니다 🌤️");
                  } else {
                    showToast("날씨 정보를 갱신하지 못했어요. 잠시 후 다시 시도해 주세요.");
                  }
                });
              }}
            />
          </div>
        )}
        {activeWidget === "commute" && commuteConfig.enabled && (
          <div className={styles.widgetPanel}>
            <CommuteCard
              homeStation={commuteConfig.homeStation || "서울역"}
              workStation={commuteConfig.workStation || "수원역"}
              transportType={commuteConfig.transportType || "public"}
              homeCoords={commuteConfig.homeCoords}
              workCoords={commuteConfig.workCoords}
              homeStop={commuteConfig.homeStop}
              workStop={commuteConfig.workStop}
              onOpenSettings={() => setShowConn(true)}
            />
          </div>
        )}
        {activeWidget === "timer" && (
          <div className={styles.widgetPanel}>
            <TimerWidget onCompleteToast={showToast} />
          </div>
        )}
        {activeWidget === "calc" && (
          <div className={styles.widgetPanel}>
            <CalculatorWidget />
          </div>
        )}
        {activeWidget === "shortcuts" && (
          <div className={styles.widgetPanel}>
            <ShortcutsWidget shortcuts={appShortcuts} onError={showToast} />
          </div>
        )}
      </div>

      <div className={styles.grid}>
        {/* G1: 빠른 업무 추가 + 붙여넣기 — 입력 경로가 최우선 (00-product-spec §4.1) */}
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
          <WelcomeCard
            compact
            weather={weatherData}
            collapsed={welcomeCardCollapsed}
            onToggleCollapsed={setWelcomeCardCollapsed}
            taskCount={merged.filter((i) => i.status !== "completed" && i.status !== "dismissed").length}
            urgentCount={merged.filter((i) => i.category === "urgent" && i.status !== "completed" && i.status !== "dismissed").length}
          />
          <CopilotConversation
            bodyRef={copilotBodyRef}
            messages={copilotMessages}
            busy={copilotBusy}
            waitSteps={dynamicCopilotSteps}
            hasItems={merged.length > 0}
            expandedKeys={expandedQaKeys}
            unreadKeys={unreadQaKeys}
            onToggleExpand={toggleQaPair}
          />
          <CopilotComposer
            value={copilotInput}
            onChange={setCopilotInput}
            onSubmit={() => void askCopilot()}
            onFocus={() => setWelcomeCardCollapsed(true)}
            busy={copilotBusy}
            onRunSlashCommand={(cmd) => handleSlashCommand(cmd)}
            onQuickBriefing={() => void askCopilot("오늘 해야 할 일을 브리핑해줘")}
            fileInputRef={fileInputRef}
            onFileChange={handleFileUpload}
            uploadBusy={uploadBusy}
            plusOpen={plusOpen}
            onTogglePlus={setPlusOpen}
            plusBtnRef={plusBtnRef}
            plusFirstItemRef={plusFirstItemRef}
            saveToDrive={saveToDrive}
            onToggleSaveToDrive={() => {
              userSetDriveRef.current = true;
              setSaveToDrive(!saveToDrive);
            }}
            googleConnected={googleConnected}
          />
        </section>



        {/* 오늘의 행동 지침 */}
        <section className={`${styles.card} ${styles.colFull}`}>
          <div
            className={`${styles.cardTitle} ${styles.cardTitleToggleable}`}
            onClick={() => setTodoSectionCollapsed((prev) => !prev)}
          >
            <span>🎯 오늘의 행동 지침</span>
            <small>{todoItems.length}건</small>
            <button
              type="button"
              className={styles.btnReorder}
              onClick={(e) => {
                e.stopPropagation();
                void handleReorderRemainingWithAI();
              }}
              title="미완료 및 진행 중 업무들을 AI 바리스타가 일정 재배치 브리핑으로 정리합니다"
            >
              🔄 남은 업무 AI 재배치
            </button>
            <span className={styles.folderToggleIcon} title={todoSectionCollapsed ? "섹션 펼치기" : "섹션 접기"}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: todoSectionCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </span>
          </div>
          {!todoSectionCollapsed && (
            todoItems.length === 0 ? (
              <div className={styles.emptyState}>
                {/* G2: 연동 전제가 아닌 입력 우선 안내 */}
                오늘은 아직 조용하네요. <b>위에서 업무를 추가하거나 메모를 붙여넣어
                보세요.</b>
                {!isAnyConnected && " Outlook/Notion 연동은 나중에 해도 충분해요."}
              </div>
            ) : (
              <div className={styles.list}>{todoItems.map(renderItem)}</div>
            )
          )}
        </section>

        {/* 🧠 오늘의 LLM 작업 (phase6 §7) */}
        {(llmItems.length > 0 || connections?.llm || browserLlm) && (
          <section className={`${styles.card} ${styles.colFull}`}>
            <div
              className={`${styles.cardTitle} ${styles.cardTitleToggleable}`}
              onClick={() => setLlmSectionCollapsed((prev) => !prev)}
            >
              <span>🧠 오늘의 LLM 작업</span>
              <small>{llmItems.length}건</small>
              {connections?.obsidian && (
                <button
                  className={`${styles.btn} ${styles.cardTitleBtn}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    exportLlmDigest();
                  }}
                >
                  📥 Obsidian에 오늘 요약 내보내기
                </button>
              )}
              <span className={styles.folderToggleIcon} title={llmSectionCollapsed ? "섹션 펼치기" : "섹션 접기"}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: llmSectionCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </span>
            </div>
            {!llmSectionCollapsed && (
              llmItems.length === 0 ? (
                <div className={styles.emptyState}>
                  오늘은 AI 동료들이 조용하네요. 산출물이 생기면 여기 모아드릴게요.
                </div>
              ) : (
                <div className={styles.list}>{llmItems.map(renderItem)}</div>
              )
            )}
          </section>
        )}

        {/* 전체 목록 */}
        <section className={`${styles.card} ${styles.colFull}`}>
          <div
            className={`${styles.cardTitle} ${styles.cardTitleToggleable}`}
            onClick={() => setRestSectionCollapsed((prev) => !prev)}
          >
            <span>📚 받은 항목 전체</span>
            <small>{restItems.length}건</small>
            <span className={styles.folderToggleIcon} title={restSectionCollapsed ? "섹션 펼치기" : "섹션 접기"}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: restSectionCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </span>
          </div>
          {!restSectionCollapsed && (
            restItems.length === 0 ? (
              <div className={styles.emptyState}>
                참고용 소식이 모이는 자리예요. 아직은 텅 — 업무를 추가하거나 문서를
                가져오면 채워드릴게요.
              </div>
            ) : (
              <div className={styles.list}>{restItems.map(renderItem)}</div>
            )
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

            <AutomationRulesSection
              rules={rules}
              onChangeRules={setRules}
              ruleInput={ruleInput}
              onChangeRuleInput={setRuleInput}
              ruleBusy={ruleBusy}
              onAddRule={addRule}
            />

            <NotificationSection
              pushSupported={pushSupported}
              pushEndpoint={pushEndpoint}
              pushBusy={pushBusy}
              notifPerm={notifPerm}
              briefTime={briefTime}
              onChangeBriefTime={(v) => void saveBriefTime(v)}
              onToggle={(enable) => void toggleNotification(enable)}
              onTestPush={() => void testPush()}
            />

            <WeatherSection
              enabled={weatherEnabled}
              busy={weatherBusy}
              weather={weatherData}
              onEnable={enableWeatherLocation}
              onDisable={disableWeatherLocation}
            />

            <CommuteSection
              config={commuteConfig}
              onChange={(next) => {
                setCommuteConfig(next);
                saveLS(LS_COMMUTE_CONFIG, next);
              }}
              onCaptureCoords={captureCommuteCoords}
            />

            <ShortcutsSection
              shortcuts={appShortcuts}
              onChange={(next) => {
                setAppShortcuts(next);
                saveLS(LS_APP_SHORTCUTS, next);
              }}
              onNotify={showToast}
            />

            {/* 📄 회의록/메모 원문 보관 및 Google Drive 백업 설정 */}
            <div className={styles.card} style={{ marginBottom: 16 }}>
              <div className={styles.cardTitle} style={{ fontSize: "0.9rem", marginBottom: 12 }}>
                📄 회의록/메모 원문 보관 및 Google Drive 백업 설정
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: "0.82rem" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>💾 PC 대용량 스토리지(IndexedDB) 원문 보관</span>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: 2 }}>
                      붙여넣은 메모/회의록 원문 텍스트 전체를 PC 내 대용량 저장소에 무제한 보관합니다.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={rawEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRawEnabled(checked);
                      saveLS(LS_RAW_ENABLED, checked);
                      showToast(checked ? "PC 원문 보관 기능이 켜졌습니다." : "PC 원문 보관 기능이 꺼졌습니다.");
                    }}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>📁 Google Drive 일자별 (`CoffeeTide/YYYY-MM-DD/`) 마크다운 백업</span>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: 2 }}>
                      구글 로그인 상태 시 Google Drive의 일자별 폴더에 원문을 마크다운 파일로 자동 동기화합니다.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={driveBackupEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDriveBackupEnabled(checked);
                      saveLS(LS_DRIVE_BACKUP_ENABLED, checked);
                      showToast(checked ? "Google Drive 일자별 백업 기능이 켜졌습니다." : "Google Drive 일자별 백업 기능이 꺼졌습니다.");
                    }}
                  />
                </label>
              </div>
            </div>

            <ConnectionsSection
              connections={connections}
              errors={errors}
              fsaSupported={fsaSupported}
              browserObsidian={browserObsidian}
              browserDocs={browserDocs}
              browserLlm={browserLlm}
              browserNeedsPermission={browserNeedsPermission}
              onDisconnect={(route, method) => void disconnect(route, method)}
              onConnectPath={(route, path) => void connectPath(route, path)}
              onConnectNotion={connectNotion}
              onAddLocalDocFolder={addLocalDocFolder}
              onRemoveLocalDocFolder={(path) => void removeLocalDocFolder(path)}
              onConnectBrowserFolder={(kind) => void connectBrowserFolder(kind)}
              onDisconnectBrowserFolder={(key) => void disconnectBrowserFolder(key)}
              onRegrantBrowserFolders={() => void regrantBrowserFolders()}
              onPickFolder={pickFolder}
            />
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
