import { describe, it, expect, vi } from "vitest";
import { bindGlobalShortcuts, handleGlobalShortcutEvent } from "./shortcuts";

describe("bindGlobalShortcuts", () => {
  function fakeWindow(selectedText: string) {
    return Object.assign(new EventTarget(), {
      document: { activeElement: null },
      getSelection: () => ({ toString: () => selectedText }),
    }) as unknown as Window;
  }
  function keyEvent(key: string, ctrlKey = false) {
    return Object.assign(new Event("keydown", { cancelable: true }), { key, ctrlKey, metaKey: false, isComposing: false });
  }

  it("uses the popup's selection and releases listeners on cleanup", () => {
    const main = fakeWindow("parent text");
    const popup = fakeWindow("popup text");
    const onQuoteText = vi.fn();
    const onCancelInteractive = vi.fn();
    const onEscape = vi.fn();
    const options = { onQuoteText, onCancelInteractive, onEscape };
    const cleanupMain = bindGlobalShortcuts(main, options);
    const cleanupPopup = bindGlobalShortcuts(popup, options);
    popup.dispatchEvent(keyEvent("i", true));
    expect(onQuoteText).toHaveBeenLastCalledWith("popup text");
    main.dispatchEvent(keyEvent("i", true));
    expect(onQuoteText).toHaveBeenLastCalledWith("parent text");
    popup.dispatchEvent(keyEvent("d", true));
    popup.dispatchEvent(keyEvent("Escape"));
    expect(onCancelInteractive).toHaveBeenCalledOnce();
    expect(onEscape).toHaveBeenCalledOnce();
    cleanupPopup();
    popup.dispatchEvent(keyEvent("Escape"));
    expect(onEscape).toHaveBeenCalledOnce();
    cleanupMain();
  });

  it("quotes textarea selections and respects consumed events", () => {
    const target = fakeWindow("page selection");
    Object.defineProperty(target.document, "activeElement", {
      value: { tagName: "TEXTAREA", value: "first second", selectionStart: 6, selectionEnd: 12 },
    });
    const onQuoteText = vi.fn();
    const cleanup = bindGlobalShortcuts(target, { onQuoteText });
    target.dispatchEvent(keyEvent("i", true));
    expect(onQuoteText).toHaveBeenCalledWith("second");
    const consumed = keyEvent("i", true);
    consumed.preventDefault();
    target.dispatchEvent(consumed);
    expect(onQuoteText).toHaveBeenCalledOnce();
    cleanup();
  });
});

describe("handleGlobalShortcutEvent", () => {
  it("triggers onQuoteText with selected text on Ctrl+L", () => {
    const onQuoteText = vi.fn();
    const preventDefault = vi.fn();

    const handled = handleGlobalShortcutEvent(
      {
        key: "l",
        ctrlKey: true,
        metaKey: false,
        preventDefault,
      },
      {
        onQuoteText,
        getSelectedText: () => "업무 내용 요약 필요",
      }
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onQuoteText).toHaveBeenCalledWith("업무 내용 요약 필요");
  });

  it("triggers onQuoteText with selected text on Cmd+I (macOS style)", () => {
    const onQuoteText = vi.fn();
    const preventDefault = vi.fn();

    const handled = handleGlobalShortcutEvent(
      {
        key: "i",
        ctrlKey: false,
        metaKey: true,
        preventDefault,
      },
      {
        onQuoteText,
        getSelectedText: () => "회의록 검토",
      }
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onQuoteText).toHaveBeenCalledWith("회의록 검토");
  });

  it("triggers onCancelInteractive on Ctrl+D", () => {
    const onCancelInteractive = vi.fn();
    const preventDefault = vi.fn();

    const handled = handleGlobalShortcutEvent(
      {
        key: "d",
        ctrlKey: true,
        metaKey: false,
        preventDefault,
      },
      {
        onCancelInteractive,
      }
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onCancelInteractive).toHaveBeenCalledTimes(1);
  });

  it("triggers onSubmitInteractive on Ctrl+Enter", () => {
    const onSubmitInteractive = vi.fn();
    const preventDefault = vi.fn();

    const handled = handleGlobalShortcutEvent(
      {
        key: "Enter",
        ctrlKey: true,
        metaKey: false,
        preventDefault,
      },
      {
        onSubmitInteractive,
      }
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onSubmitInteractive).toHaveBeenCalledTimes(1);
  });

  it("triggers onEscape on Escape key", () => {
    const onEscape = vi.fn();

    const handled = handleGlobalShortcutEvent(
      {
        key: "Escape",
        ctrlKey: false,
        metaKey: false,
      },
      {
        onEscape,
      }
    );

    expect(handled).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("returns false for non-matching keys", () => {
    const handled = handleGlobalShortcutEvent(
      {
        key: "k",
        ctrlKey: true,
        metaKey: false,
      },
      {}
    );

    expect(handled).toBe(false);
  });
});
