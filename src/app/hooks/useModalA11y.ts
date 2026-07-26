"use client";

import { RefObject, useEffect, useRef } from "react";

/** 모달 접근성 — 열릴 때 포커스 이동, Tab 순환 유지(포커스 트랩), ESC 닫기, 닫힐 때 포커스 복원 */
export function useModalA11y(
  open: boolean,
  containerRef: RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      // 닫힌 <details> 안의 요소 등 실제로 포커스 불가능한 것은 제외해야 트랩이 끊기지 않는다
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) =>
        typeof el.checkVisibility === "function" ? el.checkVisibility() : el.offsetParent !== null
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus();
    };
  }, [open, containerRef]);
}
