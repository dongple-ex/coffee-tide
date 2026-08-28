"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import MarkdownLite from "../markdownLite";
import { checkHtmlInCanvasSupport, HtmlInCanvasStatus, drawElementToCanvas } from "@/lib/canvas/htmlInCanvas";
import { UiIcon } from "../UiIcon";
import styles from "../../page.module.css";

interface Props {
  content: string;
  title: string;
  docType: string;
}

export function HtmlInCanvasView({ content, title, docType }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<HtmlInCanvasStatus | null>(null);
  const [tilt, setTilt] = useState<{ rotateX: number; rotateY: number; glareX: number; glareY: number }>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 50,
  });
  const [autoFloat, setAutoFloat] = useState(true);
  const [zoom, setZoom] = useState(1);

  // Chrome Canary HTML in Canvas 지원 상태 감지
  useEffect(() => {
    const s = checkHtmlInCanvasSupport();
    setStatus(s);
  }, []);

  // 마우스 이동 시 3D 틸트 & 광택 효과 계산
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // 최대 ±15도 회전
      const rotateY = ((x - centerX) / centerX) * 12;
      const rotateX = -((y - centerY) / centerY) * 12;

      const glareX = (x / rect.width) * 100;
      const glareY = (y / rect.height) * 100;

      setTilt({ rotateX, rotateY, glareX, glareY });
      if (autoFloat) setAutoFloat(false);
    },
    [autoFloat]
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 50 });
  }, []);

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

      // HTML in Canvas API (drawElementImage) 호출
      const drawn = drawElementToCanvas(ctx, cardEl, 0, 0, canvas.width, canvas.height);

      // 미지원 시 부드러운 캔버스 파티클 / 격자 효과 폴백
      if (!drawn) {
        ctx.strokeStyle = "rgba(100, 160, 255, 0.12)";
        ctx.lineWidth = 1;
        const step = 24;
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
  }, [content]);

  // 실시간 미니맵 (Minimap) 렌더링
  useEffect(() => {
    const minimap = minimapCanvasRef.current;
    const cardEl = cardRef.current;
    if (!minimap || !cardEl) return;

    const ctx = minimap.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, minimap.width, minimap.height);

    // 미니맵 배경
    ctx.fillStyle = "rgba(20, 24, 33, 0.85)";
    ctx.fillRect(0, 0, minimap.width, minimap.height);

    // drawElementImage 시도 또는 마크다운 구조 시각화
    const drawn = drawElementToCanvas(ctx, cardEl, 4, 4, minimap.width - 8, minimap.height - 8);
    if (!drawn) {
      // 텍스트 블록 추상화 미니맵 선 그리기
      ctx.fillStyle = "rgba(120, 180, 255, 0.7)";
      ctx.fillRect(8, 8, 60, 6); // 제목

      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      const lineCount = Math.min(18, Math.max(4, Math.floor(content.length / 40)));
      for (let i = 0; i < lineCount; i++) {
        const w = (i % 3 === 0 ? 80 : i % 2 === 0 ? 110 : 95) * (minimap.width / 140);
        ctx.fillRect(8, 20 + i * 7, Math.min(w, minimap.width - 16), 3);
      }
    }
  }, [content, zoom]);

  return (
    <div className={styles.htmlInCanvasContainer}>
      {/* 상단 툴바 & 상태 뱃지 */}
      <div className={styles.htmlInCanvasToolbar}>
        <div className={styles.htmlInCanvasBadgeGroup}>
          {status?.supported ? (
            <span className={`${styles.canvasBadge} ${styles.canvasBadgeCanary}`} title="Chrome Canary의 WICG drawElementImage API가 활성화되었습니다.">
              🟢 HTML in Canvas 가속 (Chrome Canary)
            </span>
          ) : (
            <span className={`${styles.canvasBadge} ${styles.canvasBadgeCloud}`} title="일반 브라우저에서는 고성능 CSS 3D Transform 가속으로 동작합니다.">
              🎨 3D 인터랙티브 캔버스 뷰 (CSS 3D 가속)
            </span>
          )}
          <span style={{ fontSize: "0.75rem", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <UiIcon name="spark" size={13} />
            마우스를 움직여 3D 회전과 조명을 테스트해 보세요
          </span>
        </div>

        <div className={styles.htmlInCanvasControls}>
          <button
            type="button"
            className={`${styles.canvasBtn} ${autoFloat ? styles.canvasBtnActive : ""}`}
            onClick={() => setAutoFloat((v) => !v)}
            title="3D 자동 부유 애니메이션 토글"
          >
            {autoFloat ? "🌊 자동 부유 ON" : "⏸️ 자동 부유 OFF"}
          </button>
          <button
            type="button"
            className={styles.canvasBtn}
            onClick={() => setZoom((z) => (z >= 1.2 ? 0.8 : z + 0.1))}
            title="확대 / 축소"
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
        {/* WICG <canvas layoutsubtree> 엘리먼트 (Chrome Canary drawElementImage 타깃) */}
        {/* @ts-ignore - layoutsubtree is an experimental proposal attribute */}
        <canvas
          ref={canvasRef}
          // @ts-ignore
          layoutsubtree=""
          className={styles.htmlInCanvasBackdropCanvas}
          width={800}
          height={600}
        />

        {/* 3D 회전 & 조명 래퍼 카드 */}
        <div
          ref={cardRef}
          className={`${styles.htmlInCanvas3DCard} ${autoFloat ? styles.htmlInCanvasFloating : ""}`}
          style={{
            transform: `perspective(1000px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale(${zoom})`,
            transition: autoFloat ? "none" : "transform 0.12s ease-out",
          }}
        >
          {/* 동적 광택 하이라이트 오버레이 */}
          <div
            className={styles.htmlInCanvasGlare}
            style={{
              background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 65%)`,
            }}
          />

          <div className={styles.htmlInCanvasCardHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={styles.canvasDocTypeBadge}>{docType}</span>
              <h3 className={styles.htmlInCanvasTitle}>{title || "무제 문서"}</h3>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
              HTML in Canvas 3D Render
            </span>
          </div>

          <div className={styles.htmlInCanvasCardBody}>
            <MarkdownLite text={content} />
          </div>
        </div>

        {/* 실시간 플로팅 미니맵 (Mini-map) */}
        <div className={styles.htmlInCanvasMinimapWrapper}>
          <div className={styles.htmlInCanvasMinimapHeader}>
            <span>🗺️ 실시간 미니맵</span>
          </div>
          <canvas
            ref={minimapCanvasRef}
            className={styles.htmlInCanvasMinimapCanvas}
            width={160}
            height={180}
          />
        </div>
      </div>
    </div>
  );
}
