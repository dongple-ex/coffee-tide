import "server-only";

import { randomUUID } from "node:crypto";
import { financeSnapshotTool } from "./tools/financeSnapshot";
import { taskSummaryTool } from "./tools/taskSummary";
import { calendarDraftTool } from "./tools/calendarDraft";
import { emailReplyDraftTool } from "./tools/emailReplyDraft";
import { reportDraftTool } from "./tools/reportDraft";
import { calendarCreateTool } from "./tools/calendarCreate";
import { driveReportSaveTool } from "./tools/driveReportSave";
import type {
  CloudToolContext,
  CloudToolDefinition,
  CloudToolExecution,
  PublicCloudToolDefinition,
} from "./types";
import { CloudToolInputError, validateCloudToolInput } from "./validation";
import {
  authorizeExternalWrite,
  cloudToolActorHash,
  cloudToolInputHash,
  CloudToolGovernanceError,
  enforceDistributedRateLimit,
  finishExternalWrite,
  issueExternalWriteApproval,
  recordCloudToolAudit,
} from "./governance";

const definitions: CloudToolDefinition[] = [
  taskSummaryTool,
  financeSnapshotTool,
  calendarDraftTool,
  emailReplyDraftTool,
  reportDraftTool,
  calendarCreateTool,
  driveReportSaveTool,
];
const registry = new Map(definitions.map((definition) => [definition.id, definition]));

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

function publicDefinition(definition: CloudToolDefinition): PublicCloudToolDefinition {
  const { execute: _execute, preview: _preview, ...publicValue } = definition;
  void _execute;
  void _preview;
  return publicValue;
}

export function listCloudTools(): PublicCloudToolDefinition[] {
  return definitions.map(publicDefinition);
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(value);
}

export async function issueCloudToolApproval(options: {
  toolId: string;
  input?: unknown;
  idempotencyKey: unknown;
  context: Omit<CloudToolContext, "requestId" | "signal">;
}) {
  const definition = registry.get(options.toolId);
  if (!definition) throw new CloudToolNotFoundError(options.toolId);
  if (definition.effect !== "external_write" || definition.confirmation !== "always") {
    throw new CloudToolPolicyError("외부 쓰기 도구만 1회 승인을 발급할 수 있습니다.");
  }
  if (!definition.preview) throw new CloudToolPolicyError("이 도구는 승인 미리보기를 지원하지 않습니다.");
  if (!options.context.sessionBinding) throw new CloudToolPolicyError("승인을 세션에 연결하지 못했습니다.");
  if (!validIdempotencyKey(options.idempotencyKey)) {
    throw new CloudToolInputError("올바른 멱등성 키가 필요합니다.");
  }
  const input = validateCloudToolInput(definition.inputSchema, options.input);
  if (!(await enforceDistributedRateLimit(options.context.userId, `${definition.id}:approval`))) {
    throw new CloudToolRateLimitError();
  }
  const requestId = randomUUID();
  const controller = new AbortController();
  const context = { ...options.context, requestId, signal: controller.signal };
  const preview = definition.preview(input, context);
  const inputHash = cloudToolInputHash(definition.id, input);
  const approval = await issueExternalWriteApproval({
    userId: options.context.userId,
    sessionBinding: options.context.sessionBinding,
    toolId: definition.id,
    inputHash,
    idempotencyKey: options.idempotencyKey,
  });
  return {
    requestId,
    toolId: definition.id,
    toolVersion: definition.version,
    effect: definition.effect,
    confirmation: definition.confirmation,
    idempotencyKey: options.idempotencyKey,
    preview,
    ...approval,
  };
}

export async function executeCloudTool(options: {
  toolId: string;
  input?: unknown;
  context: Omit<CloudToolContext, "requestId" | "signal">;
  approvalToken?: unknown;
  idempotencyKey?: unknown;
}): Promise<CloudToolExecution> {
  const definition = registry.get(options.toolId);
  if (!definition) throw new CloudToolNotFoundError(options.toolId);
  const executable =
    (definition.effect === "read_only" && definition.confirmation === "none") ||
    (definition.effect === "draft" && definition.confirmation === "result_review") ||
    (definition.effect === "external_write" && definition.confirmation === "always");
  if (!executable) {
    throw new CloudToolPolicyError(
      "허용되지 않은 Cloud Tool 효과/승인 정책 조합입니다."
    );
  }
  const input = validateCloudToolInput(definition.inputSchema, options.input);
  if (!(await enforceDistributedRateLimit(options.context.userId, definition.id))) {
    throw new CloudToolRateLimitError();
  }
  const requestId = randomUUID();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), definition.timeoutMs);
  const isExternalWrite = definition.effect === "external_write";
  let idempotencyKey: string | undefined;
  let idempotencyClaimed = false;

  try {
    if (isExternalWrite) {
      if (!options.context.sessionBinding) {
        throw new CloudToolPolicyError("외부 쓰기 승인을 세션에 연결하지 못했습니다.");
      }
      if (!validIdempotencyKey(options.idempotencyKey)) {
        throw new CloudToolInputError("올바른 멱등성 키가 필요합니다.");
      }
      if (typeof options.approvalToken !== "string" || options.approvalToken.length < 32) {
        throw new CloudToolPolicyError("외부 쓰기에는 1회 승인 토큰이 필요합니다.");
      }
      idempotencyKey = options.idempotencyKey;
      const authorization = await authorizeExternalWrite({
        userId: options.context.userId,
        sessionBinding: options.context.sessionBinding,
        toolId: definition.id,
        inputHash: cloudToolInputHash(definition.id, input),
        idempotencyKey,
        approvalToken: options.approvalToken,
      });
      if (authorization.replayResult) {
        const execution = {
          requestId,
          toolId: definition.id,
          toolVersion: definition.version,
          effect: definition.effect,
          durationMs: Date.now() - startedAt,
          replayed: true,
          result: authorization.replayResult,
        } satisfies CloudToolExecution;
        await recordCloudToolAudit({
          requestId,
          userId: options.context.userId,
          toolId: definition.id,
          toolVersion: definition.version,
          effect: definition.effect,
          success: true,
          durationMs: execution.durationMs,
        });
        return execution;
      }
      idempotencyClaimed = true;
    }
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
    if (isExternalWrite && idempotencyKey && idempotencyClaimed) {
      await finishExternalWrite({
        userId: options.context.userId,
        toolId: definition.id,
        idempotencyKey,
        success: true,
        result,
      });
    }
    await recordCloudToolAudit({
      requestId,
      userId: options.context.userId,
      toolId: definition.id,
      toolVersion: definition.version,
      effect: definition.effect,
      success: result.success,
      durationMs,
    });
    console.info(
      "[coffeeTide] Cloud tool execution",
      JSON.stringify({
        requestId,
        actor: cloudToolActorHash(options.context.userId).slice(0, 16),
        toolId: definition.id,
        version: definition.version,
        effect: definition.effect,
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
    const errorCode =
      error instanceof CloudToolInputError
        ? "INPUT"
        : error instanceof CloudToolGovernanceError
          ? "GOVERNANCE"
          : "EXECUTION";
    if (isExternalWrite && idempotencyKey && idempotencyClaimed) {
      await finishExternalWrite({
        userId: options.context.userId,
        toolId: definition.id,
        idempotencyKey,
        success: false,
        errorCode,
      });
    }
    await recordCloudToolAudit({
      requestId,
      userId: options.context.userId,
      toolId: definition.id,
      toolVersion: definition.version,
      effect: definition.effect,
      success: false,
      durationMs: Date.now() - startedAt,
      errorCode,
    });
    console.warn(
      "[coffeeTide] Cloud tool failed",
      JSON.stringify({
        requestId,
        actor: cloudToolActorHash(options.context.userId).slice(0, 16),
        toolId: definition.id,
        version: definition.version,
        effect: definition.effect,
        durationMs: Date.now() - startedAt,
        errorCode,
      })
    );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export { CloudToolInputError } from "./validation";
export { CloudToolGovernanceError } from "./governance";
