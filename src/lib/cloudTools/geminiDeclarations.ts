import "server-only";

import { listCloudTools } from "./registry";
import type {
  CloudToolObjectSchema,
  CloudToolPropertySchema,
  PublicCloudToolDefinition,
} from "./types";

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, GeminiPropertySchema>;
    required?: string[];
  };
}

interface GeminiPropertySchema {
  type: CloudToolPropertySchema["type"];
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

const FUNCTION_PREFIX = "coffee_tide_";

function functionName(toolId: string): string {
  return `${FUNCTION_PREFIX}${toolId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function geminiPropertySchema(property: CloudToolPropertySchema): GeminiPropertySchema {
  return {
    type: property.type,
    description: property.description,
    ...(property.enum ? { enum: [...property.enum] } : {}),
    ...(property.minimum !== undefined ? { minimum: property.minimum } : {}),
    ...(property.maximum !== undefined ? { maximum: property.maximum } : {}),
  };
}

function geminiParameters(schema: CloudToolObjectSchema): GeminiFunctionDeclaration["parameters"] {
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [
        name,
        geminiPropertySchema(property),
      ])
    ),
    ...(schema.required?.length ? { required: [...schema.required] } : {}),
  };
}

function automaticDefinitions(): PublicCloudToolDefinition[] {
  return listCloudTools().filter(
    (tool) => tool.effect === "read_only" && tool.confirmation === "none"
  );
}

export function geminiCloudToolDeclarations(): GeminiFunctionDeclaration[] {
  return automaticDefinitions().map((tool) => ({
    name: functionName(tool.id),
    description: `${tool.description} CoffeeTide가 서버에서 실행하는 읽기 전용 함수입니다.`,
    parameters: geminiParameters(tool.inputSchema),
  }));
}

export function cloudToolIdFromGeminiFunction(name: string): string | null {
  const matching = automaticDefinitions().find((tool) => functionName(tool.id) === name);
  return matching?.id ?? null;
}
