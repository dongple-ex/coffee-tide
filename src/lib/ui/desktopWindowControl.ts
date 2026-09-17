interface DesktopWindowControl {
  minimize: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  active: () => boolean;
}

let connected: DesktopWindowControl | null = null;

export function registerDesktopWindowControl(control: DesktopWindowControl) {
  connected = control;
  return () => {
    if (connected === control) connected = null;
  };
}

export function isDesktopMainManaged(): boolean {
  return Boolean(connected?.active());
}

export function minimizeConnectedMain(): Promise<boolean> {
  if (!connected) {
    return Promise.resolve(false);
  }
  return connected.minimize();
}

export function restoreConnectedMain(): Promise<boolean> {
  if (!connected) {
    return Promise.resolve(false);
  }
  return connected.restore();
}
