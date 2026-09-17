import { expect, it, vi } from "vitest";
import { isDesktopMainManaged, minimizeConnectedMain, registerDesktopWindowControl, restoreConnectedMain } from "./desktopWindowControl";

it("does nothing without a paired controller and removes access on disconnect", async () => {
  expect(await minimizeConnectedMain()).toBe(false);
  const minimize = vi.fn(async () => true);
  const restore = vi.fn(async () => true);
  const unregister = registerDesktopWindowControl({ minimize, restore, active: () => true });
  expect(isDesktopMainManaged()).toBe(true);
  expect(await minimizeConnectedMain()).toBe(true);
  expect(await restoreConnectedMain()).toBe(true);
  unregister();
  expect(isDesktopMainManaged()).toBe(false);
  expect(await minimizeConnectedMain()).toBe(false);
  expect(minimize).toHaveBeenCalledOnce();
  expect(restore).toHaveBeenCalledOnce();
});
