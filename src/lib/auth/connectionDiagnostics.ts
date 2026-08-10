import "server-only";

import type { ConnectionState, MailsResponse } from "@/lib/types/unified";
import { persistRefreshedIntegration } from "./integrationStore";
import { REFRESH_WINDOW_MS, refreshChannel } from "./refresh";
import type { SessionData } from "./session";

interface ApiCheck<T = Record<string, unknown>> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
}

export interface ConnectionDiagnosticResult {
  answer: string;
  connections: ConnectionState;
  errors?: MailsResponse["errors"];
  session: SessionData;
  preserveIntegrations: boolean;
}

async function apiCheck<T = Record<string, unknown>>(
  url: string,
  token: string,
  init?: RequestInit
): Promise<ApiCheck<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
    const data = (await response.json().catch(() => undefined)) as T | undefined;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "네트워크 확인 실패",
    };
  }
}

function checkLine(label: string, check: ApiCheck): string {
  if (check.ok) return `- ${label}: ✅ 사용 가능`;
  if (check.status === 401) return `- ${label}: ❌ 인증 만료`;
  if (check.status === 403) return `- ${label}: ⚠️ 권한 부족`;
  if (check.status) return `- ${label}: ⚠️ API 응답 ${check.status}`;
  return `- ${label}: ⚠️ 실시간 확인 실패`;
}

async function refreshForDiagnostic(
  provider: "google" | "outlook",
  session: SessionData
): Promise<{ session: SessionData; refreshed: boolean; persisted: boolean }> {
  const refreshed = await refreshChannel(provider, session);
  if (!refreshed) return { session, refreshed: false, persisted: false };
  const persisted = await persistRefreshedIntegration(provider, refreshed);
  return { session: refreshed, refreshed: true, persisted };
}

export async function diagnoseConnections(
  initialSession: SessionData
): Promise<ConnectionDiagnosticResult> {
  let session = initialSession;
  let preserveIntegrations = false;
  const errors: NonNullable<MailsResponse["errors"]> = {};
  const sections: string[] = [
    "## 🔌 실시간 서비스 연동 진단",
    `- 확인 시각: ${new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Seoul",
    }).format(new Date())}`,
    "- 판정 기준: CoffeeTide 서버 저장정보 + 각 서비스 API 실호출",
  ];

  if (!session.googleToken) {
    sections.push("### Google\n- 상태: ❌ 미연동\n- 설정 → Google에서 연동해 주세요.");
  } else {
    let refreshed = false;
    if (
      session.googleRefreshToken &&
      session.googleTokenExpiry &&
      session.googleTokenExpiry - Date.now() < REFRESH_WINDOW_MS
    ) {
      const result = await refreshForDiagnostic("google", session);
      session = result.session;
      refreshed = result.refreshed;
      preserveIntegrations ||= result.refreshed && !result.persisted;
    }

    let profile = await apiCheck<{ email?: string }>(
      "https://openidconnect.googleapis.com/v1/userinfo",
      session.googleToken!
    );
    if (profile.status === 401 && session.googleRefreshToken && !refreshed) {
      const result = await refreshForDiagnostic("google", session);
      session = result.session;
      refreshed = result.refreshed;
      preserveIntegrations ||= result.refreshed && !result.persisted;
      if (result.refreshed && session.googleToken) {
        profile = await apiCheck<{ email?: string }>(
          "https://openidconnect.googleapis.com/v1/userinfo",
          session.googleToken
        );
      }
    }

    if (profile.ok && session.googleToken) {
      const [gmail, calendar, drive] = await Promise.all([
        apiCheck("https://gmail.googleapis.com/gmail/v1/users/me/profile", session.googleToken),
        apiCheck(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&singleEvents=true",
          session.googleToken
        ),
        apiCheck(
          "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
          session.googleToken
        ),
      ]);
      const permissionIssue = [gmail, calendar, drive].some(
        (check) => check.status === 401 || check.status === 403
      );
      if (permissionIssue) errors.google = "일부 Google 권한이 없거나 만료됐습니다";
      session.googleEmail = profile.data?.email || session.googleEmail;
      sections.push(
        [
          "### Google",
          `- 상태: ${permissionIssue ? "⚠️ 계정 연결됨 · 일부 권한 확인 필요" : "✅ 정상 연결"}`,
          `- 계정: ${session.googleEmail || "이메일 확인 불가"}`,
          checkLine("Gmail 읽기", gmail),
          checkLine("Calendar 일정", calendar),
          checkLine("Drive 읽기·쓰기", drive),
          `- 토큰 갱신: ${refreshed ? "이번 진단에서 갱신 완료" : "불필요"}`,
        ].join("\n")
      );
    } else {
      const temporary = profile.status !== 401 && profile.status !== 403;
      if (!temporary) errors.google = "Google 재연동이 필요합니다";
      sections.push(
        `### Google\n- 상태: ${temporary ? "⚠️ 저장정보 있음 · Google API 확인 실패" : "❌ 인증 만료 · 재연동 필요"}\n- 계정: ${session.googleEmail || "확인 불가"}\n${checkLine("Google 계정", profile)}`
      );
    }
  }

  if (!session.outlookToken) {
    sections.push("### Outlook\n- 상태: ❌ 미연동");
  } else {
    let refreshed = false;
    if (
      session.outlookRefreshToken &&
      session.outlookTokenExpiry &&
      session.outlookTokenExpiry - Date.now() < REFRESH_WINDOW_MS
    ) {
      const result = await refreshForDiagnostic("outlook", session);
      session = result.session;
      refreshed = result.refreshed;
      preserveIntegrations ||= result.refreshed && !result.persisted;
    }
    let profile = await apiCheck<{ mail?: string; userPrincipalName?: string }>(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
      session.outlookToken!
    );
    if (profile.status === 401 && session.outlookRefreshToken && !refreshed) {
      const result = await refreshForDiagnostic("outlook", session);
      session = result.session;
      refreshed = result.refreshed;
      preserveIntegrations ||= result.refreshed && !result.persisted;
      if (result.refreshed && session.outlookToken) {
        profile = await apiCheck<{ mail?: string; userPrincipalName?: string }>(
          "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
          session.outlookToken
        );
      }
    }
    if (profile.ok) {
      session.outlookEmail =
        profile.data?.mail || profile.data?.userPrincipalName || session.outlookEmail;
    } else if (profile.status === 401 || profile.status === 403) {
      errors.outlook = "Outlook 재연동이 필요합니다";
    }
    sections.push(
      [
        "### Outlook",
        `- 상태: ${profile.ok ? "✅ 정상 연결" : profile.status ? "❌ 인증 확인 실패" : "⚠️ Microsoft API 확인 실패"}`,
        `- 계정: ${session.outlookEmail || "확인 불가"}`,
        checkLine("메일 읽기", profile),
        `- 토큰 갱신: ${refreshed ? "이번 진단에서 갱신 완료" : "불필요"}`,
      ].join("\n")
    );
  }

  if (!session.notionToken || !session.notionDbId) {
    sections.push("### Notion\n- 상태: ❌ 미연동");
  } else {
    const [identity, database] = await Promise.all([
      apiCheck("https://api.notion.com/v1/users/me", session.notionToken, {
        headers: { "Notion-Version": "2022-06-28" },
      }),
      apiCheck(`https://api.notion.com/v1/databases/${session.notionDbId}/query`, session.notionToken, {
        method: "POST",
        headers: {
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 1 }),
      }),
    ]);
    if (identity.status === 401 || identity.status === 403 || database.status === 401) {
      errors.notion = "Notion 재연동이 필요합니다";
    } else if (database.status === 404) {
      errors.notion = "Notion 데이터베이스 공유 설정을 확인해 주세요";
    }
    sections.push(
      [
        "### Notion",
        `- 상태: ${identity.ok && database.ok ? "✅ 정상 연결" : "⚠️ 연결 설정 확인 필요"}`,
        checkLine("Integration Token", identity),
        checkLine("Database 접근", database),
      ].join("\n")
    );
  }

  // /connect는 Mock 표시가 아니라 현재 요청의 실제 서버 자격정보만 판정한다.
  const connections: ConnectionState = {
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
  if (errors.google?.includes("재연동")) connections.google = false;
  if (errors.outlook) connections.outlook = false;
  if (errors.notion?.includes("재연동")) connections.notion = false;
  connections.googleEmail = session.googleEmail;
  connections.outlookEmail = session.outlookEmail;

  sections.push(
    [
      "### 로컬·서버 폴더",
      `- Obsidian 서버 경로: ${connections.obsidian ? "✅ 설정됨" : "미설정"}`,
      `- 로컬 문서 서버 경로: ${connections.local_doc ? `✅ ${connections.localDocPaths?.length ?? 0}개` : "미설정"}`,
      `- LLM 산출물 서버 경로: ${connections.llm ? "✅ 설정됨" : "미설정"}`,
      "- 모바일 브라우저 폴더 권한은 기기별 브라우저 설정이므로 이 명령에서 검사하지 않습니다.",
      "",
      "> 이 결과를 기준으로 현재 화면의 Google·Outlook·Notion 연동 표시도 갱신했습니다.",
    ].join("\n")
  );

  return {
    answer: sections.join("\n\n"),
    connections,
    errors: Object.keys(errors).length ? errors : undefined,
    session,
    preserveIntegrations,
  };
}
