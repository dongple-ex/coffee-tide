"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import styles from "./baristaBrewing.module.css";

interface SteamParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface SparkleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  vRot: number;
  color: string;
}

interface InteractiveBarista3DProps {
  size: number;
  imageSrc: string;
  isBrewing: boolean;
  personaName?: string;
  onClick?: () => void;
}

export function InteractiveBarista3D({
  size,
  imageSrc,
  isBrewing,
  personaName = "AI 바리스타",
  onClick,
}: InteractiveBarista3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 3D 틸트 및 인터랙티브 각도 상태 (Spring lerp)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, glareX: 50, glareY: 50 });
  const targetTiltRef = useRef({ rx: 0, ry: 0, glareX: 50, glareY: 50 });
  const currentTiltRef = useRef({ rx: 0, ry: 0, glareX: 50, glareY: 50 });

  const mousePosRef = useRef<{ x: number; y: number; isInside: boolean }>({
    x: size / 2,
    y: size / 2,
    isInside: false,
  });

  const steamParticlesRef = useRef<SteamParticle[]>([]);
  const sparklesRef = useRef<SparkleParticle[]>([]);

  // 마우스 이동 시 3D 시선 및 패럴랙스 계산
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      mousePosRef.current = { x, y, isInside: true };

      // 중심점 기준 -1 ~ +1 정규화
      const nx = (x / rect.width) * 2 - 1;
      const ny = (y / rect.height) * 2 - 1;

      // 최대 ±14도 3D 회전 및 글레어 하이라이트 위치
      targetTiltRef.current = {
        rx: -ny * 12,
        ry: nx * 14,
        glareX: (x / rect.width) * 100,
        glareY: (y / rect.height) * 100,
      };
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current.isInside = false;
    targetTiltRef.current = { rx: 0, ry: 0, glareX: 50, glareY: 50 };
  }, []);

  // 클릭 시 스파클 폭죽 파티클 분출
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const clickX = rect ? e.clientX - rect.left : size / 2;
      const clickY = rect ? e.clientY - rect.top : size / 2;

      const colors = ["#fbbf24", "#f59e0b", "#d97706", "#ffffff", "#fed7aa"];
      for (let i = 0; i < 14; i++) {
        const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5);
        const speed = 1.5 + Math.random() * 2.5;
        sparklesRef.current.push({
          x: clickX,
          y: clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.8,
          size: 3 + Math.random() * 4,
          alpha: 1,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }

      onClick?.();
    },
    [size, onClick]
  );

  // 60FPS 실시간 인터랙티브 물리 렌더 루프
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastSpawn = Date.now();

    const loop = () => {
      // 1. Spring lerp 3D 틸트 보간 (부드러운 시선 추적)
      const cur = currentTiltRef.current;
      const tgt = targetTiltRef.current;
      cur.rx += (tgt.rx - cur.rx) * 0.12;
      cur.ry += (tgt.ry - cur.ry) * 0.12;
      cur.glareX += (tgt.glareX - cur.glareX) * 0.15;
      cur.glareY += (tgt.glareY - cur.glareY) * 0.15;

      setTilt({ rx: cur.rx, ry: cur.ry, glareX: cur.glareX, glareY: cur.glareY });

      // 2. 실시간 스팀 파티클 방출 (커피잔/드리퍼 위치)
      const now = Date.now();
      if (now - lastSpawn > 80) {
        lastSpawn = now;
        const originX = size * (isBrewing ? 0.48 : 0.5);
        const originY = size * (isBrewing ? 0.58 : 0.62);

        // 마우스 커서가 가까우면 스팀이 바람에 밀려 휘어짐
        let windVx = (Math.random() - 0.5) * 0.4;
        if (mousePosRef.current.isInside) {
          const dx = originX - mousePosRef.current.x;
          windVx += (dx > 0 ? 0.5 : -0.5) * Math.min(1, 40 / (Math.abs(dx) + 10));
        }

        steamParticlesRef.current.push({
          x: originX + (Math.random() - 0.5) * 8,
          y: originY,
          vx: windVx,
          vy: -0.6 - Math.random() * 0.7,
          size: 4 + Math.random() * 3,
          alpha: 0.75,
          life: 0,
          maxLife: 45 + Math.random() * 25,
        });
      }

      // 3. Canvas 클리어 및 파티클 렌더링
      ctx.clearRect(0, 0, size, size);

      // 스팀 파티클 업데이트 및 드로우
      for (let i = steamParticlesRef.current.length - 1; i >= 0; i--) {
        const p = steamParticlesRef.current[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.size += 0.18; // 위로 갈수록 퍼짐
        p.alpha = Math.max(0, 0.75 * (1 - p.life / p.maxLife));

        if (p.life >= p.maxLife) {
          steamParticlesRef.current.splice(i, 1);
          continue;
        }

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, `rgba(255, 255, 255, ${p.alpha})`);
        grad.addColorStop(0.5, `rgba(254, 243, 199, ${p.alpha * 0.6})`);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 클릭 스파클 파티클 업데이트 및 드로우
      for (let i = sparklesRef.current.length - 1; i >= 0; i--) {
        const s = sparklesRef.current[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.08; // 중력
        s.rotation += s.vRot;
        s.alpha -= 0.025;

        if (s.alpha <= 0) {
          sparklesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha;

        // 4각 별 모양 드로우
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
          ctx.rotate(Math.PI / 2);
          ctx.lineTo(s.size, 0);
          ctx.lineTo(s.size * 0.3, s.size * 0.3);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [size, isBrewing]);

  return (
    <div
      ref={containerRef}
      className={styles.interactive3dContainer}
      style={{
        width: size,
        height: size,
        perspective: "600px",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleCanvasClick}
      title={`${personaName} 3D 인터랙티브 바리스타 (마우스를 올리면 시선이 따라옵니다!)`}
    >
      {/* 3D 회전 카드 */}
      <div
        className={styles.interactive3dCard}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        }}
      >
        {/* 3D 캐릭터 레이어 */}
        <div className={`${styles.barista3dActor} ${isBrewing ? styles.actorBrewing : styles.actorServing}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={`${personaName} 3D 아바타`}
            className={styles.barista3dImage}
            loading="lazy"
          />
        </div>

        {/* 인터랙티브 마우스 조명 글레어 */}
        <div
          className={styles.interactiveGlare}
          style={{
            background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255, 255, 255, 0.45) 0%, transparent 65%)`,
          }}
        />

        {/* 실시간 60FPS 유체 스팀 & 스파클 파티클 캔버스 */}
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className={styles.interactiveCanvasOverlay}
        />
      </div>
    </div>
  );
}
