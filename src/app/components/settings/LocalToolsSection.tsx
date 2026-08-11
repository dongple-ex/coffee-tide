"use client";

import React, { useEffect, useState } from "react";
import type {
  LocalToolArgumentDefinition,
  LocalToolExecutionResult,
  LocalToolPreview,
  PublicLocalToolDefinition,
} from "@/lib/localTools/types";
import styles from "../../page.module.css";

interface ToolListResponse {
  configured?: boolean;
  tools?: PublicLocalToolDefinition[];
  error?: string;
  localOnly?: boolean;
}

interface PreviewResponse {
  preview?: LocalToolPreview;
  approvalToken?: string;
  error?: string;
}

interface Props {
  onNotify: (message: string) => void;
}

function inputType(argument: LocalToolArgumentDefinition): string {
  if (argument.type === "date") return "date";
  if (argument.type === "integer" || argument.type === "number") return "number";
  return "text";
}

export function LocalToolsSection({ onNotify }: Props) {
  const [tools, setTools] = useState<PublicLocalToolDefinition[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  const [inputs, setInputs] = useState<Record<string, Record<string, string | boolean>>>({});
  const [busyToolId, setBusyToolId] = useState("");
  const [lastResult, setLastResult] = useState<LocalToolExecutionResult | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/local-tools", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as ToolListResponse;
        if (!active) return;
        if (!response.ok) {
          setError(payload.error ?? "로컬 도구 상태를 확인하지 못했습니다.");
          setLocalOnly(payload.localOnly === true);
          return;
        }
        setTools(payload.tools ?? []);
        setConfigured(payload.configured === true);
      })
      .catch(() => {
        if (active) setError("로컬 도구 상태를 확인하지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateInput(toolId: string, name: string, value: string | boolean) {
    setInputs((current) => ({
      ...current,
      [toolId]: { ...current[toolId], [name]: value },
    }));
  }

  async function request(tool: PublicLocalToolDefinition) {
    if (busyToolId) return;
    setBusyToolId(tool.id);
    setLastResult(null);
    try {
      const input = inputs[tool.id] ?? {};
      const previewResponse = await fetch("/api/local-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", toolId: tool.id, input }),
      });
      const previewPayload = (await previewResponse.json().catch(() => ({}))) as PreviewResponse;
      if (!previewResponse.ok || !previewPayload.preview || !previewPayload.approvalToken) {
        throw new Error(previewPayload.error ?? "실행 미리보기를 만들지 못했습니다.");
      }

      const preview = previewPayload.preview;
      const approved = window.confirm(
        [
          `읽기 전용 로컬 도구를 실행할까요?`,
          "",
          `도구: ${preview.toolName}`,
          `실행 PC: ${preview.executionHost}`,
          `스크립트: ${preview.scriptName}`,
          `입력: ${preview.inputSummary.join(", ")}`,
          `최대 실행 시간: ${Math.round(preview.timeoutMs / 1_000)}초`,
          "",
          "등록된 스크립트는 CoffeeTide가 격리하지 못하므로 직접 신뢰한 파일만 등록해야 합니다.",
        ].join("\n")
      );
      if (!approved) return;

      const executeResponse = await fetch("/api/local-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          toolId: tool.id,
          input,
          approvalToken: previewPayload.approvalToken,
        }),
      });
      const result = (await executeResponse.json().catch(() => ({}))) as
        | LocalToolExecutionResult
        | { error?: string };
      if (!executeResponse.ok || !("executionId" in result)) {
        throw new Error("error" in result ? result.error : "로컬 도구 실행에 실패했습니다.");
      }
      setLastResult(result);
      onNotify(result.success ? `${tool.name} 실행을 마쳤습니다.` : `${tool.name} 실행 결과를 확인해 주세요.`);
    } catch (requestError) {
      onNotify(requestError instanceof Error ? requestError.message : "로컬 도구 실행에 실패했습니다.");
    } finally {
      setBusyToolId("");
    }
  }

  return (
    <section className={styles.card} style={{ marginBottom: 16 }} aria-labelledby="local-tools-title">
      <div id="local-tools-title" className={styles.cardTitle} style={{ fontSize: "0.9rem", marginBottom: 8 }}>
        🧰 로컬 AI 도구
      </div>
      <p className={styles.connNote}>
        사용자 PC에 등록한 읽기 전용 PowerShell·Python·Node 도구입니다. 모바일로 같은 PC의
        CoffeeTide에 접속한 경우에도 실행 PC와 입력을 확인한 뒤 승인할 수 있습니다.
      </p>

      {loading && <p className={styles.connNote}>로컬 도구 상태를 확인하는 중입니다.</p>}
      {!loading && error && (
        <p className={styles.connNote} role="status">
          {localOnly ? "클라우드 배포에서는 사용할 수 없습니다. " : ""}{error}
        </p>
      )}
      {!loading && !error && !configured && (
        <p className={styles.connNote}>
          `LOCAL_TOOL_REGISTRY_PATH`가 설정되지 않았습니다. 등록 파일을 지정하면 도구가 표시됩니다.
        </p>
      )}
      {!loading && !error && configured && tools.length === 0 && (
        <p className={styles.connNote}>등록된 도구가 없습니다.</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {tools.map((tool) => (
          <details key={tool.id} className={styles.connDetails}>
            <summary>
              {tool.name} · {tool.runtime}
            </summary>
            <p className={styles.connNote}>{tool.description}</p>
            <p className={styles.connNote}>
              {tool.scriptName} · 읽기 전용 · 실행 전 항상 확인
            </p>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {tool.arguments.map((argument) => (
                <label key={argument.name} style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                    {argument.label}{argument.required ? " *" : ""}
                  </span>
                  {argument.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={inputs[tool.id]?.[argument.name] === true}
                      onChange={(event) => updateInput(tool.id, argument.name, event.target.checked)}
                    />
                  ) : argument.type === "enum" ? (
                    <select
                      className={styles.input}
                      value={String(inputs[tool.id]?.[argument.name] ?? "")}
                      onChange={(event) => updateInput(tool.id, argument.name, event.target.value)}
                    >
                      <option value="">선택</option>
                      {argument.enumValues?.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={styles.input}
                      type={inputType(argument)}
                      inputMode={argument.type === "integer" || argument.type === "number" ? "decimal" : undefined}
                      value={String(inputs[tool.id]?.[argument.name] ?? "")}
                      onChange={(event) => updateInput(tool.id, argument.name, event.target.value)}
                      placeholder={argument.description}
                      required={argument.required}
                    />
                  )}
                </label>
              ))}
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void request(tool)}
                disabled={Boolean(busyToolId)}
                style={{ minHeight: 44 }}
              >
                {busyToolId === tool.id ? "확인 중…" : "미리보기 후 실행"}
              </button>
            </div>
          </details>
        ))}
      </div>

      {lastResult && (
        <details className={styles.connDetails} open style={{ marginTop: 10 }}>
          <summary>{lastResult.success ? "실행 완료" : "실행 결과 확인 필요"}</summary>
          <p className={styles.connNote}>
            종료 코드 {lastResult.exitCode ?? "없음"} · {lastResult.durationMs}ms · 실행 ID {lastResult.executionId}
          </p>
          {lastResult.stdout && (
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflow: "auto" }}>
              {lastResult.stdout}
            </pre>
          )}
          {lastResult.stderr && (
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 160, overflow: "auto" }}>
              {lastResult.stderr}
            </pre>
          )}
          {lastResult.warnings.map((warning) => (
            <p key={warning} className={styles.connNote}>⚠️ {warning}</p>
          ))}
        </details>
      )}
    </section>
  );
}
