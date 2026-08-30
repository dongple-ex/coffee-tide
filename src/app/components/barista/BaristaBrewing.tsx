"use client";

import React, { useState } from "react";
import { InteractiveBarista3D } from "./InteractiveBarista3D";
import { getPersonaEffect, getPersonaAvatar } from "@/lib/ai/personaEffects";
import styles from "./baristaBrewing.module.css";

export interface BaristaBrewingProps {
  size?: number;
  isBrewing?: boolean;
  statusText?: string;
  onClick?: () => void;
  className?: string;
  showBubbleOnHover?: boolean;
  personaName?: string;
  visualMode?: "3d" | "svg";
  gender?: "female" | "male";
  presetId?: string;
}

export function BaristaBrewing({
  size = 80,
  isBrewing = true,
  statusText,
  onClick,
  className,
  showBubbleOnHover = true,
  personaName = "AI 바리스타",
  visualMode = "3d",
  gender,
  presetId,
}: BaristaBrewingProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [bubbleMessage, setBubbleMessage] = useState<string | null>(null);

  // 페르소나 판별과 효과 선택은 공용 모듈이 전담한다.
  const effect = getPersonaEffect(presetId, personaName);

  // gender를 명시적으로 지정한 경우에만 아바타 성별을 덮어쓴다.
  const imageSrc =
    gender === "male" && effect.kind !== "secretary"
      ? isBrewing
        ? "/barista/barista_male_3d_brewing.jpg"
        : "/barista/barista_male_3d_serving.jpg"
      : getPersonaAvatar(effect, isBrewing);

  const isIced = effect.cupDecoration === "glint";

  const handleClick = () => {
    const pool = effect.brewBubbles;
    const randomMsg = pool[Math.floor(Math.random() * pool.length)];
    setBubbleMessage(randomMsg);
    setTimeout(() => setBubbleMessage(null), 3500);
    onClick?.();
  };

  const currentBubble =
    bubbleMessage || (isHovered && showBubbleOnHover ? effect.hoverBubble(personaName) : statusText);

  return (
    <div
      className={`${styles.baristaContainer} ${className || ""}`}
      style={{ width: size, height: visualMode === "3d" ? size : size * 1.1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      role="img"
      aria-label={`${personaName} ${isIced ? "아이스 음료" : "커피"} 브루잉 3D 애니메이션`}
      title={`클릭하면 바리스타가 ${isIced ? "스페셜 아이스 음료를" : "스페셜 커피를"} 만들어드려요!`}
    >
      {currentBubble && (
        <div className={styles.baristaSpeechBubble} role="status">
          {currentBubble}
        </div>
      )}

      {visualMode === "3d" ? (
        <InteractiveBarista3D
          size={size}
          imageSrc={imageSrc}
          isBrewing={isBrewing}
          personaName={personaName}
          presetId={presetId}
          onClick={handleClick}
        />
      ) : (
        <svg
          width={size}
          height={size * 1.1}
          viewBox="0 0 100 110"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.baristaSvg}
        >
        <defs>
          {/* 커피 원두 및 앰비언트 그라데이션 */}
          <linearGradient id="coffeeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8d5b36" />
            <stop offset="100%" stopColor="#4a2c16" />
          </linearGradient>
          <linearGradient id="apronGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="kettleGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="glassServerGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(226, 232, 240, 0.4)" />
            <stop offset="100%" stopColor="rgba(148, 163, 184, 0.15)" />
          </linearGradient>
        </defs>

        {/* 1. 작업대 (Barista Counter Desk) */}
        <rect x="5" y="96" width="90" height="8" rx="3" fill="#334155" />
        <rect x="7" y="94" width="86" height="3" rx="1.5" fill="#64748b" />

        {/* 2. 바리스타 몸체 & 앞치마 */}
        <g id="baristaBody">
          {/* 셔츠 몸통 */}
          <path d="M 32 46 Q 50 43 68 46 L 72 94 L 28 94 Z" fill="#f8fafc" />

          {/* 앞치마 (Apron) */}
          <path d="M 36 50 L 64 50 L 68 94 L 32 94 Z" fill="url(#apronGradient)" />
          {/* 앞치마 멜빵 스트랩 */}
          <path d="M 39 46 L 43 52 M 61 46 L 57 52" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
          {/* 앞치마 주머니 & 커피콩 마크 */}
          <rect x="42" y="70" width="16" height="13" rx="2" fill="#0f172a" opacity="0.6" />
          <ellipse cx="50" cy="76" rx="3" ry="2.2" fill="#d97706" transform="rotate(-15 50 76)" />
          <path d="M 48 76 Q 50 75 52 77" stroke="#78350f" strokeWidth="0.8" strokeLinecap="round" />
        </g>

        {/* 3. 바리스타 머리 & 얼굴 */}
        <g id="baristaHead">
          {/* 목 */}
          <rect x="46" y="38" width="8" height="10" rx="2" fill="#fed7aa" />

          {/* 얼굴 */}
          <ellipse cx="50" cy="27" rx="14" ry="13" fill="#ffedd5" />

          {/* 귀 */}
          <circle cx="36" cy="28" r="2.5" fill="#fed7aa" />
          <circle cx="64" cy="28" r="2.5" fill="#fed7aa" />

          {/* 헤어 스타일 */}
          <path d="M 36 24 C 36 14, 64 14, 64 24 C 64 21, 60 17, 50 17 C 40 17, 36 21, 36 24 Z" fill="#3b2416" />

          {/* 바리스타 베레모 / 캡 (Barista Beret) */}
          <path d="M 33 21 C 33 11, 67 11, 67 21 C 67 23, 33 23, 33 21 Z" fill="#78350f" />
          <path d="M 31 20 Q 50 18 69 20 L 70 23 Q 50 21 30 23 Z" fill="#92400e" />
          <circle cx="50" cy="11" r="1.5" fill="#d97706" />

          {/* 눈 (깜빡임 애니메이션) */}
          <g className={styles.baristaEye}>
            <ellipse cx="44.5" cy="26" rx="1.6" ry="2" fill="#1e293b" />
            <circle cx="45" cy="25.3" r="0.6" fill="#ffffff" />
            <ellipse cx="55.5" cy="26" rx="1.6" ry="2" fill="#1e293b" />
            <circle cx="56" cy="25.3" r="0.6" fill="#ffffff" />
          </g>

          {/* 볼터치 (Blush) */}
          <ellipse cx="41" cy="30" rx="2.5" ry="1.2" fill="#fca5a5" opacity="0.6" />
          <ellipse cx="59" cy="30" rx="2.5" ry="1.2" fill="#fca5a5" opacity="0.6" />

          {/* 코 & 미소 입 */}
          <path d="M 50 28 L 50 29.5" stroke="#ea580c" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M 47 32 Q 50 35 53 32" stroke="#78350f" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </g>

        {/* 4. 드립 기구 & 커피 서버 (Drip Stand & Glass Server) */}
        <g id="dripEquipment">
          {/* 드립 스탠드 거치대 */}
          <path d="M 20 95 L 20 62 L 36 62" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />

          {/* 유리 서버 카라페 (Glass Carafe) */}
          <path
            d="M 23 75 L 37 75 L 40 94 Q 40 96 38 96 L 22 96 Q 20 96 20 94 Z"
            fill="url(#glassServerGradient)"
            stroke="#94a3b8"
            strokeWidth="1.2"
          />
          {/* 서버 눈금 */}
          <line x1="24" y1="82" x2="27" y2="82" stroke="#cbd5e1" strokeWidth="0.8" />
          <line x1="24" y1="87" x2="28" y2="87" stroke="#cbd5e1" strokeWidth="0.8" />
          <line x1="24" y1="92" x2="27" y2="92" stroke="#cbd5e1" strokeWidth="0.8" />

          {/* 추출된 커피 액체 (서버 내부) */}
          <path
            d="M 21.5 84 Q 30 83 38.5 84 L 39.5 94 Q 39.5 95.5 38 95.5 L 22 95.5 Q 20.5 95.5 20.5 94 Z"
            fill="url(#coffeeGradient)"
          />

          {/* V60 원뿔형 커피 드리퍼 (Dripper Cone) */}
          <path d="M 22 56 L 38 56 L 33 67 L 27 67 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" />
          {/* 종이 필터 및 커피가루 원두 */}
          <path d="M 24 57 L 36 57 L 32 65 L 28 65 Z" fill="#92400e" />
          <ellipse cx="30" cy="57" rx="5" ry="1.2" fill="#582900" />
        </g>

        {/* 5. 애니메이션 레이어: 커피 물줄기, 드립 방울, 스팀 김 */}
        {isBrewing && (
          <g id="brewingAnimations">
            {/* 주전자에서 나오는 온수 물줄기 */}
            <path
              d="M 52 48 Q 42 49 31 56"
              stroke="#67e8f9"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
              className={styles.waterStream}
            />

            {/* 드리퍼에서 아래 서버로 떨어지는 커피 방울 */}
            <circle cx="30" cy="69" r="1.5" fill="#78350f" className={styles.dripDrop} />

            {/* 피어오르는 따뜻한 커피 김 (Steam) */}
            <path
              d="M 27 52 Q 25 45 28 40"
              stroke="rgba(255, 255, 255, 0.7)"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
              className={styles.steam1}
            />
            <path
              d="M 31 51 Q 34 44 31 38"
              stroke="rgba(255, 255, 255, 0.75)"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
              className={styles.steam2}
            />
            <path
              d="M 35 52 Q 33 46 36 41"
              stroke="rgba(255, 255, 255, 0.65)"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
              className={styles.steam3}
            />
          </g>
        )}

        {/* 6. 주전자 (Gooseneck Pour-Over Kettle) & 바리스타 손 */}
        <g id="kettleAndHands" className={isBrewing ? styles.kettleGroup : undefined}>
          {/* 주전자 몸통 */}
          <path
            d="M 56 46 L 74 46 L 76 60 Q 76 64 72 64 L 58 64 Q 54 64 54 60 Z"
            fill="url(#kettleGradient)"
            stroke="#64748b"
            strokeWidth="1"
          />
          {/* 주전자 뚜껑 & 손잡이 꼭지 */}
          <rect x="58" y="43" width="14" height="3" rx="1.5" fill="#475569" />
          <circle cx="65" cy="41.5" r="1.5" fill="#b45309" />

          {/* 주전자 구스넥 주둥이 (Gooseneck Spout) */}
          <path
            d="M 54 59 Q 47 57 48 48 Q 49 46 53 47"
            stroke="url(#kettleGradient)"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />

          {/* 주전자 손잡이 */}
          <path
            d="M 75 48 Q 83 50 82 58 Q 81 63 75 62"
            stroke="#1e293b"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* 바리스타 손 (주전자 손잡이를 쥔 손) */}
          <circle cx="79" cy="54" r="3.2" fill="#ffedd5" />
          <circle cx="68" cy="46" r="2.8" fill="#ffedd5" />
        </g>
      </svg>
      )}
    </div>
  );
}
