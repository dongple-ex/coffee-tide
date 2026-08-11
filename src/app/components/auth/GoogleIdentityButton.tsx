"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { getAuthSiteOrigin, getSupabaseAuthCallbackUrl } from "@/lib/auth/siteOrigin";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "../../page.module.css";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce: string;
    ux_mode: "popup";
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      text: "continue_with";
      shape: "rectangular";
      logo_alignment: "left";
      locale: string;
      width: number;
    }
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

interface Props {
  clientId: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (email: string) => Promise<void>;
  onError: (message: string) => void;
}

interface LoginEnvironment {
  ready: boolean;
  mobile: boolean;
  inAppName?: string;
}

const SERVER_LOGIN_ENVIRONMENT: LoginEnvironment = { ready: false, mobile: false };
let cachedLoginEnvironment: LoginEnvironment | undefined;

function detectLoginEnvironment(): LoginEnvironment {
  const userAgent = navigator.userAgent || "";
  const inAppName = /KAKAOTALK/i.test(userAgent)
    ? "카카오톡"
    : /Instagram/i.test(userAgent)
      ? "Instagram"
      : /FBAN|FBAV/i.test(userAgent)
        ? "Facebook"
        : /NAVER\(inapp/i.test(userAgent)
          ? "네이버"
          : undefined;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const coarseMobile = window.matchMedia?.("(max-width: 768px) and (pointer: coarse)").matches;
  const narrowViewport = window.innerWidth <= 768;
  return {
    ready: true,
    mobile: mobileUserAgent || Boolean(coarseMobile) || narrowViewport,
    inAppName,
  };
}

function subscribeLoginEnvironment() {
  return () => undefined;
}

function getClientLoginEnvironment(): LoginEnvironment {
  cachedLoginEnvironment ??= detectLoginEnvironment();
  return cachedLoginEnvironment;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function createNoncePair(): Promise<{ raw: string; hashed: string }> {
  const raw = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#EA4335" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.614Z" />
      <path fill="#4285F4" d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.036-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.282-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.008-2.332Z" />
      <path fill="#34A853" d="M9 3.58c1.322 0 2.508.454 3.441 1.346l2.582-2.582C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.008 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
    </svg>
  );
}

function DesktopGoogleIdentityButton({
  clientId,
  onBusyChange,
  onSuccess,
  onError,
}: Omit<Props, "busy">) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);

  async function renderGoogleButton() {
    const googleId = window.google?.accounts.id;
    const parent = buttonRef.current;
    if (!googleId || !parent) return;
    if (!clientId) {
      onError("Google Client ID가 설정되지 않았습니다.");
      return;
    }

    const generation = ++generationRef.current;
    const nonce = await createNoncePair();
    if (generation !== generationRef.current || !buttonRef.current) return;

    googleId.initialize({
      client_id: clientId,
      nonce: nonce.hashed,
      ux_mode: "popup",
      use_fedcm_for_prompt: true,
      callback: (response) => {
        void (async () => {
          if (!response.credential) {
            onError("Google에서 로그인 정보를 받지 못했습니다.");
            return;
          }

          onBusyChange(true);
          onError("");
          try {
            const supabase = createBrowserSupabaseClient();
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
              nonce: nonce.raw,
            });
            if (error) throw error;
            const email = data.user?.email;
            if (!email) throw new Error("Google 계정 이메일을 확인하지 못했습니다.");
            await onSuccess(email);
          } catch (error) {
            await createBrowserSupabaseClient().auth.signOut({ scope: "local" }).catch(() => undefined);
            onError(error instanceof Error ? error.message : "Google 로그인에 실패했습니다.");
            onBusyChange(false);
            void renderGoogleButton();
          }
        })();
      },
    });

    parent.replaceChildren();
    googleId.renderButton(parent, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      locale: "ko",
      width: 280,
    });
  }

  return (
    <>
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void renderGoogleButton()}
        onError={() => onError("Google 로그인 스크립트를 불러오지 못했습니다.")}
      />
      <div ref={buttonRef} className={styles.googleIdentityButton} aria-label="Google 계정으로 계속" />
    </>
  );
}

export function GoogleIdentityButton({
  clientId,
  busy,
  onBusyChange,
  onSuccess,
  onError,
}: Props) {
  const environment = useSyncExternalStore(
    subscribeLoginEnvironment,
    getClientLoginEnvironment,
    () => SERVER_LOGIN_ENVIRONMENT
  );
  const [copied, setCopied] = useState(false);

  const startRedirectSignIn = useCallback(async () => {
    onBusyChange(true);
    onError("");
    try {
      const currentOrigin = window.location.origin;
      const authOrigin = getAuthSiteOrigin(currentOrigin);
      if (currentOrigin !== authOrigin) {
        window.location.replace(`${authOrigin}/?login=google`);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getSupabaseAuthCallbackUrl(currentOrigin),
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Google 리디렉션 로그인에 실패했습니다.");
      onBusyChange(false);
    }
  }, [onBusyChange, onError]);

  useEffect(() => {
    if (!environment.ready || environment.inAppName) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") !== "google") return;
    url.searchParams.delete("login");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    void startRedirectSignIn();
  }, [environment.inAppName, environment.ready, startRedirectSignIn]);

  async function copyCurrentAddress() {
    try {
      await navigator.clipboard.writeText(getAuthSiteOrigin(window.location.origin));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onError("주소를 복사하지 못했습니다. 브라우저 메뉴에서 외부 브라우저로 열어 주세요.");
    }
  }

  const currentOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const canonicalRedirectRequired = environment.ready && currentOrigin !== getAuthSiteOrigin(currentOrigin);
  const redirectIsPrimary = environment.mobile || canonicalRedirectRequired;

  return (
    <div className={`${styles.googleIdentityWrap} ${busy ? styles.googleIdentityBusy : ""}`} aria-busy={busy}>
      {environment.inAppName && (
        <div className={styles.inAppBrowserNotice} role="alert">
          <strong>외부 브라우저에서 열어 주세요</strong>
          <span>
            {environment.inAppName} 내부 브라우저에서는 Google 로그인이 제한될 수 있습니다.
            메뉴에서 Safari 또는 Chrome으로 열어 주세요.
          </span>
          <button type="button" className={styles.inAppCopyButton} onClick={() => void copyCurrentAddress()}>
            {copied ? "주소 복사 완료" : "운영 주소 복사"}
          </button>
        </div>
      )}

      {!environment.ready ? (
        <div className={styles.googleLoginPlaceholder} aria-label="로그인 환경 확인 중" />
      ) : redirectIsPrimary ? (
        <button
          type="button"
          className={styles.googleRedirectPrimary}
          onClick={() => void startRedirectSignIn()}
          disabled={busy || Boolean(environment.inAppName)}
        >
          <GoogleLogo />
          <span>Google 계정으로 계속</span>
        </button>
      ) : (
        <>
          <DesktopGoogleIdentityButton
            clientId={clientId}
            onBusyChange={onBusyChange}
            onSuccess={onSuccess}
            onError={onError}
          />
          <button
            type="button"
            className={styles.googleRedirectLoginButton}
            onClick={() => void startRedirectSignIn()}
            disabled={busy}
          >
            팝업이 안 열리면 리디렉션으로 로그인
          </button>
        </>
      )}
      {canonicalRedirectRequired && (
        <span className={styles.googleCanonicalHint}>
          로그인은 coffee-tide.dongple.kr에서 안전하게 계속됩니다.
        </span>
      )}
      {busy && <span className={styles.googleIdentityBusyText}>로그인 처리 중…</span>}
    </div>
  );
}
