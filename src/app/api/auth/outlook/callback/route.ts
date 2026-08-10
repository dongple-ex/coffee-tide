import { NextRequest, NextResponse } from "next/server";
import { readSession, writeSession } from "@/lib/auth/cookies";
import { exchangeOutlookCode, fetchOutlookProfile } from "@/lib/auth/msal";
import {
  storeIntegrationForCurrentUser,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  const home = NextResponse.redirect(new URL("/", request.url));
  home.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/?error=outlook_auth", request.url));
  }

  const session = (await readSession()) ?? {
    userEmail: "guest@coffeetide.dongple.kr",
    createdAt: new Date().toISOString(),
  };

  try {
    const tokens = await exchangeOutlookCode(code);
    const email = await fetchOutlookProfile(tokens.accessToken);
    const next = {
      ...session,
      outlookToken: tokens.accessToken,
      outlookRefreshToken: tokens.refreshToken,
      outlookTokenExpiry: tokens.expiresAt,
      outlookEmail: email || undefined,
    };
    const stored = await storeIntegrationForCurrentUser("outlook", {
      outlookToken: tokens.accessToken,
      outlookRefreshToken: tokens.refreshToken,
      outlookTokenExpiry: tokens.expiresAt,
      outlookEmail: email || undefined,
    });
    return stored ? writeSessionForCurrentUser(home, next) : writeSession(home, next);
  } catch (err) {
    console.error("[coffeeTide] Outlook 토큰 교환 실패", err);
    return NextResponse.redirect(new URL("/?error=outlook_token", request.url));
  }
}
