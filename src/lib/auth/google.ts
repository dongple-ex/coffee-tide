// Google OAuth (Gmail·Calendar·Drive readonly) — doc/as-built-reference.md §2.
// access_type=offline + prompt=consent 로 refresh token 확보.

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

const CLIENT_ID = () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = () =>
  process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/api/auth/google/callback";

export function isGoogleConfigured(): boolean {
  return Boolean(CLIENT_ID() && CLIENT_SECRET());
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID(),
    response_type: "code",
    redirect_uri: REDIRECT_URI(),
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token endpoint ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };
  let email: string | undefined;
  if (json.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(json.id_token.split(".")[1], "base64url").toString("utf8")
      ) as { email?: string };
      email = payload.email;
    } catch {
      // id_token 파싱 실패는 치명적이지 않음
    }
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    email,
  };
}

export function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI(),
    })
  );
}

export function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}
