"use client";

import React, { useState, useEffect } from "react";
import styles from "./proactiveNudgeCard.module.css";

interface ProactiveNudgeCardProps {
  taskCount: number;
  urgentCount: number;
  onActionHandoff: () => void;
  onActionBriefing: (prompt: string) => void;
}

export function ProactiveNudgeCard({
  taskCount,
  urgentCount,
  onActionHandoff,
  onActionBriefing,
}: ProactiveNudgeCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [hours, setHours] = useState(12);

  useEffect(() => {
    setHours(new Date().getHours());
  }, []);

  if (dismissed) return null;

  // 제안 카드 타입 결정
  let icon = "☕";
  let title = "AI 바리스타의 먼저 말걸기";
  let message = "";
  let primaryBtnText = "";
  let onPrimaryAction = () => {};

  if (hours >= 17) {
    icon = "🌆";
    title = "AI 바리스타의 퇴근 전 한마디";
    message = "오늘 하루도 수고 많으셨어요! Handoff 상태를 정돈해두시면 내일 아침 출근이 훨씬 편안해집니다 ☕";
    primaryBtnText = "Handoff 정리하기";
    onPrimaryAction = onActionHandoff;
  } else if (urgentCount >= 2) {
    icon = "🚨";
    title = "AI 바리스타의 우선순위 제안";
    message = `마감 또는 긴급 조치가 필요한 업무가 ${urgentCount}건 있어요! 지금 우선순위를 확인해보세요.`;
    primaryBtnText = "긴급 업무 브리핑 받기";
    onPrimaryAction = () => onActionBriefing("오늘 처리해야 할 긴급 업무들을 요약해줘");
  } else if (taskCount >= 5) {
    icon = "📋";
    title = "AI 바리스타의 스마트 코칭";
    message = `할 일이 ${taskCount}개 쌓여 있네요. 에스프레소 한 잔과 함께 우선순위를 깔끔하게 묶어드릴까요?`;
    primaryBtnText = "오늘의 브리핑 받기";
    onPrimaryAction = () => onActionBriefing("오늘 해야 할 주요 업무들을 브리핑해줘");
  } else {
    icon = "✨";
    title = "AI 바리스타의 한마디";
    message = "업무가 잘 정리되어 쾌적한 상태입니다. 커피 한 잔과 함께 여유를 즐겨보세요 ☕";
    primaryBtnText = "전체 상태 브리핑";
    onPrimaryAction = () => onActionBriefing("현재 내 업무 상태를 전체 요약해줘");
  }

  return (
    <div className={styles.nudgeContainer}>
      <div className={styles.nudgeHeader}>
        <div className={styles.nudgeTitleGroup}>
          <span className={styles.nudgeIcon}>{icon}</span>
          <span className={styles.nudgeTitle}>{title}</span>
          <span className={styles.nudgeBadge}>카나나 벤치마킹 선톡</span>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => setDismissed(true)}
          title="제안 카드 닫기"
          aria-label="제안 카드 닫기"
        >
          ✕
        </button>
      </div>
      <div className={styles.nudgeMessage}>{message}</div>
      <div className={styles.nudgeFooter}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onPrimaryAction}
        >
          {primaryBtnText}
        </button>
      </div>
    </div>
  );
}
