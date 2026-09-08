// 어댑터 팩토리 — MOCK_MODE=true면 Mock 데이터 반환 (doc/legacy_timepilot/3-integration_env.md 사상 계승)

import { SessionData } from "../auth/session";
import { COLLECT_WINDOW_DAYS, COLLECT_WINDOW_MS } from "../collectWindow";
import {
  MOCK_LLM_ITEMS,
  MOCK_MAILS,
  MOCK_NOTION_PAGES,
  MOCK_OBSIDIAN_ITEMS,
} from "../mocks/mails";
import { UnifiedData } from "../types/unified";
import { GmailAdapter } from "./gmail";
import { GoogleCalendarAdapter } from "./googleCalendar";
import { GoogleDriveAdapter } from "./googleDrive";
import { LlmArtifactAdapter } from "./llmArtifact";
import { LocalDocAdapter } from "./localDoc";
import { NotionAdapter } from "./notion";
import { ObsidianAdapter } from "./obsidian";
import { AuthExpiredError, OutlookAdapter } from "./outlook";

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

type Fetcher = () => Promise<UnifiedData[]>;

/** 세션의 연동 상태에 맞춰 소스별 수집 함수를 구성 (phase3 Step 3: 동적 선택 동기화) */
export function buildFetchers(
  session: SessionData,
  limit: number = 20
): Partial<
  Record<"outlook" | "google" | "notion" | "obsidian" | "local_doc" | "llm", Fetcher>
> {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  if (isMockMode()) {
    return {
      outlook: async () => MOCK_MAILS.filter((m) => m.source === "outlook").slice(0, safeLimit),
      google: async () =>
        MOCK_MAILS.filter(
          (m) => m.source === "gmail" || m.source === "gcalendar" || m.source === "gdrive"
        ).slice(0, safeLimit),
      notion: async () => MOCK_NOTION_PAGES.slice(0, safeLimit),
      obsidian: async () => MOCK_OBSIDIAN_ITEMS.slice(0, safeLimit),
      llm: async () => MOCK_LLM_ITEMS.slice(0, safeLimit),
    };
  }

  const fetchers: ReturnType<typeof buildFetchers> = {};
  if (session.outlookToken) {
    const adapter = new OutlookAdapter(session.outlookToken);
    // 윈도우를 쿼리에 푸시다운 — 오래된 메일에 개수 상한을 낭비하지 않는다
    fetchers.outlook = () =>
      adapter.fetchRecent(safeLimit, new Date(Date.now() - COLLECT_WINDOW_MS).toISOString());
  }
  if (session.googleToken) {
    const gmailAdapter = new GmailAdapter(session.googleToken);
    const calAdapter = new GoogleCalendarAdapter(session.googleToken);
    const driveAdapter = new GoogleDriveAdapter(session.googleToken);

    fetchers.google = async () => {
      const results = await Promise.allSettled([
        gmailAdapter.fetchRecent(safeLimit, COLLECT_WINDOW_DAYS),
        calAdapter.fetchTodayMeetings(safeLimit),
        driveAdapter.fetchRecentFiles(safeLimit, COLLECT_WINDOW_DAYS),
      ]);

      const items: UnifiedData[] = [];
      for (const res of results) {
        if (res.status === "fulfilled") {
          items.push(...res.value);
        } else {
          // 토큰 만료 에러는 상위 리프레시 루프로 전파
          if (res.reason instanceof AuthExpiredError) {
            throw res.reason;
          }
          console.warn("[coffeeTide] Google 서브서비스 수집 실패 (부분 실패 허용):", res.reason);
        }
      }

      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return items.slice(0, safeLimit);
    };
  }
  if (session.notionToken && session.notionDbId) {
    const adapter = new NotionAdapter(session.notionToken, session.notionDbId);
    fetchers.notion = () => adapter.fetchRecent(safeLimit);
  }
  if (session.obsidianVaultPath) {
    const adapter = new ObsidianAdapter(session.obsidianVaultPath);
    fetchers.obsidian = () => adapter.fetchRecent(safeLimit);
  }
  if (session.localDocPaths && session.localDocPaths.length > 0) {
    const adapters = session.localDocPaths.map((p) => new LocalDocAdapter(p));
    fetchers.local_doc = async () =>
      (await Promise.all(adapters.map((a) => a.fetchRecent(safeLimit)))).flat();
  }
  if (session.llmArtifactsPath) {
    const adapter = new LlmArtifactAdapter(session.llmArtifactsPath);
    fetchers.llm = () => adapter.fetchArtifacts({ limit: safeLimit });
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
