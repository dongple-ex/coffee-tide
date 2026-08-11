import type { CloudToolObjectSchema } from "./types";

export class CloudToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudToolInputError";
  }
}

export function validateCloudToolInput(
  schema: CloudToolObjectSchema,
  value: unknown
): Record<string, string | number | boolean> {
  if (value === undefined || value === null) value = {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CloudToolInputError("도구 입력은 JSON 객체여야 합니다.");
  }
  const raw = value as Record<string, unknown>;
  const propertyNames = new Set(Object.keys(schema.properties));
  const unknownKeys = Object.keys(raw).filter((key) => !propertyNames.has(key));
  if (unknownKeys.length > 0) {
    throw new CloudToolInputError(`등록되지 않은 입력 항목입니다: ${unknownKeys.join(", ")}`);
  }

  const output: Record<string, string | number | boolean> = {};
  for (const [name, property] of Object.entries(schema.properties)) {
    const supplied = raw[name];
    if (supplied === undefined || supplied === null || supplied === "") {
      if (property.default !== undefined) output[name] = property.default;
      else if (schema.required?.includes(name)) {
        throw new CloudToolInputError(`${name} 값이 필요합니다.`);
      }
      continue;
    }

    if (property.type === "string") {
      if (typeof supplied !== "string") {
        throw new CloudToolInputError(`${name} 값은 문자열이어야 합니다.`);
      }
      const text = supplied.trim();
      if (/\p{Cc}/u.test(text)) {
        throw new CloudToolInputError(`${name} 값에 제어문자를 사용할 수 없습니다.`);
      }
      if (text.length > (property.maxLength ?? 200)) {
        throw new CloudToolInputError(`${name} 값이 너무 깁니다.`);
      }
      if (property.enum && !property.enum.includes(text)) {
        throw new CloudToolInputError(`${name} 값이 허용 목록에 없습니다.`);
      }
      output[name] = text;
      continue;
    }

    if (property.type === "boolean") {
      if (typeof supplied !== "boolean") {
        throw new CloudToolInputError(`${name} 값은 참/거짓이어야 합니다.`);
      }
      output[name] = supplied;
      continue;
    }

    if (typeof supplied !== "number" || !Number.isFinite(supplied)) {
      throw new CloudToolInputError(`${name} 값은 숫자여야 합니다.`);
    }
    if (property.type === "integer" && !Number.isInteger(supplied)) {
      throw new CloudToolInputError(`${name} 값은 정수여야 합니다.`);
    }
    if (property.minimum !== undefined && supplied < property.minimum) {
      throw new CloudToolInputError(`${name} 값이 최소값보다 작습니다.`);
    }
    if (property.maximum !== undefined && supplied > property.maximum) {
      throw new CloudToolInputError(`${name} 값이 최대값보다 큽니다.`);
    }
    output[name] = supplied;
  }
  return output;
}
