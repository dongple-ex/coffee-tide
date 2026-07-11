// 카페 주문 컨셉 대기 안내 — 단계 멘트가 순차적으로 넘어가고 마지막 멘트에서 멈춘다.

"use client";

import { useEffect, useState } from "react";

export default function CafeWait({
  steps,
  interval = 1400,
}: {
  steps: string[];
  interval?: number;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((i) => Math.min(i + 1, steps.length - 1));
    }, interval);
    return () => clearInterval(timer);
  }, [steps, interval]);

  return <span>{steps[Math.min(idx, steps.length - 1)]}</span>;
}
