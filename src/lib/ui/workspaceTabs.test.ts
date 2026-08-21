import { describe, expect, it } from "vitest";
import {
  hasCrossedWorkspaceTabDragThreshold,
  isWorkspaceTab,
  WORKSPACE_TAB_DRAG_THRESHOLD_PX,
  WORKSPACE_TABS,
} from "./workspaceTabs";

describe("workspace tab drag helpers", () => {
  it("accepts only the three workspace tab identifiers", () => {
    expect(WORKSPACE_TABS).toEqual(["todo", "copilot", "widgets"]);
    expect(isWorkspaceTab("todo")).toBe(true);
    expect(isWorkspaceTab("copilot")).toBe(true);
    expect(isWorkspaceTab("widgets")).toBe(true);
    expect(isWorkspaceTab("weather")).toBe(false);
    expect(isWorkspaceTab(undefined)).toBe(false);
  });

  it("starts drag selection only after the movement threshold", () => {
    expect(hasCrossedWorkspaceTabDragThreshold(10, 10, 14, 14)).toBe(false);
    expect(
      hasCrossedWorkspaceTabDragThreshold(10, 10, 10 + WORKSPACE_TAB_DRAG_THRESHOLD_PX, 10)
    ).toBe(true);
  });
});
