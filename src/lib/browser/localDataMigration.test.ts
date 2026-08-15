import { describe, it, expect } from "vitest";
import { mergeLocalWorkNotesAndSubTasks } from "./localDataMigration";
import type { UnifiedData } from "../types/unified";

describe("Phase 14-02: D05 로컬 워크노트 및 하위작업 비파괴 병합 테스트", () => {
  it("기존 localStorage 맵 데이터를 항목 필드로 안전하게 병합한다", () => {
    const items: UnifiedData[] = [
      {
        id: "task-1",
        source: "manual",
        title: "기획서 작성",
        content: "내용 1",
        created_at: "2026-08-14T00:00:00Z",
        author: { name: "User" },
        url: "",
        status: "pending",
      },
      {
        id: "task-2",
        source: "manual",
        title: "디자인 검토",
        content: "내용 2",
        created_at: "2026-08-14T00:00:00Z",
        author: { name: "User" },
        url: "",
        status: "pending",
        workNote: "이미 존재하는 메모", // 덮어쓰지 않아야 함
      },
    ];

    const workNotesMap: Record<string, string> = {
      "task-1": "task-1 진행 메모 내용",
      "task-2": "task-2 새로운 메모 (무시되어야 함)",
      "task-orphan": "삭제된 항목의 메모",
    };

    const subTasksMap = {
      "task-1": [{ id: "sub-1", title: "1차 초안", completed: true }],
    };

    const result = mergeLocalWorkNotesAndSubTasks(items, workNotesMap, subTasksMap);

    expect(result.migrated).toBe(true);
    expect(result.workNotesMerged).toBe(1);
    expect(result.subTasksMerged).toBe(1);

    // task-1은 병합됨
    const task1 = result.items.find((i) => i.id === "task-1");
    expect(task1?.workNote).toBe("task-1 진행 메모 내용");
    expect(task1?.subTasks).toHaveLength(1);
    expect(task1?.subTasks?.[0].title).toBe("1차 초안");

    // task-2는 기존 값 보존
    const task2 = result.items.find((i) => i.id === "task-2");
    expect(task2?.workNote).toBe("이미 존재하는 메모");
  });
});
