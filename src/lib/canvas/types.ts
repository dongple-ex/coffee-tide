export type CanvasDocType = "doc" | "report" | "email" | "meeting_note" | "checklist" | "code";

export interface CanvasDocument {
  id: string;
  title: string;
  type: CanvasDocType;
  content: string;
  updatedAt: string;
  createdAt: string;
  sourceQuestion?: string;
  history?: string[];
  historyIndex?: number;
}

export type CanvasAiAction =
  | "shorten"
  | "expand"
  | "tone_karina"
  | "tone_kim"
  | "tone_ontime"
  | "fix_grammar"
  | "to_table"
  | "extract_tasks"
  | "custom";

export interface CanvasExtractedTask {
  id: string;
  title: string;
  category: "urgent" | "action_required" | "reference" | "approval_required" | "meeting";
  estimatedMinutes?: number;
  selected?: boolean;
}

export interface CanvasTransformResult {
  content: string;
  extractedTasks?: CanvasExtractedTask[];
  providerUsed: "chrome_canary_nano" | "gemini_cloud" | "local_rules";
}
