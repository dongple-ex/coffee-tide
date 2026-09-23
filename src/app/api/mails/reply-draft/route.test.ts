import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), save: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/ai/gemini", () => ({ generateReplyDraft: mocks.generate }));
vi.mock("@/lib/adapters/factory", () => ({ isMockMode: () => false }));
vi.mock("@/lib/adapters/outlook", () => ({ AuthExpiredError: class extends Error {}, OutlookAdapter: class { saveReplyDraft = mocks.save; } }));
vi.mock("@/lib/auth/integrationStore", () => ({ readSessionWithIntegrations: mocks.session, persistRefreshedIntegration: vi.fn(), writeSessionForCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/cookies", () => ({ unauthorized: () => new Response(null, { status: 401 }) }));
vi.mock("@/lib/auth/refresh", () => ({ REFRESH_WINDOW_MS: 60000, refreshChannel: vi.fn() }));
import { POST } from "./route";
const request = (data: object) => new NextRequest("http://localhost/api/mails/reply-draft", { method: "POST", body: JSON.stringify(data) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ outlookToken: "test-token" });
  mocks.generate.mockResolvedValue({ text: "샘플 생성 답변", generated: true });
  mocks.save.mockResolvedValue(undefined);
});
it("forwards the mail and instructions to AI and only saves Outlook drafts", async () => {
  const body = { id: "mail-1", source: "gmail", bodyContent: "샘플 원문", instruction: "정중하게 일정 연기를 요청해줘" };
  expect((await POST(request(body))).status).toBe(200);
  expect(mocks.generate).toHaveBeenCalledWith(body.bodyContent, body.instruction);
  expect(mocks.save).not.toHaveBeenCalled();
  await POST(request({ ...body, source: "outlook" }));
  expect(mocks.save).toHaveBeenCalledWith("mail-1", "샘플 생성 답변");
});
it("labels fallback text and does not persist it as an AI-generated draft", async () => {
  mocks.generate.mockResolvedValue({ text: "기본 예시", generated: false });
  const response = await POST(request({ id: "mail-1", source: "outlook", bodyContent: "샘플 원문", instruction: "내용을 수정해줘" }));
  expect((await response.json()).message).toContain("기본 예시");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects malformed instructions before generating anything", async () => {
  expect((await POST(request({ id: "mail-1", bodyContent: "샘플 원문", instruction: {} }))).status).toBe(400);
  expect(mocks.generate).not.toHaveBeenCalled();
});
