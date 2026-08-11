import type { ReportCloudDraft } from "../drafts";
import type { CloudToolDefinition } from "../types";

export const reportDraftTool: CloudToolDefinition = {
  id: "document.report_draft",
  version: 1,
  name: "보고서 초안 작성",
  description:
    "현재 대화와 업무 컨텍스트에 근거한 편집 가능한 Markdown 보고서 초안을 구성합니다. 파일로 저장하지 않습니다.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "보고서 제목입니다.", maxLength: 200 },
      reportType: {
        type: "string",
        description: "보고서 유형입니다.",
        enum: ["status", "weekly", "meeting", "general"],
        default: "general",
      },
      body: {
        type: "string",
        description: "컨텍스트에 없는 사실을 만들지 않은 완성된 Markdown 보고서 본문입니다.",
        maxLength: 20_000,
      },
    },
    required: ["title", "body"],
    additionalProperties: false,
  },
  effect: "draft",
  confirmation: "result_review",
  timeoutMs: 2_000,
  maxOutputBytes: 64 * 1024,
  async execute(input) {
    const reportType = ["status", "weekly", "meeting", "general"].includes(String(input.reportType))
      ? (input.reportType as ReportCloudDraft["reportType"])
      : "general";
    const data: ReportCloudDraft = {
      kind: "report",
      title: String(input.title),
      body: String(input.body),
      reportType,
    };
    return {
      success: true,
      summary: `### 📝 보고서 초안\n- **${data.title}**\n- 파일이나 Drive에는 아직 저장하지 않았습니다. 아래에서 수정하거나 복사하세요.`,
      data,
      sources: [{ label: "현재 CoffeeTide 업무와 사용자 요청" }],
      warnings: ["제출 전에 수치·일정·담당자를 확인하세요."],
    };
  },
};
