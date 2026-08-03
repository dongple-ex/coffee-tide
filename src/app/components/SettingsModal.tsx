"use client";

import React, { RefObject } from "react";
import { AutomationRule } from "@/lib/automation/rules";
import { AppShortcut } from "@/lib/types/appShortcut";
import { CommuteConfig } from "@/lib/types/commute";
import { ConnectionState } from "@/lib/types/unified";
import { BrowserFolderInfo, BrowserFolderKind } from "@/lib/browser/localFolders";
import { AutomationRulesSection } from "./settings/AutomationRulesSection";
import { CommuteSection } from "./settings/CommuteSection";
import { ConnectionsSection } from "./settings/ConnectionsSection";
import { NotificationSection } from "./settings/NotificationSection";
import { ShortcutsSection } from "./settings/ShortcutsSection";
import { WeatherSection } from "./settings/WeatherSection";
import { WeatherData } from "./WelcomeCard";
import styles from "../page.module.css";

export interface SettingsModalProps {
  connPanelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSignout: () => void;
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
  driveBackupEnabled: boolean;
  onChangeDriveBackupEnabled: (enabled: boolean) => void;
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
  driveBackupEnabled,
  onChangeDriveBackupEnabled,
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
                onChange={(e) => onChangeRawEnabled(e.target.checked)}
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                paddingTop: 8,
                borderTop: "1px dashed var(--border)",
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>📁 Google Drive 일자별 (`CoffeeTide/YYYY-MM-DD/`) 마크다운 백업</span>
                <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: 2 }}>
                  구글 로그인 상태 시 Google Drive의 일자별 폴더에 원문을 마크다운 파일로 자동 동기화합니다.
                </div>
              </div>
              <input
                type="checkbox"
                checked={driveBackupEnabled}
                onChange={(e) => onChangeDriveBackupEnabled(e.target.checked)}
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
      </div>
    </div>
  );
}
