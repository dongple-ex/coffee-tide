export const WORKSPACE_TABS = ["todo", "copilot", "widgets"] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export const WORKSPACE_TAB_DRAG_THRESHOLD_PX = 7;

export function isWorkspaceTab(value: string | null | undefined): value is WorkspaceTab {
  return WORKSPACE_TABS.some((tab) => tab === value);
}

export function hasCrossedWorkspaceTabDragThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= WORKSPACE_TAB_DRAG_THRESHOLD_PX;
}
