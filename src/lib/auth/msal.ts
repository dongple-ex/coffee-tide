// Microsoft Entra ID OAuth (Authorization Code) — 현행 흐름: /api/auth/outlook → callback.
// 백로그 D1 반영: 레거시 PKCE 잔재 없이 처음부터 단일 흐름으로 구현.

export const MS_SCOPES = ["User.Read", "Mail.Read", "Mail.ReadWrite", "offline_access"];

const TENANT = () => process.env.MS_TENANT_ID || "common";
const CLIENT_ID = () => process.env.NEXT_PUBLIC_MS_CLIENT_ID || "";
const CLIENT_SECRET = () => process.env.MS_CLIENT_SECRET || "";
const REDIRECT_URI = () =>
  process.env.NEXT_PUBLIC_MS_REDIRECT_URI ||
  "http://localhost:3000/api/auth/outlook/callback";

export function isOutlookConfigured(): boolean {
  return Boolean(CLIENT_ID() && CLIENT_SECRET());
}

export function buildOutlookAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID(),
    response_type: "code",
    redirect_uri: REDIRECT_URI(),
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
  });
  return `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/authorize?${params}`;
}

export interface MsTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
}

async function tokenRequest(body: URLSearchParams): Promise<MsTokens> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  if (!res.ok) {
    throw new Error(`MS token endpoint ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export function exchangeOutlookCode(code: string): Promise<MsTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI(),
      scope: MS_SCOPES.join(" "),
    })
  );
}

export function refreshAccessToken(refreshToken: string): Promise<MsTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: MS_SCOPES.join(" "),
    })
  );
}

export async function fetchOutlookProfile(accessToken: string): Promise<string> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
  return me.mail || me.userPrincipalName || "";
}
