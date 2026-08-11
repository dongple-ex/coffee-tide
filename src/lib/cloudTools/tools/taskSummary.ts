import type { UnifiedData } from "@/lib/types/unified";
import type { CloudToolDefinition } from "../types";

function isActive(item: UnifiedData): boolean {
  return item.status !== "completed" && item.status !== "dismissed";
}

export const taskSummaryTool: CloudToolDefinition = {
  id: "workspace.task_summary",
  version: 1,
  name: "업무 현황 요약",
  description: "현재 CoffeeTide 화면의 업무를 상태와 카테고리 또는 출처별로 집계합니다.",
  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        description: "active는 미완료 업무만, all은 전달된 전체 업무를 집계합니다.",
        enum: ["active", "all"],
        default: "active",
      },
      groupBy: {
        type: "string",
        description: "집계 기준입니다.",
        enum: ["category", "source"],
        default: "category",
      },
    },
    additionalProperties: false,
  },
  effect: "read_only",
  confirmation: "none",
  timeoutMs: 2_000,
  maxOutputBytes: 32 * 1024,
  async execute(input, context) {
    const scope = input.scope === "all" ? "all" : "active";
    const groupBy = input.groupBy === "source" ? "source" : "category";
    const selected = scope === "all" ? context.items : context.items.filter(isActive);
    const groups: Record<string, number> = {};
    for (const item of selected) {
      const key = groupBy === "source" ? item.source : item.category ?? "unclassified";
      groups[key] = (groups[key] ?? 0) + 1;
    }

    const counts = {
      total: selected.length,
      active: selected.filter(isActive).length,
      pending: selected.filter((item) => !item.status || item.status === "pending").length,
      held: selected.filter((item) => item.status === "held").length,
      completed: selected.filter((item) => item.status === "completed").length,
      urgent: selected.filter((item) => item.category === "urgent" && isActive(item)).length,
    };
    const groupLines = Object.entries(groups)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([label, count]) => `- ${label}: ${count}건`);

    return {
      success: true,
      summary: [
        `### ☁️ Cloud Tool · 업무 현황 요약`,
        `- 집계 범위: ${scope === "active" ? "미완료 업무" : "전달된 전체 업무"}`,
        `- 총 ${counts.total}건 · 긴급 ${counts.urgent}건 · 보류 ${counts.held}건 · 완료 ${counts.completed}건`,
        groupLines.length ? `\n#### ${groupBy === "source" ? "출처별" : "분류별"}\n${groupLines.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      data: { scope, groupBy, counts, groups },
      sources: [{ label: "현재 CoffeeTide 업무 화면" }],
      warnings:
        context.items.length >= 80
          ? ["Copilot 요청 상한인 80개 항목 안에서 집계했습니다."]
          : [],
    };
  },
};
