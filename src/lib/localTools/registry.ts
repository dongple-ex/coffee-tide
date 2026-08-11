import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  LocalToolArgumentDefinition,
  LocalToolDefinition,
  PublicLocalToolDefinition,
} from "./types";

const MAX_REGISTRY_BYTES = 256 * 1024;
const MAX_TOOLS = 50;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ARGUMENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const FLAG_PATTERN = /^--?[A-Za-z][A-Za-z0-9-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export class LocalToolConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalToolConfigurationError";
  }
}

export function localToolExecutionDisabled(): boolean {
  if (process.env.DISABLE_LOCAL_EXEC === "true") return true;
  return Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
  );
}

function requiredText(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new LocalToolConfigurationError(`${field} 값이 필요합니다.`);
  }
  const text = value.trim();
  if (text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new LocalToolConfigurationError(`${field} 값이 너무 길거나 제어문자를 포함합니다.`);
  }
  return text;
}

function absolutePath(value: unknown, field: string): string {
  const text = requiredText(value, field, 1_024);
  if (!path.isAbsolute(text)) {
    throw new LocalToolConfigurationError(`${field}는 절대 경로여야 합니다.`);
  }
  return path.normalize(text);
}

function parseArgument(value: unknown, toolId: string): LocalToolArgumentDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LocalToolConfigurationError(`${toolId}의 arguments 항목이 객체가 아닙니다.`);
  }
  const raw = value as Record<string, unknown>;
  const name = requiredText(raw.name, `${toolId}.arguments.name`, 32);
  const flag = requiredText(raw.flag, `${toolId}.${name}.flag`, 64);
  const type = requiredText(raw.type, `${toolId}.${name}.type`, 16);
  if (!ARGUMENT_NAME_PATTERN.test(name)) {
    throw new LocalToolConfigurationError(`${toolId}.${name}: 올바르지 않은 인자 이름입니다.`);
  }
  if (!FLAG_PATTERN.test(flag)) {
    throw new LocalToolConfigurationError(`${toolId}.${name}: 인자 플래그가 안전하지 않습니다.`);
  }
  if (!["string", "integer", "number", "boolean", "date", "enum"].includes(type)) {
    throw new LocalToolConfigurationError(`${toolId}.${name}: 지원하지 않는 인자 형식입니다.`);
  }

  const enumValues = Array.isArray(raw.enumValues)
    ? raw.enumValues.map((item) => requiredText(item, `${toolId}.${name}.enumValues`, 100))
    : undefined;
  if (type === "enum" && (!enumValues || enumValues.length === 0 || enumValues.length > 30)) {
    throw new LocalToolConfigurationError(`${toolId}.${name}: enumValues가 필요합니다.`);
  }

  return {
    name,
    label: requiredText(raw.label ?? name, `${toolId}.${name}.label`, 80),
    description:
      typeof raw.description === "string" ? raw.description.trim().slice(0, 200) : undefined,
    flag,
    type: type as LocalToolArgumentDefinition["type"],
    required: raw.required === true,
    maxLength:
      typeof raw.maxLength === "number"
        ? Math.max(1, Math.min(1_000, Math.trunc(raw.maxLength)))
        : undefined,
    enumValues,
  };
}

function parseTool(value: unknown): LocalToolDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LocalToolConfigurationError("도구 정의가 객체가 아닙니다.");
  }
  const raw = value as Record<string, unknown>;
  const id = requiredText(raw.id, "tool.id", 64);
  if (!ID_PATTERN.test(id)) {
    throw new LocalToolConfigurationError(`${id}: 도구 ID는 영문 소문자, 숫자, -, _만 허용합니다.`);
  }
  const runtime = requiredText(raw.runtime, `${id}.runtime`, 20);
  if (!["powershell", "python", "node"].includes(runtime)) {
    throw new LocalToolConfigurationError(`${id}: 지원하지 않는 실행 환경입니다.`);
  }
  if (raw.effect !== "read_only" || raw.confirmation !== "always") {
    throw new LocalToolConfigurationError(
      `${id}: 현재 단계에서는 effect=read_only, confirmation=always만 허용합니다.`
    );
  }
  const scriptPath = absolutePath(raw.scriptPath, `${id}.scriptPath`);
  const allowedExtensions: Record<string, string[]> = {
    powershell: [".ps1"],
    python: [".py"],
    node: [".js", ".mjs", ".cjs"],
  };
  if (!allowedExtensions[runtime].includes(path.extname(scriptPath).toLowerCase())) {
    throw new LocalToolConfigurationError(`${id}: 실행 환경과 스크립트 확장자가 맞지 않습니다.`);
  }
  const scriptSha256 = requiredText(raw.scriptSha256, `${id}.scriptSha256`, 64);
  if (!SHA256_PATTERN.test(scriptSha256)) {
    throw new LocalToolConfigurationError(`${id}: scriptSha256은 64자리 SHA-256이어야 합니다.`);
  }

  const argumentsList = Array.isArray(raw.arguments)
    ? raw.arguments.map((argument) => parseArgument(argument, id))
    : [];
  if (argumentsList.length > 20) {
    throw new LocalToolConfigurationError(`${id}: 인자는 최대 20개까지 등록할 수 있습니다.`);
  }
  if (new Set(argumentsList.map((argument) => argument.name)).size !== argumentsList.length) {
    throw new LocalToolConfigurationError(`${id}: 중복된 인자 이름이 있습니다.`);
  }

  return {
    id,
    name: requiredText(raw.name, `${id}.name`, 100),
    description: requiredText(raw.description, `${id}.description`, 300),
    runtime: runtime as LocalToolDefinition["runtime"],
    executablePath:
      raw.executablePath === undefined
        ? undefined
        : absolutePath(raw.executablePath, `${id}.executablePath`),
    scriptPath,
    scriptSha256: scriptSha256.toLowerCase(),
    workingDirectory: absolutePath(raw.workingDirectory, `${id}.workingDirectory`),
    arguments: argumentsList,
    timeoutMs:
      typeof raw.timeoutMs === "number"
        ? Math.max(1_000, Math.min(120_000, Math.trunc(raw.timeoutMs)))
        : 30_000,
    maxOutputBytes:
      typeof raw.maxOutputBytes === "number"
        ? Math.max(1_024, Math.min(1_048_576, Math.trunc(raw.maxOutputBytes)))
        : 262_144,
    effect: "read_only",
    confirmation: "always",
  };
}

export async function loadLocalToolRegistry(): Promise<LocalToolDefinition[]> {
  const registryPath = process.env.LOCAL_TOOL_REGISTRY_PATH?.trim();
  if (!registryPath) return [];
  if (!path.isAbsolute(registryPath)) {
    throw new LocalToolConfigurationError("LOCAL_TOOL_REGISTRY_PATH는 절대 경로여야 합니다.");
  }
  const file = await readFile(registryPath);
  if (file.byteLength > MAX_REGISTRY_BYTES) {
    throw new LocalToolConfigurationError("로컬 도구 등록 파일이 256KB를 초과합니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.toString("utf8"));
  } catch {
    throw new LocalToolConfigurationError("로컬 도구 등록 파일이 올바른 JSON이 아닙니다.");
  }
  const values = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tools?: unknown }).tools)
      ? (parsed as { tools: unknown[] }).tools
      : null;
  if (!values) throw new LocalToolConfigurationError("등록 파일에는 tools 배열이 필요합니다.");
  if (values.length > MAX_TOOLS) {
    throw new LocalToolConfigurationError(`도구는 최대 ${MAX_TOOLS}개까지 등록할 수 있습니다.`);
  }
  const tools = values.map(parseTool);
  if (new Set(tools.map((tool) => tool.id)).size !== tools.length) {
    throw new LocalToolConfigurationError("중복된 도구 ID가 있습니다.");
  }
  return tools;
}

export async function assertLocalToolFiles(tool: LocalToolDefinition): Promise<void> {
  await Promise.all([
    access(tool.scriptPath, constants.R_OK),
    access(tool.workingDirectory, constants.R_OK),
    tool.executablePath ? access(tool.executablePath, constants.X_OK) : Promise.resolve(),
  ]);
}

export function publicLocalTool(tool: LocalToolDefinition): PublicLocalToolDefinition {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    runtime: tool.runtime,
    scriptName: path.basename(tool.scriptPath),
    workingDirectoryName: path.basename(tool.workingDirectory),
    arguments: tool.arguments ?? [],
    timeoutMs: tool.timeoutMs ?? 30_000,
    maxOutputBytes: tool.maxOutputBytes ?? 262_144,
    effect: "read_only",
    confirmation: "always",
  };
}
