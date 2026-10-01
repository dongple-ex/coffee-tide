"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CopilotUserConfig } from "@/lib/ai/harness";
import { cancelTerminalAi, checkTerminalAi, subscribeTerminalAi, terminalAiConfig, terminalAiConnected, terminalAiDisconnected, type TerminalAiProvider, type TerminalAiSettings } from "@/lib/ai/desktopAi";
import styles from "./terminalAiSection.module.css";

const EMPTY: TerminalAiSettings = { executablePath: "", workingDirectory: "", model: "" };
export function TerminalAiSection({ config, onChangeConfig }: { config: CopilotUserConfig; onChangeConfig: (next: CopilotUserConfig) => void }) {
  const connected = useSyncExternalStore(subscribeTerminalAi, terminalAiConnected, terminalAiDisconnected);
  const provider = config.aiProvider === "claude_cli" || config.aiProvider === "codex_cli" ? config.aiProvider : null;
  return (
    <div className={styles.section}>
      <label htmlFor="terminal-ai-provider"><strong>터미널 AI 연결</strong></label>
      <select id="terminal-ai-provider" value={provider || "default"} onChange={event => {
        cancelTerminalAi();
        onChangeConfig({ ...config, aiProvider: event.target.value as CopilotUserConfig["aiProvider"] });
      }}>
        <option value="default">기본 AI</option>
        <option value="claude_cli">Claude Code · 이 PC의 CLI</option>
        <option value="codex_cli">Codex CLI · 이 PC의 CLI</option>
      </select>
      {provider && <TerminalAiFields key={`${provider}-${connected}`} provider={provider} connected={connected} />}
    </div>
  );
}

function TerminalAiFields({ provider, connected }: { provider: TerminalAiProvider; connected: boolean }) {
  const [settings, setSettings] = useState<TerminalAiSettings>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let disposed = false;
    if (provider && connected) {
      void terminalAiConfig(provider).then(result => {
        if (!disposed) { setSettings(result.config); setLoaded(true); }
      }).catch(error => { if (!disposed) { setMessage(error.message); setFailed(true); } });
    }
    return () => { disposed = true; };
  }, [provider, connected]);

  const save = async (check: boolean) => {
    if (!provider || busy || !loaded) return;
    setBusy(true); setMessage("");
    try {
      const result = await terminalAiConfig(provider, settings);
      setSettings(result.config);
      const installed = check ? await checkTerminalAi(provider) : null;
      setFailed(false);
      setMessage(installed ? `${installed.version} 설치를 확인했습니다. 로그인·실제 응답은 질문을 보낼 때 확인합니다.` : "이 PC의 AI 실행 설정을 저장했습니다.");
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : "설정하지 못했습니다.");
    } finally { setBusy(false); }
  };
  return (
    <>
        <p>설치하고 로그인한 CLI로 캐릭터 지침·최근 대화·질문을 전송합니다. 제공업체의 클라우드 모델과 해당 계정의 사용 한도를 이용합니다.</p>
        {!connected ? <p role="status">데스크톱 AI 바리스타를 실행하고 6자리 코드로 연결해 주세요. 기존 앱이면 이번 소스로 다시 빌드해야 합니다.</p> : <>
          <label htmlFor="terminal-ai-executable">실행 파일 경로</label>
          <input id="terminal-ai-executable" value={settings.executablePath} disabled={busy || !loaded} placeholder="비우면 자동 탐색 · Windows는 .exe 절대 경로" onChange={event => setSettings(previous => ({ ...previous, executablePath: event.target.value }))} />
          <label htmlFor="terminal-ai-directory">작업 폴더</label>
          <input id="terminal-ai-directory" value={settings.workingDirectory} disabled={busy || !loaded} placeholder={settings.defaultDirectory || "비우면 앱 전용 AI 폴더"} onChange={event => setSettings(previous => ({ ...previous, workingDirectory: event.target.value }))} />
          <label htmlFor="terminal-ai-model">모델 이름 · 선택 사항</label>
          <input id="terminal-ai-model" value={settings.model} disabled={busy || !loaded} placeholder="비우면 CLI 기본 모델" onChange={event => setSettings(previous => ({ ...previous, model: event.target.value }))} />
          <div className={styles.actions}>
            <button type="button" disabled={busy || !loaded} onClick={() => void save(false)}>설정 저장</button>
            <button type="button" disabled={busy || !loaded} onClick={() => void save(true)}>{busy ? "확인 중…" : "저장·설치 확인"}</button>
            <button type="button" onClick={cancelTerminalAi}>답변 취소</button>
          </div>
          <p>첫 연결은 대화 송수신용입니다. 업무 데이터 전체 전송·파일 수정·MCP 자동 실행은 제공하지 않습니다. 연결 실패 시 다른 AI로 자동 전환하지 않습니다.</p>
        </>}
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </>
  );
}
