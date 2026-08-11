import type { EmailReplyCloudDraft } from "../drafts";
import type { CloudToolDefinition } from "../types";

export const emailReplyDraftTool: CloudToolDefinition = {
  id: "email.reply_draft",
  version: 1,
  name: "메일 답장 초안 작성",
  description:
    "대화와 업무 컨텍스트를 바탕으로 편집 가능한 메일 답장 초안을 구성합니다. 저장하거나 발송하지 않습니다.",
  inputSchema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "답장 메일 제목입니다.", maxLength: 200 },
      recipient: { type: "string", description: "알고 있는 경우 받는 사람 이름 또는 이메일입니다.", maxLength: 320 },
      sourceTitle: { type: "string", description: "답장의 근거가 된 메일 또는 업무 제목입니다.", maxLength: 300 },
      body: {
        type: "string",
        description: "사용자 요청과 컨텍스트에 근거한 완성된 한국어 답장 본문입니다.",
        maxLength: 12_000,
      },
    },
    required: ["subject", "body"],
    additionalProperties: false,
  },
  effect: "draft",
  confirmation: "result_review",
  timeoutMs: 2_000,
  maxOutputBytes: 32 * 1024,
  async execute(input) {
    const data: EmailReplyCloudDraft = {
      kind: "email_reply",
      subject: String(input.subject),
      body: String(input.body),
      ...(typeof input.recipient === "string" ? { recipient: input.recipient } : {}),
      ...(typeof input.sourceTitle === "string" ? { sourceTitle: input.sourceTitle } : {}),
    };
    return {
      success: true,
      summary: `### 📝 메일 답장 초안\n- 제목: **${data.subject}**\n- 임시보관함 저장이나 발송은 하지 않았습니다. 아래에서 내용을 검토하세요.`,
      data,
      sources: [{ label: data.sourceTitle ?? "사용자 요청과 현재 CoffeeTide 대화" }],
      warnings: ["받는 사람과 사실관계를 확인한 후 사용하세요."],
    };
  },
};
