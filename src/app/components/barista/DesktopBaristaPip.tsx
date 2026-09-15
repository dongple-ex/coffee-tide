"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getPersonaEffect, getPersonaAvatar } from "@/lib/ai/personaEffects";


export interface DesktopBaristaPipProps {
  presetId?: string;
  baristaName?: string;
  displayTitle?: string;
  displayContent?: string;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage?: (
    message: string,
    previousTurn?: { userText: string; aiText: string }
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

  // 테마 속성 복제
  const theme = document.documentElement.getAttribute("data-theme") || "notebook";
  pipDoc.documentElement.setAttribute("data-theme", theme);

  // 둥실둥실 펫 애니메이션 주입
  const animStyle = pipDoc.createElement("style");
  animStyle.textContent = `
    @keyframes ct-pet-float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-4px); }
    }
  `;
  pipDoc.head.appendChild(animStyle);

  // PiP 윈도우 바디 기본 스타일
  pipDoc.body.style.margin = "0";
  pipDoc.body.style.padding = "0";
  pipDoc.body.style.background = "var(--bg, #f8fafc)";
  pipDoc.body.style.color = "var(--text, #0f172a)";
  pipDoc.body.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  pipDoc.body.style.overflow = "hidden";
  pipDoc.body.style.userSelect = "none";
}

export function DesktopBaristaPip({
  presetId = "karina",
  baristaName = "AI 바리스타",
  displayTitle = "잠시 커피 한잔 어때요?",
  displayContent = "열심히 일하고 계시네요! 잠시 기지개 켜고 쉬어가세요 ☕",
  isOpen,
  onClose,
  onSendMessage,
  onOpenCopilot,
}: DesktopBaristaPipProps) {
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);

  const [chatReply, setChatReply] = useState<string | null>(null);
  const [isBouncing, setIsBouncing] = useState(false);
  const [servedToast, setServedToast] = useState<string | null>(null);
  const [moodIcon, setMoodIcon] = useState("☀️");
  const [isHovered, setIsHovered] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const effect = getPersonaEffect(presetId, baristaName);

  // 웹 본화면의 AI 대화(displayContent)가 업데이트되면 데스크톱 말풍선에도 즉시 반영
  useEffect(() => {
    if (displayContent) {
      setChatReply(null);
      setServedToast(null);
    }
  }, [displayContent]);

  // PiP 창 열기 (코덱스처럼 컴팩트한 초소형 펫 규격: 170x230)
  const openPipWindow = useCallback(async () => {
    if (typeof window === "undefined") return;

    if ("documentPictureInPicture" in window && window.documentPictureInPicture) {
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 170,
          height: 230,
        });

        pipWindowRef.current = pipWin;
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

        pipWin.addEventListener("pagehide", () => {
          setPipContainer(null);
          pipWindowRef.current = null;
          onClose();
        });
      } catch (err) {
        console.warn("[DesktopBaristaPip] Document PiP 진입 실패:", err);
        onClose();
      }
    } else {
      // Document PiP 미지원 시 알림
      alert("현재 브라우저에서는 화면 최상위 윈도우(Document PiP)가 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.");
      onClose();
    }
  }, [baristaName, onClose]);

  useEffect(() => {
    if (isOpen && !pipContainer) {
      void openPipWindow();
    } else if (!isOpen && pipContainer && pipWindowRef.current) {
      pipWindowRef.current.close();
      setPipContainer(null);
      pipWindowRef.current = null;
    }
  }, [isOpen, pipContainer, openPipWindow]);

  const quoteIndexRef = useRef(0);

  // 말풍선 터치 / 벨 울리기: 콩콩 뛰는 모션 + 웹 AI 대화 양방향 연동
  const handleBubbleClick = async () => {
    setIsBouncing(true);
    setTimeout(() => setIsBouncing(false), 450);

    const drink = effect.menu[0]?.name || "시그니처 라떼";
    const servedLine = effect.servedMessage
      ? effect.servedMessage(baristaName, drink)
      : `✨ 주문하신 ${drink} 나왔습니다! 오늘도 반짝이는 하루 되세요 🌟`;

    const quotes = [
      servedLine,
      "팀장님 힘내세요! ☕",
      "잠깐 기지개 켜실래요? ✨",
      "오늘도 파이팅이에요! 🥰",
      "커피 한 잔의 여유를 가져요 🍀",
      "집중력 부스터 풀가동! ⚡",
      "수분 섭취도 잊지 마세요! 💧",
      "스트레칭 3초만 해볼까요? 🙆‍♂️",
    ];

    const nextQuote = quotes[quoteIndexRef.current % quotes.length];
    quoteIndexRef.current += 1;

    // 1단계: 즉각 반응으로 사용자 인터랙션 즉시 만족
    if (nextQuote === servedLine) {
      setServedToast(servedLine);
      setTimeout(() => setServedToast(null), 5000);
    } else {
      setServedToast(null);
      setChatReply(nextQuote);
    }

    // 2단계: 웹 메인 AI 엔진(onSendMessage)과 실시간 연동하여 실제 대화 생성 & 기록
    if (onSendMessage && !isAiLoading) {
      setIsAiLoading(true);
      try {
        const prompt = nextQuote === servedLine
          ? `시그니처 음료인 ${drink} 한 잔과 함께 기분 전환되는 따뜻한 한마디 해줘 ☕`
          : `${nextQuote}와 관련해서 오늘 업무에 도움되는 맞춤 격려나 짧은 팁 한마디 해줘! ✨`;
        const aiAnswer = await onSendMessage(prompt);
        if (aiAnswer) {
          setServedToast(null);
          setChatReply(aiAnswer);
        }
      } catch {
        // 네트워크 장애 시 1단계의 즉각 멘트 유지
      } finally {
        setIsAiLoading(false);
      }
    }
  };

  const moodReplies: Record<string, string> = {
    "☀️": "화창한 날씨처럼 맑고 힘찬 에너지 충전! ☀️",
    "☕": "지금 딱 맛있는 핸드드립 한 잔 내려드릴게요 ☕",
    "🌸": "잠시 먼 산이나 창밖을 보며 눈을 쉬어주세요 🌸",
    "🌙": "오늘 하루도 정말 고생 많으셨어요. 차분하게 마무리해봐요 🌙",
  };

  const handleMoodSelect = async (emoji: string) => {
    setMoodIcon(emoji);
    setIsBouncing(true);
    setTimeout(() => setIsBouncing(false), 300);
    if (moodReplies[emoji]) {
      setServedToast(null);
      setChatReply(moodReplies[emoji]);
    }

    // 이모지 기분 상태를 웹 AI에 전달하여 맞춤 피드백 연동
    if (onSendMessage && !isAiLoading) {
      setIsAiLoading(true);
      try {
        const prompt = `지금 내 기분은 ${emoji} 상태야. 바리스타로서 기분에 맞는 센스 있는 한마디 해줘!`;
        const aiAnswer = await onSendMessage(prompt);
        if (aiAnswer) {
          setServedToast(null);
          setChatReply(aiAnswer);
        }
      } catch {
        // fallback
      } finally {
        setIsAiLoading(false);
      }
    }
  };

  // 아바타 클릭 시: 브라우저 본화면(커피타이드 메인 탭)으로 화면 전환 및 코파일럿 활성화
  const handleAvatarClick = () => {
    if (window.opener) {
      window.opener.focus();
    } else {
      window.focus();
    }
    onOpenCopilot?.();
  };

  if (!isOpen || !pipContainer) return null;

  // 말풍선 대사: 생각 중 상태이거나 AI 응답 또는 서빙 멘트 노출
  const rawSpeech = isAiLoading
    ? `*${baristaName}가 생각 중...* 💭`
    : servedToast || chatReply || displayContent || "오늘도 힘내세요! ☕";
  const displaySpeech = rawSpeech.length > 55 ? rawSpeech.slice(0, 52) + "…" : rawSpeech;

  return createPortal(
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: "8px",
        boxSizing: "border-box",
        background: "var(--bg-card, var(--card, #ffffff))",
        color: "var(--text, #0f172a)",
        overflow: "hidden",
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* 마우스 호버 시에만 나타나는 초소형 미니 컨트롤 (✕, ↗) */}
      <div
        style={{
          position: "absolute",
          top: "4px",
          right: "5px",
          display: "flex",
          alignItems: "center",
          gap: "3px",
          opacity: isHovered ? 1 : 0,
          transition: "opacity 0.2s ease",
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={handleAvatarClick}
          title="본화면 열기"
          style={{
            border: "none",
            background: "rgba(0, 0, 0, 0.45)",
            color: "#ffffff",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            fontSize: "0.68rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          ↗
        </button>
        <button
          type="button"
          onClick={() => {
            if (pipWindowRef.current) pipWindowRef.current.close();
          }}
          title="닫기"
          style={{
            border: "none",
            background: "rgba(0, 0, 0, 0.45)",
            color: "#ffffff",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            fontSize: "0.68rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* 펫 클러스터 (말풍선 + 아바타 + 캡슐 버튼 바를 한 덩어리로 단단히 묶음) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          width: "100%",
          maxWidth: "155px",
        }}
      >
        {/* 1. 꼬리가 달린 만화 말풍선 (Cartoon Speech Bubble) - 터치 시 콩콩 뛰며 격려 및 서빙 멘트 순환 */}
        <div
          onClick={handleBubbleClick}
          title="말풍선 터치 (콩콩 뛰는 모션 / 격려 멘트 & 커피 주문)"
          style={{
            position: "relative",
            background: "var(--card, #ffffff)",
            border: "1.5px solid var(--border, rgba(0, 0, 0, 0.1))",
            borderRadius: "14px",
            padding: "6px 10px",
            fontSize: "0.72rem",
            lineHeight: 1.35,
            color: "var(--text, #1e293b)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)",
            textAlign: "center",
            wordBreak: "break-word",
            cursor: "pointer",
            width: "100%",
            boxSizing: "border-box",
            marginBottom: "3px",
            transition: "transform 0.15s ease",
          }}
        >
          <span
            style={{
              fontWeight: servedToast ? 700 : 550,
              color: servedToast
                ? (effect.accent || "var(--persona-accent, #d97706)")
                : "inherit",
            }}
          >
            {displaySpeech}
          </span>

          {/* 말풍선 삼각형 꼬리 (아래쪽 아바타 정수리를 가리킴) */}
          <div
            style={{
              position: "absolute",
              bottom: "-7px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "7px solid var(--border, rgba(0, 0, 0, 0.12))",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-5px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "6px solid var(--card, #ffffff)",
            }}
          />
        </div>

        {/* 2. 바리스타 캐릭터 원형 아바타 (터치 시 메인 탭으로 전환) */}
        <div
          onClick={handleAvatarClick}
          title="클릭하여 커피타이드 메인 탭으로 전환"
          style={{
            position: "relative",
            width: "92px",
            height: "92px",
            borderRadius: "50%",
            padding: "2px",
            cursor: "pointer",
            transition: "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            transform: isBouncing ? "scale(1.15) translateY(-4px)" : "scale(1)",
            animation: isBouncing ? "none" : "ct-pet-float 3.2s ease-in-out infinite",
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPersonaAvatar(effect, isBouncing)}
            alt={baristaName}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              objectFit: "cover",
              border: `2.5px solid ${effect.accent || "#f59e0b"}`,
              boxShadow: `0 4px 14px ${effect.accent || "#f59e0b"}40`,
              display: "block",
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/barista/barista_male_3d_serving.jpg";
            }}
          />

          {/* 기분 이모지 뱃지 */}
          <span
            style={{
              position: "absolute",
              bottom: "1px",
              right: "1px",
              fontSize: "0.85rem",
              background: "var(--card, #fff)",
              borderRadius: "50%",
              padding: "2px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.2)",
              lineHeight: 1,
            }}
          >
            {moodIcon}
          </span>
        </div>

        {/* 3. 미니 캡슐 액션 바 (빨간 동그라미 하단 버튼 바) */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            background: "var(--card-hover, rgba(0, 0, 0, 0.04))",
            border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
            borderRadius: "999px",
            padding: "3px 6px",
            marginTop: "3px",
            flexShrink: 0,
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
          }}
        >
          <button
            type="button"
            onClick={handleBubbleClick}
            style={{
              border: "none",
              background: effect.accent || "var(--persona-accent, #f59e0b)",
              color: "#ffffff",
              borderRadius: "999px",
              padding: "2.5px 8px",
              fontSize: "0.68rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.18)",
              transition: "transform 0.15s ease",
            }}
            title="벨 울리기 (콩콩 모션 & 커피 서빙)"
          >
            <span>🔔</span>
            <span>벨</span>
          </button>

          {["☀️", "☕", "🌸", "🌙"].map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleMoodSelect(emoji)}
              style={{
                border: "none",
                background: moodIcon === emoji ? "var(--card, #fff)" : "transparent",
                borderRadius: "50%",
                width: "22px",
                height: "22px",
                padding: 0,
                fontSize: "0.72rem",
                cursor: "pointer",
                boxShadow: moodIcon === emoji ? "0 1px 3px rgba(0, 0, 0, 0.15)" : "none",
                transition: "transform 0.12s ease",
              }}
              title={`${emoji} 기분 설정`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>,
    pipContainer
  );
}
