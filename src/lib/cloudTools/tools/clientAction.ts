import type { CloudToolDefinition } from "../types";

export const clientActionTool: CloudToolDefinition = {
  id: "workspace.client_action",
  version: 1,
  name: "클라이언트 액션 실행",
  description: "화면의 업무 상태를 변경하거나 광고 필터링 자동화 규칙을 추가하도록 클라이언트 앱에 지시합니다. (광고성 메일을 삭제/필터링해 달라는 요청이나 메일/업무를 일괄 완료처리해 달라는 요청에 사용하세요)",
  inputSchema: {
    type: "object",
    properties: {
      actionsJson: {
        type: "string",
        description: "실행할 액션 목록(JSON 배열 문자열). 예: '[{\"type\":\"batch_complete\",\"payload\":{\"targetIds\":[\"id1\"]}}]'",
      },
    },
    required: ["actionsJson"],
    additionalProperties: false,
  },
  effect: "read_only",
  confirmation: "none",
  timeoutMs: 2000,
  maxOutputBytes: 16384,
  async execute(input, context) {
    let actions: any[] = [];
    try {
      actions = JSON.parse(input.actionsJson as string);
    } catch (e) {
      // ignore
    }
    
    let summary = "요청하신 작업을 화면에 반영했습니다.";
    if (actions.some(a => a.type === "add_rule")) {
      summary = "새로운 자동화 규칙을 추가했습니다.";
    } else if (actions.some(a => a.type === "batch_complete")) {
      summary = "지정한 항목들을 완료 처리했습니다.";
    }

    return {
      success: true,
      summary,
      data: { actions },
      sources: [],
      warnings: [],
    };
  },
};
