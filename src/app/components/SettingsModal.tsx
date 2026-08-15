"use client";

import React, { RefObject, useState } from "react";
import { AutomationRule } from "@/lib/automation/rules";
import { AppShortcut } from "@/lib/types/appShortcut";
import { CommuteConfig } from "@/lib/types/commute";
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
import styles from "../page.module.css";

export interface SettingsModalProps {
  connPanelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSignout: () => void;
  accountEmail?: string;
  onDeleteAccount: () => Promise<void>;
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
}

export function SettingsModal({
  connPanelRef,
  onClose,
  onSignout,
  accountEmail,
  onDeleteAccount,
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
}: SettingsModalProps) {
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);

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
        <div className={styles.stickyModalHeader}>
          <div className={styles.cardTitle} style={{ margin: 0, display: "flex", alignItems: "center" }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 6 }}
            >
              <path d="m12 14 4-4" />
              <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            </svg>
            설정
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              style={{ padding: "4px 10px", fontSize: "0.78rem" }}
              onClick={onSignout}
            >
              로그아웃 (접속 종료)
            </button>
            <button
              className={styles.iconBtn}
              onClick={onClose}
              aria-label="설정 닫기"
              style={{ fontSize: "1.1rem", padding: "4px 8px" }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 🖥️ 화면 뷰 모드 설정 */}
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <div className={styles.cardTitle} style={{ fontSize: "0.9rem", marginBottom: 10 }}>
            화면 보기
          </div>
          <div className={styles.settingToggleList}>
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
          </div>
        </div>

        {/* 💾 데이터 및 보관 상태 요약 */}
        <DataStorageSection storageStatus={defaultStorageStatus} onRetrySync={onRetrySync} />

        <CopilotCustomSection
          config={copilotConfig}
          onChangeConfig={onChangeCopilotConfig}
        />

        <AutomationRulesSection
          rules={rules}
          onChangeRules={onChangeRules}
          ruleInput={ruleInput}
          onChangeRuleInput={onChangeRuleInput}
          ruleBusy={ruleBusy}
          onAddRule={onAddRule}
        />

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
          onCaptureCoords={onCaptureCommuteCoords}
        />

        <ShortcutsSection
          shortcuts={appShortcuts}
          onChange={onChangeAppShortcuts}
          onNotify={onNotify}
        />

        <YouTubeBundleSection onNotify={onNotify} />

        <LocalToolsSection onNotify={onNotify} />

        {/* PC 로컬 원문 보관 — Google 연동 기능은 아래 Google 카드에서 관리 */}
        <div className={styles.card} style={{ marginBottom: 16 }}>
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
    </div>
  );
}
