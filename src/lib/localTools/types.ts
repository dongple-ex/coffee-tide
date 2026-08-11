export type LocalToolRuntime = "powershell" | "python" | "node";

export type LocalToolArgumentType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "enum";

export interface LocalToolArgumentDefinition {
  name: string;
  label: string;
  description?: string;
  flag: string;
  type: LocalToolArgumentType;
  required?: boolean;
  maxLength?: number;
  enumValues?: string[];
}

export interface LocalToolDefinition {
  id: string;
  name: string;
  description: string;
  runtime: LocalToolRuntime;
  executablePath?: string;
  scriptPath: string;
  scriptSha256: string;
  workingDirectory: string;
  arguments?: LocalToolArgumentDefinition[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  effect: "read_only";
  confirmation: "always";
}

export interface PublicLocalToolDefinition {
  id: string;
  name: string;
  description: string;
  runtime: LocalToolRuntime;
  scriptName: string;
  workingDirectoryName: string;
  arguments: LocalToolArgumentDefinition[];
  timeoutMs: number;
  maxOutputBytes: number;
  effect: "read_only";
  confirmation: "always";
}

export interface LocalToolPreview {
  toolId: string;
  toolName: string;
  runtime: LocalToolRuntime;
  scriptName: string;
  executionHost: string;
  inputSummary: string[];
  effect: "read_only";
  timeoutMs: number;
}

export interface LocalToolExecutionResult {
  success: boolean;
  executionId: string;
  toolId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  warnings: string[];
}
