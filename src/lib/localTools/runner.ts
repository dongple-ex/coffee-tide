import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  LocalToolArgumentDefinition,
  LocalToolDefinition,
  LocalToolExecutionResult,
  LocalToolPreview,
} from "./types";
import { assertLocalToolFiles } from "./registry";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ENV_NAMES = [
  "PATH",
  "Path",
  "PATHEXT",
  "SYSTEMROOT",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
  "COMSPEC",
] as const;

export class LocalToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalToolInputError";
  }
}

function validateArgument(definition: LocalToolArgumentDefinition, value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    if (definition.required) throw new LocalToolInputError(`${definition.label} 값이 필요합니다.`);
    return null;
  }
  if (definition.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new LocalToolInputError(`${definition.label} 값은 참/거짓이어야 합니다.`);
    }
    return value ? "true" : null;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new LocalToolInputError(`${definition.label} 값의 형식이 올바르지 않습니다.`);
  }
  const text = String(value).trim();
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new LocalToolInputError(`${definition.label} 값이 비어 있거나 제어문자를 포함합니다.`);
  }
  if (text.length > (definition.maxLength ?? 200)) {
    throw new LocalToolInputError(`${definition.label} 값이 너무 깁니다.`);
  }
  if (definition.type === "integer" && !/^-?\d+$/.test(text)) {
    throw new LocalToolInputError(`${definition.label} 값은 정수여야 합니다.`);
  }
  if (definition.type === "number" && !Number.isFinite(Number(text))) {
    throw new LocalToolInputError(`${definition.label} 값은 숫자여야 합니다.`);
  }
  if (definition.type === "date") {
    const parsed = DATE_PATTERN.test(text) ? new Date(`${text}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      throw new LocalToolInputError(`${definition.label} 값은 유효한 YYYY-MM-DD 날짜여야 합니다.`);
    }
  }
  if (definition.type === "enum" && !definition.enumValues?.includes(text)) {
    throw new LocalToolInputError(`${definition.label} 값이 허용 목록에 없습니다.`);
  }
  return text;
}

export function toolArguments(
  tool: LocalToolDefinition,
  input: Record<string, unknown>
): { args: string[]; summary: string[] } {
  const definitions = tool.arguments ?? [];
  const allowed = new Set(definitions.map((definition) => definition.name));
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new LocalToolInputError(`등록되지 않은 인자입니다: ${unknown.join(", ")}`);

  const args: string[] = [];
  const summary: string[] = [];
  for (const definition of definitions) {
    const value = validateArgument(definition, input[definition.name]);
    if (value === null) continue;
    args.push(definition.flag);
    if (definition.type !== "boolean") args.push(value);
    summary.push(
      definition.type === "boolean" ? `${definition.label}: 사용` : `${definition.label}: ${value}`
    );
  }
  return { args, summary };
}

function defaultExecutable(tool: LocalToolDefinition): string {
  if (tool.executablePath) return tool.executablePath;
  if (tool.runtime === "powershell") {
    return process.platform === "win32"
      ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
      : "pwsh";
  }
  throw new LocalToolInputError(`${tool.name}: executablePath를 등록해야 합니다.`);
}

function commandArguments(tool: LocalToolDefinition, args: string[]): string[] {
  if (tool.runtime === "powershell") {
    return [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      tool.scriptPath,
      ...args,
    ];
  }
  return [tool.scriptPath, ...args];
}

function safeEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const name of SAFE_ENV_NAMES) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  env.COFFEETIDE_LOCAL_TOOL = "1";
  return env;
}

async function verifyScriptHash(tool: LocalToolDefinition): Promise<void> {
  const bytes = await readFile(tool.scriptPath);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== tool.scriptSha256) {
    throw new LocalToolInputError(
      `${tool.name} 스크립트가 등록 후 변경되었습니다. SHA-256을 다시 확인해 등록해 주세요.`
    );
  }
}

export function localToolPreview(
  tool: LocalToolDefinition,
  input: Record<string, unknown>
): { preview: LocalToolPreview; args: string[] } {
  const { args, summary } = toolArguments(tool, input);
  return {
    args,
    preview: {
      toolId: tool.id,
      toolName: tool.name,
      runtime: tool.runtime,
      scriptName: path.basename(tool.scriptPath),
      executionHost: os.hostname(),
      inputSummary: summary.length ? summary : ["입력 없음"],
      effect: "read_only",
      timeoutMs: tool.timeoutMs ?? 30_000,
    },
  };
}

async function audit(result: LocalToolExecutionResult): Promise<void> {
  const directory = path.join(process.cwd(), "data");
  await mkdir(directory, { recursive: true });
  await appendFile(
    path.join(directory, "local-tool-audit.jsonl"),
    `${JSON.stringify({
      executionId: result.executionId,
      toolId: result.toolId,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      success: result.success,
      exitCode: result.exitCode,
    })}\n`,
    "utf8"
  );
}

export async function runLocalTool(
  tool: LocalToolDefinition,
  input: Record<string, unknown>
): Promise<LocalToolExecutionResult> {
  await assertLocalToolFiles(tool);
  await verifyScriptHash(tool);
  const { args } = toolArguments(tool, input);
  const executable = defaultExecutable(tool);
  const commandArgs = commandArguments(tool, args);
  const executionId = randomUUID();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const maxOutputBytes = tool.maxOutputBytes ?? 262_144;
  const timeoutMs = tool.timeoutMs ?? 30_000;

  const result = await new Promise<Omit<LocalToolExecutionResult, "executionId" | "toolId" | "startedAt" | "finishedAt" | "durationMs">>(
    (resolve, reject) => {
      const child = spawn(/* turbopackIgnore: true */ executable, commandArgs, {
        cwd: tool.workingDirectory,
        shell: false,
        windowsHide: true,
        env: safeEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let timedOut = false;
      let outputExceeded = false;
      let settled = false;

      const stop = (reason: "timeout" | "output") => {
        if (reason === "timeout") timedOut = true;
        else outputExceeded = true;
        child.kill();
      };
      const timer = setTimeout(() => stop("timeout"), timeoutMs);
      const capture = (target: Buffer[], chunk: Buffer) => {
        const remaining = Math.max(0, maxOutputBytes - outputBytes);
        if (remaining > 0) target.push(chunk.subarray(0, remaining));
        outputBytes += chunk.byteLength;
        if (outputBytes > maxOutputBytes) stop("output");
      };
      child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
      child.once("error", (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      child.once("close", (exitCode) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        const warnings: string[] = [];
        if (timedOut) warnings.push(`실행 시간이 ${timeoutMs}ms를 넘어 중단했습니다.`);
        if (outputExceeded) warnings.push(`출력이 ${maxOutputBytes}바이트를 넘어 중단했습니다.`);
        resolve({
          success: exitCode === 0 && !timedOut && !outputExceeded,
          exitCode,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          warnings,
        });
      });
    }
  );

  const finished = Date.now();
  const completed: LocalToolExecutionResult = {
    ...result,
    executionId,
    toolId: tool.id,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
  };
  await audit(completed).catch((error) => {
    completed.warnings.push(
      `감사 로그를 저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  return completed;
}
