import { describe, it, expect } from "vitest";
import { validateWindowPayload } from "./route";

describe("window-control validation", () => {
  it("validates correct minimize payload", () => {
    const valid = validateWindowPayload({
      action: "minimize",
      marker: "0123456789abcdef0123456789abcdef",
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.action).toBe("minimize");
      expect(valid.marker).toBe("0123456789abcdef0123456789abcdef");
    }
  });

  it("validates correct restore payload", () => {
    const valid = validateWindowPayload({
      action: "restore",
      marker: "fedcba9876543210fedcba9876543210",
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.action).toBe("restore");
    }
  });

  it("rejects invalid action", () => {
    const invalid = validateWindowPayload({
      action: "maximize",
      marker: "0123456789abcdef0123456789abcdef",
    });
    expect(invalid.ok).toBe(false);
  });

  it("rejects invalid marker format", () => {
    const invalidShort = validateWindowPayload({
      action: "minimize",
      marker: "1234",
    });
    expect(invalidShort.ok).toBe(false);

    const invalidChars = validateWindowPayload({
      action: "minimize",
      marker: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    });
    expect(invalidChars.ok).toBe(false);
  });
});
