"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./timerWidget.module.css";

interface TimerWidgetProps {
  onCompleteToast?: (msg: string) => void;
}

export function TimerWidget({ onCompleteToast }: TimerWidgetProps) {
  const [totalSeconds, setTotalSeconds] = useState(25 * 60); // 기본 25분 (포모도로)
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsRunning(false);
            onCompleteToast?.("🔔 집중 타이머가 완료되었습니다! 수고하셨어요 ☕");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, onCompleteToast]);

  const selectPreset = (minutes: number) => {
    const sec = minutes * 60;
    setIsRunning(false);
    setTotalSeconds(sec);
    setSecondsLeft(sec);
  };

  const toggleRun = () => {
    if (secondsLeft === 0) {
      setSecondsLeft(totalSeconds);
    }
    setIsRunning((prev) => !prev);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(totalSeconds);
  };

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const progressPercent = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>⏱️</span>
          <span>집중 몰입 타이머</span>
        </div>
        <div className={styles.presetList}>
          <button type="button" className={styles.presetChip} onClick={() => selectPreset(5)}>
            5분
          </button>
          <button type="button" className={styles.presetChip} onClick={() => selectPreset(10)}>
            10분
          </button>
          <button type="button" className={styles.presetChip} onClick={() => selectPreset(25)}>
            25분(포모도로)
          </button>
          <button type="button" className={styles.presetChip} onClick={() => selectPreset(60)}>
            60분
          </button>
        </div>
      </div>

      <div className={styles.timerBody}>
        <div className={styles.timeDisplay}>{formatTime(secondsLeft)}</div>
        <div className={styles.controls}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={toggleRun}
          >
            {isRunning ? "일시정지" : secondsLeft === 0 ? "재시작" : "시작"}
          </button>
          <button type="button" className={styles.btn} onClick={resetTimer}>
            리셋
          </button>
        </div>
      </div>

      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
