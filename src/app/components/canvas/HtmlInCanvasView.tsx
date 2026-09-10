"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import MarkdownLite from "../markdownLite";
import { checkHtmlInCanvasSupport, HtmlInCanvasStatus, drawElementToCanvas } from "@/lib/canvas/htmlInCanvas";
import { UiIcon } from "../UiIcon";
import styles from "../../page.module.css";

interface Props {
  content: string;
  title: string;
  docType: string;
}

type ViewStyle = "book" | "chalkboard" | "postit" | "diary";
type FloatMotion = "gentle" | "zeroG" | "orbit" | "breathe" | "none";

const FLOAT_MOTIONS: { id: FloatMotion; label: string; icon: string }[] = [
  { id: "gentle", label: "잔잔한 물결", icon: "🌊" },
  { id: "zeroG", label: "무중력 유영", icon: "🪐" },
  { id: "orbit", label: "턴테이블", icon: "💫" },
  { id: "breathe", label: "호흡 펄스", icon: "🫀" },
  { id: "none", label: "부유 끄기", icon: "⏸️" },
];

/**
 * 1. 텍스트를 양면 책(Two-Page Book) 각 쪽에 맞게 분할
 */
function splitContentIntoBookPages(content: string): string[] {
  if (!content || !content.trim()) {
    return [
      "## 📖 문서 시작\n\n작성된 내용이 없습니다.",
      "오른쪽 페이지가 비어 있습니다."
    ];
  }

  if (content.includes("<!-- pagebreak -->")) {
    const explicit = content
      .split("<!-- pagebreak -->")
      .map((p) => p.trim())
      .filter(Boolean);
    if (explicit.length > 0) {
      if (explicit.length % 2 !== 0) explicit.push("*다음 내용 없음*");
      return explicit;
    }
  }

  const lines = content.split("\n");
  const pages: string[] = [];
  let currentChunk: string[] = [];
  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,3}\s/.test(line.trim());
    const isDivider = /^---+\s*$/.test(line.trim());

    if ((isHeading || isDivider) && currentChunk.length > 0 && charCount >= 140) {
      pages.push(currentChunk.join("\n").trim());
      currentChunk = [];
      charCount = 0;
      if (isDivider) continue;
    }

    currentChunk.push(line);
    charCount += line.length + 1;

    if (line.trim() === "" && charCount >= 280 && currentChunk.length >= 3) {
      pages.push(currentChunk.join("\n").trim());
      currentChunk = [];
      charCount = 0;
    }
  }

  if (currentChunk.length > 0) {
    const remaining = currentChunk.join("\n").trim();
    if (remaining) {
      if (remaining.length < 60 && pages.length > 0) {
        pages[pages.length - 1] += "\n\n" + remaining;
      } else {
        pages.push(remaining);
      }
    }
  }

  if (pages.length === 0) {
    pages.push("## 시작\n\n내용 없음", "오른쪽 페이지");
  } else if (pages.length === 1) {
    pages.push("*추가 작성된 내용이 없습니다.*");
  } else if (pages.length % 2 !== 0) {
    pages.push("*[커피타이드 리포트 끝]*\n\n오늘도 수고 많으셨습니다 ☕");
  }

  return pages;
}

/**
 * 2. 텍스트를 단면 수첩(Single-Page Notebook) 여러 장으로 분할
 */
function splitContentIntoNotebookPages(content: string): string[] {
  if (!content || !content.trim()) {
    return ["작성된 내용이 없습니다."];
  }

  if (content.includes("<!-- pagebreak -->")) {
    const explicit = content
      .split("<!-- pagebreak -->")
      .map((p) => p.trim())
      .filter(Boolean);
    if (explicit.length > 0) return explicit;
  }

  const lines = content.split("\n");
  const pages: string[] = [];
  let currentChunk: string[] = [];
  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,3}\s/.test(line.trim());
    const isDivider = /^---+\s*$/.test(line.trim());

    if ((isHeading || isDivider) && currentChunk.length > 0 && charCount >= 180) {
      pages.push(currentChunk.join("\n").trim());
      currentChunk = [];
      charCount = 0;
      if (isDivider) continue;
    }

    currentChunk.push(line);
    charCount += line.length + 1;

    if (line.trim() === "" && charCount >= 380 && currentChunk.length >= 4) {
      pages.push(currentChunk.join("\n").trim());
      currentChunk = [];
      charCount = 0;
    }
  }

  if (currentChunk.length > 0) {
    const remaining = currentChunk.join("\n").trim();
    if (remaining) {
      if (remaining.length < 80 && pages.length > 0) {
        pages[pages.length - 1] += "\n\n" + remaining;
      } else {
        pages.push(remaining);
      }
    }
  }

  return pages.length > 0 ? pages : [content];
}

/**
 * 3. 텍스트를 포스트잇(Post-it Sticky Note) 짧은 메모 여러 장으로 분할
 */
function splitContentIntoPostitNotes(content: string): string[] {
  if (!content || !content.trim()) {
    return ["📌 작성된 메모가 없습니다."];
  }

  if (content.includes("<!-- pagebreak -->")) {
    const explicit = content
      .split("<!-- pagebreak -->")
      .map((p) => p.trim())
      .filter(Boolean);
    if (explicit.length > 0) return explicit;
  }

  const lines = content.split("\n");
  const notes: string[] = [];
  let currentChunk: string[] = [];
  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,3}\s/.test(line.trim());
    const isDivider = /^---+\s*$/.test(line.trim());

    // 포스트잇은 작고 간결하게 120자 이상에서 적극 분할
    if ((isHeading || isDivider) && currentChunk.length > 0 && charCount >= 100) {
      notes.push(currentChunk.join("\n").trim());
      currentChunk = [];
      charCount = 0;
      if (isDivider) continue;
    }

    currentChunk.push(line);
    charCount += line.length + 1;

    if (charCount >= 220 && (line.trim() === "" || line.startsWith("*") || line.startsWith("-"))) {
      notes.push(currentChunk.join("\n").trim());
      currentChunk = [];
      charCount = 0;
    }
  }

  if (currentChunk.length > 0) {
    const remaining = currentChunk.join("\n").trim();
    if (remaining) notes.push(remaining);
  }

  return notes.length > 0 ? notes : [content];
}

// 🔍 줌 레벨: 50%부터 115%까지 선택 폭 대폭 확장
const ZOOM_LEVELS = [0.5, 0.65, 0.8, 1.0, 1.15];

export function HtmlInCanvasView({ content, title, docType }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status] = useState<HtmlInCanvasStatus | null>(() => {
    if (typeof window === "undefined") return null;
    return checkHtmlInCanvasSupport();
  });

  // 🌟 보기 모드: 'book' | 'notebook' | 'postit'
  const [viewStyle, setViewStyle] = useState<ViewStyle>("book");

  // 🌟 부유 모션: gentle, zeroG, orbit, breathe, none
  const [floatMotion, setFloatMotion] = useState<FloatMotion>("gentle");

  // 🗺️ 미니맵 표시 여부 (글씨 가림 방지를 위한 숨기기/펼치기)
  const [showMinimap, setShowMinimap] = useState(true);

  // 1. 양면 책 상태
  const bookPages = useMemo(() => splitContentIntoBookPages(content), [content]);
  const totalSpreads = Math.max(1, Math.ceil(bookPages.length / 2));
  const [currentSpread, setCurrentSpread] = useState(0);
  const [bookFlipState, setBookFlipState] = useState<{
    isFlipping: boolean;
    direction: "next" | "prev" | null;
    leavingSpread: number;
  }>({
    isFlipping: false,
    direction: null,
    leavingSpread: 0,
  });

  // 2. 단면 수첩 상태
  const notebookPages = useMemo(() => splitContentIntoNotebookPages(content), [content]);
  const [currentNotebookPage, setCurrentNotebookPage] = useState(0);
  const [notebookFlipState, setNotebookFlipState] = useState<{
    isFlipping: boolean;
    direction: "next" | "prev" | null;
    leavingPage: number;
  }>({
    isFlipping: false,
    direction: null,
    leavingPage: 0,
  });

  // 3. 🟡 포스트잇 뜯기 상태
  const postitNotes = useMemo(() => splitContentIntoPostitNotes(content), [content]);
  const [currentPostitIndex, setCurrentPostitIndex] = useState(0);
  const [isTearing, setIsTearing] = useState(false);
  const [tearingIndex, setTearingIndex] = useState<number | null>(null);

  const [tilt, setTilt] = useState<{ rotateX: number; rotateY: number; glareX: number; glareY: number }>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 50,
  });

  const [zoom, setZoom] = useState(1);

  // 📱 뷰포트 가용 너비 실시간 감지 (반응형 자동 폭 맞춤)
  const [containerWidth, setContainerWidth] = useState<number>(1000);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cycleZoom = useCallback(() => {
    setZoom((current) => {
      const idx = ZOOM_LEVELS.findIndex((z) => Math.abs(z - current) < 0.04);
      const nextIdx = (idx + 1) % ZOOM_LEVELS.length;
      return ZOOM_LEVELS[nextIdx];
    });
  }, []);

  // 양면 책 넘김 트리거
  const triggerBookFlip = useCallback(
    (direction: "next" | "prev") => {
      if (bookFlipState.isFlipping) return;

      if (direction === "next") {
        if (currentSpread >= totalSpreads - 1) return;
        const leaving = currentSpread;
        setBookFlipState({ isFlipping: true, direction: "next", leavingSpread: leaving });
        setTimeout(() => {
          setCurrentSpread(leaving + 1);
          setBookFlipState({ isFlipping: false, direction: null, leavingSpread: leaving + 1 });
        }, 640);
      } else {
        if (currentSpread <= 0) return;
        const leaving = currentSpread;
        setBookFlipState({ isFlipping: true, direction: "prev", leavingSpread: leaving });
        setTimeout(() => {
          setCurrentSpread(leaving - 1);
          setBookFlipState({ isFlipping: false, direction: null, leavingSpread: leaving - 1 });
        }, 640);
      }
    },
    [bookFlipState.isFlipping, currentSpread, totalSpreads]
  );

  const jumpToSpread = useCallback(
    (target: number) => {
      if (bookFlipState.isFlipping || target === currentSpread) return;
      if (target < 0 || target >= totalSpreads) return;
      triggerBookFlip(target > currentSpread ? "next" : "prev");
    },
    [bookFlipState.isFlipping, currentSpread, totalSpreads, triggerBookFlip]
  );

  // 단면 수첩 넘김 트리거
  const triggerNotebookFlip = useCallback(
    (targetPage: number) => {
      if (notebookFlipState.isFlipping || targetPage === currentNotebookPage) return;
      if (targetPage < 0 || targetPage >= notebookPages.length) return;

      const direction = targetPage > currentNotebookPage ? "next" : "prev";
      const leaving = currentNotebookPage;

      setNotebookFlipState({ isFlipping: true, direction, leavingPage: leaving });
      setTimeout(() => {
        setCurrentNotebookPage(targetPage);
        setNotebookFlipState({ isFlipping: false, direction: null, leavingPage: targetPage });
      }, 540);
    },
    [notebookFlipState.isFlipping, currentNotebookPage, notebookPages.length]
  );

  // 🟡 포스트잇 한 장 뜯어 없애기 함수
  const tearCurrentPostit = useCallback(() => {
    if (isTearing || currentPostitIndex >= postitNotes.length) return;
    setIsTearing(true);
    setTearingIndex(currentPostitIndex);

    setTimeout(() => {
      setCurrentPostitIndex((idx) => idx + 1);
      setIsTearing(false);
      setTearingIndex(null);
    }, 460);
  }, [isTearing, currentPostitIndex, postitNotes.length]);

  // 포스트잇 처음으로 리셋
  const resetPostitPad = useCallback(() => {
    setCurrentPostitIndex(0);
    setIsTearing(false);
    setTearingIndex(null);
  }, []);

  // 키보드 넘김 및 뜯기 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (viewStyle === "book" || viewStyle === "diary") {
        if (e.key === "ArrowRight" || e.key === "PageDown") triggerBookFlip("next");
        else if (e.key === "ArrowLeft" || e.key === "PageUp") triggerBookFlip("prev");
      } else if (viewStyle === "chalkboard") {
        if (e.key === "ArrowRight" || e.key === "PageDown") {
          if (currentNotebookPage < notebookPages.length - 1) triggerNotebookFlip(currentNotebookPage + 1);
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          if (currentNotebookPage > 0) triggerNotebookFlip(currentNotebookPage - 1);
        }
      } else if (viewStyle === "postit") {
        if (e.key === "ArrowRight" || e.key === " " || e.key === "Delete" || e.key === "Enter") {
          tearCurrentPostit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewStyle, currentNotebookPage, notebookPages.length, triggerBookFlip, triggerNotebookFlip, tearCurrentPostit]);

  // 🌟 마우스 이동 3D 틸트 (부유 끄기일 때는 절대 안 움직이도록 0도 완전 고정!)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 🔒 사용자가 "부유 끄기"를 선택했을 때는 마우스 오버 시에도 전혀 기울어지지 않고 광원은 오른쪽 맨 위 완전 고정!
      if (floatMotion === "none") {
        setTilt({ rotateX: 0, rotateY: 0, glareX: 88, glareY: 12 });
        return;
      }

      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const factor = (viewStyle === "book" || viewStyle === "diary") ? 6 : 8;
      const rotateY = ((x - centerX) / centerX) * factor;
      const rotateX = -((y - centerY) / centerY) * factor;

      const glareX = (x / rect.width) * 100;
      const glareY = (y / rect.height) * 100;

      setTilt({ rotateX, rotateY, glareX, glareY });
    },
    [viewStyle, floatMotion]
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({
      rotateX: 0,
      rotateY: 0,
      glareX: floatMotion === "none" ? 88 : 50,
      glareY: floatMotion === "none" ? 12 : 50,
    });
  }, [floatMotion]);

  // Canvas 실시간 drawElementImage 렌더링 시도
  useEffect(() => {
    const canvas = canvasRef.current;
    const cardEl = cardRef.current;
    if (!canvas || !cardEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;

    const renderLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const drawn = drawElementToCanvas(ctx, cardEl, 0, 0, canvas.width, canvas.height);

      if (!drawn) {
        ctx.strokeStyle = "rgba(100, 160, 255, 0.08)";
        ctx.lineWidth = 1;
        const step = 32;
        for (let x = 0; x < canvas.width; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }

      animFrame = requestAnimationFrame(renderLoop);
    };

    animFrame = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrame);
  }, [content, currentSpread, currentNotebookPage, currentPostitIndex, viewStyle]);

  // 실시간 미니맵 렌더링
  useEffect(() => {
    if (!showMinimap) return;
    const minimap = minimapCanvasRef.current;
    if (!minimap) return;

    const ctx = minimap.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, minimap.width, minimap.height);

    ctx.fillStyle = "rgba(18, 22, 30, 0.92)";
    ctx.fillRect(0, 0, minimap.width, minimap.height);

    if (viewStyle === "book") {
      ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
      ctx.font = "10px sans-serif";
      ctx.fillText(`양면 책 ${totalSpreads}펼침 (${bookPages.length}쪽)`, 10, 15);

      const padding = 10;
      const availableH = minimap.height - padding * 2 - 16;
      const slotH = Math.min(36, Math.max(18, Math.floor(availableH / totalSpreads) - 4));
      const bookW = minimap.width - padding * 2;
      const halfW = (bookW - 4) / 2;

      for (let s = 0; s < totalSpreads; s++) {
        const y = 22 + s * (slotH + 4);
        const isCurrent = s === currentSpread;

        ctx.fillStyle = isCurrent ? "rgba(59, 130, 246, 0.25)" : "rgba(255, 255, 255, 0.04)";
        ctx.strokeStyle = isCurrent ? "rgba(96, 165, 250, 0.8)" : "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = isCurrent ? 1.5 : 1;
        ctx.beginPath();
        ctx.roundRect(padding, y, halfW, slotH, [3, 0, 0, 3]);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(padding + halfW + 4, y, halfW, slotH, [0, 3, 3, 0]);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isCurrent ? "#3b82f6" : "rgba(255, 255, 255, 0.25)";
        ctx.fillRect(padding + halfW + 1, y, 2, slotH);

        ctx.fillStyle = isCurrent ? "#93c5fd" : "rgba(255, 255, 255, 0.45)";
        ctx.font = isCurrent ? "bold 9px sans-serif" : "8px sans-serif";
        ctx.fillText(`${s * 2 + 1}`, padding + 4, y + slotH / 2 + 3);
        ctx.fillText(`${s * 2 + 2}`, padding + halfW + 8, y + slotH / 2 + 3);
      }
    } else if (viewStyle === "chalkboard") {
      ctx.fillStyle = "#86efac";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`🏫 칠판 총 ${notebookPages.length}면`, 10, 15);

      const padding = 10;
      const availableH = minimap.height - padding * 2 - 16;
      const slotH = Math.min(32, Math.max(16, Math.floor(availableH / notebookPages.length) - 4));

      notebookPages.forEach((p, idx) => {
        const y = 22 + idx * (slotH + 4);
        const isCurrent = idx === currentNotebookPage;

        // 원목 프레임 + 다크 그린 칠판
        ctx.fillStyle = isCurrent ? "rgba(22, 101, 52, 0.75)" : "rgba(18, 38, 27, 0.7)";
        ctx.strokeStyle = isCurrent ? "#fef08a" : "rgba(180, 83, 9, 0.65)";
        ctx.lineWidth = isCurrent ? 1.5 : 1;

        ctx.beginPath();
        ctx.roundRect(padding, y, minimap.width - padding * 2, slotH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isCurrent ? "#fef08a" : "rgba(255, 255, 255, 0.65)";
        ctx.font = isCurrent ? "bold 10px sans-serif" : "9px sans-serif";
        ctx.fillText(`칠판 ${idx + 1}`, padding + 6, y + slotH / 2 + 3);

        const lineLen = Math.min(45, Math.floor(p.length / 12));
        ctx.fillStyle = isCurrent ? "rgba(254, 240, 138, 0.75)" : "rgba(255, 255, 255, 0.25)";
        ctx.fillRect(padding + 48, y + slotH / 2 - 2, lineLen, 3);
      });
    } else if (viewStyle === "diary") {
      // 📔 6공 다이어리 미니맵
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`📔 6공 다이어리`, 10, 15);

      const padding = 10;
      const availableH = minimap.height - padding * 2 - 16;
      const slotH = Math.min(36, Math.max(18, Math.floor(availableH / totalSpreads) - 4));

      for (let s = 0; s < totalSpreads; s++) {
        const y = 22 + s * (slotH + 4);
        const isCurrent = s === currentSpread;

        ctx.fillStyle = isCurrent ? "rgba(56, 189, 248, 0.28)" : "rgba(255, 255, 255, 0.05)";
        ctx.strokeStyle = isCurrent ? "rgba(56, 189, 248, 0.85)" : "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = isCurrent ? 1.5 : 1;

        ctx.beginPath();
        ctx.roundRect(padding, y, minimap.width - padding * 2, slotH, 4);
        ctx.fill();
        ctx.stroke();

        // 중앙 6공 링 표시
        ctx.fillStyle = isCurrent ? "#38bdf8" : "rgba(255, 255, 255, 0.4)";
        const midX = minimap.width / 2;
        for (let r = 0; r < 6; r++) {
          const ringY = y + 4 + (r * (slotH - 8)) / 5;
          ctx.fillRect(midX - 1, ringY, 2, 2);
        }

        ctx.fillStyle = isCurrent ? "#7dd3fc" : "rgba(255, 255, 255, 0.55)";
        ctx.font = isCurrent ? "bold 10px sans-serif" : "9px sans-serif";
        ctx.fillText(`${s + 1}속지`, padding + 4, y + slotH / 2 + 3);
      }
    } else {
      // 🟡 포스트잇 미니맵
      const total = postitNotes.length;
      const remaining = Math.max(0, total - currentPostitIndex);
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`🟡 포스트잇 패드`, 10, 15);

      const padding = 14;
      const padW = minimap.width - padding * 2;
      const padH = 120;
      const topY = 38;

      // 스티키 노트 더미 그림자
      for (let i = Math.min(4, remaining); i >= 0; i--) {
        ctx.fillStyle = i === 0 ? "#fef08a" : i === 1 ? "#fde047" : "#eab308";
        ctx.strokeStyle = "rgba(202, 138, 4, 0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(padding + i * 2, topY + i * 3, padW - i * 4, padH - i * 4, 3);
        ctx.fill();
        ctx.stroke();
      }

      // 상단 테이프 표시
      ctx.fillStyle = "rgba(254, 240, 138, 0.8)";
      ctx.fillRect(minimap.width / 2 - 20, topY - 4, 40, 8);
    }
  }, [viewStyle, totalSpreads, currentSpread, bookPages.length, notebookPages, currentNotebookPage, postitNotes.length, currentPostitIndex, showMinimap]);

  // 미니맵 클릭 핸들러
  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const padding = 10;

    if (viewStyle === "book" || viewStyle === "diary") {
      if (totalSpreads <= 1) return;
      const availableH = canvas.height - padding * 2 - 16;
      const slotH = Math.min(36, Math.max(18, Math.floor(availableH / totalSpreads) - 4));
      for (let s = 0; s < totalSpreads; s++) {
        const slotY = 22 + s * (slotH + 4);
        if (y >= slotY && y <= slotY + slotH) {
          jumpToSpread(s);
          break;
        }
      }
    } else if (viewStyle === "chalkboard") {
      if (notebookPages.length <= 1) return;
      const availableH = canvas.height - padding * 2 - 16;
      const slotH = Math.min(32, Math.max(16, Math.floor(availableH / notebookPages.length) - 4));
      for (let idx = 0; idx < notebookPages.length; idx++) {
        const slotY = 22 + idx * (slotH + 4);
        if (y >= slotY && y <= slotY + slotH) {
          triggerNotebookFlip(idx);
          break;
        }
      }
    } else {
      // 포스트잇 미니맵 클릭 시 다음 장 뜯기
      tearCurrentPostit();
    }
  };

  const cycleFloatMotion = () => {
    const currentIndex = FLOAT_MOTIONS.findIndex((m) => m.id === floatMotion);
    const nextIndex = (currentIndex + 1) % FLOAT_MOTIONS.length;
    setFloatMotion(FLOAT_MOTIONS[nextIndex].id);
  };

  const getFloatClass = () => {
    switch (floatMotion) {
      case "gentle":
        return styles.htmlInCanvasFloatGentle;
      case "zeroG":
        return styles.htmlInCanvasFloatZeroG;
      case "orbit":
        return styles.htmlInCanvasFloatOrbit;
      case "breathe":
        return styles.htmlInCanvasFloatBreathe;
      default:
        return "";
    }
  };

  const currentFloatMotionMeta = FLOAT_MOTIONS.find((m) => m.id === floatMotion) || FLOAT_MOTIONS[0];

  // 양면 책 변수
  const leftPageIndex = currentSpread * 2;
  const rightPageIndex = currentSpread * 2 + 1;
  const leftContent = bookPages[leftPageIndex] || "";
  const rightContent = bookPages[rightPageIndex] || "";
  const hasPrevSpread = currentSpread > 0;
  const hasNextSpread = currentSpread < totalSpreads - 1;

  const leavingLeftIdx = bookFlipState.leavingSpread * 2;
  const leavingRightIdx = bookFlipState.leavingSpread * 2 + 1;
  const leavingRightContent = bookPages[leavingRightIdx] || "";
  const nextLeftContent = bookPages[(bookFlipState.leavingSpread + 1) * 2] || "";
  const leavingLeftContent = bookPages[leavingLeftIdx] || "";
  const prevRightContent = bookPages[(bookFlipState.leavingSpread - 1) * 2 + 1] || "";

  // 단면 수첩 변수
  const activeNotebookContent = notebookPages[currentNotebookPage] || "";
  const hasNextNotebookPage = currentNotebookPage < notebookPages.length - 1;
  const hasPrevNotebookPage = currentNotebookPage > 0;

  // 🟡 포스트잇 변수
  const activePostitContent = postitNotes[currentPostitIndex] || "";
  const tearingPostitContent = tearingIndex !== null ? postitNotes[tearingIndex] || "" : "";
  const hasNextPostit = currentPostitIndex < postitNotes.length;

  // 🌟 광원 위치 (부유 끄기 시 오른쪽 맨 위 88%, 12% 고정)
  const effectiveGlareX = floatMotion === "none" ? 88 : tilt.glareX;
  const effectiveGlareY = floatMotion === "none" ? 12 : tilt.glareY;
  const chalkSpotX = effectiveGlareX;
  const chalkSpotY = effectiveGlareY;

  // 📱 축소 모드/모바일 반응형 자동 폭 맞춤 계산 (가용 너비에 맞춰 쏙 들어가도록 배율 보정)
  const targetBaseWidth =
    viewStyle === "diary" ? 890 :
    viewStyle === "chalkboard" ? 830 :
    viewStyle === "book" ? 890 : 460;

  const autoFitScale =
    containerWidth > 0 && containerWidth < targetBaseWidth
      ? Math.min(1, Math.max(0.35, (containerWidth - 24) / targetBaseWidth))
      : 1;

  const effectiveScale = Number((zoom * autoFitScale).toFixed(3));

  return (
    <div className={styles.htmlInCanvasContainer}>
      {/* 상단 툴바 & 상태 뱃지 */}
      <div className={styles.htmlInCanvasToolbar}>
        <div className={styles.htmlInCanvasBadgeGroup}>
          {/* 🌟 보기 스타일 드롭다운 (양면 책 / 플립 메모장 / 🟡 포스트잇 뜯기) */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted)" }}>스타일:</span>
            <select
              className={styles.htmlInCanvasModeSelect}
              value={viewStyle}
              onChange={(e) => setViewStyle(e.target.value as ViewStyle)}
              title="3D 문서 보기 스타일 선택"
            >
              <option value="book">📖 양면 펼침 책</option>
              <option value="chalkboard">🏫 교실 칠판 (분필)</option>
              <option value="postit">🟡 포스트잇 (뜯기)</option>
              <option value="diary">📔 6공 다이어리</option>
            </select>
          </div>

          {status?.supported && (
            <span className={`${styles.canvasBadge} ${styles.canvasBadgeCanary}`}>
              🟢 Canary 가속
            </span>
          )}

          <span style={{ fontSize: "0.75rem", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <UiIcon name="spark" size={13} />
            {viewStyle === "book"
              ? "좌우 모서리 또는 방향키(←, →)"
              : viewStyle === "chalkboard"
              ? "마우스를 움직여 조명으로 분필 글씨를 비춰보세요 🔦"
              : viewStyle === "diary"
              ? "하단 버튼 또는 방향키(←, →)로 속지 넘기기 📔"
              : "모서리나 뜯기 버튼(또는 스페이스바)을 눌러 한 장씩 뜯어보세요 ✂️"}
          </span>
        </div>

        <div className={styles.htmlInCanvasControls}>
          {/* 🗺️ 미니맵 숨기기/펼치기 토글 버튼 */}
          <button
            type="button"
            className={`${styles.canvasBtn} ${showMinimap ? styles.canvasBtnActive : ""}`}
            onClick={() => setShowMinimap((prev) => !prev)}
            title={showMinimap ? "미니맵 접기/숨기기" : "미니맵 펼치기/표시"}
          >
            🗺️ 미니맵
          </button>

          {/* 🌊 5가지 부유 모션 순환 토글 버튼 */}
          <button
            type="button"
            className={`${styles.canvasBtn} ${floatMotion !== "none" ? styles.canvasBtnActive : ""}`}
            onClick={cycleFloatMotion}
            title="클릭하여 부유 모션 변경 (잔잔한 물결 → 무중력 유영 → 턴테이블 → 호흡 펄스 → 부유 끄기)"
          >
            {currentFloatMotionMeta.icon} {currentFloatMotionMeta.label}
          </button>

          {/* 🔍 50% ~ 115% 다단계 줌 버튼 */}
          <button
            type="button"
            className={styles.canvasBtn}
            onClick={cycleZoom}
            title="클릭하여 화면 크기 변경 (50% → 65% → 80% → 100% → 115%)"
          >
            🔍 {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className={styles.canvasBtn}
            onClick={() => {
              setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 50 });
              setZoom(1);
            }}
            title="화면 각도 초기화"
          >
            ↺ 리셋
          </button>
        </div>
      </div>

      {/* 3D 뷰포트 공간 */}
      <div
        ref={containerRef}
        className={styles.htmlInCanvasViewport}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          {...({ layoutsubtree: "" } as Record<string, string>)}
          className={styles.htmlInCanvasBackdropCanvas}
          width={900}
          height={640}
        />

        {/* 📱 반응형 자동 폭 맞춤 & 줌 스케일 컨테이너 (애니메이션과 줌 배율 충돌 완전 방지) */}
        <div
          className={styles.htmlInCanvasScaleBox}
          style={{
            transform: `scale(${effectiveScale})`,
          }}
        >
          {/* ================================================================
              A. 📖 양면 펼침 책 모드
              ================================================================ */}
          {viewStyle === "book" && (
            <div
              ref={cardRef}
              className={`${styles.htmlInCanvasBookWrapper} ${getFloatClass()}`}
              style={{
                transform:
                  floatMotion === "none"
                    ? "none"
                    : `perspective(1600px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
                transition: floatMotion !== "none" ? "none" : "transform 0.12s ease-out",
              }}
            >
            <div
              className={styles.htmlInCanvasGlare}
              style={{
                background: `radial-gradient(circle at ${effectiveGlareX}% ${effectiveGlareY}%, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 65%)`,
              }}
            />

            <div className={styles.htmlInCanvasBook}>
              <div className={styles.htmlInCanvasBookGutter} />

              {/* 좌측 페이지 */}
              <div className={`${styles.htmlInCanvasHalfPage} ${styles.htmlInCanvasLeftPage}`}>
                <div className={styles.htmlInCanvasPageHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={styles.canvasDocTypeBadge}>{docType}</span>
                    <h3 className={styles.htmlInCanvasTitle}>{title || "무제 문서"}</h3>
                  </div>
                  <span style={{ fontSize: "0.74rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
                    P. {leftPageIndex + 1}
                  </span>
                </div>

                <div className={styles.htmlInCanvasPageBody}>
                  <MarkdownLite text={leftContent} />
                </div>

                <div className={styles.htmlInCanvasPageFooter}>
                  <span>coffeeTide Book Edition</span>
                  <span>P. {leftPageIndex + 1}</span>
                </div>

                {hasPrevSpread && (
                  <div
                    className={styles.htmlInCanvasDogEarLeft}
                    onClick={() => triggerBookFlip("prev")}
                    title="모서리를 눌러 이전 쪽으로 되넘기기 📖"
                  />
                )}
              </div>

              {/* 우측 페이지 */}
              <div className={`${styles.htmlInCanvasHalfPage} ${styles.htmlInCanvasRightPage}`}>
                <div className={styles.htmlInCanvasPageHeader}>
                  <span style={{ fontSize: "0.74rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
                    P. {rightPageIndex + 1}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
                    Spread {currentSpread + 1} / {totalSpreads}
                  </span>
                </div>

                <div className={styles.htmlInCanvasPageBody}>
                  <MarkdownLite text={rightContent} />
                </div>

                <div className={styles.htmlInCanvasPageFooter}>
                  <span>P. {rightPageIndex + 1}</span>
                  <span>coffeeTide</span>
                </div>

                {hasNextSpread && (
                  <div
                    className={styles.htmlInCanvasDogEarRight}
                    onClick={() => triggerBookFlip("next")}
                    title="모서리를 눌러 다음 쪽으로 넘기기 📖"
                  />
                )}
              </div>

              {/* 3D 책장 넘김 레이어 */}
              {bookFlipState.isFlipping && (
                <div
                  className={`${styles.htmlInCanvasBookFlippingPage} ${
                    bookFlipState.direction === "next"
                      ? styles.htmlInCanvasBookFlipNext
                      : styles.htmlInCanvasBookFlipPrev
                  }`}
                >
                  <div className={styles.htmlInCanvasBookFlipFront}>
                    <div className={styles.htmlInCanvasPageHeader}>
                      <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                        P. {bookFlipState.direction === "next" ? leavingRightIdx + 1 : leavingLeftIdx + 1}
                      </span>
                    </div>
                    <div className={styles.htmlInCanvasPageBody}>
                      <MarkdownLite
                        text={bookFlipState.direction === "next" ? leavingRightContent : leavingLeftContent}
                      />
                    </div>
                  </div>

                  <div className={styles.htmlInCanvasBookFlipBack}>
                    <div className={styles.htmlInCanvasPageHeader}>
                      <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                        P. {bookFlipState.direction === "next" ? (bookFlipState.leavingSpread + 1) * 2 + 1 : (bookFlipState.leavingSpread - 1) * 2 + 2}
                      </span>
                    </div>
                    <div className={styles.htmlInCanvasPageBody}>
                      <MarkdownLite
                        text={bookFlipState.direction === "next" ? nextLeftContent : prevRightContent}
                      />
                    </div>
                  </div>

                  <div className={styles.htmlInCanvasBookFlipShadow} />
                </div>
              )}
            </div>

            {/* 하단 책 컨트롤 바 */}
            <div className={styles.htmlInCanvasBookFooter}>
              <div className={styles.htmlInCanvasNavBtns}>
                <button
                  type="button"
                  className={styles.htmlInCanvasFlipBtn}
                  onClick={() => triggerBookFlip("prev")}
                  disabled={!hasPrevSpread || bookFlipState.isFlipping}
                  title="이전 쪽으로 넘기기 (방향키 ←)"
                >
                  ◀ 이전 쪽
                </button>
                <button
                  type="button"
                  className={styles.htmlInCanvasFlipBtn}
                  onClick={() => triggerBookFlip("next")}
                  disabled={!hasNextSpread || bookFlipState.isFlipping}
                  title="다음 쪽으로 넘기기 (방향키 →)"
                >
                  다음 쪽 ▶
                </button>
              </div>

              <div className={styles.htmlInCanvasPageDots}>
                {Array.from({ length: totalSpreads }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`${styles.htmlInCanvasDot} ${idx === currentSpread ? styles.htmlInCanvasDotActive : ""}`}
                    onClick={() => jumpToSpread(idx)}
                    title={`${idx + 1}번째 펼침 (P.${idx * 2 + 1}-${idx * 2 + 2})`}
                  />
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={styles.htmlInCanvasPageIndicator}>
                  {currentSpread + 1} / {totalSpreads} 펼침 (P. {leftPageIndex + 1} - {rightPageIndex + 1})
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {hasNextSpread ? "모서리 클릭 또는 방향키(←, →)" : "마지막 쪽입니다 ✨"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            B. 🏫 앤틱 교실 칠판 (Blackboard with Chalk & Spotlight) 모드
            ================================================================ */}
        {viewStyle === "chalkboard" && (
          <div
            ref={cardRef}
            className={`${styles.htmlInCanvasChalkboardWrapper} ${getFloatClass()}`}
            style={{
              transform:
                floatMotion === "none"
                  ? "none"
                  : `perspective(1400px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
              transition: floatMotion !== "none" ? "none" : "transform 0.12s ease-out",
            }}
          >
            {/* 칠판 본체 (원목 프레임 + 짙은 녹색 칠판) */}
            <div className={styles.htmlInCanvasChalkboard}>
              {/* 🔦 칠판 표면 에메랄드 웜 스포트라이트 광원 레이어 (텍스트 뒤에 위치하여 번짐 없이 깊이감 형성) */}
              <div
                className={styles.htmlInCanvasChalkSpotlight}
                style={{
                  background: `radial-gradient(circle 380px at ${chalkSpotX}% ${chalkSpotY}%, rgba(55, 115, 80, 0.42) 0%, rgba(26, 58, 40, 0.2) 50%, transparent 80%)`,
                }}
              />

              {/* 칠판 상단 헤더 */}
              <div className={styles.htmlInCanvasChalkHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={styles.htmlInCanvasChalkBadge}>{docType}</span>
                  <span className={styles.htmlInCanvasChalkDate}>
                    Classroom Board · {title || "칠판 수업"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className={styles.htmlInCanvasChalkIndicator}>
                    [ 슬레이트 {currentNotebookPage + 1} / {notebookPages.length} ]
                  </span>
                </div>
              </div>

              {/* 칠판 분필체 본문 */}
              <div className={styles.htmlInCanvasChalkBody}>
                <MarkdownLite text={activeNotebookContent} />
              </div>

              {/* 하단 원목 분필 받침대 (Chalk Tray) & 소품 */}
              <div className={styles.htmlInCanvasChalkTray}>
                <div className={styles.htmlInCanvasChalkProps}>
                  <div className={styles.htmlInCanvasChalkStickWhite} title="흰색 분필" />
                  <div className={styles.htmlInCanvasChalkStickYellow} title="노란색 분필" />
                  <div className={styles.htmlInCanvasChalkStickMint} title="민트색 분필" />
                  <div className={styles.htmlInCanvasChalkEraser} title="칠판 지우개">
                    <div className={styles.htmlInCanvasChalkEraserFelt} />
                  </div>
                </div>

                <div className={styles.htmlInCanvasChalkNavBtns}>
                  <button
                    type="button"
                    className={styles.htmlInCanvasChalkBtn}
                    onClick={() => triggerNotebookFlip(currentNotebookPage - 1)}
                    disabled={!hasPrevNotebookPage}
                    title="이전 칠판 내용 (방향키 ←)"
                  >
                    ◀ 이전 칠판
                  </button>
                  <button
                    type="button"
                    className={styles.htmlInCanvasChalkBtn}
                    onClick={() => triggerNotebookFlip(currentNotebookPage + 1)}
                    disabled={!hasNextNotebookPage}
                    title="다음 칠판 내용 (방향키 →)"
                  >
                    다음 칠판 ▶
                  </button>
                </div>

                <div className={styles.htmlInCanvasChalkDots}>
                  {notebookPages.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`${styles.htmlInCanvasChalkDot} ${idx === currentNotebookPage ? styles.htmlInCanvasChalkDotActive : ""}`}
                      onClick={() => triggerNotebookFlip(idx)}
                      title={`${idx + 1}번째 칠판 슬레이트`}
                    />
                  ))}
                </div>

                <span style={{ fontSize: "0.74rem", color: "rgba(255, 255, 255, 0.55)", fontFamily: "'Gaegu', cursive" }}>
                  {hasNextNotebookPage ? "방향키(←, →)로 칠판 넘기기 ✏️" : "마지막 칠판입니다 ✨"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            C. 🟡 포스트잇 (한 장씩 뜯어 없애기) 모드
            ================================================================ */}
        {viewStyle === "postit" && (
          <div
            ref={cardRef}
            className={`${styles.htmlInCanvasPostitWrapper} ${getFloatClass()}`}
            style={{
              transform:
                floatMotion === "none"
                  ? "none"
                  : `perspective(1400px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
              transition: floatMotion !== "none" ? "none" : "transform 0.12s ease-out",
            }}
          >
            {/* 상단 마스킹 테이프 */}
            <div className={styles.htmlInCanvasPostitTape} />

            {/* 포스트잇 본체 */}
            <div className={styles.htmlInCanvasPostit}>
              {/* 상단 접착면 헤더 */}
              <div className={styles.htmlInCanvasPostitTopAdhesive}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📌</span>
                  <span>{title || "포스트잇 브리핑"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>
                    {hasNextPostit
                      ? `남은 메모: ${postitNotes.length - currentPostitIndex}장`
                      : "모두 뜯음 ✨"}
                  </span>
                </div>
              </div>

              {/* 포스트잇 본문 내용 */}
              <div className={styles.htmlInCanvasPostitBody}>
                {hasNextPostit ? (
                  <MarkdownLite text={activePostitContent} />
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "inherit" }}>
                    <span style={{ fontSize: "2.8rem" }}>🎉</span>
                    <h3 style={{ margin: "14px 0 8px" }}>모든 메모를 확인했습니다!</h3>
                    <p style={{ margin: 0, opacity: 0.8, fontSize: "0.9rem" }}>
                      아래 [↺ 새 패드 채우기] 버튼을 눌러 처음부터 다시 볼 수 있습니다.
                    </p>
                  </div>
                )}
              </div>

              {/* 우측 하단 뜯기 모서리 (Dog-ear) */}
              {hasNextPostit && (
                <div
                  className={styles.htmlInCanvasDogEarRight}
                  onClick={tearCurrentPostit}
                  title="모서리를 당겨 이 메모를 뜯어내기 ✂️"
                />
              )}

              {/* 뜯겨 날아가는 레이어 */}
              {isTearing && (
                <div
                  className={`${styles.htmlInCanvasPostit} ${styles.htmlInCanvasPostitTearing}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 20,
                  }}
                >
                  <div className={styles.htmlInCanvasPostitTopAdhesive}>
                    <span>📌 뜯어내는 중...</span>
                  </div>
                  <div className={styles.htmlInCanvasPostitBody}>
                    <MarkdownLite text={tearingPostitContent} />
                  </div>
                </div>
              )}

              {/* 포스트잇 하단 툴바 */}
              <div className={styles.htmlInCanvasPostitFooter}>
                <button
                  type="button"
                  className={styles.htmlInCanvasTearBtn}
                  onClick={tearCurrentPostit}
                  disabled={!hasNextPostit || isTearing}
                  title="현재 메모를 뜯어서 없앱니다 (단축키: 스페이스바)"
                >
                  ✂️ 한 장 뜯기
                </button>

                <div className={styles.htmlInCanvasPostitCounter}>
                  [ {Math.min(currentPostitIndex + 1, postitNotes.length)} / {postitNotes.length} ]
                </div>

                <button
                  type="button"
                  className={styles.htmlInCanvasPostitResetBtn}
                  onClick={resetPostitPad}
                  title="모든 메모지를 새 포스트잇 패드로 다시 채웁니다"
                >
                  ↺ 새 패드 채우기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            D. 📔 6공 투명 PVC 링 다이어리 모드
            ================================================================ */}
        {viewStyle === "diary" && (
          <div
            ref={cardRef}
            className={`${styles.htmlInCanvasDiaryWrapper} ${getFloatClass()}`}
            style={{
              transform:
                floatMotion === "none"
                  ? "none"
                  : `perspective(1600px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
              transition: floatMotion !== "none" ? "none" : "transform 0.12s ease-out",
            }}
          >
            <div
              className={styles.htmlInCanvasGlare}
              style={{
                background: `radial-gradient(circle at ${effectiveGlareX}% ${effectiveGlareY}%, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 65%)`,
              }}
            />

            {/* 다이어리 본체 컨테이너 */}
            <div className={styles.htmlInCanvasDiary}>
              {/* 실물 사진 배경 (투명 PVC 커버, 메탈 똑딱이 버튼, 스카이블루 배경) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/binder_diary_bg.png"
                alt="6-Ring Binder Diary Background"
                className={styles.htmlInCanvasDiaryBgImg}
                draggable={false}
              />

              {/* 좌측 클린 모눈 속지 (사진의 기존 손글씨/스티커를 덮고 텍스트만 배치) */}
              <div className={styles.htmlInCanvasDiaryPageLeft}>
                <div className={styles.htmlInCanvasDiaryHeader}>
                  <div className={styles.htmlInCanvasDiaryHeaderLeft}>
                    <span className={styles.canvasDocTypeBadge}>{docType}</span>
                    <span className={styles.htmlInCanvasDiaryDate}>
                      MONTH <span className={styles.htmlInCanvasDiaryCircledNum}>1</span> MEMO
                    </span>
                  </div>
                  <span className={styles.htmlInCanvasDiaryPageNum}>
                    P. {leftPageIndex + 1}
                  </span>
                </div>

                <div className={styles.htmlInCanvasDiaryBody}>
                  <MarkdownLite text={leftContent} />
                </div>

                <div className={styles.htmlInCanvasDiaryFooter}>
                  <span>coffeeTide 6-Ring Planner</span>
                  <span>P. {leftPageIndex + 1}</span>
                </div>
              </div>

              {/* 우측 클린 모눈 속지 (사진의 기존 손글씨/스티커를 덮고 텍스트만 배치) */}
              <div className={styles.htmlInCanvasDiaryPageRight}>
                <div className={styles.htmlInCanvasDiaryHeader}>
                  <span className={styles.htmlInCanvasDiaryPageNum}>
                    P. {rightPageIndex + 1}
                  </span>
                  <div className={styles.htmlInCanvasDiaryHeaderRight}>
                    <span className={styles.htmlInCanvasDiaryTag}>WEEKLY PLAN</span>
                    <span className={styles.htmlInCanvasDiarySpreadBadge}>
                      Spread {currentSpread + 1} / {totalSpreads}
                    </span>
                  </div>
                </div>

                <div className={styles.htmlInCanvasDiaryBody}>
                  <MarkdownLite text={rightContent} />
                </div>

                <div className={styles.htmlInCanvasDiaryFooter}>
                  <span>P. {rightPageIndex + 1}</span>
                  <span>coffeeTide</span>
                </div>
              </div>
            </div>

            {/* 하단 다이어리 속지 네비게이션 */}
            <div className={styles.htmlInCanvasBookFooter}>
              <div className={styles.htmlInCanvasNavBtns}>
                <button
                  type="button"
                  className={styles.htmlInCanvasFlipBtn}
                  onClick={() => triggerBookFlip("prev")}
                  disabled={!hasPrevSpread}
                  title="이전 쪽으로 넘기기 (방향키 ←)"
                >
                  ◀ 이전 쪽
                </button>
                <button
                  type="button"
                  className={styles.htmlInCanvasFlipBtn}
                  onClick={() => triggerBookFlip("next")}
                  disabled={!hasNextSpread}
                  title="다음 쪽으로 넘기기 (방향키 →)"
                >
                  다음 쪽 ▶
                </button>
              </div>

              <div className={styles.htmlInCanvasPageDots}>
                {Array.from({ length: totalSpreads }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`${styles.htmlInCanvasDot} ${idx === currentSpread ? styles.htmlInCanvasDotActive : ""}`}
                    onClick={() => jumpToSpread(idx)}
                    title={`${idx + 1}번째 다이어리 펼침 (P.${idx * 2 + 1}-${idx * 2 + 2})`}
                  />
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={styles.htmlInCanvasPageIndicator}>
                  {currentSpread + 1} / {totalSpreads} 다이어리 속지 (P. {leftPageIndex + 1} - {rightPageIndex + 1})
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {hasNextSpread ? "하단 버튼 또는 방향키(←, →)로 넘기기 📔" : "마지막 다이어리 쪽입니다 ✨"}
                </span>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* 실시간 플로팅 미니맵 (숨기기/펼치기 지원 - 상단 툴바의 미니맵 버튼으로 토글) */}
        {showMinimap && (
          <div
            className={styles.htmlInCanvasMinimapWrapper}
            style={{ pointerEvents: "auto", cursor: "pointer" }}
            title="미니맵의 슬롯을 클릭하면 해당 쪽으로 즉시 이동합니다."
          >
            <div className={styles.htmlInCanvasMinimapHeader}>
              <span>
                🗺️{" "}
                {viewStyle === "book"
                  ? "양면 책 미니맵"
                  : viewStyle === "chalkboard"
                  ? "칠판 미니맵"
                  : viewStyle === "diary"
                  ? "다이어리 미니맵"
                  : "포스트잇 미니맵"}
              </span>
              <button
                type="button"
                className={styles.htmlInCanvasMinimapCloseBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMinimap(false);
                }}
                title="미니맵 접기/숨기기"
              >
                ✕
              </button>
            </div>
            <canvas
              ref={minimapCanvasRef}
              className={styles.htmlInCanvasMinimapCanvas}
              width={160}
              height={180}
              onClick={handleMinimapClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}



