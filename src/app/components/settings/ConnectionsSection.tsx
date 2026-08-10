"use client";

import React, { useState } from "react";
import { BrowserFolderInfo, BrowserFolderKind } from "@/lib/browser/localFolders";
import { ConnectionState, MailsResponse } from "@/lib/types/unified";
import { GoogleIcon, NotionIcon, ObsidianIcon, OutlookIcon } from "../brandIcons";
import styles from "../../page.module.css";

interface Props {
  connections: ConnectionState | null;
  errors: MailsResponse["errors"];
  driveBackupEnabled: boolean;
  onChangeDriveBackupEnabled: (enabled: boolean) => void;
  sparkEnabled: boolean;
  onChangeSparkEnabled: (enabled: boolean) => void;
  /** File System Access API 지원 여부 (Chrome/Edge) */
  fsaSupported: boolean;
  browserObsidian?: BrowserFolderInfo;
  browserDocs: BrowserFolderInfo[];
  browserLlm?: BrowserFolderInfo;
  browserNeedsPermission: boolean;

  onDisconnect: (route: string, method?: "POST" | "DELETE") => void;
  onConnectPath: (route: string, path: string) => void;
  /** @returns 성공 여부 — 성공했을 때만 입력값을 비운다 */
  onConnectNotion: (token: string, dbId: string) => Promise<boolean>;
  onAddLocalDocFolder: (path: string) => Promise<boolean>;
  onRemoveLocalDocFolder: (path: string) => void;
  onConnectBrowserFolder: (kind: BrowserFolderKind) => void;
  onDisconnectBrowserFolder: (key: string) => void;
  onRegrantBrowserFolders: () => void;
  /** 네이티브 폴더 선택 (Windows 전용) — 선택한 경로, 취소/실패 시 null */
  onPickFolder: () => Promise<string | null>;
}

export function ConnectionsSection({
  connections,
  errors,
  driveBackupEnabled,
  onChangeDriveBackupEnabled,
  sparkEnabled,
  onChangeSparkEnabled,
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
}: Props) {
  // 연동 폼 입력값은 이 패널 밖에서 쓰이지 않는다 — 지역 state로 둔다
  const [notionToken, setNotionToken] = useState("");
  const [notionDbId, setNotionDbId] = useState("");
  const [obsidianPath, setObsidianPath] = useState("");
  const [localDocPath, setLocalDocPath] = useState("");
  const [llmPath, setLlmPath] = useState("");

  const pickInto = async (setter: (path: string) => void) => {
    const path = await onPickFolder();
    if (path) setter(path);
  };

  const submitNotion = async () => {
    const ok = await onConnectNotion(notionToken, notionDbId);
    if (ok) {
      setNotionToken("");
      setNotionDbId("");
    }
  };

  const submitLocalDoc = async () => {
    const ok = await onAddLocalDocFolder(localDocPath);
    if (ok) setLocalDocPath("");
  };

  /** 브라우저 폴더 열기 / 미지원 안내 — Obsidian·로컬 문서·LLM 카드가 같은 모양을 쓴다 */
  const renderBrowserPicker = (kind: BrowserFolderKind, label: string) =>
    fsaSupported ? (
      <button className={styles.btn} onClick={() => onConnectBrowserFolder(kind)}>
        📂 {label}
      </button>
    ) : (
      <p className={styles.connNote}>이 브라우저는 폴더 열기를 지원하지 않아요 (Chrome/Edge 필요).</p>
    );

  return (
    <>
      <div className={styles.cardTitle} style={{ marginTop: 20 }}>
        🔌 서비스 연동 <small>전부 선택 사항이에요</small>
      </div>

      {browserNeedsPermission && (
        <div className={styles.permRow}>
          🔑 저장된 폴더의 접근 권한을 다시 허용해 주세요 (브라우저 보안 정책상 재방문 시 필요할 수
          있어요)
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onRegrantBrowserFolders}>
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
            <button className={styles.btn} onClick={() => onDisconnect("outlook", "DELETE")}>
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
            <button className={styles.btn} onClick={() => onDisconnect("google/signin", "DELETE")}>
              해제
            </button>
          ) : (
            <a className={styles.btn} href="/api/auth/google/signin" style={{ textAlign: "center" }}>
              연동하기
            </a>
          )}
          <div className={styles.googleConnectionSettings}>
            <div className={styles.googleConnectionSettingsTitle}>Google 연동 기능</div>
            <div className={styles.settingToggleList}>
              <label className={styles.settingToggleRow}>
                <div className={styles.settingToggleCopy}>
                  <span className={styles.settingToggleTitle}>
                    📁 Drive 일자별 마크다운 백업
                  </span>
                  <div className={styles.settingToggleDesc}>
                    `CoffeeTide/YYYY-MM-DD/` 폴더에 회의록과 메모 원문을 자동 동기화합니다.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={driveBackupEnabled}
                  onChange={(event) => onChangeDriveBackupEnabled(event.target.checked)}
                />
              </label>
              <label className={styles.settingToggleRow}>
                <div className={styles.settingToggleCopy}>
                  <span className={styles.settingToggleTitle}>⚡ Gemini Spark 브리핑 자동 수신</span>
                  <div className={styles.settingToggleDesc}>
                    Spark가 분석한 메일·일정·승인 결과를 AI 바리스타 브리핑으로 수신합니다.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={sparkEnabled}
                  onChange={(event) => onChangeSparkEnabled(event.target.checked)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className={styles.connCard}>
          <div className={styles.connHead}>
            <NotionIcon /> Notion
            <span className={`${styles.connStatus} ${connections?.notion ? styles.connOn : ""}`}>
              {connections?.notion ? "연동됨" : "미연동"}
            </span>
          </div>
          {connections?.notion ? (
            <button className={styles.btn} onClick={() => onDisconnect("notion")}>
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
                <button className={styles.btn} onClick={() => void submitNotion()}>
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
            <button className={styles.btn} onClick={() => onDisconnect("obsidian")}>
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
                    onClick={() => onDisconnectBrowserFolder(browserObsidian.key)}
                    aria-label="브라우저 볼트 연결 해제"
                    title="연결 해제"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                renderBrowserPicker("obsidian", "브라우저에서 볼트 폴더 열기")
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
                    onClick={() => void pickInto(setObsidianPath)}
                    aria-label="Obsidian 볼트 폴더 선택"
                    title="폴더 선택"
                  >
                    📂
                  </button>
                  <button className={styles.btn} onClick={() => onConnectPath("obsidian", obsidianPath)}>
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
                onClick={() => onDisconnectBrowserFolder(folder.key)}
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
                onClick={() => onRemoveLocalDocFolder(path)}
                aria-label={`'${path}' 폴더 연결 해제`}
                title="이 폴더 빼기"
              >
                ✕
              </button>
            </div>
          ))}
          {renderBrowserPicker("local_doc", "브라우저에서 문서 폴더 열기")}
          <details className={styles.connDetails}>
            <summary>서버(로컬 실행) 경로로 연동</summary>
            <div className={styles.connRow}>
              <input
                className={styles.input}
                placeholder="문서 폴더 경로 (.md/.txt)"
                value={localDocPath}
                onChange={(e) => setLocalDocPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitLocalDoc()}
                aria-label="로컬 문서 폴더 경로"
              />
              <button
                className={styles.iconBtn}
                onClick={() => void pickInto(setLocalDocPath)}
                aria-label="로컬 문서 폴더 선택"
                title="폴더 선택"
              >
                📂
              </button>
              <button className={styles.btn} onClick={() => void submitLocalDoc()}>
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
            <button className={styles.btn} onClick={() => onDisconnect("llm")}>
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
                    onClick={() => onDisconnectBrowserFolder(browserLlm.key)}
                    aria-label="브라우저 LLM 폴더 연결 해제"
                    title="연결 해제"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                renderBrowserPicker("llm", "브라우저에서 산출물 폴더 열기")
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
                    onClick={() => void pickInto(setLlmPath)}
                    aria-label="LLM 산출물 폴더 선택"
                    title="폴더 선택"
                  >
                    📂
                  </button>
                  <button className={styles.btn} onClick={() => onConnectPath("llm", llmPath)}>
                    연동
                  </button>
                </div>
              </details>
            </>
          )}
          <p className={styles.connNote}>Claude Code·Gemini 등의 작업 산출물 폴더</p>
        </div>
      </div>
    </>
  );
}
