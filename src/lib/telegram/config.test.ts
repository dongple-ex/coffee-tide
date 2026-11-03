import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { telegramConfig, validWebhookSecret } from "./config";
afterEach(() => { vi.unstubAllEnvs(); });
it("fails closed on missing settings and verifies the exact webhook secret", () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-only");
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "example_bot");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "a".repeat(40));
  vi.stubEnv("TELEGRAM_APP_ORIGIN", "https://example.com");
  expect(telegramConfig()).not.toBeNull();
  expect(validWebhookSecret("a".repeat(40))).toBe(true);
  expect(validWebhookSecret("b".repeat(40))).toBe(false);
  vi.stubEnv("TELEGRAM_APP_ORIGIN", "https://example.com/private");
  expect(telegramConfig()).toBeNull();
});
