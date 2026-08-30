"use client";

import React, { useState } from "react";
import { InteractiveBarista3D } from "./InteractiveBarista3D";
import { getPersonaEffect, getPersonaAvatar, PersonaMenuItem } from "@/lib/ai/personaEffects";
import styles from "./cafeBaristaScene.module.css";

export interface CafeBaristaSceneProps {
  baristaName?: string;
  presetId?: string;
  /** null을 넘기면 제목 줄을 그리지 않는다 (바깥 카드에 이미 제목이 있는 경우) */
  title?: string | null;
  description?: string;
  dateLabel?: string;
  onOpenCopilot?: () => void;
  compact?: boolean;
}

export function CafeBaristaScene({
  baristaName = "AI 바리스타",
  presetId = "karina",
  title = "주문하신 오늘의 브리핑 나왔습니다! ☕",
  description = "따뜻한 커피 향과 함께 오늘 꼭 챙겨야 할 중요 업무와 일정을 확인해 보세요.",
  dateLabel,
  compact = false,
}: CafeBaristaSceneProps) {
  const effect = getPersonaEffect(presetId, baristaName);

  // 선택 상태를 메뉴 항목이 아닌 id로 보관한다.
  // 페르소나가 바뀌어 그 id가 새 메뉴에 없으면 자연히 첫 메뉴로 돌아가므로,
  // 페르소나 변경을 감지해 상태를 되돌리는 별도의 처리가 필요하지 않다.
  const [selectedCoffeeId, setSelectedCoffeeId] = useState<string | null>(null);
  const [isBrewing, setIsBrewing] = useState(false);
  const [servedToast, setServedToast] = useState<string | null>(null);
  const [showActionCutin, setShowActionCutin] = useState(false);

  const selectedCoffee: PersonaMenuItem =
    effect.menu.find((item) => item.id === selectedCoffeeId) || effect.menu[0];

  const handleRingBell = (drink: PersonaMenuItem = selectedCoffee) => {
    setIsBrewing(true);
    setServedToast(effect.brewingMessage(baristaName, drink.name));

    // 컷인이 정의된 페르소나는 벨을 울릴 때 전용 연출을 함께 띄운다.
    if (effect.cutin) {
      const cutinDuration = effect.cutin.durationMs;
      setShowActionCutin(true);
      setTimeout(() => setShowActionCutin(false), cutinDuration);
    }

    setTimeout(() => {
      setIsBrewing(false);
      setServedToast(effect.servedMessage(baristaName, drink.name));
    }, 2600);

    setTimeout(() => setServedToast(null), 6000);
  };

  const cutin = effect.cutin;

  return (
    <section
      className={`${styles.sceneContainer} ${compact ? styles.sceneContainerCompact : ""}`}
      aria-label="카페 바리스타 카운터 장면"
      style={
        {
          "--persona-accent": effect.accent,
          "--persona-glint": effect.glintColor,
        } as React.CSSProperties
      }
    >
      {/* ⚡ 페르소나별 벨 울리기 액션 컷인 오버레이 */}
      {showActionCutin && cutin && (
        <div
          className={styles.personaCutinOverlay}
          aria-hidden="true"
          style={
            {
              "--cutin-a": cutin.colorA,
              "--cutin-b": cutin.colorB,
            } as React.CSSProperties
          }
        >
          <div className={styles.cutinSpeedlines} />
          <div className={styles.cutinBanner}>
            <div className={styles.cutinTextGroup}>
              <span className={styles.cutinBadge}>{cutin.badge}</span>
              <div className={styles.cutinTitle}>{cutin.title}</div>
              <div className={styles.cutinSubtitle}>
                {cutin.subtitleTemplate.replace("{drink}", selectedCoffee.name)}
              </div>
            </div>
            {cutin.image && (
              <div className={styles.cutinImageWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cutin.image} alt={`${baristaName} 액션 스탠스`} className={styles.cutinImage} />
              </div>
            )}
          </div>
          <div className={styles.cutinFlash} />
        </div>
      )}

      {/* 🌟 펜던트 램프 & 앰비언트 라이트 (어두운 카페 배경일 때만 의미가 있어 축소 모드에서는 감춘다) */}
      {!compact && (
        <>
          <div className={styles.ambientLighting} />
          <div className={styles.pendantLamp} style={{ left: "20%" }} />
          <div className={styles.pendantLamp} style={{ left: "75%" }} />
        </>
      )}

      <div className={styles.sceneGrid}>
        {/* 📋 좌측: 브리핑 & 주문 영수증 보드 */}
        <div className={styles.sceneLeft}>
          <div className={styles.sceneHeaderBadge}>
            <span>☕ CoffeeTide Espresso Bar</span>
            {dateLabel && <span>• {dateLabel}</span>}
          </div>

          {(servedToast || title) && <h2 className={styles.sceneTitle}>{servedToast || title}</h2>}

          <p className={styles.sceneDescription}>{description}</p>
        </div>

        {/* ☕ 우측: 카운터 테이블 & 3D 바리스타 스테이지 */}
        <div className={styles.sceneRight}>
          <div className={styles.barCounterStage}>
            {/* 3D 바리스타 액터 (마우스 3D 시선 추적 & 페르소나별 파티클) */}
            <div className={styles.stageBaristaActor}>
              <InteractiveBarista3D
                size={compact ? 125 : 140}
                imageSrc={getPersonaAvatar(effect, isBrewing)}
                isBrewing={isBrewing}
                personaName={baristaName}
                presetId={presetId}
                onClick={() => handleRingBell()}
              />
            </div>

            {/* 🪑 원목 카운터 테이블 3D 상판 (인터랙티브 바) */}
            <div className={styles.counterTable}>
              {/* 좌측: 인터랙티브 카운터 호출 벨 */}
              <button
                type="button"
                className={styles.counterBellBtn}
                onClick={() => handleRingBell()}
                title="🛎️ 카운터 벨을 울려 음료 새로 내리기"
                aria-label="카운터 벨 울리기"
              >
                <span className={styles.counterBellIcon}>🛎️</span>
                <span className={styles.counterBellLabel}>벨 울리기</span>
              </button>

              {/* 중앙: 페르소나별 음료 메뉴 아이콘 칩 */}
              <div className={styles.counterMenuChips}>
                {effect.menu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.counterMenuChip} ${
                      selectedCoffee.id === item.id ? styles.counterMenuChipActive : ""
                    }`}
                    onClick={() => {
                      setSelectedCoffeeId(item.id);
                      handleRingBell(item);
                    }}
                    title={`${item.name} — ${item.note}`}
                    aria-label={item.name}
                  >
                    {item.icon}
                  </button>
                ))}
              </div>

              {/* 우측: 페르소나별 장식이 얹힌 음료잔 */}
              <div
                className={styles.stageCoffeeCup}
                onClick={() => handleRingBell()}
                title={`클릭하여 ${selectedCoffee.name} 한 잔 더 내리기!`}
              >
                {effect.cupDecoration === "glint" ? (
                  <div className={styles.stageIceGlintGroup}>
                    {effect.glintChars.map((char, idx) => (
                      <span
                        key={idx}
                        className={styles.stageGlintStar}
                        style={{
                          top: [-8, -16, -4][idx % 3],
                          left: idx === 0 ? -6 : undefined,
                          right: idx === 1 ? -4 : idx === 2 ? 8 : undefined,
                          animationDelay: `${idx * 0.7}s`,
                        }}
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.stageSteamPlume} />
                )}
                <span style={{ fontSize: "1.6rem" }}>{selectedCoffee.icon}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
