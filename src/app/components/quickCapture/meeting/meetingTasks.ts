import type { UnifiedData } from "@/lib/types/unified";

export interface ActionItem {
  clientId: string;
  task: string;
  assignee: string;
  dueDate: string;
  selected?: boolean;
  saved?: boolean;
  error?: string;
}

export interface SavedTaskResult {
  clientId: string;
  task: string;
}

export interface FailedTaskResult {
  clientId: string;
  task: string;
  error: string;
}

export interface SaveTasksResult {
  success: boolean;
  saved: SavedTaskResult[];
  failed: FailedTaskResult[];
}

export interface SaveMeetingTasksOptions {
  onSaveTaskItem?: (item: UnifiedData) => void;
  onStoredVoiceItem?: (item: UnifiedData, warnings: string[]) => void;
}

export async function saveMeetingTasks(
  tasks: ActionItem[],
  options?: SaveMeetingTasksOptions
): Promise<SaveTasksResult> {
  const saved: SavedTaskResult[] = [];
  const failed: FailedTaskResult[] = [];

  for (const t of tasks) {
    if (!t.task || !t.task.trim()) {
      failed.push({
        clientId: t.clientId,
        task: t.task,
        error: "업무명이 비어 있습니다.",
      });
      continue;
    }

    try {
      const contentParts = [
        `[회의록 할 일]`,
        t.assignee ? `담당자: ${t.assignee}` : null,
        t.dueDate ? `기한: ${t.dueDate}` : null,
      ].filter(Boolean).join("\n");

      const item: UnifiedData = {
        id: `manual-meeting-${t.clientId}`,
        source: "manual",
        sourceApp: "meeting",
        title: t.task.trim(),
        content: contentParts,
        actionDirective: t.dueDate ? `기한: ${t.dueDate}` : undefined,
        category: "action_required",
        created_at: new Date().toISOString(),
        author: { name: t.assignee?.trim() || "나" },
        url: "",
        status: "pending",
      };

      if (options?.onSaveTaskItem) {
        options.onSaveTaskItem(item);
      } else if (options?.onStoredVoiceItem) {
        options.onStoredVoiceItem(item, []);
      }
      saved.push({ clientId: t.clientId, task: t.task });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "업무 등록 중 오류가 발생했습니다.";
      failed.push({ clientId: t.clientId, task: t.task, error: errorMsg });
    }
  }

  return {
    success: failed.length === 0,
    saved,
    failed,
  };
}
