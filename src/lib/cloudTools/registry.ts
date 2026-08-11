import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { financeSnapshotTool } from "./tools/financeSnapshot";
import { taskSummaryTool } from "./tools/taskSummary";
import type {
  CloudToolContext,
  CloudToolDefinition,
  CloudToolExecution,
  PublicCloudToolDefinition,
} from "./types";
import { CloudToolInputError, validateCloudToolInput } from "./validation";

const definitions: CloudToolDefinition[] = [taskSummaryTool, financeSnapshotTool];
const registry = new Map(definitions.map((definition) => [definition.id, definition]));
const MAX_CALLS_PER_MINUTE = 20;
const callWindows = new Map<string, number[]>();

export class CloudToolNotFoundError extends Error {
  constructor(toolId: string) {
    super(`등록된 Cloud Tool을 찾지 못했습니다: ${toolId}`);
    this.name = "CloudToolNotFoundError";
  }
}

export class CloudToolPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudToolPolicyError";
  }
}

export class CloudToolRateLimitError extends Error {
  constructor() {
    super("Cloud Tool 호출이 너무 많습니다. 1분 후 다시 시도해 주세요.");
    this.name = "CloudToolRateLimitError";
  }
}

function enforceRateLimit(userId: string, toolId: string) {
  const key = `${userId}\u0000${toolId}`;
  const cutoff = Date.now() - 60_000;
  const current = (callWindows.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
  if (current.length >= MAX_CALLS_PER_MINUTE) throw new CloudToolRateLimitError();
  current.push(Date.now());
  callWindows.set(key, current);
  if (callWindows.size > 1_000) {
    for (const [candidate, timestamps] of callWindows) {
      if (!timestamps.some((timestamp) => timestamp > cutoff)) callWindows.delete(candidate);
    }
  }
}

function publicDefinition(definition: CloudToolDefinition): PublicCloudToolDefinition {
  const { execute: _execute, ...publicValue } = definition;
  void _execute;
  return publicValue;
}

export function listCloudTools(): PublicCloudToolDefinition[] {
  return definitions.map(publicDefinition);
}

export function cloudTool(toolId: string): PublicCloudToolDefinition | null {
  const definition = registry.get(toolId);
  return definition ? publicDefinition(definition) : null;
}

function actorHash(userId: string): string {
  const salt =
    process.env.CLOUD_TOOL_AUDIT_SALT ||
    process.env.SESSION_ENCRYPTION_SECRET ||
    "coffeetide-development-audit";
  return createHash("sha256").update(`${salt}\u0000${userId}`).digest("hex").slice(0, 16);
}

export async function executeCloudTool(options: {
  toolId: string;
  input?: unknown;
  context: Omit<CloudToolContext, "requestId" | "signal">;
}): Promise<CloudToolExecution> {
  const definition = registry.get(options.toolId);
  if (!definition) throw new CloudToolNotFoundError(options.toolId);
  if (definition.effect !== "read_only" || definition.confirmation !== "none") {
    throw new CloudToolPolicyError("현재 단계에서는 자동 승인 없는 읽기 전용 도구만 실행합니다.");
  }
  enforceRateLimit(options.context.userId, definition.id);
  const input = validateCloudToolInput(definition.inputSchema, options.input);
  const requestId = randomUUID();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), definition.timeoutMs);

  try {
    const result = await Promise.race([
      definition.execute(input, { ...options.context, requestId, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new CloudToolPolicyError(`${definition.name} 실행 시간이 초과되었습니다.`)),
          { once: true }
        );
      }),
    ]);
    const outputBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    if (outputBytes > definition.maxOutputBytes) {
      throw new CloudToolPolicyError(`${definition.name} 결과가 출력 상한을 초과했습니다.`);
    }
    const durationMs = Date.now() - startedAt;
    console.info(
      "[coffeeTide] Cloud tool execution",
      JSON.stringify({
        requestId,
        actor: actorHash(options.context.userId),
        toolId: definition.id,
        version: definition.version,
        durationMs,
        success: result.success,
      })
    );
    return {
      requestId,
      toolId: definition.id,
      toolVersion: definition.version,
      effect: definition.effect,
      durationMs,
      result,
    };
  } catch (error) {
    console.warn(
      "[coffeeTide] Cloud tool failed",
      JSON.stringify({
        requestId,
        actor: actorHash(options.context.userId),
        toolId: definition.id,
        version: definition.version,
        durationMs: Date.now() - startedAt,
        errorCode: error instanceof CloudToolInputError ? "INPUT" : "EXECUTION",
      })
    );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export { CloudToolInputError } from "./validation";
