import { describe, expect, it } from "vitest";
import { parseTaskActionIntent, matchTasks, cleanTargetKeyword } from "./taskActions";
import type { UnifiedData } from "../types/unified";

const mockItems: UnifiedData[] = [
  {
    id: "task-1",
    source: "manual",
    title: "Supabase 업데이트 확인",
    content: "Supabase 신규 마이그레이션 변경사항 확인 및 테스트",
    created_at: "2026-09-20T10:00:00Z",
    author: { name: "나" },
    url: "#",
    status: "pending",
  },
  {
    id: "task-2",
    source: "manual",
    title: "주간 업무 보고서 제출",
    content: "금요일까지 본부 주간 취합본 보고서 전달",
    created_at: "2026-09-20T11:00:00Z",
    author: { name: "나" },
    url: "#",
    status: "pending",
  },
  {
    id: "task-3",
    source: "manual",
    title: "월간 결산 보고서 작성",
    content: "9월 월간 결산 지표 정리",
    created_at: "2026-09-20T12:00:00Z",
    author: { name: "나" },
    url: "#",
    status: "pending",
  },
  {
    id: "mail-1",
    source: "gmail",
    title: "[김 대리] 프로젝트 일정 문의 메일",
    content: "김 대리님이 10월 런칭 일정 관련 회의 요청을 보냈습니다.",
    created_at: "2026-09-20T13:00:00Z",
    author: { name: "김 대리", email: "kim@example.com" },
    url: "#",
    status: "pending",
  },
  {
    id: "task-completed",
    source: "manual",
    title: "카페 원두 구매",
    content: "에티오피아 예가체프 원두 주문",
    created_at: "2026-09-19T10:00:00Z",
    author: { name: "나" },
    url: "#",
    status: "completed",
  },
];

describe("taskActions", () => {
  describe("cleanTargetKeyword", () => {
    it("불필요한 조사와 업무 명칭을 깔끔하게 제거한다", () => {
      expect(cleanTargetKeyword("Supabase 업데이트 일감")).toBe("Supabase 업데이트");
      expect(cleanTargetKeyword("주간 업무 보고서 건")).toBe("주간 업무 보고서");
      expect(cleanTargetKeyword("김 대리 메일에")).toBe("김 대리");
      expect(cleanTargetKeyword("'보고서' 관련")).toBe("보고서");
    });
  });

  describe("matchTasks", () => {
    it("완전 일치 또는 부분 일치로 정확한 일감을 찾는다", () => {
      const res = matchTasks("Supabase 업데이트 확인", mockItems);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("task-1");
    });

    it("미완료 항목만 우선 검색하고 이미 완료된 일감은 기본 제외한다", () => {
      const res = matchTasks("원두 구매", mockItems);
      expect(res).toHaveLength(0);

      const resWithCompleted = matchTasks("원두 구매", mockItems, { includeCompleted: true });
      expect(resWithCompleted).toHaveLength(1);
      expect(resWithCompleted[0].id).toBe("task-completed");
    });

    it("번호(예: 1번)로 대상을 식별한다", () => {
      const res = matchTasks("1번", mockItems);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("task-1");
    });
  });

  describe("parseTaskActionIntent - 완료 (complete)", () => {
    it("단일 일감 완료 명령을 인식하고 성공 결과를 반환한다", () => {
      const res = parseTaskActionIntent("Supabase 업데이트 확인 일감 완료해줘", mockItems);
      expect(res).not.toBeNull();
      expect(res?.status).toBe("success");
      if (res?.status === "success") {
        expect(res.type).toBe("complete");
        expect(res.item.id).toBe("task-1");
        expect(res.replyText).toContain("완료 처리했습니다");
      }
    });

    it("'끝냈어', '완료했어' 등의 표현도 정상 감지한다", () => {
      const res1 = parseTaskActionIntent("Supabase 업데이트 끝냈어", mockItems);
      expect(res1?.status).toBe("success");

      const res2 = parseTaskActionIntent("주간 업무 보고서 완료했어", mockItems);
      expect(res2?.status).toBe("success");
    });

    it("여러 일감이 매칭될 경우 ambiguous 상태와 후보 목록을 반환한다", () => {
      const res = parseTaskActionIntent("보고서 완료해줘", mockItems);
      expect(res).not.toBeNull();
      expect(res?.status).toBe("ambiguous");
      if (res?.status === "ambiguous") {
        expect(res.type).toBe("complete");
        expect(res.candidates.length).toBeGreaterThanOrEqual(2);
        expect(res.replyText).toContain("어떤 일감을 완료할까요");
      }
    });

    it("일치하는 일감이 없을 경우 not_found 결과를 반환한다", () => {
      const res = parseTaskActionIntent("외계인 침공 대비 일감 완료해줘", mockItems);
      expect(res).not.toBeNull();
      expect(res?.status).toBe("not_found");
      expect(res?.replyText).toContain("찾지 못했습니다");
    });
  });

  describe("parseTaskActionIntent - 메모 (add_note)", () => {
    it("일감에 메모 추가 명령을 인식하고 메모 본문을 추출한다", () => {
      const res = parseTaskActionIntent(
        "Supabase 업데이트에 다음주 월요일 확인 예정이라고 메모 남겨줘",
        mockItems
      );
      expect(res).not.toBeNull();
      expect(res?.status).toBe("success");
      if (res?.status === "success") {
        expect(res.type).toBe("add_note");
        expect(res.item.id).toBe("task-1");
        expect(res.note).toBe("다음주 월요일 확인 예정");
        expect(res.replyText).toContain("다음주 월요일 확인 예정");
      }
    });

    it("'메모: 내용' 형식도 정상 파싱한다", () => {
      const res = parseTaskActionIntent(
        "주간 업무 보고서에 메모: 팀장님 컨펌 대기 중",
        mockItems
      );
      expect(res?.status).toBe("success");
      if (res?.status === "success") {
        expect(res.note).toBe("팀장님 컨펌 대기 중");
      }
    });
  });

  describe("parseTaskActionIntent - 검색 및 필터 (search_focus)", () => {
    it("일감 검색 명령을 감지하고 해당 일감을 찾아 필터 키워드를 전달한다", () => {
      const res = parseTaskActionIntent("Supabase 일감 찾아줘", mockItems);
      expect(res).not.toBeNull();
      expect(res?.status).toBe("success");
      if (res?.status === "success") {
        expect(res.type).toBe("search_focus");
        expect(res.keyword.toLowerCase()).toContain("supabase");
        expect(res.replyText).toContain("검색 필터를");
      }
    });
  });

  describe("parseTaskActionIntent - 답장 초안 (reply_draft)", () => {
    it("메일 답장 요청을 감지하고 대상을 식별한다", () => {
      const res = parseTaskActionIntent(
        "김 대리 메일에 오늘 중으로 검토하겠다고 답장 써줘",
        mockItems
      );
      expect(res).not.toBeNull();
      expect(res?.status).toBe("success");
      if (res?.status === "success") {
        expect(res.type).toBe("reply_draft");
        expect(res.item.id).toBe("mail-1");
        expect(res.draftInstruction).toBe("오늘 중으로 검토하겠다고");
      }
    });
  });

  describe("parseTaskActionIntent - 일반 질문 (non-action)", () => {
    it("업무 제어가 아닌 일반 질문이나 대화는 가로채지 않고 null을 반환한다", () => {
      expect(parseTaskActionIntent("오늘 날씨 어때?", mockItems)).toBeNull();
      expect(parseTaskActionIntent("오늘 뭐 해야 해?", mockItems)).toBeNull();
      expect(parseTaskActionIntent("커피 한 잔 마시고 싶다", mockItems)).toBeNull();
      expect(parseTaskActionIntent("안녕하세요!", mockItems)).toBeNull();
    });
  });
});
