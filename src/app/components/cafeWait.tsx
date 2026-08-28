// 카페 주문 컨셉 대기 안내 — 단계 멘트가 순차적으로 넘어가고 마지막 멘트에서 멈춘다.

"use client";

import { useEffect, useState } from "react";
import { BaristaBrewing } from "./barista/BaristaBrewing";
import styles from "./cafeWait.module.css";

export default function CafeWait({
  steps,
  interval = 1400,
  withBarista = false,
  baristaSize = 64,
  personaName,
  presetId,
}: {
  steps: string[];
  interval?: number;
  withBarista?: boolean;
  baristaSize?: number;
  personaName?: string;
  presetId?: string;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((i) => Math.min(i + 1, steps.length - 1));
    }, interval);
    return () => clearInterval(timer);
  }, [steps, interval]);

  return (
    <div className={styles.waitWrapper} role="status" aria-live="polite">
      {withBarista && (
        <BaristaBrewing
          size={baristaSize}
          isBrewing={true}
          showBubbleOnHover={false}
          personaName={personaName}
          presetId={presetId}
        />
      )}
      <span className={styles.wait}>
        <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
        <span>{steps[Math.min(idx, steps.length - 1)]}</span>
      </span>
    </div>
  );
}
