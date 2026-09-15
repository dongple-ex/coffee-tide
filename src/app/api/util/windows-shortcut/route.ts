import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { launchHotkey, stopHotkeyProcesses } from "@/lib/windows/hotkeyProcesses";

/** OS 변경은 로그인한 사용자가 동일 PC의 브라우저에서 요청한 경우만 허용한다. */
async function authorizeLocalRequest(request: Request): Promise<Response | null> {
  if (!(await readSession())) return unauthorized();
  const url = new URL(request.url);
  const disabled = process.env.DISABLE_LOCAL_EXEC === "true" ||
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY;
  if (disabled || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return NextResponse.json({ success: false, supported: false, message: "이 PC의 localhost에서만 단축키를 설정할 수 있습니다." }, { status: 403 });
  }
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ success: false, message: "동일 출처의 요청만 허용됩니다." }, { status: 403 });
  }
  return null;
}

/** 시작프로그램 폴더 경로 탐색 (Windows 전용) */
export function getStartupDir(): string | null {
  if (process.platform !== "win32") return null;
  const appData =
    process.env.APPDATA ||
    (process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, "AppData", "Roaming")
      : null);
  if (!appData) return null;
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

export const HOTKEY_VBS_NAME = "coffeeTide_hotkey.vbs";
export const HOTKEY_PS1_NAME = "coffeeTide_hotkey.ps1";
export const HOTKEY_AHK_NAME = "coffeeTide_hotkey.ahk";
export const HOTKEY_LNK_NAME = "coffeeTide_shortcut.lnk";

/** 백그라운드 핫키 리스너 PowerShell 스크립트 본문 (Alt 두 번 누름) */
export const PS1_CONTENT = `# coffeeTide Global Shortcut Listener (Double-tap Alt)
Add-Type @"
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class DoubleAltHook : IDisposable {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;

    private const int VK_MENU = 0x12;
    private const int VK_LMENU = 0xA4;

    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public const int SW_RESTORE = 9;

    // GC 방지를 위한 static 델리게이트 참조
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookId = IntPtr.Zero;

    private static DateTime _lastAltUp = DateTime.MinValue;
    private static bool _otherKeyPressed = false;

    public static string LogPath = "";
    public Action OnDoubleAltPressed;
    private static DoubleAltHook _instance;

    public static void Log(string text) {
        if (string.IsNullOrEmpty(LogPath)) return;
        try {
            File.AppendAllText(LogPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + text + Environment.NewLine);
        } catch {}
    }

    public DoubleAltHook() {
        _instance = this;
        _hookId = SetHook(_proc);
        Log("DoubleAltHook started. HookId: " + _hookId);
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int msg = (int)wParam;
            int vkCode = Marshal.ReadInt32(lParam);

            // 좌측 Alt 키 (0xA4 또는 0x12)만 감지 (우측 Alt=한영키 분리)
            bool isLeftAlt = (vkCode == VK_LMENU || vkCode == VK_MENU);

            if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) {
                if (!isLeftAlt) {
                    // Alt와 함께 다른 키(Tab, F4 등)가 눌렸거나 다른 키가 눌림 -> 더블 탭 취소
                    _otherKeyPressed = true;
                }
            } else if (msg == WM_KEYUP || msg == WM_SYSKEYUP) {
                if (isLeftAlt) {
                    if (!_otherKeyPressed) {
                        DateTime now = DateTime.Now;
                        double diff = (now - _lastAltUp).TotalMilliseconds;
                        if (diff > 50 && diff <= 450) {
                            Log("Double-tap Alt detected! (Interval: " + (int)diff + "ms)");
                            _lastAltUp = DateTime.MinValue;
                            if (_instance != null && _instance.OnDoubleAltPressed != null) {
                                _instance.OnDoubleAltPressed();
                            }
                        } else {
                            _lastAltUp = now;
                        }
                    } else {
                        _otherKeyPressed = false;
                        _lastAltUp = DateTime.MinValue;
                    }
                } else {
                    _otherKeyPressed = false;
                }
            }
        }
        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    public static void UnlockForeground() {
        // Windows 포그라운드 락 일시 해제
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
    }

    public static bool ActivateCoffeeTide() {
        UnlockForeground();
        IntPtr targetHwnd = IntPtr.Zero;
        string foundTitle = "";

        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(512);
                int len = GetWindowText(hWnd, sb, sb.Capacity);
                if (len > 0) {
                    string title = sb.ToString();
                    if (title.IndexOf("coffee Tide", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        title.IndexOf("coffeeTide", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        title.IndexOf("localhost:3000", StringComparison.OrdinalIgnoreCase) >= 0) {
                        targetHwnd = hWnd;
                        foundTitle = title;
                        return false;
                    }
                }
            }
            return true;
        }, IntPtr.Zero);

        if (targetHwnd != IntPtr.Zero) {
            ShowWindow(targetHwnd, SW_RESTORE);
            BringWindowToTop(targetHwnd);
            bool brought = SetForegroundWindow(targetHwnd);
            Log("Activated window '" + foundTitle + "' (hWnd: " + targetHwnd + ", Success: " + brought + ")");
            return true;
        }

        Log("Target window not found. Launching browser...");
        return false;
    }

    public void Dispose() {
        if (_hookId != IntPtr.Zero) {
            UnhookWindowsHookEx(_hookId);
            _hookId = IntPtr.Zero;
            Log("DoubleAltHook unhooked and disposed.");
        }
    }
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = [System.IO.Path]::GetTempPath() }
[DoubleAltHook]::LogPath = Join-Path $scriptDir "coffeeTide_hotkey.log"

$hook = New-Object DoubleAltHook
$hook.OnDoubleAltPressed = {
    $found = [DoubleAltHook]::ActivateCoffeeTide()
    if (-not $found) {
        Start-Process "http://localhost:3000"
    }
}

[System.Windows.Forms.Application]::Run()
$hook.Dispose()
`;

/** 검은 콘솔창 없이 PowerShell을 숨김 실행하는 VBScript 본문 */
export const VBS_CONTENT = `' coffeeTide Silent Launcher for Double-tap Alt
Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
ps1Path = scriptDir & "\\coffeeTide_hotkey.ps1"

WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -File """ & ps1Path & """", 0, False
`;

/** AutoHotkey 사용자를 위한 스크립트 본문 (Double-tap Left Alt) */
export const AHK_CONTENT = `; coffeeTide Quick Launch Shortcut (Double-tap Left Alt)
~LAlt::
{
    if (A_PriorHotkey = "~LAlt" and A_TimeSincePriorHotkey < 450)
    {
        SetTitleMatchMode 2
        if WinExist("coffee Tide") or WinExist("coffeeTide") or WinExist("localhost:3000")
        {
            WinActivate
        }
        else
        {
            Run "http://localhost:3000"
        }
    }
}
`;

/** 등록 상태 조회 */
export async function GET(request: Request) {
  const denied = await authorizeLocalRequest(request);
  if (denied) return denied;
  if (process.platform !== "win32") {
    return NextResponse.json({
      supported: false,
      registered: false,
      message: "Windows 운영체제에서만 전역 단축키 등록이 지원됩니다.",
    });
  }

  const startupDir = getStartupDir();
  if (!startupDir) {
    return NextResponse.json({
      supported: false,
      registered: false,
      message: "시작프로그램 폴더를 찾을 수 없습니다.",
    });
  }

  try {
    const vbsPath = path.join(startupDir, HOTKEY_VBS_NAME);
    await fs.access(vbsPath);
    return NextResponse.json({
      supported: true,
      registered: true,
      startupDir,
    });
  } catch {
    return NextResponse.json({
      supported: true,
      registered: false,
      startupDir,
    });
  }
}

/** 단축키 자동 등록 및 즉시 실행 */
export async function POST(request: Request) {
  const denied = await authorizeLocalRequest(request);
  if (denied) return denied;
  if (process.platform !== "win32") {
    return NextResponse.json(
      { success: false, message: "Windows 환경에서만 지원됩니다." },
      { status: 400 }
    );
  }

  const startupDir = getStartupDir();
  if (!startupDir) {
    return NextResponse.json(
      { success: false, message: "시작프로그램 폴더를 찾을 수 없습니다." },
      { status: 500 }
    );
  }

  try {
    await fs.mkdir(startupDir, { recursive: true });

    const vbsPath = path.join(startupDir, HOTKEY_VBS_NAME);
    const ps1Path = path.join(startupDir, HOTKEY_PS1_NAME);
    const ahkPath = path.join(startupDir, HOTKEY_AHK_NAME);

    // 스크립트 파일들 작성
    await fs.writeFile(ps1Path, PS1_CONTENT, "utf-8");
    await fs.writeFile(vbsPath, VBS_CONTENT, "utf-8");
    await fs.writeFile(ahkPath, AHK_CONTENT, "utf-8");

    // 기존에 실행 중이던 리스너 프로세스가 있다면 먼저 확실하게 정리 (중복 선점 방지)
    await stopHotkeyProcesses(ps1Path);

    // 핫키 리소스 반환 대기
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 즉시 백그라운드 리스너 프로세스 기동 (재부팅 없이 바로 사용 가능)
    await launchHotkey(vbsPath);

    return NextResponse.json({
      success: true,
      registered: true,
      message: "Windows 단축키(Alt 두 번 누름)를 시작프로그램에 등록하고 실행을 요청했습니다.",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, message: `단축키 등록 중 오류 발생: ${errMsg}` },
      { status: 500 }
    );
  }
}

/** 단축키 등록 해제 및 프로세스 종료 */
export async function DELETE(request: Request) {
  const denied = await authorizeLocalRequest(request);
  if (denied) return denied;
  if (process.platform !== "win32") {
    return NextResponse.json(
      { success: false, message: "Windows 환경에서만 지원됩니다." },
      { status: 400 }
    );
  }

  const startupDir = getStartupDir();
  if (!startupDir) {
    return NextResponse.json(
      { success: false, message: "시작프로그램 폴더를 찾을 수 없습니다." },
      { status: 500 }
    );
  }

  try {
    const vbsPath = path.join(startupDir, HOTKEY_VBS_NAME);
    const ps1Path = path.join(startupDir, HOTKEY_PS1_NAME);
    const ahkPath = path.join(startupDir, HOTKEY_AHK_NAME);
    const lnkPath = path.join(startupDir, HOTKEY_LNK_NAME);

    // 파일 삭제
    await Promise.all([vbsPath, ps1Path, ahkPath, lnkPath].map(async (file) => {
      try {
        await fs.unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }));

    // 실행 중인 PowerShell 리스너 종료
    await stopHotkeyProcesses(ps1Path);

    return NextResponse.json({
      success: true,
      registered: false,
      message: "단축키 등록이 해제되었습니다.",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, message: `단축키 해제 중 오류 발생: ${errMsg}` },
      { status: 500 }
    );
  }
}
