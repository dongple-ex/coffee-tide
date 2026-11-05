import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile("page.tsx", readFileSync(new URL("./page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "askCopilot") {
    declaration = node;
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!declaration) {
  throw new Error("askCopilot entry point not found");
}
const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(provider?: string, connected = false) {
  const context = {
    Error,
    copilotConfig: { aiProvider: provider, presetId: "barista" },
    copilotInput: "합성 질문", copilotMessages: [], copilotBusy: false,
    taskActionBusyRef: { current: false }, voiceChatActiveRef: { current: false },
    terminalScopeRef: { current: "test" }, userScope: "test",
    pendingTaskActions: { current: new Map() }, appShortcuts: [], merged: [],
    sparkEnabled: false, pushEndpoint: undefined,
    setWelcomeCardCollapsed: vi.fn(), setCopilotInput: vi.fn(), setCopilotMessages: vi.fn(),
    setCopilotBusy: vi.fn(), showToast: vi.fn(), speakPersonaVoice: vi.fn(),
    handleSlashCommand: vi.fn(() => false), parseTaskActionIntent: vi.fn(() => null),
    terminalAiConnected: vi.fn(() => connected),
    askTerminalAi: vi.fn(async () => {
      if (!connected) { throw new Error("데스크톱 앱을 실행하고 6자리 코드로 연결해 주세요."); }
      return { answer: "합성 데스크톱 답변" };
    }),
    buildTerminalAiPrompt: vi.fn(() => "synthetic prompt"),
    requestAiJob: vi.fn(async () => ({ ok: true, json: async () => ({ answer: "합성 서버 답변" }) })),
    shouldUseChromeCanaryAfterServer: vi.fn(() => false),
    tryChromeCanaryFallback: vi.fn(async () => null),
    AiJobPendingError: class extends Error {},
  };
  const ask = runInNewContext(`${code}\naskCopilot`, context) as (preset?: string, options?: { persistToFeed?: boolean; trackGlobalBusy?: boolean }) => Promise<string>;
  return { context, ask };
}

describe("question provider routing", () => {
  it.each([undefined, "default"])("uses the server without a desktop connection for %s", async provider => {
    const { context, ask } = fixture(provider);
    expect(await ask()).toBe("합성 서버 답변");
    expect(context.requestAiJob).toHaveBeenCalledOnce();
    expect(context.askTerminalAi).not.toHaveBeenCalled();
    expect(context.terminalAiConnected).not.toHaveBeenCalled();
  });

  it.each(["claude_cli", "codex_cli"])("preserves the draft when optional %s is disconnected", async provider => {
    const { context, ask } = fixture(provider);
    expect(await ask()).toContain("기본 AI로 전환");
    expect(context.setCopilotInput).not.toHaveBeenCalled();
    expect(context.setCopilotMessages).not.toHaveBeenCalled();
    expect(context.askTerminalAi).not.toHaveBeenCalled();
    expect(context.requestAiJob).not.toHaveBeenCalled();
    expect(context.copilotConfig.aiProvider).toBe(provider);
  });

  it.each(["claude_cli", "codex_cli"])("keeps connected %s requests on the selected provider", async provider => {
    const { context, ask } = fixture(provider, true);
    expect(await ask()).toBe("합성 데스크톱 답변");
    expect(context.askTerminalAi).toHaveBeenCalledOnce();
    expect(context.requestAiJob).not.toHaveBeenCalled();
  });

  it("uses the default route only after an explicit switch, with no automatic resend", async () => {
    const { context, ask } = fixture("codex_cli");
    await ask();
    context.copilotConfig.aiProvider = "default";
    expect(context.requestAiJob).not.toHaveBeenCalled();
    expect(await ask()).toBe("합성 서버 답변");
    expect(context.requestAiJob).toHaveBeenCalledOnce();
  });

  it("returns actionable guidance to companion callers without sending data", async () => {
    const { context, ask } = fixture("codex_cli");
    expect(await ask("합성 대화", { persistToFeed: false, trackGlobalBusy: false })).toContain("기본 AI로 전환");
    expect(context.requestAiJob).not.toHaveBeenCalled();
    expect(context.askTerminalAi).not.toHaveBeenCalled();
  });

  it("does not silently use the server if a connected desktop request fails", async () => {
    const { context, ask } = fixture("codex_cli", true);
    context.askTerminalAi.mockRejectedValueOnce(new Error("합성 연결 실패"));
    expect(await ask()).toBe("합성 연결 실패");
    expect(context.requestAiJob).not.toHaveBeenCalled();
  });
});
