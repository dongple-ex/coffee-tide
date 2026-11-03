import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceItem } from "../data/contracts";
import type { UnifiedData } from "../types/unified";

vi.mock("server-only", () => ({}));
import { askKananaCopilot } from "./kanana";
import { generateCopilotReply } from "./copilotService";

let endpoint: string;
let respond: (res: ServerResponse) => void;
const received: Array<{ headers: IncomingMessage["headers"]; body: Record<string, unknown> }> = [];
const key = randomBytes(32).toString("hex");
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) { chunks.push(Buffer.from(chunk)); }
  received.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
  respond(res);
});
const answer = (content: string) => ({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] });
const item = (id: string, overrides: Partial<WorkspaceItem> = {}): UnifiedData & Partial<WorkspaceItem> => ({
  id, source: "manual", title: id, content: `${id} 업무 자료`, created_at: "2026-10-26T00:00:00Z",
  author: { name: "Tester" }, url: "", status: "pending", aiPolicy: "cloud_allowed", privacyScope: "cloud_private", ...overrides,
});
const prompt = () => received[0].body.messages as Array<{ role: string; content: string }>;

beforeAll(async () => {
  await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") { throw new Error("No test listener"); }
  endpoint = `http://127.0.0.1:${address.port}/v1/chat/completions`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) { reject(error); } else { resolve(); } }); });
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("KANANA_API_URL", endpoint);
  vi.stubEnv("KANANA_API_KEY", key);
  vi.stubEnv("KANANA_MODEL", "kakaocorp/kanana-2-1.3b-instruct");
  vi.stubEnv("KANANA_TIMEOUT_MS", "1000");
  vi.stubEnv("KANANA_MAX_OUTPUT_TOKENS", "128");
  vi.stubEnv("KANANA_MAX_INPUT_BYTES", "6000");
  received.length = 0;
  respond = (res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(answer("회의는 오후 3시입니다."))); };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); server.closeAllConnections(); });

describe("Kanana HTTP contract", () => {
  it("runs the shared web and Telegram response path against the HTTP fixture", async () => {
    vi.stubEnv("COPILOT_AI_PROVIDER", "kanana");
    const result = await generateCopilotReply("회의 요약", [item("회의")], "Asia/Seoul", undefined,
      { userId: "alice" }, { mode: "work", allowCloudTools: true });
    expect(result).toMatchObject({ answer: "회의는 오후 3시입니다.", providerUsed: "kanana", aiUsed: true, suggestions: [] });
    expect(received).toHaveLength(1);
    expect(received[0].body).not.toHaveProperty("tools");
    expect(result).not.toHaveProperty("cloudToolExecution");
  });

  it("uses the Korean timezone for invalid timezone input without losing the reply", async () => {
    expect(await askKananaCopilot("안녕", [], "invalid-timezone")).toMatchObject({ aiUsed: true });
    expect(prompt()[0].content).toContain("Asia/Seoul");
    expect(prompt()[0].content).not.toContain("invalid-timezone");
  });

  it("sends authenticated bounded non-streaming chat to the configured model", async () => {
    const result = await askKananaCopilot("회의 요약", [item("회의")], "Asia/Seoul");
    expect(result).toMatchObject({ answer: "회의는 오후 3시입니다.", aiUsed: true, providerUsed: "kanana", contextItemIds: ["회의"] });
    expect(received).toHaveLength(1);
    expect(received[0].headers.authorization).toBe(`Bearer ${key}`);
    expect(received[0].body).toMatchObject({ model: "kakaocorp/kanana-2-1.3b-instruct", stream: false, max_tokens: 128 });
    expect(received[0].body).not.toHaveProperty("tools");
    expect(JSON.stringify(result)).not.toContain(key);
    expect(prompt()[0].content).toContain("Asia/Seoul");
    expect(prompt()[0].content).toContain("외부 도구는 없습니다");
  });

  it("excludes local-only, disabled, deleted and unclassified policy data", async () => {
    const result = await askKananaCopilot("자료 요약", [item("allowed"), item("private", { privacyScope: "local_only" }),
      item("disabled", { aiPolicy: "disabled" }), item("local", { aiPolicy: "local_only" }),
      item("deleted", { deletedAt: "2026-10-26T00:00:00Z" }), item("missing", { aiPolicy: undefined })], "Asia/Seoul");
    const payload = JSON.parse(prompt()[1].content);
    expect(payload.work.map((entry: { id: string }) => entry.id)).toEqual(["allowed"]);
    expect(result.contextItemIds).toEqual(["allowed"]);
  });

  it("omits work data in social mode and keeps bounded recent conversation", async () => {
    await askKananaCopilot("안녕", [item("not-for-social")], "Asia/Seoul", { baristaName: "테드" }, {
      mode: "social", history: [{ role: "user", text: "아까 커피 얘기" }, { role: "assistant", text: "좋아요" }],
    });
    expect(prompt()[0].content).toContain("테드");
    const payload = JSON.parse(prompt()[1].content);
    expect(payload.work).toEqual([]);
    expect(payload.history.map((entry: { text: string }) => entry.text)).toEqual(["아까 커피 얘기", "좋아요"]);
  });

  it("keeps the complete question and prunes whole context entries to the byte budget", async () => {
    const question = "회의 날짜와 담당자를 알려줘";
    const result = await askKananaCopilot(question, Array.from({ length: 40 }, (_, index) => item(`item-${index}`, { content: "긴 자료 ".repeat(200) })),
      "Asia/Seoul", undefined, { history: Array.from({ length: 12 }, () => ({ role: "user", text: "history ".repeat(200) })) });
    expect(prompt().reduce((bytes, entry) => bytes + Buffer.byteLength(entry.content), 0)).toBeLessThanOrEqual(6000);
    const payload = JSON.parse(prompt()[1].content);
    expect(payload.question).toBe(question);
    expect(payload.work.length).toBeLessThan(40);
    expect(payload.history.length).toBeLessThanOrEqual(4);
    expect(result.contextLimited).toBe(true);
    expect(result.contextItemIds).toEqual(payload.work.map((entry: { id: string }) => entry.id));
  });

  it("rejects an oversized question before sending any data", async () => {
    const result = await askKananaCopilot("가".repeat(6000), [], "Asia/Seoul", undefined, { mode: "social" });
    expect(result).toMatchObject({ aiUsed: false, providerUsed: "local_rules", fallbackReason: "input_too_long" });
    expect(received).toHaveLength(0);
  });

  it.each([429, 503, 401, 500])("handles HTTP %s once without exposing upstream error text", async (status) => {
    const privateText = randomBytes(20).toString("hex");
    respond = (res) => { res.writeHead(status); res.end(privateText); };
    const result = await askKananaCopilot("안녕", [], "Asia/Seoul", undefined, { mode: "social" });
    expect(result).toMatchObject({ aiUsed: false, fallbackReason: [429, 503].includes(status) ? "busy" : "unavailable" });
    expect(received).toHaveLength(1);
    expect(JSON.stringify([result, vi.mocked(console.warn).mock.calls])).not.toContain(privateText);
  });

  it("aborts a delayed response after the configured timeout", async () => {
    respond = () => {};
    const result = await askKananaCopilot("안녕", [], "Asia/Seoul", undefined, { mode: "social" });
    expect(result).toMatchObject({ aiUsed: false, fallbackReason: "timeout" });
    expect(received).toHaveLength(1);
  });

  it("applies the timeout while reading the response body as well", async () => {
    respond = (res) => { res.writeHead(200); res.write('{"choices":['); };
    expect(await askKananaCopilot("안녕", [], "Asia/Seoul")).toMatchObject({ aiUsed: false, fallbackReason: "timeout" });
  });

  it("refuses redirects instead of forwarding the authorization header", async () => {
    respond = (res) => { res.writeHead(307, { Location: `${endpoint}/redirected` }); res.end(); };
    expect(await askKananaCopilot("안녕", [], "Asia/Seoul")).toMatchObject({ aiUsed: false, fallbackReason: "unavailable" });
    expect(received).toHaveLength(1);
  });

  it.each(["not-json", JSON.stringify(answer(" ")), JSON.stringify({ choices: [] }),
    JSON.stringify({ choices: [{ message: { role: "assistant", content: "실행", tool_calls: [{ id: "call" }] } }] }),
    JSON.stringify(answer("<think>internal reasoning</think>")), JSON.stringify(answer("a".repeat(70_000))),
  ])("rejects malformed, empty, tool or oversized replies (%#)", async (body) => {
    respond = (res) => { res.end(body); };
    expect(await askKananaCopilot("안녕", [], "Asia/Seoul")).toMatchObject({ aiUsed: false, fallbackReason: "invalid_response" });
  });

  it("returns only final text and isolates consecutive users' request contexts", async () => {
    respond = (res) => { res.end(JSON.stringify(answer("<think>private reasoning</think>최종 답변"))); };
    expect(await askKananaCopilot("사용자 A", [item("alice-only")], "Asia/Seoul")).toMatchObject({ answer: "최종 답변" });
    await askKananaCopilot("사용자 B", [item("bob-only")], "Asia/Seoul");
    expect(JSON.stringify(received[1].body)).not.toContain("alice-only");
    expect(JSON.stringify(received[1].body)).toContain("bob-only");
  });
});

describe("Kanana configuration boundary", () => {
  it.each([
    ["KANANA_API_KEY", ""], ["KANANA_API_URL", ""], ["KANANA_API_URL", "not-a-url"],
    ["KANANA_API_URL", "http://example.com/v1/chat/completions"],
    ["KANANA_API_URL", "https://example.com/v1/chat/completions?secret=placeholder"],
    ["KANANA_API_URL", "https://example.com/v1/chat/completions#fragment"],
    ["KANANA_TIMEOUT_MS", "180001"], ["KANANA_TIMEOUT_MS", "0"],
    ["KANANA_MAX_OUTPUT_TOKENS", "257"], ["KANANA_MAX_INPUT_BYTES", "NaN"],
  ])("rejects invalid %s configuration (%#)", async (name, value) => {
    vi.stubEnv(name, value);
    expect(await askKananaCopilot("안녕", [], "Asia/Seoul")).toMatchObject({ aiUsed: false, fallbackReason: "invalid_config" });
    expect(received).toHaveLength(0);
  });

  it("requires HTTPS on Vercel even for a localhost address", async () => {
    vi.stubEnv("VERCEL", "1");
    expect(await askKananaCopilot("안녕", [], "Asia/Seoul")).toMatchObject({ aiUsed: false, fallbackReason: "invalid_config" });
    expect(received).toHaveLength(0);
  });
});
