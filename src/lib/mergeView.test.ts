import { describe, expect, it } from "vitest";
import { getWorkflowSection, buildMergedView } from "@/lib/mergeView";
import { UnifiedData } from "@/lib/types/unified";

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

describe("buildMergedView - in-place ordering", () => {
  const baseItem = (id: string, title: string, source: "llm" | "manual" = "llm"): UnifiedData => ({
    id,
    source,
    title,
    content: title,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    author: { name: "test" },
    url: "",
    status: "pending",
    category: "reference",
  });

  it("keeps overridden external items in their original relative position when status changes to completed", () => {
    const serverItems: UnifiedData[] = [
      baseItem("llm-1", "첫 번째 LLM 결과"),
      baseItem("llm-2", "두 번째 LLM 결과"),
      baseItem("llm-3", "세 번째 LLM 결과"),
    ];

    // 두 번째 항목(llm-2)을 완료 처리하여 manualItems에 추가한 경우
    const manualItems: UnifiedData[] = [
      { ...baseItem("llm-2", "두 번째 LLM 결과"), status: "completed" },
    ];

    const result = buildMergedView(manualItems, serverItems, [], [], 24);

    expect(result.map((i) => i.id)).toEqual(["llm-1", "llm-2", "llm-3"]);
    expect(result[1].status).toBe("completed");
  });

  it("places pure manual items at the front while keeping external items in place", () => {
    const serverItems: UnifiedData[] = [
      baseItem("llm-1", "첫 번째 LLM 결과"),
      baseItem("llm-2", "두 번째 LLM 결과"),
    ];

    const manualItems: UnifiedData[] = [
      baseItem("manual-new", "새로 등록한 수동 업무", "manual"),
      { ...baseItem("llm-2", "두 번째 LLM 결과"), status: "completed" },
    ];

    const result = buildMergedView(manualItems, serverItems, [], [], 24);

    expect(result.map((i) => i.id)).toEqual(["manual-new", "llm-1", "llm-2"]);
    expect(result[2].status).toBe("completed");
  });
});
