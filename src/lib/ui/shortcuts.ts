export interface GlobalShortcutsOptions {
  /** 텍스트 선택 후 Ctrl/Cmd + L 또는 I를 눌렀을 때 호출 (선택된 텍스트 전달) */
  onQuoteText?: (selectedText: string) => void;
  /** 왼쪽 Shift를 빠르게 두 번 눌렀다 떼면 호출 */
  onTriggerBarista?: () => void;
  /** 인터랙티브 모달, 승인 카드 등에서 Ctrl/Cmd + D를 눌렀을 때 호출 */
  onCancelInteractive?: () => void;
  /** Ctrl/Cmd + Enter를 눌렀을 때 호출 */
  onSubmitInteractive?: () => void;
  /** Escape 키를 눌렀을 때 호출 */
  onEscape?: () => void;
  /** 선택된 텍스트를 가져오는 함수 (테스트 주입용) */
  getSelectedText?: () => string;
  /** 현재 시각 반환 함수 (테스트 주입용, 기본 Date.now) */
  now?: () => number;
}

export interface KeyboardEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
  code?: string;
  type?: string;
  altKey?: boolean;
  preventDefault?: () => void;
}

/** 각 창이 독립적으로 관리한다. 두 번 모두 keyup까지 확인해야 조합키를 제외할 수 있다. */
export function createLeftShiftGesture(now: () => number = () => performance.now()) {
  const pressed = new Set<string>();
  let started: number | null = null;
  let previousRelease: number | null = null;
  const reset = () => { pressed.clear(); started = previousRelease = null; };
  return {
    reset,
    handle(event: KeyboardEventLike): boolean {
      const key = event.code || event.key;
      const down = event.type === "keydown";
      const repeated = event.repeat || (down && pressed.has(key));
      if (down) pressed.add(key); else pressed.delete(key);
      if (event.code !== "ShiftLeft" || event.ctrlKey || event.metaKey || event.altKey) {
        started = previousRelease = null;
        return false;
      }
      const time = now();
      if (down) {
        if (repeated || pressed.size !== 1) started = previousRelease = null;
        else started = time;
        return false;
      }
      const tap = started !== null && time - started <= 250 && pressed.size === 0;
      started = null;
      if (!tap) { previousRelease = null; return false; }
      const gap = previousRelease === null ? null : time - previousRelease;
      if (gap !== null && gap >= 70 && gap <= 500) {
        previousRelease = null;
        return true;
      }
      previousRelease = time;
      return false;
    },
  };
}

/** 선택 영역과 이벤트를 같은 창에서 읽고, 창이 닫힐 때 해제한다. */
export function bindGlobalShortcuts(target: Window, options: GlobalShortcutsOptions): () => void {
  const gesture = createLeftShiftGesture(options.now);
  const capture = { capture: true };
  const handleGesture = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) { gesture.reset(); return; }
    if (gesture.handle(event)) options.onTriggerBarista?.();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    handleGlobalShortcutEvent(event, {
      ...options,
      getSelectedText: () => {
        const active = target.document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
        if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT") &&
            active.selectionStart != null && active.selectionEnd != null) {
          return active.value.slice(active.selectionStart, active.selectionEnd).trim();
        }
        return target.getSelection()?.toString().trim() || "";
      },
    });
  };
  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keydown", handleGesture, capture);
  target.addEventListener("keyup", handleGesture, capture);
  target.addEventListener("blur", gesture.reset);
  return () => {
    gesture.reset();
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keydown", handleGesture, capture);
    target.removeEventListener("keyup", handleGesture, capture);
    target.removeEventListener("blur", gesture.reset);
  };
}

/**
 * Antigravity 2.13.0 스타일의 전역 키보드 단축키 이벤트 처리기
 * - 왼쪽 Shift 두 번은 bindGlobalShortcuts의 keydown/keyup 처리에서 감지
 * - Ctrl/Cmd + L or I: 텍스트 인용 또는 바리스타 입력창 포커스
 * - Ctrl/Cmd + D: 대화형 취소/닫기
 * - Ctrl/Cmd + Enter: 제출/승인
 * - Escape: 모달/패널 닫기 또는 최소화
 *
 * @returns 단축키가 처리되어 기본 동작이 방지되었거나 액션이 실행되었으면 true
 */
export function handleGlobalShortcutEvent(
  e: KeyboardEventLike,
  options: GlobalShortcutsOptions
): boolean {
  const key = e.key.toLowerCase();

  const isModifier = e.ctrlKey || e.metaKey;

  // 1. Escape: 모달/패널 닫기
  if (key === "escape") {
    if (options.onEscape) {
      options.onEscape();
      return true;
    }
    return false;
  }

  // 2. Ctrl/Cmd + Enter: 제출/승인
  if (isModifier && key === "enter") {
    if (options.onSubmitInteractive) {
      e.preventDefault?.();
      options.onSubmitInteractive();
      return true;
    }
    return false;
  }

  // 3. Ctrl/Cmd + D: 대화형 취소/닫기 (Antigravity Cancel shortcut)
  if (isModifier && key === "d") {
    if (options.onCancelInteractive) {
      e.preventDefault?.();
      options.onCancelInteractive();
      return true;
    }
    return false;
  }

  // 4. Ctrl/Cmd + L or Ctrl/Cmd + I: 텍스트 인용 (Antigravity Quote shortcut)
  if (isModifier && (key === "l" || key === "i")) {
    e.preventDefault?.();
    let text = "";
    if (options.getSelectedText) {
      text = options.getSelectedText();
    } else if (typeof window !== "undefined") {
      try {
        text = window.getSelection()?.toString().trim() || "";
      } catch {
        text = "";
      }
    }
    if (options.onQuoteText) {
      options.onQuoteText(text);
      return true;
    }
    return false;
  }

  return false;
}
