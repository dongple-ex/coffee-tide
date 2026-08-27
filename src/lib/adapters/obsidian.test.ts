import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ObsidianAdapter,
  formatObsidianTaskLine,
  insertUnderHeading,
} from "./obsidian";

describe("Obsidian Tasks & Dataview Formatters", () => {
  it("기본 Tasks 마크다운 라인을 생성한다", () => {
    const line = formatObsidianTaskLine("프로젝트 기획서 작성", "주요 마일스톤 정리", {
      createdDate: "2026-08-27",
    });
    expect(line).toBe(
      "- [ ] 프로젝트 기획서 작성 — 주요 마일스톤 정리 ➕ 2026-08-27 #coffeeTide/task"
    );
  });

  it("마감일, 우선순위, 커스텀 태그, Dataview source를 올바르게 포맷팅한다", () => {
    const line = formatObsidianTaskLine("고객사 미팅 회신", undefined, {
      dueDate: "2026-08-29",
      createdDate: "2026-08-27",
      priority: "high",
      tags: ["#work", "meeting"],
      source: "outlook",
    });
    expect(line).toBe(
      "- [ ] 고객사 미팅 회신 ⏫ 📅 2026-08-29 ➕ 2026-08-27 #work #meeting [source:: outlook]"
    );
  });

  it("헤딩이 없을 때 문서 끝에 헤딩과 함께 항목을 삽입한다", () => {
    const doc = "# 2026-08-27\n오늘의 일기 내용.";
    const result = insertUnderHeading(doc, "- [ ] 테스트 태스크", "## Tasks");
    expect(result).toBe(
      "# 2026-08-27\n오늘의 일기 내용.\n\n## Tasks\n- [ ] 테스트 태스크\n"
    );
  });

  it("기존 헤딩이 존재할 때 헤딩 바로 아래에 항목을 삽입한다", () => {
    const doc = "# 2026-08-27\n\n## Tasks\n- [ ] 기존 항목\n\n## Notes\n메모들";
    const result = insertUnderHeading(doc, "- [ ] 신규 항목", "## Tasks");
    expect(result).toContain("## Tasks\n- [ ] 신규 항목\n- [ ] 기존 항목");
  });
});

describe("ObsidianAdapter 파일 조작", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("수집함에 Tasks 포맷으로 태스크를 캡처한다", async () => {
    const adapter = new ObsidianAdapter(tmpDir);
    const note = await adapter.captureTask("긴급 보고서 작성", "오후 3시까지 제출", {
      priority: "high",
      dueDate: "2026-08-27",
    });

    expect(note).toBe("coffeeTide_수집함.md");
    const content = await fs.readFile(path.join(tmpDir, note), "utf8");
    expect(content).toContain("# coffeeTide 수집함");
    expect(content).toContain("- [ ] 긴급 보고서 작성 — 오후 3시까지 제출 ⏫ 📅 2026-08-27");
  });

  it("데일리노트에 지정된 헤딩 아래로 태스크를 캡처한다", async () => {
    const adapter = new ObsidianAdapter(tmpDir);
    const dateKey = new Date().toISOString().slice(0, 10);
    const note = await adapter.captureTask("데일리 업무 확인", undefined, {
      targetNote: "daily",
      dailyFolder: "Daily",
      heading: "## 📥 Tasks",
    });

    expect(note).toBe(path.join("Daily", `${dateKey}.md`));
    const content = await fs.readFile(path.join(tmpDir, note), "utf8");
    expect(content).toContain(`# ${dateKey}`);
    expect(content).toContain("## 📥 Tasks\n- [ ] 데일리 업무 확인");
  });

  it("LLM 다이제스트를 Frontmatter와 함께 생성한다", async () => {
    const dateKey = "2026-08-27";
    const written = await ObsidianAdapter.writeLlmDigest(tmpDir, dateKey, [
      {
        id: "llm-1",
        source: "llm",
        title: "코드 리팩토링 산출물",
        content: "어댑터 계층 고도화 작업 완료",
        created_at: new Date().toISOString(),
        author: { name: "Claude" },
        url: "obsidian://open?file=MEMORY",
        status: "pending",
      },
    ]);

    expect(written).toBe(true);
    const content = await fs.readFile(
      path.join(tmpDir, "coffeeTide_LLM", `${dateKey}.md`),
      "utf8"
    );
    expect(content).toContain("tags:\n  - coffeeTide\n  - coffeeTide/llm-digest");
    expect(content).toContain("# 2026-08-27 LLM 작업 다이제스트");
    expect(content).toContain("- [코드 리팩토링 산출물](obsidian://open?file=MEMORY)");
  });
});
