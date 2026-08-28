"use client";

import React, { useState } from "react";
import { InteractiveBarista3D } from "./InteractiveBarista3D";
import styles from "./cafeBaristaScene.module.css";

export interface CafeBaristaSceneProps {
  baristaName?: string;
  presetId?: string;
  title?: string;
  description?: string;
  dateLabel?: string;
  onOpenCopilot?: () => void;
  compact?: boolean;
}

const COFFEE_MENU = [
  { id: "americano", name: "아메리카노", icon: "☕", note: "깔끔하고 깊은 풍미의 에스프레소 블렌드" },
  { id: "latte", name: "카페라떼", icon: "🥛", note: "부드러운 스팀 밀크와 고소한 원두의 조화" },
  { id: "espresso", name: "에스프레소", icon: "⚡", note: "초집중 몰입을 위한 진하고 강렬한 샷" },
  { id: "coldbrew", name: "콜드브루", icon: "🧊", note: "12시간 정성껏 추출한 깔끔한 여운" },
];

export function CafeBaristaScene({
  baristaName = "AI 바리스타",
  presetId = "karina",
  title = "주문하신 오늘의 브리핑 나왔습니다! ☕",
  description = "따뜻한 커피 향과 함께 오늘 꼭 챙겨야 할 중요 업무와 일정을 확인해 보세요.",
  dateLabel,
  onOpenCopilot,
  compact = false,
}: CafeBaristaSceneProps) {
  const [selectedCoffee, setSelectedCoffee] = useState(COFFEE_MENU[0]);
  const [isBrewing, setIsBrewing] = useState(false);
  const [servedToast, setServedToast] = useState<string | null>(null);

  const isMale =
    presetId === "secretary" ||
    presetId === "pm" ||
    baristaName.includes("부장") ||
    baristaName.includes("봇");

  const imageSrc = isMale
    ? isBrewing
      ? "/barista/barista_male_3d_brewing.jpg"
      : "/barista/barista_male_3d_serving.jpg"
    : isBrewing
      ? "/barista/barista_3d_brewing.jpg"
      : "/barista/barista_3d_serving.jpg";

  const handleRingBell = () => {
    setIsBrewing(true);
    setServedToast(`🛎️ ${baristaName}가 신선한 ${selectedCoffee.name}를 내리는 중입니다! ☕`);

    setTimeout(() => {
      setIsBrewing(false);
      setServedToast(`✨ 주문하신 ${selectedCoffee.name} 나왔습니다! 맛있게 드세요.`);
    }, 2800);

    setTimeout(() => {
      setServedToast(null);
    }, 6000);
  };

  return (
    <section
      className={`${styles.sceneContainer} ${compact ? styles.sceneContainerCompact : ""}`}
      aria-label="카페 바리스타 카운터 장면"
    >
      {/* 🌟 펜던트 램프 & 앰비언트 라이트 */}
      <div className={styles.ambientLighting} />
      <div className={styles.pendantLamp} style={{ left: "20%" }} />
      <div className={styles.pendantLamp} style={{ left: "75%" }} />

      <div className={styles.sceneGrid}>
        {/* 📋 좌측: 브리핑 & 주문 영수증 보드 */}
        <div className={styles.sceneLeft}>
          <div className={styles.sceneHeaderBadge}>
            <span>☕ CoffeeTide Espresso Bar</span>
            {dateLabel && <span>• {dateLabel}</span>}
          </div>

          <h2 className={styles.sceneTitle}>
            {servedToast || title}
          </h2>

          <p className={styles.sceneDescription}>
            {description}
          </p>

          {/* 🛎️ 가젯 바: 벨 울리기, 메뉴 선택, 대화 열기 */}
          <div className={styles.counterGadgets}>
            <button
              type="button"
              className={styles.bellButton}
              onClick={handleRingBell}
              title="카운터 벨을 울려 커피 새로 내리기"
            >
              <span>🛎️ 벨 울리기</span>
            </button>

            <div className={styles.coffeeTypeSelector}>
              {COFFEE_MENU.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.coffeeTypeBtn} ${
                    selectedCoffee.id === item.id ? styles.coffeeTypeBtnActive : ""
                  }`}
                  onClick={() => {
                    setSelectedCoffee(item);
                    handleRingBell();
                  }}
                  title={item.note}
                >
                  {item.icon} {item.name}
                </button>
              ))}
            </div>

            {onOpenCopilot && (
              <button
                type="button"
                className={styles.bellButton}
                style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", borderColor: "#3b82f6" }}
                onClick={onOpenCopilot}
                title="AI 바리스타와 실시간 대화하기"
              >
                💬 바리스타와 대화
              </button>
            )}
          </div>
        </div>

        {/* ☕ 우측: 카운터 테이블 & 3D 바리스타 스테이지 */}
        <div className={styles.sceneRight}>
          <div className={styles.barCounterStage}>
            {/* 카운터 소품: 원두 그라인더, 시럽 */}
            <div className={styles.counterTable}>
              <span className={styles.counterProp} title="에스프레소 그라인더">⚙️</span>
              <span className={styles.counterProp} title="바닐라 시럽">🍯</span>
              <span className={styles.counterProp} title="커피 콩">🫘</span>
            </div>

            {/* 3D 바리스타 액터 (마우스 3D 시선 추적 & 유체 스팀) */}
            <div className={styles.stageBaristaActor}>
              <InteractiveBarista3D
                size={140}
                imageSrc={imageSrc}
                isBrewing={isBrewing}
                personaName={baristaName}
                onClick={handleRingBell}
              />
            </div>

            {/* 갓 추출한 김이 모락모락 피어오르는 커피잔 */}
            <div
              className={styles.stageCoffeeCup}
              onClick={handleRingBell}
              title="클릭하여 따뜻한 커피 한 잔 더 주문하기!"
            >
              <div className={styles.stageSteamPlume} />
              <span style={{ fontSize: "1.8rem" }}>{selectedCoffee.icon}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
