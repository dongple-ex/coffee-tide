import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const complete = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/integrationStore", () => ({ readSessionWithIntegrations: async () => ({ obsidianVaultPath: "test-vault" }) }));
vi.mock("@/lib/auth/cookies", () => ({ unauthorized: () => new Response(null, { status: 401 }) }));
vi.mock("@/lib/adapters/factory", () => ({ isMockMode: () => false }));
vi.mock("@/lib/adapters/notion", () => ({ NotionAdapter: class { completeTask = complete; } }));
vi.mock("@/lib/adapters/obsidian", () => ({ ObsidianAdapter: class { completeTask = complete; } }));
import { POST } from "./route";
it.each(["gmail", "outlook", "gcalendar"])("rejects %s instead of routing its ID to Obsidian", async source => {
  const response = await POST(new NextRequest("http://localhost/api/tasks/update", { method: "POST", body: JSON.stringify({ id: "sample-id", source }) }));
  expect(response.status).toBe(400);
  expect(complete).not.toHaveBeenCalled();
});
