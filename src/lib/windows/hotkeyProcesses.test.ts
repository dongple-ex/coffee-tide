import { EventEmitter } from "events";
import { describe, it, expect, vi, afterEach } from "vitest";
import { spawn } from "child_process";
import { findHotkeyProcessIds, launchHotkey, type WindowsProcess } from "./hotkeyProcesses";

vi.mock("child_process", () => ({ spawn: vi.fn(), execFile: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("hotkey processes", () => {
  it("selects only the exact listener, excluding callers, ancestors and command text", () => {
    const file = "C:\\User Files\\Startup\\coffeeTide_hotkey.ps1";
    const listener = `powershell.exe -NoProfile -File "${file}"`;
    const row = (id: number, parent: number, command: string, name = "powershell.exe"): WindowsProcess =>
      ({ ProcessId: id, ParentProcessId: parent, Name: name, CommandLine: command });
    expect(findHotkeyProcessIds([
      row(1, 2, listener), row(2, 3, listener), row(3, 0, listener),
      row(10, 0, listener),
      row(11, 0, `powershell.exe -Command 'mention ${file}'`),
      row(12, 0, `powershell.exe -Command Write-Output -File "${file}"`),
      row(13, 0, listener, "cmd.exe"),
      row(14, 0, 'powershell.exe -File "C:\\Other\\coffeeTide_hotkey.ps1"'),
    ], file, 1, 2)).toEqual([10]);
  });

  it("rejects asynchronous spawn errors without unhandled error events", async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const promise = launchHotkey("C:\\Startup\\coffeeTide_hotkey.vbs");
    const assertion = expect(promise).rejects.toThrow("ENOENT");
    child.emit("error", new Error("ENOENT"));
    await assertion;
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("waits for spawn before detaching", async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const promise = launchHotkey("C:\\Startup\\coffeeTide_hotkey.vbs");
    expect(child.unref).not.toHaveBeenCalled();
    child.emit("spawn");
    await promise;
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
