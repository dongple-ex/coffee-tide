import { describe, expect, it, vi } from "vitest";
import { appendTaskNote, executeTaskAction } from "./taskActionExecution";
import type { TaskActionSuccess } from "./taskActions";
import type { UnifiedData } from "../types/unified";

const item: UnifiedData = { id: "sample-1", source: "manual", title: "샘플 업무", content: "샘플 원문", created_at: "2026-09-21", author: { name: "샘플" }, url: "#" };
const action = (source: UnifiedData["source"], type: TaskActionSuccess["type"] = "complete"): TaskActionSuccess => ({ status: "success", type, item: { ...item, source }, keyword: item.title, replyText: "파서의 성공 문구" });
function handlers() {
  return { completeExternal: vi.fn(async () => ({ ok: true, message: "외부 처리 완료" })), completeLocal: vi.fn(), appendNote: vi.fn(), search: vi.fn(), replyDraft: vi.fn(async () => ({ ok: true, message: "초안 생성 완료" })) };
}
describe("task action execution", () => {
  it.each(["gmail", "outlook", "gcalendar", "manual"] as const)("completes %s locally without external write-back", async source => {
    const h = handlers();
    const result = await executeTaskAction(action(source), h);
    expect(h.completeExternal).not.toHaveBeenCalled();
    expect(h.completeLocal).toHaveBeenCalledOnce();
    expect(result).toContain("CoffeeTide에서 완료");
  });
  it("waits for external completion and reports its failure", async () => {
    const h = handlers();
    let finish!: (value: { ok: boolean; message: string }) => void;
    h.completeExternal.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let settled = false;
    const pending = executeTaskAction(action("notion"), h).then(text => { settled = true; return text; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish({ ok: false, message: "연동 만료" });
    expect(await pending).toBe("완료하지 못했습니다: 연동 만료");
    expect(h.completeLocal).not.toHaveBeenCalled();
  });
  it("preserves existing notes when appending repeatedly", () => {
    expect(appendTaskNote(appendTaskNote("기존 진행 기록", "확인 예정"), "검토 완료")).toBe("기존 진행 기록\n확인 예정\n검토 완료");
    expect(appendTaskNote(undefined, " 첫 메모 ")).toBe("첫 메모");
  });
  it("passes the original item and writing instruction to draft generation", async () => {
    const h = handlers();
    const request = { ...action("gmail", "reply_draft"), draftInstruction: "정중하게 일정 연기를 요청해줘" };
    await executeTaskAction(request, h);
    expect(h.replyDraft).toHaveBeenCalledWith(request.item, request.draftInstruction);
    h.replyDraft.mockResolvedValue({ ok: false, message: "생성 실패" });
    expect(await executeTaskAction(request, h)).toContain("만들지 못했습니다");
  });
});
