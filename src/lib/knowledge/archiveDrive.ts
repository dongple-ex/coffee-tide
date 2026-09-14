import "server-only";

import { GoogleDriveAdapter, GoogleDriveApiError } from "@/lib/adapters/googleDrive";
import { AuthExpiredError } from "@/lib/adapters/outlook";
import {
  persistRefreshedIntegration,
  readSessionWithIntegrations,
} from "@/lib/auth/integrationStore";
import { refreshChannel, refreshGoogleIfExpiring } from "@/lib/auth/refresh";
import type { SessionData } from "@/lib/auth/session";

export type DriveCallResult<T> =
  | { status: "ok"; value: T; session: SessionData; sessionChanged: boolean }
  | { status: "not_connected" | "auth_expired" | "failed"; session?: SessionData; sessionChanged: boolean };

function isDriveAuthError(error: unknown): boolean {
  return error instanceof AuthExpiredError ||
    (error instanceof GoogleDriveApiError && error.status === 403);
}

export async function runGoogleDriveCall<T>(
  operation: (adapter: GoogleDriveAdapter) => Promise<T>
): Promise<DriveCallResult<T>> {
  let session = await readSessionWithIntegrations();
  if (!session?.googleToken && !session?.googleRefreshToken) {
    return { status: "not_connected", sessionChanged: false };
  }

  let sessionChanged = false;
  const preemptiveRefresh = await refreshGoogleIfExpiring(session);
  if (preemptiveRefresh) {
    session = preemptiveRefresh;
    sessionChanged = true;
  }
  if (!session.googleToken) {
    return { status: "auth_expired", session, sessionChanged };
  }

  try {
    return {
      status: "ok",
      value: await operation(new GoogleDriveAdapter(session.googleToken)),
      session,
      sessionChanged,
    };
  } catch (error) {
    if (!isDriveAuthError(error)) {
      return { status: "failed", session, sessionChanged };
    }
    const refreshed = await refreshChannel("google", session);
    if (!refreshed?.googleToken) {
      return { status: "auth_expired", session, sessionChanged };
    }
    session = refreshed;
    sessionChanged = true;
    const refreshedAccessToken = refreshed.googleToken;
    try {
      return {
        status: "ok",
        value: await operation(new GoogleDriveAdapter(refreshedAccessToken)),
        session,
        sessionChanged,
      };
    } catch (retryError) {
      return {
        status: isDriveAuthError(retryError) ? "auth_expired" : "failed",
        session,
        sessionChanged,
      };
    }
  }
}

export async function persistDriveSession(result: DriveCallResult<unknown>): Promise<boolean> {
  if (!result.sessionChanged || !result.session) return false;
  return persistRefreshedIntegration("google", result.session);
}
