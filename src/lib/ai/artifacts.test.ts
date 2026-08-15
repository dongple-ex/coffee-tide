import { describe, it, expect } from "vitest";
import { buildAiArtifact, markArtifactsStaleOnSourceUpdate } from "./artifacts";
import type { AiArtifact } from "../data/contracts";

describe("Phase 14-04: AI 파생 결과 수명주기 및 stale 전환 테스트", () => {
  it("A08: 원문 수정 및 버전 증가 시 기존 current AI 아티팩트가 stale로 전환된다", () => {
    const itemId = "note-100";

    const artifact1 = buildAiArtifact({
      itemId,
      artifactType: "summary",
      contentText: "버전 1 기준 요약문입니다.",
      provider: "gemini",
      model: "gemini-2.5-flash",
      sourceVersion: 1,
    });

    const artifacts: AiArtifact[] = [artifact1];
    expect(artifacts[0].status).toBe("current");

    // 원본이 버전 2로 업데이트됨
    const updatedArtifacts = markArtifactsStaleOnSourceUpdate(artifacts, itemId, 2);

    expect(updatedArtifacts[0].status).toBe("stale");
    expect(updatedArtifacts[0].contentText).toBe("버전 1 기준 요약문입니다.");
  });

  it("내용이 없는 AI 결과는 생성이 거부된다", () => {
    expect(() => {
      buildAiArtifact({
        itemId: "note-101",
        artifactType: "task_extract",
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
    }).toThrow("결과 내용이 필요합니다");
  });
});
