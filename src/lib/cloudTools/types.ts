import type { UnifiedData } from "@/lib/types/unified";

export type CloudToolEffect = "read_only" | "draft" | "external_write";
export type CloudToolConfirmation = "none" | "result_review" | "always";

export interface CloudToolPropertySchema {
  type: "string" | "integer" | "number" | "boolean";
  description: string;
  enum?: readonly string[];
  default?: string | number | boolean;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface CloudToolObjectSchema {
  type: "object";
  properties: Record<string, CloudToolPropertySchema>;
  required?: readonly string[];
  additionalProperties: false;
}

export interface CloudToolSource {
  label: string;
  url?: string;
}

export interface CloudToolResult<TData = unknown> {
  success: boolean;
  summary: string;
  data: TData;
  sources: CloudToolSource[];
  warnings: string[];
}

export interface CloudToolContext {
  userId: string;
  timezone: string;
  items: UnifiedData[];
  requestId: string;
  signal: AbortSignal;
}

export interface CloudToolDefinition {
  id: string;
  version: number;
  name: string;
  description: string;
  inputSchema: CloudToolObjectSchema;
  effect: CloudToolEffect;
  confirmation: CloudToolConfirmation;
  timeoutMs: number;
  maxOutputBytes: number;
  execute(
    input: Record<string, string | number | boolean>,
    context: CloudToolContext
  ): Promise<CloudToolResult>;
}

export type PublicCloudToolDefinition = Omit<CloudToolDefinition, "execute">;

export interface CloudToolExecution {
  requestId: string;
  toolId: string;
  toolVersion: number;
  effect: CloudToolEffect;
  durationMs: number;
  result: CloudToolResult;
}
