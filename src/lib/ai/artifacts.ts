import type { AiArtifact, AiArtifactType } from "../data/contracts";
import { validateAiArtifact } from "../data/validation";

export interface CreateAiArtifactInput {
  itemId: string;
  artifactType: AiArtifactType;
  contentText?: string;
  contentJson?: Record<string, unknown>;
  provider: string;
  model: string;
  promptVersion?: string;
  sourceHash?: string;
  sourceVersion?: number;
}

export function buildAiArtifact(
  input: CreateAiArtifactInput,
  userId?: string
): AiArtifact {
  const artifact: AiArtifact = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "art-" + Math.random().toString(36).substring(2, 12),
    userId,
    itemId: input.itemId,
    artifactType: input.artifactType,
    contentText: input.contentText,
    contentJson: input.contentJson,
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    sourceHash: input.sourceHash,
    sourceVersion: input.sourceVersion,
    status: "current",
    createdAt: new Date().toISOString(),
  };

  const validation = validateAiArtifact(artifact);
  if (!validation.valid) {
    throw new Error(`AI 아티팩트 유효성 검증 실패: ${validation.errors.join(", ")}`);
  }

  return artifact;
}

/**
 * 원본 내용/버전이 변경되었을 때, 이전 버전에 기반한 AI 아티팩트들을 stale 상태로 전환합니다.
 */
export function markArtifactsStaleOnSourceUpdate(
  artifacts: AiArtifact[],
  itemId: string,
  newSourceVersion: number
): AiArtifact[] {
  return artifacts.map((art) => {
    if (
      art.itemId === itemId &&
      art.status === "current" &&
      art.sourceVersion !== undefined &&
      art.sourceVersion < newSourceVersion
    ) {
      return {
        ...art,
        status: "stale",
      };
    }
    return art;
  });
}
