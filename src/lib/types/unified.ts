// 공통 데이터 모델 — doc/00-current-state.md §3 정본 데이터 허브 기준.
// manual/paste는 1급 소스(백로그 G1), gmail은 outlook과 별도 배지(백로그 A1).

export type UnifiedSource =
  | "manual"
  | "paste"
  | "local_doc"
  | "obsidian"
  | "outlook"
  | "gmail"
  | "notion"
  | "llm";

export type UnifiedCategory =
  | "urgent"
  | "approval_required"
  | "meeting"
  | "action_required"
  | "reference"
  | "ignore";

export type UnifiedStatus = "pending" | "held" | "completed" | "dismissed";

export interface UnifiedAuthor {
  name: string;
  email?: string;
}

export interface UnifiedData {
  id: string;
  source: UnifiedSource;
  title: string;
  content: string;
  created_at: string; // ISO 8601
  author: UnifiedAuthor;
  url: string;
  category?: UnifiedCategory;
  actionDirective?: string;
  status?: UnifiedStatus;
  delegatable?: boolean; // 로컬 LLM 도구로 넘길 만한 업무 (Phase 7)
}

export interface ConnectionState {
  google: boolean;
  outlook: boolean;
  notion: boolean;
  obsidian: boolean;
  local_doc: boolean;
  llm: boolean;
  localDocPaths?: string[]; // 로컬 문서는 다중 폴더
  googleEmail?: string;
  outlookEmail?: string;
}

export interface MailsResponse {
  mails: UnifiedData[];
  userEmail: string;
  connections: ConnectionState;
  errors?: Partial<Record<"google" | "outlook" | "notion" | "obsidian" | "local_doc" | "llm", string>>;
  ai_error?: boolean;
}

export const CATEGORY_LABELS: Record<UnifiedCategory, string> = {
  urgent: "긴급",
  approval_required: "결재 필요",
  meeting: "회의",
  action_required: "액션 필요",
  reference: "참고",
  ignore: "무시 가능",
};

export const SOURCE_LABELS: Record<UnifiedSource, string> = {
  manual: "직접 입력",
  paste: "붙여넣기",
  local_doc: "로컬 문서",
  obsidian: "Obsidian",
  outlook: "Outlook",
  gmail: "Gmail",
  notion: "Notion",
  llm: "LLM",
};
