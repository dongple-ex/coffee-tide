/**
 * Chrome Canary "HTML in Canvas" (WICG drawElementImage & layoutsubtree) 브릿지 모듈
 *
 * 표준/제안 스펙:
 * - <canvas layoutsubtree> 속성을 지원하여 캔버스 내부 자식 DOM을 레이아웃 트리에 참여시킴
 * - CanvasRenderingContext2D.prototype.drawElementImage(element, x, y, width?, height?)
 * - WebGL texElementImage2D / WebGPU copyElementImageToTexture
 */

export interface HtmlInCanvasStatus {
  supported: boolean;
  hasDrawElementImage: boolean;
  hasLayoutSubtree: boolean;
  message: string;
}

/**
 * 브라우저의 HTML in Canvas 지원 여부 검사
 */
export function checkHtmlInCanvasSupport(): HtmlInCanvasStatus {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      supported: false,
      hasDrawElementImage: false,
      hasLayoutSubtree: false,
      message: "서버 렌더링 환경입니다.",
    };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasDrawElementImage = typeof (ctx as any)?.drawElementImage === "function";
  const hasLayoutSubtree = "layoutsubtree" in canvas || "layoutSubtree" in canvas;

  const supported = hasDrawElementImage;

  return {
    supported,
    hasDrawElementImage,
    hasLayoutSubtree,
    message: supported
      ? "Chrome Canary HTML in Canvas (drawElementImage) 가속이 활성화되었습니다."
      : "일반 브라우저 모드 (CSS 3D 하이브리드 폴백 가속 렌더링)",
  };
}

/**
 * 캔버스 컨텍스트에 DOM 요소를 그리는 안전한 래퍼 함수
 */
export function drawElementToCanvas(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  x: number,
  y: number,
  width?: number,
  height?: number
): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extendedCtx = ctx as any;
  if (typeof extendedCtx.drawElementImage === "function") {
    try {
      if (width !== undefined && height !== undefined) {
        extendedCtx.drawElementImage(element, x, y, width, height);
      } else {
        extendedCtx.drawElementImage(element, x, y);
      }
      return true;
    } catch (err) {
      console.warn("[HTML in Canvas] drawElementImage execution error:", err);
      return false;
    }
  }
  return false;
}
