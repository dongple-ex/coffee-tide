import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TerminalAiModelCatalog, TerminalAiStatus } from "@/lib/ai/desktopAi";
import { TerminalAiCostInfo } from "./TerminalAiCostInfo";

const catalog: TerminalAiModelCatalog = { provider: "codex_cli", source: "codex-app-server", checkedAt: "2026-10-02T00:00:00Z", models: [{ value: "mock-model", label: "샘플 모델", description: "", reasoningEfforts: ["low", "high"], defaultReasoningEffort: "high", isDefault: true }] };
const accountStatus = (authMethod: string, loggedIn = true): TerminalAiStatus => ({ provider: "codex_cli", account: { loggedIn, authMethod }, checkedAt: null, verifiedAt: null, usage: { label: "Sample usage", url: "https://platform.openai.com/usage", description: "" } });
const render = (props: Partial<React.ComponentProps<typeof TerminalAiCostInfo>> = {}) => renderToStaticMarkup(<TerminalAiCostInfo provider="codex_cli" model="mock-model" customModel={false} catalog={catalog} status={null} {...props} />);

describe("terminal AI effort and cost disclosure", () => {
  it("separates catalogue defaults from actual execution effort", () => {
    const html = render();
    expect(html).toContain("low · high");
    expect(html).toContain("목록의 권장 기본값: high");
    expect(html).toContain("실제 적용 수준: 미확인");
    expect(html).toContain("과금 방식을 확정할 수 없습니다");
    expect(html).not.toContain("실제 적용 수준: high");
  });
  it("shows an automatic-model reference without claiming it is the execution model", () => {
    const html = render({ model: "" });
    expect(html).toContain("목록 기본 모델(참고): 샘플 모델");
    expect(html).toContain("사용할 모델은 CLI 설정에 따라 달라질 수 있습니다");
    expect(render({ model: "", customModel: true })).not.toContain("low · high");
  });
  it("does not reuse a previous model's effort data for missing, manual or unavailable models", () => {
    for (const props of [{ model: "unknown" }, { model: "", customModel: true }, { catalog: null }, { catalog: { ...catalog, models: [{ ...catalog.models[0], reasoningEfforts: [], defaultReasoningEffort: undefined }] } }]) {
      const html = render(props);
      expect(html).toContain("정보 없음 · 미지원 여부도 확인되지 않음");
      expect(html).not.toContain("목록의 권장 기본값: high");
      expect(html).not.toContain("0원");
    }
  });
  it("distinguishes API billing, subscriptions, logged-out and external accounts", () => {
    expect(render({ status: accountStatus("API 키") })).toContain("API 사용량에 따라 과금");
    expect(render({ status: accountStatus("ChatGPT") })).toContain("추가 사용량 결제 여부");
    for (const status of [accountStatus("외부 제공업체"), accountStatus("API 키", false)]) expect(render({ status })).toContain("과금 방식을 확정할 수 없습니다");
    const claude = render({ provider: "claude_cli", status: { ...accountStatus("Claude 구독"), provider: "claude_cli" }, catalog: null });
    expect(claude).toContain("별도 결제 확인 없이 크레딧");
    expect(claude).toContain("https://code.claude.com/docs/en/costs");
  });
});
