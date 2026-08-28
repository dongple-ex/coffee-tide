"use client";

import React, { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AutomationRule } from "@/lib/automation/rules";
import { AppShortcut } from "@/lib/types/appShortcut";
import { CommuteConfig, CommuteTimetable } from "@/lib/types/commute";
import { ConnectionState } from "@/lib/types/unified";
import { BrowserFolderInfo, BrowserFolderKind } from "@/lib/browser/localFolders";
import { CopilotUserConfig } from "@/lib/ai/harness";
import type { DataStorageStatus } from "@/lib/types/storage";
import { CopilotCustomSection } from "./settings/CopilotCustomSection";
import { AutomationRulesSection } from "./settings/AutomationRulesSection";
import { ConnectionsSection } from "./settings/ConnectionsSection";
import { CommuteSection } from "./settings/CommuteSection";
import { NotificationSection } from "./settings/NotificationSection";
import { ShortcutsSection } from "./settings/ShortcutsSection";
import { YouTubeBundleSection } from "./settings/YouTubeBundleSection";
import { WeatherSection } from "./settings/WeatherSection";
import { LocalToolsSection } from "./settings/LocalToolsSection";
import { DataStorageSection } from "./settings/DataStorageSection";
import { WeatherData } from "./WelcomeCard";
import { APP_VERSION } from "@/lib/appVersion";
import { ViewWindowSetting, WINDOW_TIERS_DAYS } from "@/lib/collectWindow";
import type { Theme } from "./HeaderControls";
import { UiIcon } from "./UiIcon";
import styles from "../page.module.css";

export interface SettingsModalProps {
  connPanelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSignout: () => void;
  accountEmail?: string;
  onDeleteAccount: () => Promise<void>;
  theme?: Theme;
  onChangeTheme?: (theme: Theme) => void;
  followupHours?: number;
  onChangeFollowupHours?: (hours: number) => void;
  viewWindow?: ViewWindowSetting;
  onChangeViewWindow?: (val: ViewWindowSetting) => void;
  fetchLimit?: number;
  onChangeFetchLimit?: (limit: number) => void;
  copilotConfig: CopilotUserConfig;
  onChangeCopilotConfig: (next: CopilotUserConfig) => void;
  rules: AutomationRule[];
  onChangeRules: (rules: AutomationRule[]) => void;
  ruleInput: string;
  onChangeRuleInput: (val: string) => void;
  ruleBusy: boolean;
  onAddRule: () => void;
  pushSupported: boolean;
  pushEndpoint: string | null;
  pushBusy: boolean;
  notifPerm: NotificationPermission;
  briefTime: string;
  onChangeBriefTime: (val: string) => void;
  onToggleNotification: (enable: boolean) => void;
  onTestPush: () => void;
  weatherEnabled: boolean;
  weatherBusy: boolean;
  weatherData: WeatherData | null;
  onEnableWeatherLocation: () => void;
  onDisableWeatherLocation: () => void;
  commuteConfig: CommuteConfig;
  onChangeCommuteConfig: (next: CommuteConfig) => void;
  commuteTimetables: CommuteTimetable[];
  onChangeCommuteTimetables: (next: CommuteTimetable[]) => void;
  onCaptureCommuteCoords: (type: "home" | "work") => void;
  appShortcuts: AppShortcut[];
  onChangeAppShortcuts: (next: AppShortcut[]) => void;
  onNotify: (msg: string) => void;
  rawEnabled: boolean;
  onChangeRawEnabled: (enabled: boolean) => void;
  compactMode: boolean;
  onChangeCompactMode: (enabled: boolean) => void;
  driveBackupEnabled: boolean;
  onChangeDriveBackupEnabled: (enabled: boolean) => void;
  sparkEnabled: boolean;
  onChangeSparkEnabled: (enabled: boolean) => void;
  canvasEnabled?: boolean;
  onChangeCanvasEnabled?: (enabled: boolean) => void;
  storageStatus?: DataStorageStatus;
  onRetrySync?: () => void;
  connections: ConnectionState | null;
  errors?: Partial<Record<string, string>>;
  fsaSupported: boolean;
  browserObsidian?: BrowserFolderInfo;
  browserDocs: BrowserFolderInfo[];
  browserLlm?: BrowserFolderInfo;
  browserNeedsPermission: boolean;
  onDisconnect: (route: string, method?: "POST" | "DELETE") => void;
  onConnectPath: (route: string, path: string) => void;
  onConnectNotion: (token: string, dbId: string) => Promise<boolean>;
  onAddLocalDocFolder: (path: string) => Promise<boolean>;
  onRemoveLocalDocFolder: (path: string) => void;
  onConnectBrowserFolder: (kind: BrowserFolderKind) => void;
  onDisconnectBrowserFolder: (key: string) => void;
  onRegrantBrowserFolders: () => void;
  onPickFolder: () => Promise<string | null>;
  initialTab?: SettingsTab;
}

type SettingsTab = "general" | "connections" | "ai" | "lifestyle" | "tools";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: string }> = [
  { id: "general", label: "일반", icon: "⚙️" },
  { id: "connections", label: "서비스 연동", icon: "🔌" },
  { id: "ai", label: "AI·자동화", icon: "🤖" },
  { id: "lifestyle", label: "알림·일상", icon: "🌤️" },
  { id: "tools", label: "휴식·도구", icon: "🧩" },
];

export function SettingsModal({
  connPanelRef,
  onClose,
  onSignout,
  accountEmail,
  onDeleteAccount,
  theme = "dark",
  onChangeTheme,
  followupHours = 24,
  onChangeFollowupHours,
  viewWindow = "auto",
  onChangeViewWindow,
  fetchLimit = 20,
  onChangeFetchLimit,
  copilotConfig,
  onChangeCopilotConfig,
  rules,
  onChangeRules,
  ruleInput,
  onChangeRuleInput,
  ruleBusy,
  onAddRule,
  pushSupported,
  pushEndpoint,
  pushBusy,
  notifPerm,
  briefTime,
  onChangeBriefTime,
  onToggleNotification,
  onTestPush,
  weatherEnabled,
  weatherBusy,
  weatherData,
  onEnableWeatherLocation,
  onDisableWeatherLocation,
  commuteConfig,
  onChangeCommuteConfig,
  commuteTimetables,
  onChangeCommuteTimetables,
  onCaptureCommuteCoords,
  appShortcuts,
  onChangeAppShortcuts,
  onNotify,
  rawEnabled,
  onChangeRawEnabled,
  compactMode,
  onChangeCompactMode,
  driveBackupEnabled,
  onChangeDriveBackupEnabled,
  sparkEnabled,
  onChangeSparkEnabled,
  canvasEnabled = true,
  onChangeCanvasEnabled,
  storageStatus,
  onRetrySync,
  connections,
  errors,
  fsaSupported,
  browserObsidian,
  browserDocs,
  browserLlm,
  browserNeedsPermission,
  onDisconnect,
  onConnectPath,
  onConnectNotion,
  onAddLocalDocFolder,
  onRemoveLocalDocFolder,
  onConnectBrowserFolder,
  onDisconnectBrowserFolder,
  onRegrantBrowserFolders,
  onPickFolder,
  initialTab = "general",
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const settingsTabBarRef = useRef<HTMLDivElement>(null);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);

  const selectSettingsTab = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
  }, []);

  const handlePrevTab = useCallback(() => {
    const currentIndex = SETTINGS_TABS.findIndex((tab) => tab.id === activeTab);
    const nextIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    selectSettingsTab(SETTINGS_TABS[nextIndex].id);
  }, [activeTab, selectSettingsTab]);

  const handleNextTab = useCallback(() => {
    const currentIndex = SETTINGS_TABS.findIndex((tab) => tab.id === activeTab);
    const nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
    selectSettingsTab(SETTINGS_TABS[nextIndex].id);
  }, [activeTab, selectSettingsTab]);

  useEffect(() => {
    const tabBar = settingsTabBarRef.current;
    const activeButton = tabBar?.querySelector<HTMLElement>(`[data-settings-tab="${activeTab}"]`);
    if (!tabBar || !activeButton) return;

    const centeredLeft = activeButton.offsetLeft - (tabBar.clientWidth - activeButton.offsetWidth) / 2;
    tabBar.scrollTo({ left: Math.max(0, centeredLeft), behavior: "smooth" });
  }, [activeTab]);

  const handleSettingsTabWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const tabBar = settingsTabBarRef.current;
    if (!tabBar || tabBar.scrollWidth <= tabBar.clientWidth) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta === 0) return;

    tabBar.scrollLeft += delta;
    e.preventDefault();
  }, []);

  const handleSettingsTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = SETTINGS_TABS.findIndex((tab) => tab.id === activeTab);
      let nextIndex: number | null = null;
      if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
      if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
      if (e.key === "Home") nextIndex = 0;
      if (e.key === "End") nextIndex = SETTINGS_TABS.length - 1;
      if (nextIndex === null) return;

      e.preventDefault();
      const nextTab = SETTINGS_TABS[nextIndex].id;
      selectSettingsTab(nextTab);
      document.getElementById(`settings-tab-${nextTab}`)?.focus();
    },
    [activeTab, selectSettingsTab]
  );

  async function confirmAccountDeletion() {
    if (!accountEmail || accountDeleteBusy) return;
    const confirmation = window.prompt(
      `계정과 서버 데이터를 영구 삭제합니다. 계속하려면 "계정 삭제"를 입력하세요.\n\n대상: ${accountEmail}`
    );
    if (confirmation !== "계정 삭제") return;
    setAccountDeleteBusy(true);
    try {
      await onDeleteAccount();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "계정을 삭제하지 못했습니다.");
    } finally {
      setAccountDeleteBusy(false);
    }
  }

  const defaultStorageStatus: DataStorageStatus = storageStatus ?? {
    cloudProvider: "guest",
    syncState: "guest",
    pendingChanges: 0,
    driveConnected: Boolean(connections?.google),
    driveBackupEnabled,
    rawLocalStorageEnabled: rawEnabled,
  };

  const displayEmail = accountEmail || connections?.googleEmail || connections?.outlookEmail || "게스트";

  return (
    <div className={`${styles.overlay} ${styles.overlayTop}`} onClick={onClose}>
      <div
        ref={connPanelRef}
        tabIndex={-1}
        className={`${styles.modal} ${styles.connPanel}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="설정"
      >
        <div className={styles.settingsStickyShell}>
          {/* 1단: 설정 타이틀 & 버전 & 닫기 버튼 */}
          <div className={styles.stickyModalHeader}>
            <div className={styles.cardTitle} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <UiIcon name="settings" size={20} />
              <span>설정</span>
              <span
                className={styles.appVersionBadge}
                aria-label={`coffeeTide 버전 ${APP_VERSION}`}
              >
                {APP_VERSION}
              </span>
            </div>
            <button
              className={styles.iconBtn}
              onClick={onClose}
              aria-label="설정 닫기"
              style={{ fontSize: "1.1rem", padding: "4px 8px" }}
            >
              ✕
            </button>
          </div>

          {/* 2단: 계정 정보 & 로그아웃 바 */}
          <div className={styles.stickyModalAccountRow}>
            <div className={styles.stickyModalAccountInfo}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span className={styles.userEmail} title={displayEmail}>
                {displayEmail}
              </span>
            </div>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              style={{ padding: "3px 8px", fontSize: "0.75rem" }}
              onClick={onSignout}
            >
              로그아웃 (접속 종료)
            </button>
          </div>

          {/* 📑 3단: 좌우 화살표가 있는 탭 바 내비게이션 */}
          <div className={styles.settingsTabBarNavWrapper}>
            <button
              type="button"
              className={styles.settingsTabNavBtn}
              onClick={handlePrevTab}
              aria-label="이전 설정 탭"
              title="이전 설정 탭 (←)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </button>

            <div
              ref={settingsTabBarRef}
              className={styles.settingsTabBar}
              role="tablist"
              aria-label="설정 카테고리"
              onKeyDown={handleSettingsTabKeyDown}
              onWheel={handleSettingsTabWheel}
            >
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`settings-panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  data-settings-tab={tab.id}
                  className={`${styles.settingsTabBtn} ${activeTab === tab.id ? styles.settingsTabBtnActive : ""}`}
                  onClick={() => selectSettingsTab(tab.id)}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.settingsTabNavBtn}
              onClick={handleNextTab}
              aria-label="다음 설정 탭"
              title="다음 설정 탭 (→)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 🔌 1. 서비스 연동 탭 */}
        {activeTab === "connections" && (
          <div id="settings-panel-connections" role="tabpanel" aria-labelledby="settings-tab-connections" className={styles.settingsTabPanel}>
            <ConnectionsSection
              connections={connections}
              errors={errors}
              driveBackupEnabled={driveBackupEnabled}
              onChangeDriveBackupEnabled={onChangeDriveBackupEnabled}
              sparkEnabled={sparkEnabled}
              onChangeSparkEnabled={onChangeSparkEnabled}
              fsaSupported={fsaSupported}
              browserObsidian={browserObsidian}
              browserDocs={browserDocs}
              browserLlm={browserLlm}
              browserNeedsPermission={browserNeedsPermission}
              onDisconnect={onDisconnect}
              onConnectPath={onConnectPath}
              onConnectNotion={onConnectNotion}
              onAddLocalDocFolder={onAddLocalDocFolder}
              onRemoveLocalDocFolder={onRemoveLocalDocFolder}
              onConnectBrowserFolder={onConnectBrowserFolder}
              onDisconnectBrowserFolder={onDisconnectBrowserFolder}
              onRegrantBrowserFolders={onRegrantBrowserFolders}
              onPickFolder={onPickFolder}
            />

            <DataStorageSection storageStatus={defaultStorageStatus} onRetrySync={onRetrySync} />

            {/* PC 로컬 원문 보관 */}
            <div className={styles.card} style={{ marginTop: 16, marginBottom: 16 }}>
              <div className={styles.cardTitle} style={{ fontSize: "0.9rem", marginBottom: 12 }}>
                회의록·메모 원문 보관
              </div>
              <div className={styles.settingToggleList}>
                <label className={styles.settingToggleRow}>
                  <div className={styles.settingToggleCopy}>
                    <span className={styles.settingToggleTitle}>PC 대용량 스토리지 원문 보관</span>
                    <div className={styles.settingToggleDesc}>
                      붙여넣은 메모/회의록 원문 텍스트 전체를 PC 내 대용량 저장소에 무제한 보관합니다.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={rawEnabled}
                    onChange={(e) => onChangeRawEnabled(e.target.checked)}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 🤖 2. AI & 자동화 탭 */}
        {activeTab === "ai" && (
          <div id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai" className={styles.settingsTabPanel}>
            <CopilotCustomSection
              config={copilotConfig}
              onChangeConfig={onChangeCopilotConfig}
              followupHours={followupHours}
              onChangeFollowupHours={onChangeFollowupHours}
            />

            <AutomationRulesSection
              rules={rules}
              onChangeRules={onChangeRules}
              ruleInput={ruleInput}
              onChangeRuleInput={onChangeRuleInput}
              ruleBusy={ruleBusy}
              onAddRule={onAddRule}
            />

            {/* 🧪 실험실 기능 (Experimental Labs) */}
            <div className={styles.card} style={{ marginTop: 16 }}>
              <div className={styles.cardTitle} style={{ fontSize: "0.9rem", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🧪 실험실 기능 (Experimental Labs)</span>
              </div>
              <div className={styles.settingToggleList}>
                <label className={styles.settingToggleItem}>
                  <div className={styles.settingToggleCopy}>
                    <span className={styles.settingToggleTitle}>🖌️ AI 캔버스 작업 공간 (Chrome Canary 온디바이스 AI)</span>
                    <div className={styles.settingToggleDesc}>
                      대화 내용을 실시간 마크다운 문서로 분할 편집하고, Chrome Canary의 온디바이스 Gemini Nano 또는 클라우드 AI로 문서를 다듬거나 할 일을 자동 추출합니다.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={canvasEnabled}
                    onChange={(e) => onChangeCanvasEnabled?.(e.target.checked)}
                    aria-label="AI 캔버스 실험실 기능 활성화"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 🌤️ 3. 알림 & 일상 탭 */}
        {activeTab === "lifestyle" && (
          <div id="settings-panel-lifestyle" role="tabpanel" aria-labelledby="settings-tab-lifestyle" className={styles.settingsTabPanel}>
            <NotificationSection
              pushSupported={pushSupported}
              pushEndpoint={pushEndpoint}
              pushBusy={pushBusy}
              notifPerm={notifPerm}
              briefTime={briefTime}
              onChangeBriefTime={onChangeBriefTime}
              onToggle={onToggleNotification}
              onTestPush={onTestPush}
            />

            <WeatherSection
              enabled={weatherEnabled}
              busy={weatherBusy}
              weather={weatherData}
              onEnable={onEnableWeatherLocation}
              onDisable={onDisableWeatherLocation}
            />

            <CommuteSection
              config={commuteConfig}
              onChange={onChangeCommuteConfig}
              timetables={commuteTimetables}
              onChangeTimetables={onChangeCommuteTimetables}
              onCaptureCoords={onCaptureCommuteCoords}
            />
          </div>
        )}

        {/* ⚙️ 1. 일반 탭 */}
        {activeTab === "general" && (
          <div id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" className={styles.settingsTabPanel}>
            {/* 🖥️ 화면 뷰 모드 설정 */}
            <div className={styles.card} style={{ marginBottom: 16 }}>
              <div className={styles.cardTitle} style={{ fontSize: "0.9rem", marginBottom: 10 }}>
                화면 보기
              </div>
              <div className={styles.settingToggleList}>
                {onChangeTheme && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                      테마 색상
                    </label>
                    <select
                      className={styles.input}
                      value={theme}
                      onChange={(e) => onChangeTheme(e.target.value as Theme)}
                      style={{ width: "100%" }}
                      aria-label="테마 색상 선택"
                    >
                      <option value="dark">다크</option>
                      <option value="light">라이트</option>
                      <option value="notebook">커피타이드 (기본)</option>
                      <option value="coffee">에스프레소</option>
                      <option value="mega">메가커피</option>
                      <option value="kustom">커스텀커피</option>
                    </select>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className={`${styles.btn} ${!compactMode ? styles.btnPrimary : styles.btnSecondary}`}
                    style={{
                      padding: "9px 12px",
                      fontSize: "0.82rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      fontWeight: !compactMode ? 700 : 500,
                    }}
                    onClick={() => onChangeCompactMode(false)}
                    aria-pressed={!compactMode}
                  >
                    <span>일반 뷰</span>
                    <small style={{ opacity: 0.8, fontSize: "0.72rem" }}>PC 넓은 화면 기본</small>
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${compactMode ? styles.btnPrimary : styles.btnSecondary}`}
                    style={{
                      padding: "9px 12px",
                      fontSize: "0.82rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      fontWeight: compactMode ? 700 : 500,
                    }}
                    onClick={() => onChangeCompactMode(true)}
                    aria-pressed={compactMode}
                  >
                    <span>축소(컴팩트) 뷰</span>
                    <small style={{ opacity: 0.8, fontSize: "0.72rem" }}>여백과 카드 밀도 축소</small>
                  </button>
                </div>
                <div className={styles.settingToggleDesc} style={{ marginTop: 10, lineHeight: 1.5, fontSize: "0.78rem" }}>
                  • <b>일반 뷰</b>: 카드 여백을 넉넉하게 표시합니다.<br />
                  • <b>축소(컴팩트) 뷰</b>: 같은 내용을 더 높은 밀도로 표시합니다. 업무·AI·휴식 도구 탭은 두 모드에서 동일하게 유지됩니다.<br />
                  • <i>(미설정 시 모바일 기기는 축소 뷰, PC 환경은 일반 뷰로 자동 시작됩니다.)</i>
                </div>

                {(onChangeViewWindow || onChangeFetchLimit) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {onChangeViewWindow && (
                      <div>
                        <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>
                          항목 표시 기간
                        </label>
                        <select
                          className={styles.input}
                          value={String(viewWindow)}
                          onChange={(e) =>
                            onChangeViewWindow(e.target.value === "auto" ? "auto" : Number(e.target.value))
                          }
                          style={{ width: "100%" }}
                          aria-label="외부 항목 표시 기간"
                        >
                          <option value="auto">자동</option>
                          {WINDOW_TIERS_DAYS.map((d) => (
                            <option key={d} value={d}>
                              최근 {d}일
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {onChangeFetchLimit && (
                      <div>
                        <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 4 }}>
                          채널별 수집 건수
                        </label>
                        <select
                          className={styles.input}
                          value={fetchLimit}
                          onChange={(e) => onChangeFetchLimit(Number(e.target.value))}
                          style={{ width: "100%" }}
                          aria-label="채널별 수집 건수 상한"
                        >
                          <option value={10}>10건</option>
                          <option value={20}>20건</option>
                          <option value={50}>50건</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.accountManagementCard}>
              <div>
                <div className={styles.cardTitle} style={{ marginBottom: 6 }}>
                  계정 및 개인정보
                </div>
                <p className={styles.connNote}>
                  저장 항목과 보유 기간은 <a href="/privacy">개인정보처리방침</a>에서 확인할 수 있어요.
                </p>
              </div>
              {accountEmail && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() => void confirmAccountDeletion()}
                  disabled={accountDeleteBusy}
                >
                  {accountDeleteBusy ? "계정 삭제 중…" : "계정 및 서버 데이터 삭제"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 🧩 5. 휴식·도구 탭 */}
        {activeTab === "tools" && (
          <div id="settings-panel-tools" role="tabpanel" aria-labelledby="settings-tab-tools" className={styles.settingsTabPanel}>
            <ShortcutsSection
              shortcuts={appShortcuts}
              onChange={onChangeAppShortcuts}
              onNotify={onNotify}
            />

            <YouTubeBundleSection onNotify={onNotify} />

            <LocalToolsSection onNotify={onNotify} />
          </div>
        )}
      </div>
    </div>
  );
}
