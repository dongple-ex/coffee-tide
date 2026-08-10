"use client";

import React, { useRef } from "react";
import Script from "next/script";
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

export function GoogleIdentityButton({
  clientId,
  busy,
  onBusyChange,
  onSuccess,
  onError,
}: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);

  async function startRedirectSignIn() {
    onBusyChange(true);
    onError("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Google 리디렉션 로그인에 실패했습니다.");
      onBusyChange(false);
    }
  }

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
      width: 250,
    });
  }

  return (
    <div className={`${styles.googleIdentityWrap} ${busy ? styles.googleIdentityBusy : ""}`} aria-busy={busy}>
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void renderGoogleButton()}
        onError={() => onError("Google 로그인 스크립트를 불러오지 못했습니다.")}
      />
      <div ref={buttonRef} className={styles.googleIdentityButton} aria-label="Google 계정으로 계속" />
      <button
        type="button"
        className={styles.googleRedirectLoginButton}
        onClick={() => void startRedirectSignIn()}
        disabled={busy}
      >
        모바일에서 Google 로그인
      </button>
      {busy && <span className={styles.googleIdentityBusyText}>로그인 처리 중…</span>}
    </div>
  );
}
