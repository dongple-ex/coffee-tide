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
  hideSteam?: boolean;
  onClick?: () => void;
}

export function InteractiveBarista3D({
  size,
  imageSrc,
  isBrewing,
  personaName = "AI 바리스타",
  hideSteam = false,
  onClick,
}: InteractiveBarista3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 3D 틸트 및 시선 패럴랙스 상태 (Spring lerp)
  const [tilt, setTilt] = useState({
    rx: 0,
    ry: 0,
    shiftX: 0,
    shiftY: 0,
    glareX: 50,
    glareY: 50,
    glareOpacity: 0.3,
  });
  const targetTiltRef = useRef({
    rx: 0,
    ry: 0,
    shiftX: 0,
    shiftY: 0,
    glareX: 50,
    glareY: 50,
    glareOpacity: 0.3,
  });
  const currentTiltRef = useRef({
    rx: 0,
    ry: 0,
    shiftX: 0,
    shiftY: 0,
    glareX: 50,
    glareY: 50,
    glareOpacity: 0.3,
  });

  const mousePosRef = useRef<{ x: number; y: number; isInside: boolean }>({
    x: size / 2,
    y: size / 2,
    isInside: false,
  });

  const steamParticlesRef = useRef<SteamParticle[]>([]);
  const sparklesRef = useRef<SparkleParticle[]>([]);

  // 전역 마우스 좌표 추적 (윈도우/카드 전체에서 바리스타를 쳐다보도록 시선 및 패럴랙스 계산)
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.hypot(dx, dy);

      // 마우스가 아바타 중심에 가까울수록(약 550px 반경 내) 반응도 활성화
      const maxDistance = 550;
      const influence = Math.max(0, 1 - distance / maxDistance);

      // -1 ~ +1 정규화
      const nx = Math.max(-1, Math.min(1, dx / 200));
      const ny = Math.max(-1, Math.min(1, dy / 200));

      const isInside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      mousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        isInside,
      };

      if (influence > 0.01) {
        // 3D 틸트 (최대 ±18도) 및 내부 시선 패럴랙스 슬라이딩 (최대 ±7~9px)
        targetTiltRef.current = {
          rx: -ny * 16 * influence,
          ry: nx * 18 * influence,
          shiftX: nx * (size * 0.12) * influence,
          shiftY: ny * (size * 0.10) * influence,
          glareX: 50 + nx * 40,
          glareY: 50 + ny * 40,
          glareOpacity: isInside ? 0.6 : 0.2 + influence * 0.35,
        };
      } else {
        targetTiltRef.current = {
          rx: 0,
          ry: 0,
          shiftX: 0,
          shiftY: 0,
          glareX: 50,
          glareY: 50,
          glareOpacity: 0.2,
        };
      }
    };

    const handleGlobalMouseLeave = () => {
      mousePosRef.current.isInside = false;
      targetTiltRef.current = {
        rx: 0,
        ry: 0,
        shiftX: 0,
        shiftY: 0,
        glareX: 50,
        glareY: 50,
        glareOpacity: 0.2,
      };
    };

    window.addEventListener("mousemove", handleGlobalMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleGlobalMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseleave", handleGlobalMouseLeave);
    };
  }, [size]);

  // 클릭 시 스파클 폭죽 파티클 분출
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const clickX = rect ? e.clientX - rect.left : size / 2;
      const clickY = rect ? e.clientY - rect.top : size / 2;

      const colors = ["#fbbf24", "#f59e0b", "#d97706", "#ffffff", "#fed7aa"];
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5);
        const speed = 1.5 + Math.random() * 2.8;
        sparklesRef.current.push({
          x: clickX,
          y: clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.8,
          size: 3 + Math.random() * 4,
          alpha: 1,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.25,
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
      // 1. Spring lerp 3D 틸트 & 시선 패럴랙스 보간 (부드러운 시선 추적)
      const cur = currentTiltRef.current;
      const tgt = targetTiltRef.current;
      cur.rx += (tgt.rx - cur.rx) * 0.14;
      cur.ry += (tgt.ry - cur.ry) * 0.14;
      cur.shiftX += (tgt.shiftX - cur.shiftX) * 0.14;
      cur.shiftY += (tgt.shiftY - cur.shiftY) * 0.14;
      cur.glareX += (tgt.glareX - cur.glareX) * 0.16;
      cur.glareY += (tgt.glareY - cur.glareY) * 0.16;
      cur.glareOpacity += (tgt.glareOpacity - cur.glareOpacity) * 0.15;

      setTilt({
        rx: cur.rx,
        ry: cur.ry,
        shiftX: cur.shiftX,
        shiftY: cur.shiftY,
        glareX: cur.glareX,
        glareY: cur.glareY,
        glareOpacity: cur.glareOpacity,
      });

      // 2. 실시간 파티클 방출 (스팀 또는 아이스 크리스탈 섬광)
      const shouldHideSteam =
        hideSteam ||
        personaName.includes("채린") ||
        personaName.includes("채스터") ||
        personaName.includes("칼찌");

      const now = Date.now();
      if (now - lastSpawn > 90) {
        lastSpawn = now;
        const originX = size * (isBrewing ? 0.48 : 0.5);
        const originY = size * (isBrewing ? 0.58 : 0.62);

        if (!shouldHideSteam) {
          // 따뜻한 커피: 부드러운 스팀 연기 방출
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
        } else {
          // 아이스 음료 (채린이): 반짝이는 크리스탈 섬광(Sparkle) 파티클 방출
          const glintColors = ["#67e8f9", "#ffffff", "#c084fc", "#f472b6", "#a5f3fc"];
          sparklesRef.current.push({
            x: originX + (Math.random() - 0.5) * (size * 0.5),
            y: originY + (Math.random() - 0.5) * (size * 0.3),
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.35 - Math.random() * 0.45,
            size: 2.2 + Math.random() * 3.2,
            alpha: 0.95,
            rotation: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.15,
            color: glintColors[Math.floor(Math.random() * glintColors.length)],
          });
        }
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
        {/* 3D 캐릭터 시선 & 고개 패럴랙스 래퍼 */}
        <div
          className={styles.baristaParallaxWrap}
          style={{
            transform: `translate3d(${tilt.shiftX}px, ${tilt.shiftY}px, 0) scale(1.18)`,
          }}
        >
          {/* 3D 캐릭터 브루잉/서빙 모션 레이어 */}
          <div className={`${styles.barista3dActor} ${isBrewing ? styles.actorBrewing : styles.actorServing}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={`${personaName} 3D 아바타`}
              className={styles.barista3dImage}
              loading="lazy"
            />
          </div>
        </div>

        {/* 인터랙티브 마우스 조명 글레어 (시선 포커스) */}
        <div
          className={styles.interactiveGlare}
          style={{
            background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255, 255, 255, ${tilt.glareOpacity}) 0%, transparent 65%)`,
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
