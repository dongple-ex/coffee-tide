import { describe, expect, it } from "vitest";
import { getWorkflowSection } from "@/lib/mergeView";

describe("getWorkflowSection", () => {
  it("keeps a completed action item in the todo section", () => {
    expect(getWorkflowSection({ category: "action_required", status: "pending" })).toBe("todo");
    expect(getWorkflowSection({ category: "action_required", status: "completed" })).toBe("todo");
  });

  it("keeps a completed reference item in the rest section", () => {
    expect(getWorkflowSection({ category: "reference", status: "pending" })).toBe("rest");
    expect(getWorkflowSection({ category: "reference", status: "completed" })).toBe("rest");
  });
});
