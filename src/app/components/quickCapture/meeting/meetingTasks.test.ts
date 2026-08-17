import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveMeetingTasks, type ActionItem } from "./meetingTasks";
import type { UnifiedData } from "@/lib/types/unified";

describe("meetingTasks.ts: saveMeetingTasks 공용 모듈 및 clientId 기반 고유 식별 테스트", () => {
  let savedItems: UnifiedData[] = [];
  const onSaveTaskItem = vi.fn((item: UnifiedData) => {
    savedItems.push(item);
  });

  beforeEach(() => {
    savedItems = [];
    onSaveTaskItem.mockClear();
    vi.restoreAllMocks();
  });

  it("A. 전체 성공: 서로 다른 두 업무가 모두 저장되고 각각 고유한 clientId로 성공 결과가 반환된다", async () => {
    const tasks: ActionItem[] = [
      { clientId: "client-1", task: "Q3 예산안 보고서 작성", assignee: "김철수", dueDate: "2026-08-25" },
      { clientId: "client-2", task: "디자인 검토 회의 소집", assignee: "이영희", dueDate: "2026-08-22" },
    ];

    const result = await saveMeetingTasks(tasks, { onSaveTaskItem });

    expect(result.success).toBe(true);
    expect(result.saved).toEqual([
      { clientId: "client-1", task: "Q3 예산안 보고서 작성" },
      { clientId: "client-2", task: "디자인 검토 회의 소집" },
    ]);
    expect(result.failed).toHaveLength(0);

    // CoffeeTide UnifiedData 항목 검증
    expect(savedItems).toHaveLength(2);
    expect(savedItems[0].id).toBe("manual-meeting-client-1");
    expect(savedItems[0].title).toBe("Q3 예산안 보고서 작성");
    expect(savedItems[0].author.name).toBe("김철수");
    expect(savedItems[0].actionDirective).toBe("기한: 2026-08-25");
    expect(savedItems[0].sourceApp).toBe("meeting");
    expect(savedItems[0].content).toContain("[회의록 할 일]");
    expect(savedItems[0].content).toContain("담당자: 김철수");
    expect(savedItems[0].content).toContain("기한: 2026-08-25");

    expect(savedItems[1].id).toBe("manual-meeting-client-2");
    expect(savedItems[1].title).toBe("디자인 검토 회의 소집");
    expect(savedItems[1].author.name).toBe("이영희");
  });

  it("B. 부분 실패: 첫 번째 업무는 성공하고 두 번째 업무는 실패하며 clientId로 정확히 구분된다", async () => {
    const customCallback = (item: UnifiedData) => {
      if (item.id === "manual-meeting-client-fail") {
        throw new Error("저장 공간 부족으로 등록 실패");
      }
      savedItems.push(item);
    };

    const tasks: ActionItem[] = [
      { clientId: "client-ok", task: "정상 업무", assignee: "홍길동", dueDate: "2026-08-20" },
      { clientId: "client-fail", task: "실패 업무", assignee: "테스터", dueDate: "2026-08-22" },
    ];

    const result = await saveMeetingTasks(tasks, { onSaveTaskItem: customCallback });

    expect(result.success).toBe(false);
    expect(result.saved).toEqual([{ clientId: "client-ok", task: "정상 업무" }]);
    expect(result.failed).toEqual([
      { clientId: "client-fail", task: "실패 업무", error: "저장 공간 부족으로 등록 실패" },
    ]);
    expect(savedItems).toHaveLength(1);
    expect(savedItems[0].id).toBe("manual-meeting-client-ok");
  });

  it("C. 동일 제목 업무: 제목이 완전히 같아도 서로 다른 clientId로 분리되어 하나만 실패 시 상태가 섞이지 않는다", async () => {
    const customCallback = (item: UnifiedData) => {
      // client-dup-2만 실패 발생
      if (item.id === "manual-meeting-client-dup-2") {
        throw new Error("동일 제목 2번째 항목 저장 중 예외 발생");
      }
      savedItems.push(item);
    };

    const tasks: ActionItem[] = [
      { clientId: "client-dup-1", task: "동일한 회의 업무", assignee: "담당자 A", dueDate: "2026-08-20" },
      { clientId: "client-dup-2", task: "동일한 회의 업무", assignee: "담당자 B", dueDate: "2026-08-21" },
    ];

    const result = await saveMeetingTasks(tasks, { onSaveTaskItem: customCallback });

    expect(result.success).toBe(false);
    expect(result.saved).toEqual([
      { clientId: "client-dup-1", task: "동일한 회의 업무" },
    ]);
    expect(result.failed).toEqual([
      { clientId: "client-dup-2", task: "동일한 회의 업무", error: "동일 제목 2번째 항목 저장 중 예외 발생" },
    ]);

    // 제목이 같더라도 성공한 clientId 항목만 CoffeeTide에 등록됨
    expect(savedItems).toHaveLength(1);
    expect(savedItems[0].id).toBe("manual-meeting-client-dup-1");
    expect(savedItems[0].author.name).toBe("담당자 A");
  });

  it("D. 재시도: 이미 saved 상태인 업무는 재호출하지 않고 실패했던 clientId만 전송되며 UnifiedData ID가 일관되게 유지된다", async () => {
    const actionItemsInState: ActionItem[] = [
      { clientId: "client-saved-1", task: "업무 1", assignee: "A", dueDate: "2026-08-20", selected: false, saved: true },
      { clientId: "client-retry-2", task: "업무 2", assignee: "B", dueDate: "2026-08-21", selected: true, saved: false, error: "이전 실패" },
    ];

    // MeetingAnalysisSheet의 재시도 필터링: selected && !saved
    const tasksToRetry = actionItemsInState.filter((a) => a.selected && !a.saved);
    expect(tasksToRetry).toHaveLength(1);
    expect(tasksToRetry[0].clientId).toBe("client-retry-2");

    // 재시도 실행
    const retryResult = await saveMeetingTasks(tasksToRetry, { onSaveTaskItem });

    expect(retryResult.success).toBe(true);
    expect(retryResult.saved).toEqual([{ clientId: "client-retry-2", task: "업무 2" }]);
    expect(onSaveTaskItem).toHaveBeenCalledTimes(1); // 업무 1은 재호출되지 않음
    expect(savedItems).toHaveLength(1);
    // 재시도 시에도 clientId 기반의 안정적인 ID 생성 확인
    expect(savedItems[0].id).toBe("manual-meeting-client-retry-2");
    expect(savedItems[0].title).toBe("업무 2");
  });

  it("E. 네트워크 및 오류 처리: 빈 업무명이나 예외 발생 시 해당 clientId와 오류 메시지가 실패 결과로 반환된다", async () => {
    const tasks: ActionItem[] = [
      { clientId: "client-empty", task: "", assignee: "", dueDate: "" },
      { clientId: "client-whitespace", task: "   ", assignee: "", dueDate: "" },
      { clientId: "client-error", task: "에러 업무", assignee: "", dueDate: "" },
    ];

    const errorCallback = (item: UnifiedData) => {
      if (item.id === "manual-meeting-client-error") {
        throw new Error("네트워크 연결 끊김");
      }
    };

    const result = await saveMeetingTasks(tasks, { onSaveTaskItem: errorCallback });

    expect(result.success).toBe(false);
    expect(result.saved).toHaveLength(0);
    expect(result.failed).toEqual([
      { clientId: "client-empty", task: "", error: "업무명이 비어 있습니다." },
      { clientId: "client-whitespace", task: "   ", error: "업무명이 비어 있습니다." },
      { clientId: "client-error", task: "에러 업무", error: "네트워크 연결 끊김" },
    ]);
  });
});
