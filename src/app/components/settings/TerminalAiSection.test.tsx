import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderNotice, TerminalAiSection } from "./TerminalAiSection";
import { cancelTerminalAi } from "@/lib/ai/desktopAi";

const connection = vi.hoisted(() => ({ connected: false }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("@/lib/ai/desktopAi", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/ai/desktopAi")>(),
  terminalAiConnected: () => connection.connected,
  cancelTerminalAi: vi.fn(),
}));
afterEach(() => { connection.connected = false; vi.clearAllMocks(); });

function buttonIn(node: React.ReactNode): ReactElement<{ onClick: () => void; disabled: boolean }> | undefined {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) { return; }
  if (node.type === "button") { return node as ReactElement<{ onClick: () => void; disabled: boolean }>; }
  for (const child of React.Children.toArray(node.props.children)) {
    const button = buttonIn(child);
    if (button) { return button; }
  }
}

describe("optional desktop AI controls", () => {
  it("labels the default and desktop choices without requiring a connection", () => {
    const html = renderToStaticMarkup(<TerminalAiSection config={{}} onChangeConfig={vi.fn()} />);
    expect(html).toContain("기본 AI · 데스크톱 앱 없이 사용");
    expect(html).toContain("데스크톱 AI (선택) · Claude Code");
    expect(html).toContain("데스크톱 AI (선택) · Codex CLI");
    expect(html).not.toContain("6자리 코드");
  });

  it.each([false, true])("shows the default route regardless of connection=%s", connected => {
    connection.connected = connected;
    const html = renderToStaticMarkup(<AiProviderNotice config={{ aiProvider: "default" }} onChangeConfig={vi.fn()} />);
    expect(html).toContain("데스크톱 앱 없이 질문할 수 있습니다");
    expect(html).not.toContain("<button");
  });

  it.each(["claude_cli", "codex_cli"] as const)("shows connection state and an explicit switch for %s", aiProvider => {
    for (const connected of [false, true]) {
      connection.connected = connected;
      const html = renderToStaticMarkup(<AiProviderNotice config={{ aiProvider }} onChangeConfig={vi.fn()} />);
      expect(html).toContain(connected ? "앱 연결됨" : "앱 연결 안 됨");
      expect(html).toContain("기본 AI로 전환");
      expect(html).toContain("서버에서 처리");
    }
  });

  it("changes only the provider after a click and preserves persona settings", () => {
    const config = { aiProvider: "codex_cli" as const, presetId: "barista", customInstructions: "합성 지침" };
    const onChangeConfig = vi.fn();
    const element = AiProviderNotice({ config, onChangeConfig });
    expect(onChangeConfig).not.toHaveBeenCalled();
    buttonIn(element)!.props.onClick();
    expect(onChangeConfig).toHaveBeenCalledExactlyOnceWith({ ...config, aiProvider: "default" });
    expect(cancelTerminalAi).toHaveBeenCalledOnce();
    expect(config.aiProvider).toBe("codex_cli");
  });

  it("prevents a provider switch during a response", () => {
    const onChangeConfig = vi.fn();
    const element = AiProviderNotice({ config: { aiProvider: "codex_cli" }, onChangeConfig, busy: true });
    const button = buttonIn(element)!;
    expect(button.props.disabled).toBe(true);
    button.props.onClick();
    expect(onChangeConfig).not.toHaveBeenCalled();
    expect(cancelTerminalAi).not.toHaveBeenCalled();
  });
});
