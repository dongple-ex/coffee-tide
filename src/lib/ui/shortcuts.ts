export interface GlobalShortcutsOptions {
  /** 텍스트 선택 후 Ctrl/Cmd + L 또는 I를 눌렀을 때 호출 (선택된 텍스트 전달) */
  onQuoteText?: (selectedText: string) => void;
  /** 인터랙티브 모달, 승인 카드 등에서 Ctrl/Cmd + D를 눌렀을 때 호출 */
  onCancelInteractive?: () => void;
  /** Ctrl/Cmd + Enter를 눌렀을 때 호출 */
  onSubmitInteractive?: () => void;
  /** Escape 키를 눌렀을 때 호출 */
  onEscape?: () => void;
  /** 선택된 텍스트를 가져오는 함수 (테스트 주입용) */
  getSelectedText?: () => string;
}

export interface KeyboardEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  preventDefault?: () => void;
}

/** 선택 영역과 이벤트를 같은 창에서 읽고, 창이 닫힐 때 해제한다. */
export function bindGlobalShortcuts(target: Window, options: GlobalShortcutsOptions): () => void {
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
  return () => target.removeEventListener("keydown", handleKeyDown);
}

/**
 * Antigravity 2.13.0 스타일의 전역 키보드 단축키 이벤트 처리기
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
  const isModifier = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

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
