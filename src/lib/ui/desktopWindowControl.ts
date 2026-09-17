interface DesktopWindowControl {
  minimize: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  active: () => boolean;
}

let connected: DesktopWindowControl | null = null;
let localMarker: string | null = null;
let originalTitle = "";
let titleObserver: MutationObserver | null = null;
let fallbackCommands = Promise.resolve(true);

export function registerDesktopWindowControl(control: DesktopWindowControl) {
  connected = control;
  return () => {
    if (connected === control) connected = null;
  };
}

export function isDesktopMainManaged() {
  return connected?.active() || localMarker !== null;
}

async function callFallbackApi(action: "minimize" | "restore", marker: string): Promise<boolean> {
  try {
    const res = await fetch("/api/util/window-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, marker }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

function cleanupLocalMarker() {
  titleObserver?.disconnect();
  titleObserver = null;
  if (localMarker && typeof document !== "undefined") {
    document.title = originalTitle;
  }
  localMarker = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("coffeetide:desktop-main-restored"));
  }
}

export function minimizeConnectedMain(): Promise<boolean> {
  if (connected) {
    return connected.minimize();
  }

  // 로컬 Next.js API를 통한 자체 폴백
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(false);
  }

  fallbackCommands = fallbackCommands.then(async () => {
    if (!localMarker) {
      originalTitle = document.title.replace(/ \[CoffeeTide:[a-f0-9]{32}\]/g, "");
      localMarker = crypto.randomUUID().replaceAll("-", "");
      const markedTitle = `${originalTitle} [CoffeeTide:${localMarker}]`;
      const pinTitle = () => {
        if (document.title !== markedTitle) document.title = markedTitle;
      };
      pinTitle();
      titleObserver = new MutationObserver(pinTitle);
      titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    }

    const ok = await callFallbackApi("minimize", localMarker);
    if (!ok) {
      cleanupLocalMarker();
    }
    return ok;
  });

  return fallbackCommands;
}

export function restoreConnectedMain(): Promise<boolean> {
  if (connected) {
    return connected.restore();
  }

  if (typeof window === "undefined" || !localMarker) {
    return Promise.resolve(true);
  }

  fallbackCommands = fallbackCommands.then(async () => {
    if (!localMarker) return true;
    const ok = await callFallbackApi("restore", localMarker);
    if (ok) {
      cleanupLocalMarker();
    }
    return ok;
  });

  return fallbackCommands;
}
