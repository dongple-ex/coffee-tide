import { describe, it, expect, vi } from "vitest";
import { bindGlobalShortcuts, createLeftShiftGesture, handleGlobalShortcutEvent } from "./shortcuts";

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


describe("left Shift double tap", () => {
  it("toggles visibility from the main and mini windows without combining taps across windows", () => {
    let time = 0;
    let visible = false;
    const main = Object.assign(new EventTarget(), { document: { activeElement: null } }) as unknown as Window;
    const mini = Object.assign(new EventTarget(), { document: { activeElement: null } }) as unknown as Window;
    const toggle = vi.fn(() => { visible = !visible; });
    const cleanup = [main, mini].map(target => bindGlobalShortcuts(target, { onTriggerBarista: toggle, now: () => time }));
    const tap = (target: Window, code = "ShiftLeft") => {
      for (const type of ["keydown", "keyup"]) {
        time += 50;
        target.dispatchEvent(Object.assign(new Event(type), { key: "Shift", code, ctrlKey: false, metaKey: false }));
      }
    };
    tap(main); tap(main);
    expect(visible).toBe(true);
    tap(mini, "ShiftRight"); tap(mini, "ShiftRight");
    expect(visible).toBe(true);
    tap(mini); tap(mini);
    expect(visible).toBe(false);
    tap(main); tap(main);
    expect(visible).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(3);
    cleanup.forEach(fn => fn());
  });

  function fixture() {
    let time = 0;
    const gesture = createLeftShiftGesture(() => time);
    const feed = (code: string, type: string, at: number, extra = {}) => {
      time = at;
      return gesture.handle({ key: code.startsWith("Shift") ? "Shift" : code, code, type, ctrlKey: false, metaKey: false, ...extra });
    };
    const tap = (at: number, code = "ShiftLeft") => {
      expect(feed(code, "keydown", at)).toBe(false);
      return feed(code, "keyup", at + 40);
    };
    return { gesture, feed, tap };
  }

  it("waits for the second release and does not retrigger on the third tap", () => {
    const { tap, feed } = fixture();
    expect(tap(0)).toBe(false);
    expect(feed("ShiftLeft", "keydown", 200)).toBe(false);
    expect(feed("ShiftLeft", "keyup", 240)).toBe(true);
    expect(tap(400)).toBe(false);
  });

  it("rejects right Shift, mixed sides, held keys, repeats, slow taps and chords", () => {
    let f = fixture();
    expect(f.tap(0, "ShiftRight")).toBe(false);
    expect(f.tap(200, "ShiftRight")).toBe(false);
    f = fixture(); f.tap(0);
    expect(f.tap(200, "ShiftRight")).toBe(false);
    expect(f.tap(400)).toBe(false);
    f = fixture(); f.feed("ShiftLeft", "keydown", 0);
    expect(f.feed("ShiftLeft", "keyup", 251)).toBe(false);
    expect(f.tap(300)).toBe(false);
    f = fixture(); f.tap(0);
    f.feed("ShiftLeft", "keydown", 200);
    f.feed("ShiftLeft", "keydown", 220, { repeat: true });
    expect(f.feed("ShiftLeft", "keyup", 240)).toBe(false);
    f = fixture(); f.tap(0);
    expect(f.tap(501)).toBe(false);
    f = fixture(); f.tap(0);
    f.feed("ShiftLeft", "keydown", 200);
    f.feed("KeyA", "keydown", 210);
    f.feed("KeyA", "keyup", 220);
    expect(f.feed("ShiftLeft", "keyup", 240)).toBe(false);
    f = fixture(); f.feed("ControlLeft", "keydown", 0);
    expect(f.tap(100)).toBe(false);
    expect(f.tap(300)).toBe(false);
    f = fixture(); f.tap(0);
    f.feed("ShiftLeft", "keydown", 200, { altKey: true });
    expect(f.feed("ShiftLeft", "keyup", 240)).toBe(false);
  });

  it("clears a partial gesture on blur and keeps windows independent", () => {
    let time = 0;
    const onTriggerBarista = vi.fn();
    const main = Object.assign(new EventTarget(), { document: { activeElement: null } }) as unknown as Window;
    const popup = Object.assign(new EventTarget(), { document: { activeElement: null } }) as unknown as Window;
    const cleanups = [main, popup].map(target => bindGlobalShortcuts(target, { onTriggerBarista, now: () => time }));
    const tap = (target: Window, at: number) => {
      for (const [type, offset] of [["keydown", 0], ["keyup", 40]] as const) {
        time = at + offset;
        target.dispatchEvent(Object.assign(new Event(type), { key: "Shift", code: "ShiftLeft", ctrlKey: false, metaKey: false }));
      }
    };
    tap(main, 0); tap(popup, 200);
    expect(onTriggerBarista).not.toHaveBeenCalled();
    main.dispatchEvent(new Event("blur"));
    tap(main, 300);
    expect(onTriggerBarista).not.toHaveBeenCalled();
    tap(main, 500);
    expect(onTriggerBarista).toHaveBeenCalledOnce();
    cleanups.forEach(cleanup => cleanup());
    tap(main, 700); tap(main, 900);
    expect(onTriggerBarista).toHaveBeenCalledOnce();
  });
});
