"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** 별도 창의 제목 표시줄에 노출할 문구 */
  title: string;
  /** 사용자가 별도 창을 직접 닫았을 때 호출된다 */
  onClose: () => void;
  /** 브라우저가 팝업을 차단해 창을 열지 못했을 때 호출된다 */
  onBlocked?: () => void;
  children: React.ReactNode;
}

const WINDOW_NAME = "coffeetide_canvas_window";

/**
 * 부모 문서의 스타일시트를 새 창으로 복제한다.
 * 같은 출처의 스타일은 규칙을 그대로 옮기고, 규칙에 접근할 수 없는 외부 스타일시트는 link 태그로 다시 건다.
 */
function copyStylesTo(target: Window) {
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("");
      const style = target.document.createElement("style");
      style.textContent = css;
      target.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  });
}

/** 부모 문서의 html[data-theme] 값을 새 창에 그대로 반영한다 */
function syncTheme(target: Window) {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) target.document.documentElement.setAttribute("data-theme", theme);
  else target.document.documentElement.removeAttribute("data-theme");
}

/**
 * 자식 요소를 브라우저의 별도 창에 렌더링하는 포털이다.
 * PC(일반 뷰)에서 캔버스를 모달보다 훨씬 넓은 작업 공간으로 사용하기 위해 쓴다.
 */
export function CanvasWindowPortal({ title, onClose, onBlocked, children }: Props) {
  // 마운트 지점을 먼저 만들어 두고 별도 창이 열린 뒤에 그 창으로 옮긴다.
  // 이렇게 하면 창이 준비되었는지를 상태로 관리하지 않아도 되므로 불필요한 재렌더링이 발생하지 않는다.
  const [mountNode] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const host = document.createElement("div");
    host.style.height = "100vh";
    host.style.width = "100%";
    host.style.display = "flex";
    host.style.flexDirection = "column";
    return host;
  });
  const externalWindowRef = useRef<Window | null>(null);
  const onCloseRef = useRef(onClose);
  const onBlockedRef = useRef(onBlocked);

  useEffect(() => {
    onCloseRef.current = onClose;
    onBlockedRef.current = onBlocked;
  }, [onClose, onBlocked]);

  useEffect(() => {
    if (!mountNode) return;

    const width = Math.min(1560, Math.max(960, window.screen.availWidth - 120));
    const height = Math.min(1180, Math.max(640, window.screen.availHeight - 120));
    const left = Math.max(0, Math.round(window.screen.availWidth / 2 - width / 2));
    const top = Math.max(0, Math.round(window.screen.availHeight / 2 - height / 2));

    const externalWindow = window.open(
      "",
      WINDOW_NAME,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!externalWindow) {
      onBlockedRef.current?.();
      return;
    }

    externalWindowRef.current = externalWindow;

    // 같은 이름의 창을 재사용하는 경우가 있으므로 이전에 남아 있던 내용을 먼저 비운다.
    externalWindow.document.head.innerHTML = "";
    externalWindow.document.body.innerHTML = "";

    const charset = externalWindow.document.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    externalWindow.document.head.appendChild(charset);

    externalWindow.document.documentElement.lang = "ko";

    copyStylesTo(externalWindow);
    syncTheme(externalWindow);

    const body = externalWindow.document.body;
    body.style.margin = "0";
    body.style.padding = "0";
    // 창을 아주 작게 줄였을 때 하단 도구 막대가 잘리지 않도록 스크롤을 허용한다.
    body.style.overflow = "auto";
    body.style.background = "var(--bg, #0f1115)";
    body.style.color = "var(--text, #fff)";

    body.appendChild(externalWindow.document.adoptNode(mountNode));

    // 부모 창에서 테마를 바꾸면 별도 창에도 즉시 반영한다.
    const themeObserver = new MutationObserver(() => syncTheme(externalWindow));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    let closedByParent = false;
    const handleExternalClose = () => {
      if (closedByParent) return;
      onCloseRef.current();
    };
    externalWindow.addEventListener("pagehide", handleExternalClose);

    // pagehide가 발생하지 않는 브라우저를 대비한 안전망이다.
    const closeWatcher = window.setInterval(() => {
      if (externalWindow.closed) {
        window.clearInterval(closeWatcher);
        handleExternalClose();
      }
    }, 800);

    // 부모 창이 닫히면 남겨진 별도 창도 함께 정리한다.
    const handleParentUnload = () => {
      closedByParent = true;
      externalWindow.close();
    };
    window.addEventListener("beforeunload", handleParentUnload);

    return () => {
      closedByParent = true;
      window.clearInterval(closeWatcher);
      themeObserver.disconnect();
      externalWindow.removeEventListener("pagehide", handleExternalClose);
      window.removeEventListener("beforeunload", handleParentUnload);
      externalWindowRef.current = null;
      externalWindow.close();
    };
    // 창은 마운트 시점에 한 번만 열어야 하므로 마운트 지점 외의 의존성은 두지 않는다.
  }, [mountNode]);

  // 창이 열린 직후와 문서 제목이 바뀔 때마다 별도 창의 제목 표시줄을 갱신한다.
  useEffect(() => {
    const externalWindow = externalWindowRef.current;
    if (externalWindow && !externalWindow.closed) externalWindow.document.title = title;
  }, [title, mountNode]);

  if (!mountNode) return null;
  return createPortal(children, mountNode);
}
