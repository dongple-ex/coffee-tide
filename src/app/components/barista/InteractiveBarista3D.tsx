"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { getPersonaEffect, ParticleShape } from "@/lib/ai/personaEffects";
import styles from "./baristaBrewing.module.css";

/** 스팀, 별, 픽셀, 얼음 결정을 모두 담는 통합 파티클 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  vRot: number;
  color: string;
  shape: ParticleShape;
  growth: number;
  fade: number;
  gravity: number;
}

interface InteractiveBarista3DProps {
  size: number;
  imageSrc: string;
  isBrewing: boolean;
  personaName?: string;
  /** 페르소나 프리셋 ID. 효과 판별의 우선 기준이 된다 */
  presetId?: string;
  /** 파티클 연출 자체를 끄고 싶을 때 사용한다 */
  disableParticles?: boolean;
  onClick?: () => void;
}

// 파티클 수치는 라운지 씬의 140px 아바타를 기준으로 정의되어 있다.
// 환영 카드처럼 작은 아바타에서 그대로 쓰면 파티클이 몇 프레임 만에 화면 밖으로
// 빠져나가 사실상 보이지 않으므로, 아바타 크기에 맞춰 이동량과 크기를 보정한다.
const SPEC_BASE_SIZE = 140;

/** 범위 안에서 무작위 값 하나를 고른다 */
function randomIn([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function pickColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)];
}

/** 파티클 하나를 모양에 맞게 그린다 */
function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  if (p.shape === "steam") {
    // 따뜻한 음료의 김: 가장자리로 갈수록 옅어지는 원형 그라데이션
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, "transparent");

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = p.color;

  if (p.shape === "star") {
    // 4각 별: 뾰족한 꼭짓점 네 개가 교차하는 반짝임
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 2.2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.lineTo(p.size, 0);
      ctx.lineTo(p.size * 0.3, p.size * 0.3);
    }
    ctx.closePath();
    ctx.fill();
  } else if (p.shape === "pixel") {
    // 전자 신호 픽셀: 발광하는 정사각형
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 2.4;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
  } else {
    // 얼음 결정: 위아래로 길쭉한 6각 마름모
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(p.size * 0.5, -p.size * 0.4);
    ctx.lineTo(p.size * 0.5, p.size * 0.4);
    ctx.lineTo(0, p.size);
    ctx.lineTo(-p.size * 0.5, p.size * 0.4);
    ctx.lineTo(-p.size * 0.5, -p.size * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export function InteractiveBarista3D({
  size,
  imageSrc,
  isBrewing,
  personaName = "AI 바리스타",
  presetId,
  disableParticles = false,
  onClick,
}: InteractiveBarista3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const effect = getPersonaEffect(presetId, personaName);

  // 이동량은 화면 비율 그대로 줄이고, 크기는 작은 아바타에서도 눈에 남도록 완만하게 줄인다.
  const motionScale = size / SPEC_BASE_SIZE;
  const sizeScale = 0.55 + 0.45 * motionScale;

  // 애니메이션 루프가 매 프레임 최신 효과를 참조하도록 ref에 담아 둔다.
  const effectRef = useRef(effect);
  const scaleRef = useRef({ motionScale, sizeScale });
  useEffect(() => {
    effectRef.current = effect;
    scaleRef.current = { motionScale, sizeScale };
  }, [effect, motionScale, sizeScale]);

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

  const particlesRef = useRef<Particle[]>([]);

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
          rx: -ny * 14 * influence,
          ry: nx * 18 * influence,
          shiftX: nx * 9 * influence,
          shiftY: ny * 7 * influence,
          glareX: 50 + nx * 45,
          glareY: 50 + ny * 45,
          glareOpacity: 0.22 + influence * 0.3,
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
      mousePosRef.current = { x: size / 2, y: size / 2, isInside: false };
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

  // 클릭 시 페르소나별 파티클 폭죽 분출
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const clickX = rect ? e.clientX - rect.left : size / 2;
      const clickY = rect ? e.clientY - rect.top : size / 2;

      const burst = effectRef.current.burst;
      const { motionScale: ms, sizeScale: ss } = scaleRef.current;

      for (let i = 0; i < burst.count; i++) {
        const angle = (Math.PI * 2 * i) / burst.count + (Math.random() - 0.5);
        const speed = randomIn(burst.speed) * ms;
        particlesRef.current.push({
          x: clickX,
          y: clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.8 * ms,
          size: Math.max(2, randomIn(burst.sizeRange) * ss),
          alpha: 1,
          rotation: Math.random() * Math.PI * 2,
          vRot: randomIn(burst.spin),
          color: pickColor(burst.colors),
          shape: burst.shape,
          growth: 0,
          fade: burst.fade,
          gravity: burst.gravity * ms,
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

      // 2. 페르소나별 상시 파티클 방출
      const ambient = effectRef.current.ambient;
      const now = Date.now();

      if (!disableParticles && now - lastSpawn > ambient.spawnIntervalMs) {
        lastSpawn = now;
        const originX = size * (isBrewing ? 0.48 : 0.5);
        const originY = size * (isBrewing ? 0.58 : 0.62);

        // 김이 피어오르는 연출은 마우스가 가까이 가면 바람에 밀리듯 흔들린다.
        let windVx = (Math.random() - 0.5) * 0.4;
        if (ambient.shape === "steam" && mousePosRef.current.isInside) {
          const dx = originX - mousePosRef.current.x;
          windVx += (dx > 0 ? 0.5 : -0.5) * Math.min(1, 40 / (Math.abs(dx) + 10));
        }

        const { motionScale: ms, sizeScale: ss } = scaleRef.current;

        particlesRef.current.push({
          x: originX + (Math.random() - 0.5) * size * ambient.spreadX,
          y: originY + (Math.random() - 0.5) * size * ambient.spreadY,
          vx: (ambient.shape === "steam" ? windVx : (Math.random() - 0.5) * 0.5) * ms,
          vy: randomIn(ambient.riseSpeed) * ms,
          size: Math.max(1.8, randomIn(ambient.sizeRange) * ss),
          alpha: 1,
          rotation: Math.random() * Math.PI * 2,
          vRot: randomIn(ambient.spin),
          color: pickColor(ambient.colors),
          shape: ambient.shape,
          growth: ambient.growth * ms,
          fade: ambient.fade,
          gravity: ambient.gravity * ms,
        });
      }

      // 3. Canvas 클리어 및 파티클 물리 갱신 후 드로우
      ctx.clearRect(0, 0, size, size);

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.vRot;
        p.size += p.growth;
        p.alpha -= p.fade;

        if (p.alpha <= 0 || p.size <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        drawParticle(ctx, p);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [size, isBrewing, disableParticles]);

  return (
    <div
      ref={containerRef}
      className={styles.interactive3dContainer}
      style={
        {
          width: size,
          height: size,
          perspective: "600px",
          "--persona-accent": effect.accent,
        } as React.CSSProperties
      }
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

        {/* 실시간 60FPS 페르소나별 파티클 캔버스 */}
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
