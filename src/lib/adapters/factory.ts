// 어댑터 팩토리 — MOCK_MODE=true면 Mock 데이터 반환 (doc/3-integration_env.md 사상 계승)

import { SessionData } from "../auth/session";
import {
  MOCK_LLM_ITEMS,
  MOCK_MAILS,
  MOCK_NOTION_PAGES,
  MOCK_OBSIDIAN_ITEMS,
} from "../mocks/mails";
import { UnifiedData } from "../types/unified";
import { GmailAdapter } from "./gmail";
import { LlmArtifactAdapter } from "./llmArtifact";
import { LocalDocAdapter } from "./localDoc";
import { NotionAdapter } from "./notion";
import { ObsidianAdapter } from "./obsidian";
import { OutlookAdapter } from "./outlook";

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

type Fetcher = () => Promise<UnifiedData[]>;

/** 세션의 연동 상태에 맞춰 소스별 수집 함수를 구성 (phase3 Step 3: 동적 선택 동기화) */
export function buildFetchers(session: SessionData): Partial<
  Record<"outlook" | "google" | "notion" | "obsidian" | "local_doc" | "llm", Fetcher>
> {
  if (isMockMode()) {
    return {
      outlook: async () => MOCK_MAILS.filter((m) => m.source === "outlook"),
      google: async () => MOCK_MAILS.filter((m) => m.source === "gmail"),
      notion: async () => MOCK_NOTION_PAGES,
      obsidian: async () => MOCK_OBSIDIAN_ITEMS,
      llm: async () => MOCK_LLM_ITEMS,
    };
  }

  const fetchers: ReturnType<typeof buildFetchers> = {};
  if (session.outlookToken) {
    const adapter = new OutlookAdapter(session.outlookToken);
    fetchers.outlook = () => adapter.fetchRecent(10);
  }
  if (session.googleToken) {
    const adapter = new GmailAdapter(session.googleToken);
    fetchers.google = () => adapter.fetchRecent(10);
  }
  if (session.notionToken && session.notionDbId) {
    const adapter = new NotionAdapter(session.notionToken, session.notionDbId);
    fetchers.notion = () => adapter.fetchRecent(10);
  }
  if (session.obsidianVaultPath) {
    const adapter = new ObsidianAdapter(session.obsidianVaultPath);
    fetchers.obsidian = () => adapter.fetchRecent(10);
  }
  if (session.localDocPaths && session.localDocPaths.length > 0) {
    const adapters = session.localDocPaths.map((p) => new LocalDocAdapter(p));
    fetchers.local_doc = async () =>
      (await Promise.all(adapters.map((a) => a.fetchRecent(10)))).flat();
  }
  if (session.llmArtifactsPath) {
    const adapter = new LlmArtifactAdapter(session.llmArtifactsPath);
    fetchers.llm = () => adapter.fetchArtifacts({ limit: 20 });
  }
  return fetchers;
}

export function connectionState(session: SessionData) {
  if (isMockMode()) {
    return {
      google: true,
      outlook: true,
      notion: true,
      obsidian: true,
      local_doc: false,
      llm: true,
      localDocPaths: [] as string[],
      googleEmail: "mock@gmail.com",
      outlookEmail: "mock@outlook.com",
    };
  }
  return {
    google: Boolean(session.googleToken),
    outlook: Boolean(session.outlookToken),
    notion: Boolean(session.notionToken && session.notionDbId),
    obsidian: Boolean(session.obsidianVaultPath),
    local_doc: Boolean(session.localDocPaths?.length),
    llm: Boolean(session.llmArtifactsPath),
    localDocPaths: session.localDocPaths ?? [],
    googleEmail: session.googleEmail,
    outlookEmail: session.outlookEmail,
  };
}
