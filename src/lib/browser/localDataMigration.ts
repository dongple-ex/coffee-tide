import type { SubTask, UnifiedData } from "../types/unified";

export interface MigrationResult<T> {
  migrated: boolean;
  itemCount: number;
  workNotesMerged: number;
  subTasksMerged: number;
  items: T[];
}

/**
 * 기존 별도 localStorage(ct_work_notes, ct_sub_tasks)에 보관되던 진행 메모 및 하위작업을
 * UnifiedData 항목 내부 필드로 비파괴 병합합니다.
 * 기존 항목에 이미 값이 있는 경우 기존 값을 우선하며, 없는 경우에만 로컬 맵에서 병합합니다.
 */
export function mergeLocalWorkNotesAndSubTasks<T extends UnifiedData>(
  items: T[],
  workNotesMap: Record<string, string> = {},
  subTasksMap: Record<string, SubTask[]> = {}
): MigrationResult<T> {
  let workNotesMerged = 0;
  let subTasksMerged = 0;

  const newItems = items.map((item) => {
    let nextWorkNote = item.workNote;
    let nextSubTasks = item.subTasks;

    // 1. workNote 병합
    if (!nextWorkNote && workNotesMap[item.id]) {
      nextWorkNote = workNotesMap[item.id];
      workNotesMerged++;
    }

    // 2. subTasks 병합
    if ((!nextSubTasks || nextSubTasks.length === 0) && subTasksMap[item.id]?.length) {
      nextSubTasks = subTasksMap[item.id];
      subTasksMerged++;
    }

    if (nextWorkNote !== item.workNote || nextSubTasks !== item.subTasks) {
      return {
        ...item,
        workNote: nextWorkNote,
        subTasks: nextSubTasks,
      };
    }
    return item;
  });

  return {
    migrated: workNotesMerged > 0 || subTasksMerged > 0,
    itemCount: items.length,
    workNotesMerged,
    subTasksMerged,
    items: newItems,
  };
}
