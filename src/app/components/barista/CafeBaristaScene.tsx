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

const CLASSIC_MENU = [
  { id: "americano", name: "아메리카노", icon: "☕", note: "깔끔하고 깊은 풍미의 에스프레소 블렌드" },
  { id: "latte", name: "카페라떼", icon: "🥛", note: "부드러운 스팀 밀크와 고소한 원두의 조화" },
  { id: "espresso", name: "에스프레소", icon: "⚡", note: "초집중 몰입을 위한 진하고 강렬한 샷" },
  { id: "coldbrew", name: "콜드브루", icon: "🧊", note: "12시간 정성껏 추출한 깔끔한 여운" },
];

const CHAERIN_MENU = [
  { id: "peach_tea", name: "복숭아아이스티", icon: "🍑", note: "달콤상큼 시원하게 기분 전환하는 복숭아 아이스티" },
  { id: "lemonade", name: "레모네이드", icon: "🍋", note: "상큼 톡 쏘는 에너지 충전 레모네이드" },
  { id: "iced_choco", name: "아이스초코", icon: "🍫", note: "달콤하고 시원하게 감싸주는 진한 아이스초코" },
  { id: "fruit_frappe", name: "과일프라페", icon: "🍧", note: "시원하고 달콤한 과일 듬뿍 프라페" },
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
  const isChaerin =
    presetId === "chaerin" ||
    baristaName.includes("채린") ||
    baristaName.includes("채스터") ||
    baristaName.includes("칼찌");

  const activeMenu = isChaerin ? CHAERIN_MENU : CLASSIC_MENU;
  const [selectedCoffee, setSelectedCoffee] = useState(activeMenu[0]);
  const [isBrewing, setIsBrewing] = useState(false);
  const [servedToast, setServedToast] = useState<string | null>(null);
  const [showActionCutin, setShowActionCutin] = useState(false);

  // 페르소나 변경 시 기본 메뉴 동기화
  React.useEffect(() => {
    setSelectedCoffee(isChaerin ? CHAERIN_MENU[0] : CLASSIC_MENU[0]);
  }, [isChaerin]);

  const isRobot =
    !isChaerin &&
    (presetId === "pm" ||
      baristaName.includes("칼퇴") ||
      baristaName.includes("봇") ||
      baristaName.includes("로봇"));

  const isMale =
    !isChaerin &&
    !isRobot &&
    (presetId === "secretary" || baristaName.includes("부장"));

  const imageSrc = isChaerin
    ? "/barista/barista_chaerin_3d.png"
    : isRobot
    ? "/barista/barista_robot_3d.png"
    : isMale
    ? isBrewing
      ? "/barista/barista_male_3d_brewing.jpg"
      : "/barista/barista_male_3d_serving.jpg"
    : isBrewing
    ? "/barista/barista_3d_brewing.jpg"
    : "/barista/barista_3d_serving.jpg";

  const handleRingBell = () => {
    setIsBrewing(true);

    if (isChaerin) {
      setShowActionCutin(true);
      setServedToast(`⚔️ 슉. 슈슉. 칼찌장인 채린이가 번개처럼 ${selectedCoffee.name} 제조 중! 🗡️✨`);

      setTimeout(() => {
        setShowActionCutin(false);
      }, 1600);

      setTimeout(() => {
        setIsBrewing(false);
        setServedToast(`🛎️ 훗! 특제 ${selectedCoffee.name} 완성! 시원하게 마시든가! 🍑`);
      }, 2500);

      setTimeout(() => {
        setServedToast(null);
      }, 6000);
      return;
    }

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
      {/* ⚔️ 칼찌장인 채린이 액션 컷인 오버레이 */}
      {showActionCutin && (
        <div className={styles.chaerinCutinOverlay} aria-hidden="true">
          <div className={styles.cutinSpeedlines} />
          <div className={styles.cutinBanner}>
            <div className={styles.cutinTextGroup}>
              <span className={styles.cutinBadge}>⚡ SPECIAL ACTION CUT-IN</span>
              <div className={styles.cutinTitle}>슉. 슈슉. 칼찌 제조 중!</div>
              <div className={styles.cutinSubtitle}>
                {selectedCoffee.name} 주문 접수 완료 🗡️
              </div>
            </div>
            <div className={styles.cutinImageWrap}>
              <img
                src="/barista/barista_chaerin_action.png"
                alt="칼찌장인 채린이 액션 스탠스"
                className={styles.cutinImage}
              />
            </div>
          </div>
          <div className={styles.cutinFlash} />
        </div>
      )}

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

          {/* ☕ 슬림한 커피/음료 메뉴 칩 바 */}
          <div className={styles.coffeeTypeSelector}>
            {activeMenu.map((item) => (
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
        </div>

        {/* ☕ 우측: 카운터 테이블 & 3D 바리스타 스테이지 */}
        <div className={styles.sceneRight}>
          <div className={styles.barCounterStage}>
            {/* 3D 바리스타 액터 (마우스 3D 시선 추적 & 유체 스팀) */}
            <div className={styles.stageBaristaActor}>
              <InteractiveBarista3D
                size={compact ? 125 : 140}
                imageSrc={imageSrc}
                isBrewing={isBrewing}
                personaName={baristaName}
                hideSteam={isChaerin}
                onClick={handleRingBell}
              />
            </div>

            {/* 🪑 원목 카운터 테이블 3D 상판 (인터랙티브 바) */}
            <div className={styles.counterTable}>
              {/* 좌측: 인터랙티브 카운터 호출 벨 */}
              <button
                type="button"
                className={styles.counterBellBtn}
                onClick={handleRingBell}
                title="🛎️ 카운터 벨을 울려 음료 새로 내리기"
                aria-label="카운터 벨 울리기"
              >
                <span className={styles.counterBellIcon}>🛎️</span>
                <span className={styles.counterBellLabel}>벨 울리기</span>
              </button>

              {/* 중앙 소품 */}
              <div className={styles.counterPropsGroup}>
                <span
                  className={styles.counterProp}
                  title="바닐라 시럽 🍯"
                  onClick={() => setServedToast(`🍯 달콤한 바닐라 시럽을 듬뿍 추가했어요!`)}
                >
                  🍯
                </span>
                <span
                  className={styles.counterProp}
                  title="에스프레소 원두 🫘"
                  onClick={() => setServedToast(`🫘 오늘 로스팅된 최상급 스페셜티 원두입니다!`)}
                >
                  🫘
                </span>
              </div>

              {/* 우측: 시원한 음료 / 따뜻한 커피잔 */}
              <div
                className={styles.stageCoffeeCup}
                onClick={handleRingBell}
                title={`클릭하여 ${selectedCoffee.name} 한 잔 더 내리기!`}
              >
                {isChaerin ? (
                  <div className={styles.stageIceGlintGroup}>
                    <span className={styles.stageGlintStar} style={{ top: -8, left: -6, animationDelay: "0s" }}>✨</span>
                    <span className={styles.stageGlintStar} style={{ top: -16, right: -4, animationDelay: "0.7s" }}>✦</span>
                    <span className={styles.stageGlintStar} style={{ top: -4, right: 8, animationDelay: "1.4s" }}>✧</span>
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
