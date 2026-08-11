import { GoogleDriveAdapter } from "@/lib/adapters/googleDrive";
import type { CloudToolDefinition } from "../types";

export const driveReportSaveTool: CloudToolDefinition = {
  id: "drive.report_save",
  version: 1,
  name: "Google Drive 보고서 저장",
  description: "사용자가 검토한 Markdown 보고서를 CoffeeTide 일자별 Drive 폴더에 저장합니다.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Drive 파일명이 될 보고서 제목입니다.", maxLength: 200 },
      body: { type: "string", description: "검토 완료된 Markdown 보고서 본문입니다.", maxLength: 20_000 },
    },
    required: ["title", "body"],
    additionalProperties: false,
  },
  effect: "external_write",
  confirmation: "always",
  timeoutMs: 20_000,
  maxOutputBytes: 16 * 1024,
  preview(input, context) {
    return {
      title: String(input.title),
      target: "Google Drive / CoffeeTide / 오늘 날짜",
      ...(context.googleEmail ? { account: context.googleEmail } : {}),
      changes: [`${String(input.title)}.md 파일 1개 생성`, `본문 ${String(input.body).length.toLocaleString()}자`],
      warning: "승인하면 Google Drive에 새 Markdown 파일이 생성됩니다.",
    };
  },
  async execute(input, context) {
    if (!context.googleAccessToken) throw new Error("GOOGLE_RECONNECT_REQUIRED");
    const file = await new GoogleDriveAdapter(context.googleAccessToken).saveMarkdownReport({
      title: String(input.title),
      body: String(input.body),
      timezone: context.timezone,
    });
    return {
      success: true,
      summary: `### ✅ Google Drive 저장 완료\n- **${file.name ?? String(input.title)}**`,
      data: {
        kind: "drive_report_saved",
        fileId: file.id,
        fileUrl: file.webViewLink,
        title: file.name ?? String(input.title),
      },
      sources: [
        {
          label: "Google Drive",
          ...(file.webViewLink ? { url: file.webViewLink } : {}),
        },
      ],
      warnings: [],
    };
  },
};
