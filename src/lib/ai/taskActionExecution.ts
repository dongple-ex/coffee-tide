import type { TaskActionSuccess } from "./taskActions";
import type { UnifiedData } from "../types/unified";

export interface TaskMutationResult { ok: boolean; message: string }
export function requiresExternalCompletion(item: UnifiedData) {
  return item.source === "notion" || item.source === "obsidian";
}
export function appendTaskNote(previous: string | undefined, note: string) {
  return previous?.trim() ? `${previous.trimEnd()}\n${note.trim()}` : note.trim();
}
export async function executeTaskAction(action: TaskActionSuccess, handlers: {
  completeExternal: (item: UnifiedData) => Promise<TaskMutationResult>;
  completeLocal: (item: UnifiedData) => void;
  appendNote: (item: UnifiedData, note: string) => void;
  search: (keyword: string) => void;
  replyDraft: (item: UnifiedData, instruction?: string) => Promise<TaskMutationResult>;
}): Promise<string> {
  try {
    switch (action.type) {
      case "complete":
        if (requiresExternalCompletion(action.item)) {
          const result = await handlers.completeExternal(action.item);
          return result.ok ? `✅ '${action.item.title}': ${result.message}` : `완료하지 못했습니다: ${result.message}`;
        }
        handlers.completeLocal(action.item);
        return `✅ '${action.item.title}'을 CoffeeTide에서 완료 처리했습니다.`;
      case "add_note":
        if (!action.note?.trim()) return "추가할 메모 내용을 알려주세요.";
        handlers.appendNote(action.item, action.note);
        return `📝 '${action.item.title}'의 기존 메모에 내용을 추가했습니다.\n> ${action.note}`;
      case "search_focus":
        handlers.search(action.keyword);
        return action.replyText;
      case "reply_draft": {
        const result = await handlers.replyDraft(action.item, action.draftInstruction);
        return result.ok ? `✉️ '${action.item.title}': ${result.message}` : `답장 초안을 만들지 못했습니다: ${result.message}`;
      }
    }
  } catch {
    return "요청을 처리하지 못했습니다. 업무 상태를 확인하고 다시 시도해 주세요.";
  }
}
