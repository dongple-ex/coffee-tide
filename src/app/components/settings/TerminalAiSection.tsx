"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CopilotUserConfig } from "@/lib/ai/harness";
import { cancelTerminalAi, checkTerminalAi, readTerminalAiModels, readTerminalAiStatus, subscribeTerminalAi, terminalAiConfig, terminalAiConnected, terminalAiDisconnected, terminalAiConnectionVersion, terminalAiConnectionInitialVersion, terminalAiAccountInfoSupported, terminalAiAccountInfoUnknown, terminalAiStatus, terminalAiStatusUnavailable, TERMINAL_AI_USAGE, type TerminalAiProvider, type TerminalAiSettings, type TerminalAiModelCatalog } from "@/lib/ai/desktopAi";
import styles from "./terminalAiSection.module.css";
import { TerminalAiCostInfo } from "./TerminalAiCostInfo";

const EMPTY: TerminalAiSettings = { executablePath: "", workingDirectory: "", model: "" };
const MODEL_UNSUPPORTED = "이 데스크톱 앱은 모델 목록 조회를 지원하지 않습니다. 앱을 업데이트하거나 모델 이름을 직접 입력해 주세요.";
export function TerminalAiSection({ config, onChangeConfig }: { config: CopilotUserConfig; onChangeConfig: (next: CopilotUserConfig) => void }) {
  const connected = useSyncExternalStore(subscribeTerminalAi, terminalAiConnected, terminalAiDisconnected);
  const connectionVersion = useSyncExternalStore(subscribeTerminalAi, terminalAiConnectionVersion, terminalAiConnectionInitialVersion);
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
      {provider && <TerminalAiFields key={`${provider}-${connectionVersion}`} provider={provider} connected={connected} />}
    </div>
  );
}

function TerminalAiFields({ provider, connected }: { provider: TerminalAiProvider; connected: boolean }) {
  const status = useSyncExternalStore(subscribeTerminalAi, () => terminalAiStatus(provider), terminalAiStatusUnavailable);
  const accountInfoSupported = useSyncExternalStore(subscribeTerminalAi, terminalAiAccountInfoSupported, terminalAiAccountInfoUnknown);
  const [settings, setSettings] = useState<TerminalAiSettings>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [catalog, setCatalog] = useState<TerminalAiModelCatalog | null>(null);
  const [modelMessage, setModelMessage] = useState("모델 목록 확인 대기");
  const [savedPaths, setSavedPaths] = useState("");
  useEffect(() => {
    let disposed = false;
    if (provider && connected) {
      void terminalAiConfig(provider).then(async result => {
        if (!disposed) {
          setSettings(result.config);
          setSavedPaths(JSON.stringify([result.config.executablePath, result.config.workingDirectory]));
          setLoaded(true);
          setBusy(true);
        }
        if (disposed) return;
        try { await readTerminalAiStatus(provider, true); }
        catch (error) { if (!disposed) { setMessage(error instanceof Error ? error.message : "계정 확인 실패"); setFailed(true); } }
        if (disposed) return;
        setModelMessage("모델 목록 조회 중…");
        try {
          const models = await readTerminalAiModels(provider);
          if (!disposed) { setCatalog(models); setModelMessage(models ? "" : MODEL_UNSUPPORTED); }
        } catch (error) { if (!disposed) setModelMessage(error instanceof Error ? error.message : "모델 목록을 조회하지 못했습니다."); }
      }).catch(error => { if (!disposed) { setMessage(error.message); setFailed(true); } })
        .finally(() => { if (!disposed) setBusy(false); });
    }
    // Read the in-memory snapshot while this menu is open; does not run inference.
    const interval = connected ? setInterval(() => { void readTerminalAiStatus(provider).catch(() => {}); }, 4000) : null;
    return () => { disposed = true; if (interval) clearInterval(interval); };
  }, [provider, connected]);

  const loadModels = async () => {
    setCatalog(null); setModelMessage("모델 목록 조회 중…");
    try { const result = await readTerminalAiModels(provider); setCatalog(result); setModelMessage(result ? "" : MODEL_UNSUPPORTED); }
    catch (error) { setModelMessage(error instanceof Error ? error.message : "모델 목록을 조회하지 못했습니다."); }
  };
  const refreshModels = async () => {
    if (busy || !loaded) return;
    setBusy(true);
    try { await loadModels(); } finally { setBusy(false); }
  };

  const save = async (check: boolean) => {
    if (!provider || busy || !loaded) return;
    if (customModel && !settings.model.trim()) {
      setFailed(true); setMessage("직접 사용할 모델 이름을 입력해 주세요."); return;
    }
    setBusy(true); setMessage("");
    try {
      const result = await terminalAiConfig(provider, settings);
      setSettings(result.config);
      const paths = JSON.stringify([result.config.executablePath, result.config.workingDirectory]);
      if (savedPaths !== paths) { setSavedPaths(paths); await loadModels(); }
      const installed = check ? await checkTerminalAi(provider) : null;
      const accountStatus = check ? await readTerminalAiStatus(provider, true) : null;
      setFailed(false);
      setMessage(installed ? `${installed.version} 설치 확인. ${accountStatus?.account.loggedIn ? "로그인 계정을 확인했습니다. 실제 응답 성공은 질문을 보낸 뒤 표시됩니다." : accountStatus ? "로그인 상태는 위 계정 안내를 확인해 주세요." : "이 보조 앱에서는 계정 정보를 제공하지 않습니다. 사용량은 위 공식 메뉴에서 확인해 주세요."}` : "이 PC의 AI 실행 설정을 저장했습니다.");
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : "설정하지 못했습니다.");
    } finally { setBusy(false); }
  };
  const refresh = async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await readTerminalAiStatus(provider, true); setFailed(false); }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "계정을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const usage = status?.usage || TERMINAL_AI_USAGE[provider];
  const account = status?.account;
  const selectedModel = catalog?.models.find(model => model.value === settings.model);
  return (
    <>
        <p>웹의 질문을 이 PC의 바리스타 앱이 받아, 설치하고 로그인한 CLI에 캐릭터 지침·최근 대화와 함께 전달합니다. CLI의 답변을 웹에 표시하며, 제공업체 모델과 해당 계정의 사용 한도를 이용합니다.</p>
        <div className={styles.account} aria-live="polite">
          <strong>{status?.lastError ? "연결 확인 필요" : status?.verifiedAt ? "✓ 실제 응답 연결 확인" : !accountInfoSupported ? "계정 정보 미지원" : account?.loggedIn ? "로그인 확인 · 실제 응답 대기" : account?.loggedIn === false ? "CLI 로그인 필요" : "계정 확인 대기"}</strong>
          <span>사용 계정: {account?.email || (!accountInfoSupported ? "이 보조 앱에서는 계정 정보를 제공하지 않습니다." : account?.loggedIn ? `${account.authMethod || "CLI 인증"} · 이메일 정보 제공 안 됨` : "아직 확인되지 않았습니다.")}</span>
          {account?.plan && <span>요금제: {[account.plan, account.organization].filter(Boolean).join(" · ")}</span>}
          {status?.checkedAt && <small>계정 조회: {new Date(status.checkedAt).toLocaleString("ko-KR")}</small>}
          {status?.verifiedAt && <small>최근 응답 성공: {new Date(status.verifiedAt).toLocaleString("ko-KR")}</small>}
          {status?.lastError && <p role="alert">{status.lastError}</p>}
          {connected && accountInfoSupported && <button type="button" disabled={busy || !loaded} onClick={() => void refresh()}>계정 새로고침</button>}
          <a href={usage.url} target="_blank" rel="noopener noreferrer">{usage.label} ↗</a>
          <p>{usage.description} 브라우저의 로그인 계정도 확인해 주세요.</p>
          <small>계정 조회는 모델을 호출하지 않습니다. 잔여량·청구 금액은 제공업체 메뉴에서 확인하세요.</small>
        </div>
        {!connected ? <p role="status">데스크톱 AI 바리스타를 실행하고 6자리 코드로 연결해 주세요. 계정 정보는 보조 앱이 제공하는 경우 표시됩니다.</p> : <>
          <label htmlFor="terminal-ai-executable">실행 파일 경로</label>
          <input id="terminal-ai-executable" value={settings.executablePath} disabled={busy || !loaded} placeholder="비우면 자동 탐색 · Windows는 .exe 절대 경로" onChange={event => setSettings(previous => ({ ...previous, executablePath: event.target.value }))} />
          <label htmlFor="terminal-ai-directory">작업 폴더</label>
          <input id="terminal-ai-directory" value={settings.workingDirectory} disabled={busy || !loaded} placeholder={settings.defaultDirectory || "비우면 앱 전용 AI 폴더"} onChange={event => setSettings(previous => ({ ...previous, workingDirectory: event.target.value }))} />
          <label htmlFor="terminal-ai-model">모델 선택</label>
          <select id="terminal-ai-model" value={customModel ? "custom" : settings.model} disabled={busy || !loaded} aria-describedby="terminal-ai-model-help" onChange={event => {
            const value = event.target.value;
            setCustomModel(value === "custom");
            setSettings(previous => ({ ...previous, model: value === "custom" ? "" : value }));
            setFailed(false); setMessage("설정 저장을 누르면 선택한 모델이 다음 질문부터 적용됩니다.");
          }}>
            <option value="">자동 선택 · 모델 지정 안 함</option>
            {settings.model && !customModel && !selectedModel && <option value={settings.model}>{settings.model} · 목록에서 확인되지 않음</option>}
            {catalog?.models.map(option => <option key={option.value} value={option.value}>{option.label}{option.isDefault ? " · 기본 추천" : ""}</option>)}
            <option value="custom">모델 이름 직접 입력</option>
          </select>
          {customModel && <>
            <label htmlFor="terminal-ai-custom-model">직접 사용할 모델 이름</label>
            <input id="terminal-ai-custom-model" value={settings.model} disabled={busy || !loaded} maxLength={100} placeholder={provider === "claude_cli" ? "Claude 모델 ID 또는 별칭" : "Codex 모델 ID"} onChange={event => setSettings(previous => ({ ...previous, model: event.target.value }))} />
          </>}
          <div className={styles.actions}><button type="button" disabled={busy || !loaded} onClick={() => void refreshModels()}>모델 목록 새로고침</button></div>
          <p role="status">{modelMessage || `${catalog?.models.length}개 모델 조회 · ${catalog?.source === "claude-agent-sdk" ? "Claude SDK" : "Codex App Server"} · ${catalog ? new Date(catalog.checkedAt).toLocaleTimeString("ko-KR") : ""}`}</p>
          {selectedModel?.description && <p>{selectedModel.description}</p>}
          <TerminalAiCostInfo provider={provider} model={settings.model} customModel={customModel} catalog={catalog} status={status} />
          <p id="terminal-ai-model-help">저장된 실행 경로·작업 폴더로 조회합니다. 목록은 CLI가 제공한 모델 정보이며, 계정의 실행 권한·잔여 사용량을 보장하지 않습니다. 저장 후 다음 질문부터 적용됩니다.</p>
          {!settings.model && <p>{provider === "codex_cli" ? "자동 선택은 바리스타의 Codex 실행 기본값을 사용합니다. 개인 config.toml의 모델 설정은 적용하지 않습니다." : "자동 선택은 Claude CLI의 모델 설정을 따릅니다."}</p>}
          <div className={styles.actions}>
            <button type="button" disabled={busy || !loaded} onClick={() => void save(false)}>설정 저장</button>
            <button type="button" disabled={busy || !loaded} onClick={() => void save(true)}>{busy ? "확인 중…" : accountInfoSupported ? "저장·설치·계정 확인" : "저장·설치 확인"}</button>
            <button type="button" onClick={cancelTerminalAi}>답변 취소</button>
          </div>
          <p>첫 연결은 대화 송수신용입니다. 업무 데이터 전체 전송·파일 수정·MCP 자동 실행은 제공하지 않습니다. 연결 실패 시 다른 AI로 자동 전환하지 않습니다.</p>
        </>}
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </>
  );
}
