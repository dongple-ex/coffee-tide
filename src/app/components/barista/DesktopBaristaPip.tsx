"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { minimizeConnectedMain, restoreConnectedMain, isDesktopMainManaged } from "@/lib/ui/desktopWindowControl";
import { bindGlobalShortcuts } from "@/lib/ui/shortcuts";
import { getPersonaEffect, getPersonaAvatar } from "@/lib/ai/personaEffects";
import { BaristaPipCard } from "./BaristaPipCard";
import { getPipChatHistory, type PipChatMessage, type PipChatTurn } from "./pipChat";


export interface DesktopBaristaPipProps {
  presetId?: string;
  baristaName?: string;
  displayContent?: string;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage?: (
    message: string,
    previousTurn?: { userText: string; aiText: string },
    history?: PipChatMessage[]
  ) => Promise<string | undefined> | void;
  onOpenCopilot?: () => void;
}

/** 메인 창의 스타일과 테마를 PiP 창으로 복제 주입 */
function copyStylesToPip(pipDoc: Document) {
  // link 태그 복제
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    const newLink = pipDoc.createElement("link");
    newLink.rel = "stylesheet";
    newLink.href = link.href;
    pipDoc.head.appendChild(newLink);
  });

  // inline style 태그 복제
  document.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    const newStyle = pipDoc.createElement("style");
    newStyle.textContent = style.textContent;
    pipDoc.head.appendChild(newStyle);
  });

  // dynamic styleSheets 규칙 복제
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      if (sheet.cssRules) {
        const newStyle = pipDoc.createElement("style");
        Array.from(sheet.cssRules).forEach((rule) => {
          newStyle.appendChild(pipDoc.createTextNode(rule.cssText));
        });
        pipDoc.head.appendChild(newStyle);
      }
    } catch {
      // cross-origin 스타일시트 접근 무시
    }
  });

  // 다크는 data-theme가 없는 상태다. 열린 카드에도 메인 창의 테마 변경을 반영한다.
  const syncTheme = () => {
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) pipDoc.documentElement.setAttribute("data-theme", theme);
    else pipDoc.documentElement.removeAttribute("data-theme");
    const light = theme === "light" || theme === "mega" || theme === "notebook";
    pipDoc.body.style.background = light ? "#faf6ef" : "#202020";
    pipDoc.documentElement.style.colorScheme = light ? "light" : "dark";
  };
  syncTheme();
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  pipDoc.defaultView?.addEventListener("pagehide", () => themeObserver.disconnect(), { once: true });

  // PiP 윈도우 바디 기본 스타일
  pipDoc.body.style.margin = "0";
  pipDoc.body.style.padding = "0";
  pipDoc.body.style.color = "var(--text, #0f172a)";
  pipDoc.body.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  pipDoc.body.style.overflow = "hidden";
  pipDoc.body.style.userSelect = "none";
}

export function DesktopBaristaPip({
  presetId = "karina",
  baristaName = "AI 바리스타",
  displayContent = "열심히 일하고 계시네요! 잠시 기지개 켜고 쉬어가세요 ☕",
  isOpen,
  onClose,
  onSendMessage,
  onOpenCopilot,
}: DesktopBaristaPipProps) {
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const openingRef = useRef(false);
  const wantsOpenRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const expandedSizeRef = useRef<{ width: number; height: number } | null>(null);

  const [turns, setTurns] = useState<PipChatTurn[]>([]);
  const turnsRef = useRef<PipChatTurn[]>([]);
  const turnId = useRef(0);
  const [isBouncing, setIsBouncing] = useState(false);
  const [moodIcon, setMoodIcon] = useState("☀️");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const requestInFlight = useRef(false);

  const effect = getPersonaEffect(presetId, baristaName);

  // 브라우저 상단 바와 이어지는 작은 바리스타 카드
  const openPipWindow = useCallback(async () => {
    if (typeof window === "undefined" || openingRef.current || pipWindowRef.current) return;

    if ("documentPictureInPicture" in window && window.documentPictureInPicture) {
      openingRef.current = true;
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 170,
          height: 200,
          preferInitialWindowPlacement: true,
        });

        if (!wantsOpenRef.current) {
          pipWin.close();
          return;
        }
        pipWindowRef.current = pipWin;
        setCollapsed(false);
        expandedSizeRef.current = null;
        pipWin.document.title = `☕ ${baristaName}`;

        copyStylesToPip(pipWin.document);

        const container = pipWin.document.createElement("div");
        container.id = "barista-pip-root";
        container.style.height = "100vh";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.boxSizing = "border-box";
        pipWin.document.body.appendChild(container);

        setPipContainer(container);

        const unbindShortcuts = bindGlobalShortcuts(pipWin, {
          onTriggerBarista: () => {
            if (isDesktopMainManaged()) { void restoreConnectedMain(); return; }
            // 닫힌 뒤 메인 탭에서 같은 단축키로 다시 열 수 있게 포커스를 돌린다.
            window.focus();
            pipWin.close();
          },
        });
        pipWin.addEventListener("pagehide", () => {
          unbindShortcuts();
          void restoreConnectedMain();
          if (pipWindowRef.current !== pipWin) return;
          wantsOpenRef.current = false;
          pipWindowRef.current = null;
          setPipContainer(null);
          onClose();
        }, { once: true });

        // PiP 창이 화면에 안정적으로 뜬 직후(250ms) 본창 최소화 트리거
        setTimeout(() => {
          if (pipWindowRef.current === pipWin && !pipWin.closed) {
            void minimizeConnectedMain();
          }
        }, 250);
      } catch (err) {
        console.warn("[DesktopBaristaPip] Document PiP 진입 실패:", err);
        onClose();
      } finally {
        openingRef.current = false;
      }
    } else {
      // Document PiP 미지원 시 알림
      alert("현재 브라우저에서는 화면 최상위 윈도우(Document PiP)가 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.");
      onClose();
    }
  }, [baristaName, onClose]);

  useEffect(() => {
    wantsOpenRef.current = isOpen;
    if (isOpen && !pipContainer) {
      void openPipWindow();
    } else if (!isOpen && pipContainer && pipWindowRef.current) {
      pipWindowRef.current.close();
      setPipContainer(null);
      pipWindowRef.current = null;
    }
  }, [isOpen, pipContainer, openPipWindow]);

  useEffect(() => () => {
    wantsOpenRef.current = false;
    const pipWin = pipWindowRef.current;
    pipWindowRef.current = null;
    pipWin?.close();
  }, []);

  const toggleCollapsed = () => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed) return;
    // resizeTo는 PiP 창 내부의 사용자 클릭 안에서 호출해야 한다.
    try {
      if (!collapsed) {
        expandedSizeRef.current = { width: pipWin.outerWidth, height: pipWin.outerHeight };
        const frameHeight = Math.max(0, pipWin.outerHeight - pipWin.innerHeight);
        pipWin.resizeTo(pipWin.outerWidth, frameHeight + 28);
      } else if (expandedSizeRef.current) {
        pipWin.resizeTo(expandedSizeRef.current.width, expandedSizeRef.current.height);
      }
    } catch (error) {
      // 크기 변경이 제한되어도 같은 창에서 내용을 접고 펼칠 수 있다.
      console.warn("[DesktopBaristaPip] 창 크기 변경 제한:", error);
    }
    setCollapsed(!collapsed);
  };

  const handleQuestion = async (input: string): Promise<boolean> => {
    const question = input.trim();
    if (!question || !onSendMessage || requestInFlight.current) return false;
    requestInFlight.current = true;
    const history = getPipChatHistory(turnsRef.current);
    const id = ++turnId.current;
    const updateTurns = (next: PipChatTurn[]) => {
      turnsRef.current = next;
      setTurns(next);
    };
    updateTurns([...turnsRef.current, { id, userText: question }]);
    setIsAiLoading(true);
    try {
      const answer = await onSendMessage(question, undefined, history);
      if (!answer?.trim()) throw new Error("empty-answer");
      updateTurns(turnsRef.current.map((turn) => turn.id === id ? { ...turn, aiText: answer } : turn));
      return true;
    } catch {
      updateTurns(turnsRef.current.map((turn) => turn.id === id
        ? { ...turn, error: "답변을 받지 못했어요. 다시 보내주세요." } : turn));
      return false;
    } finally {
      requestInFlight.current = false;
      setIsAiLoading(false);
    }
  };

  const handleBubbleClick = async () => {
    const drink = effect.menu[0]?.name || "시그니처 라떼";
    await handleQuestion(`${drink} 한 잔과 함께 따뜻한 한마디 해줘 ☕`);
  };

  const handleMoodSelect = async (emoji: string) => {
    if (requestInFlight.current) return;
    setMoodIcon(emoji);
    setIsBouncing(true);
    setTimeout(() => setIsBouncing(false), 300);
    await handleQuestion(`지금 내 기분은 ${emoji} 상태야. 기분에 맞는 한마디 해줘!`);
  };

  // 아바타 클릭 시: 브라우저 본화면(커피타이드 메인 탭)으로 화면 전환 및 코파일럿 활성화
  const handleAvatarClick = () => {
    void restoreConnectedMain();
    if (window.opener) {
      window.opener.focus();
    } else {
      window.focus();
    }
    onOpenCopilot?.();
  };

  if (!isOpen || !pipContainer) return null;

  return createPortal(
    <BaristaPipCard
      avatar={getPersonaAvatar(effect, isBouncing)}
      speech={displayContent}
      turns={turns}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      draft={draft}
      onDraftChange={setDraft}
      mood={moodIcon}
      loading={isAiLoading}
      bouncing={isBouncing}
      onAsk={onSendMessage ? handleQuestion : undefined}
      onTalk={() => { void handleBubbleClick(); }}
      onOpen={handleAvatarClick}
      onMood={(emoji) => { void handleMoodSelect(emoji); }}
    />,
    pipContainer
  );
}
