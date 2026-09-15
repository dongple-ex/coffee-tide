import { execFile, spawn } from "child_process";
import path from "path";

export interface WindowsProcess {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine: string | null;
}

/** 파일명 부분 일치 대신 PowerShell의 마지막 -File 인자 전체를 확인한다. */
export function findHotkeyProcessIds(
  processes: WindowsProcess[],
  scriptPath: string,
  ownPid = process.pid,
  parentPid = process.ppid
): number[] {
  const excluded = new Set<number>([ownPid]);
  let ancestor = parentPid;
  while (ancestor && !excluded.has(ancestor)) {
    excluded.add(ancestor);
    ancestor = processes.find((candidate) => candidate.ProcessId === ancestor)?.ParentProcessId ?? 0;
  }
  const expected = path.win32.normalize(scriptPath).toLowerCase();
  return processes.filter((candidate) => {
    if (excluded.has(candidate.ProcessId) || !/^(powershell|pwsh)\.exe$/i.test(candidate.Name)) return false;
    // -Command 문자열 속에 들어 있는 -File은 실행 인자로 취급하지 않는다.
    if (!candidate.CommandLine || /\s-(?:Command|EncodedCommand|c|ec)\b/i.test(candidate.CommandLine)) return false;
    const fileArg = candidate.CommandLine.match(/\s-File\s+(?:"([^"]+)"|([^\s"]+))\s*$/i);
    return Boolean(fileArg && path.win32.normalize(fileArg[1] ?? fileArg[2]).toLowerCase() === expected);
  }).map((candidate) => candidate.ProcessId);
}

export async function stopHotkeyProcesses(scriptPath: string): Promise<void> {
  // 검색 명령에는 핫키 스크립트 이름을 포함하지 않는다. 셸도 거치지 않는다.
  const output = await new Promise<string>((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"],
    { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
  const parsed = JSON.parse(output.trim() || "[]") as WindowsProcess | WindowsProcess[] | null;
  const processes = parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];
  for (const pid of findHotkeyProcessIds(processes, scriptPath)) {
    try {
      process.kill(pid);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}

/** 프로세스 생성 실패는 비동기 error 이벤트로 전달된다. */
export function launchHotkey(vbsPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("wscript.exe", [vbsPath], {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
