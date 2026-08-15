import type { AiPolicy, PrivacyScope, WorkspaceItemType } from "../data/contracts";

export interface SourceLocation {
  page?: number;
  sheet?: string;
  slide?: number;
  startSeconds?: number;
  endSeconds?: number;
}

export interface ContentChunk {
  id: string;
  userId: string;
  itemId: string;
  assetId?: string;
  ordinal: number;
  text: string;
  sourceLocation?: SourceLocation;
  sourceHash: string;
  sourceVersion: number;
  privacyScope: PrivacyScope;
  aiPolicy: AiPolicy;
}

export interface KnowledgeSearchRequest {
  query: string;
  itemTypes?: WorkspaceItemType[];
  from?: string;
  to?: string;
  relatedTo?: string;
  limit?: number;
  executionPolicy: "local_only" | "local_first" | "cloud_allowed";
}

export type EvidenceScoreReason = "relation" | "keyword" | "vector" | "recency";

export interface KnowledgeEvidence {
  itemId: string;
  assetId?: string;
  chunkId?: string;
  title: string;
  excerpt: string;
  sourceLocation?: SourceLocation;
  relationPath?: string[];
  sourceVersion: number;
  updatedAt: string;
  score: number;
  scoreReason: EvidenceScoreReason;
}

export interface StructuredFact {
  key: string;
  value: string;
  itemId: string;
  userConfirmed: boolean;
}

export interface ContextExcludedSummary {
  reason: "privacy" | "stale" | "unavailable" | "limit";
  count: number;
}

export interface GroundedContextPackage {
  question: string;
  evidence: KnowledgeEvidence[];
  structuredFacts: StructuredFact[];
  excluded: ContextExcludedSummary[];
}
